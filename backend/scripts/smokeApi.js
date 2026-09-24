// backend/scripts/smokeApi.js
//
// End-to-end API smoke test, over HTTP, against a backend that is
// ALREADY RUNNING. This script starts no server of its own.
//
//   # terminal 1
//   docker start smartschedai-mongo
//   cd backend && npm run dev            # port 5050
//
//   # terminal 2 (once, if the database is empty)
//   cd backend && node createTestUsers.js && node seedRealisticData.js
//
//   # terminal 2
//   cd backend && npm run smoke
//   BASE_URL=http://localhost:5050 node scripts/smokeApi.js
//
// Eleven assertions, one PASS / FAIL row each, then a summary
// table. Exit code is 1 when any row failed, 0 when all passed.
//
// WHAT IT TOUCHES
// ---------------
// It generates three timetables (Computer Science twice, so the
// seeded run can be compared with itself, and Electronics once),
// publishes one, exports it, and raises one faculty query. All of
// that is deleted again in the cleanup phase, so a second run
// starts from the same state as the first. Cleanup rows are part
// of the failure count: residue is a failure of this script.
//
// Publishing is the one step that reaches outside what this run
// created: PATCH /:id/publish archives every OTHER published
// timetable for the same cohort. Their ids are therefore recorded
// before the publish and set back to "published" in cleanup, so a
// timetable the operator had already published survives the run.
//
// Timetables and the notifications they produced are deleted over
// the API (DELETE /api/timetables/:id, DELETE /api/notifications/:id,
// both admin-only). The query is deleted directly in MongoDB,
// because /api/queries deliberately exposes no delete route.

import "dotenv/config";

import mongoose from "mongoose";

import Query from "../models/Query.js";


// =========================================================
// CONFIGURATION
// =========================================================

const BASE_URL =
    String(process.env.BASE_URL || "http://localhost:5050")
        .replace(/\/+$/, "");

const MONGO_URI =
    process.env.MONGO_URI || "mongodb://localhost:27017/smartschedai";

const PASSWORD = "123456";

const ACCOUNTS = {
    admin: "admin@smartscheduler.com",
    faculty: "faculty@smartscheduler.com",
    student: "student@smartscheduler.com",
};

// The two cohorts seedRealisticData.js creates. Both carry the
// same GA seed: cohort 1 is generated twice to prove the run is
// reproducible, which is the property this branch protects.
const COHORT_CS = {
    department: "Computer Science",
    semester: 1,
    year: 1,
    academicYear: 2026,
    gaOptions: { seed: 42 },
};

const COHORT_EE = {
    department: "Electronics",
    semester: 2,
    year: 2,
    academicYear: 2027,
    gaOptions: { seed: 42 },
};

// A jobId that was never issued. Any string works: the registry
// is a Map keyed by the uuid createJob() minted.
const UNKNOWN_JOB_ID = "00000000-0000-4000-8000-000000000000";

const POLL_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 1_000;

// Marks this run's query so a leftover from an aborted run is
// recognisable in the database.
const RUN_ID = new Date().toISOString();


// =========================================================
// RESULT TABLE
// =========================================================

/** @type {{section: string, label: string, ok: boolean, detail: string}[]} */
const results = [];

function record(section, label, ok, detail = "") {

    results.push({ section, label, ok, detail });

    console.log(
        `${ok ? "PASS" : "FAIL"}  ${section.padEnd(4)} ${label}` +
        (detail ? `\n            ${detail}` : "")
    );

    return ok;
}

function check(number, label, ok, detail = "") {
    return record(String(number), label, ok, detail);
}

function cleanupRow(label, ok, detail = "") {
    return record("--", label, ok, detail);
}


// =========================================================
// HTTP
// =========================================================

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}


/**
 * One HTTP call. Never throws on a non-2xx: the status is the
 * thing most assertions are about. A transport failure comes
 * back as status 0 with the error message in `text`.
 *
 * @param {string} path e.g. "/api/courses"
 * @param {{method?: string, token?: string, body?: object}} [options]
 * @returns {Promise<{status: number, ok: boolean, text: string, json: any}>}
 */
async function request(path, { method = "GET", token, body } = {}) {

    const headers = {};

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
    }

    try {

        const response = await fetch(`${BASE_URL}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });

        const text = await response.text();

        let json = null;

        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = null;
        }

        return {
            status: response.status,
            ok: response.ok,
            text,
            json,
        };

    } catch (error) {

        return {
            status: 0,
            ok: false,
            text: error?.message || String(error),
            json: null,
        };
    }
}


/** A short, printable description of a response. */
function describe(response) {

    if (response.status === 0) {
        return `transport error: ${response.text}`;
    }

    const message =
        response.json?.error ||
        response.json?.message ||
        response.text;

    return `${response.status} ${String(message || "").slice(0, 140)}`;
}


// =========================================================
// GENERATION HELPERS
// =========================================================

/**
 * Poll GET /api/timetables/generate/:jobId/progress until the job
 * reaches a terminal status or the timeout expires.
 *
 * @param {string} token admin token (the endpoint is admin-only)
 * @param {string} jobId
 * @returns {Promise<{status: string, timetableId?: string, error?: string, step?: string, polls: number}>}
 */
async function pollUntilTerminal(token, jobId) {

    const deadline = Date.now() + POLL_TIMEOUT_MS;

    let polls = 0;
    let last = null;

    while (Date.now() < deadline) {

        const response = await request(
            `/api/timetables/generate/${jobId}/progress`,
            { token }
        );

        polls += 1;

        if (response.status !== 200) {

            return {
                status: "unreadable",
                error: `progress → ${describe(response)}`,
                polls,
            };
        }

        last = response.json || {};

        if (last.status === "completed" || last.status === "failed") {
            return { ...last, polls };
        }

        await sleep(POLL_INTERVAL_MS);
    }

    return {
        status: "timeout",
        error:
            `no terminal status within ${POLL_TIMEOUT_MS / 1000}s ` +
            `(last: ${last?.status || "?"} / ${last?.step || "?"})`,
        polls,
    };
}


/**
 * POST /api/timetables/generate, assert the 202 contract, then
 * poll to completion.
 *
 * @param {string} token admin token
 * @param {object} params generation body
 * @returns {Promise<{ok: boolean, detail: string, timetableId?: string}>}
 */
async function generateAndWait(token, params) {

    const started = await request("/api/timetables/generate", {
        method: "POST",
        token,
        body: params,
    });

    if (started.status !== 202) {

        return {
            ok: false,
            detail: `POST /api/timetables/generate → ${describe(started)} (expected 202)`,
        };
    }

    const jobId = started.json?.jobId;
    const steps = started.json?.steps;

    if (typeof jobId !== "string" || !jobId) {
        return { ok: false, detail: "202 carried no jobId" };
    }

    if (!Array.isArray(steps) || steps.length === 0) {
        return { ok: false, detail: `202 carried no steps array (jobId ${jobId})` };
    }

    const job = await pollUntilTerminal(token, jobId);

    if (job.status !== "completed") {

        return {
            ok: false,
            detail:
                `job ${jobId} ended "${job.status}" after ${job.polls} polls: ` +
                `${job.error || "no error reported"}`,
        };
    }

    if (!job.timetableId) {

        return {
            ok: false,
            detail: `job ${jobId} completed without a timetableId`,
        };
    }

    return {
        ok: true,
        timetableId: String(job.timetableId),
        detail:
            `202 → jobId ${jobId}, ${steps.length} steps, completed after ` +
            `${job.polls} poll(s) → timetable ${job.timetableId}`,
    };
}


/**
 * A canonical, comparable rendering of a schedule. Order is
 * preserved: a deterministic engine must emit the same entries in
 * the same order, not merely the same set.
 *
 * @param {object[]} schedule
 * @returns {string}
 */
function fingerprint(schedule) {

    return (schedule || [])
        .map((entry) =>
            [
                entry.day,
                entry.startTime,
                entry.endTime,
                entry.courseId,
                entry.facultyId,
                entry.roomId,
            ].join("|")
        )
        .join("\n");
}


/** The same rendering, order-insensitive. */
function sortedFingerprint(schedule) {
    return fingerprint(schedule).split("\n").sort().join("\n");
}


/** The distinct courseIds a schedule references. */
function courseIdSet(schedule) {
    return new Set((schedule || []).map((entry) => String(entry.courseId)));
}


// =========================================================
// MAIN
// =========================================================

async function main() {

    console.log(`\nAPI smoke test against ${BASE_URL}`);
    console.log("(the server must already be running; this script starts none)\n");

    /** Timetables this run created, deleted again in cleanup(). */
    const createdTimetableIds = [];

    /** Query ids this run created, deleted again in cleanup(). */
    const createdQueryIds = [];

    /**
     * Timetables that were already published for the cohort this
     * run publishes into. PATCH /:id/publish archives them; they
     * are set back to "published" in cleanup().
     */
    const archivedByPublishIds = [];

    const tokens = {};


    // -----------------------------------------------------
    // 1. Log in as all three roles
    // -----------------------------------------------------

    const loginDetail = [];

    for (const [role, email] of Object.entries(ACCOUNTS)) {

        const response = await request("/api/auth/login", {
            method: "POST",
            body: { email, password: PASSWORD, role },
        });

        const returnedRole = response.json?.user?.role;
        const token = response.json?.token;

        if (
            response.status === 200 &&
            returnedRole === role &&
            typeof token === "string" &&
            token.length > 0
        ) {
            tokens[role] = token;
            loginDetail.push(`${role} 200/${returnedRole}`);
        } else {
            loginDetail.push(`${role} ${describe(response)}`);
        }
    }

    check(
        1,
        "Login as admin, faculty and student; each response carries its role",
        Object.keys(tokens).length === 3,
        loginDetail.join("   ")
    );

    if (!tokens.admin || !tokens.faculty || !tokens.student) {

        console.log(
            "\nCannot continue without all three tokens " +
            "(run `node createTestUsers.js` against the same database).\n"
        );

        return summarise();
    }


    // -----------------------------------------------------
    // 2. Unauthenticated read is rejected
    // -----------------------------------------------------

    const anonymous = await request("/api/courses");

    check(
        2,
        "GET /api/courses without a token → 401",
        anonymous.status === 401,
        describe(anonymous)
    );


    // -----------------------------------------------------
    // 3. Student cannot create a course
    // -----------------------------------------------------

    const studentWrite = await request("/api/courses", {
        method: "POST",
        token: tokens.student,
        body: {
            name: "Smoke Test Course",
            code: "SMOKE101",
            department: "Computer Science",
            credits: 3,
        },
    });

    check(
        3,
        "POST /api/courses as student → 403",
        studentWrite.status === 403,
        describe(studentWrite)
    );


    // -----------------------------------------------------
    // 4. Generate cohort 1 (Computer Science, seed 42)
    // -----------------------------------------------------

    const first = await generateAndWait(tokens.admin, COHORT_CS);

    if (first.timetableId) {
        createdTimetableIds.push(first.timetableId);
    }

    check(
        4,
        "Generate Computer Science Y1 S1 AY2026 (seed 42): 202 + jobId + steps, polls to completion",
        first.ok,
        first.detail
    );


    // -----------------------------------------------------
    // 5. Generate cohort 2 (Electronics, seed 42) and
    //    compare the two records
    // -----------------------------------------------------

    const second = await generateAndWait(tokens.admin, COHORT_EE);

    if (second.timetableId) {
        createdTimetableIds.push(second.timetableId);
    }

    let csDoc = null;
    let eeDoc = null;

    if (first.ok && second.ok) {

        const [csResponse, eeResponse] = await Promise.all([
            request(`/api/timetables/${first.timetableId}`, { token: tokens.admin }),
            request(`/api/timetables/${second.timetableId}`, { token: tokens.admin }),
        ]);

        csDoc = csResponse.json;
        eeDoc = eeResponse.json;
    }

    if (!csDoc || !eeDoc) {

        check(
            5,
            "Two cohorts differ in department / year / semester / academicYear and share no courses",
            false,
            second.ok
                ? "could not read one of the generated timetables back"
                : `Electronics generation failed: ${second.detail}`
        );

    } else {

        const csCourses = courseIdSet(csDoc.schedule);
        const eeCourses = courseIdSet(eeDoc.schedule);

        const shared = [...csCourses].filter((id) => eeCourses.has(id));

        const differs =
            String(csDoc.department) !== String(eeDoc.department) &&
            Number(csDoc.year) !== Number(eeDoc.year) &&
            String(csDoc.semester) !== String(eeDoc.semester) &&
            Number(csDoc.academicYear) !== Number(eeDoc.academicYear);

        check(
            5,
            "Two cohorts differ in department / year / semester / academicYear and share no courses",
            differs && shared.length === 0 && csCourses.size > 0 && eeCourses.size > 0,
            `${csDoc.department}/Y${csDoc.year}/S${csDoc.semester}/AY${csDoc.academicYear} ` +
            `(${csCourses.size} courses) vs ` +
            `${eeDoc.department}/Y${eeDoc.year}/S${eeDoc.semester}/AY${eeDoc.academicYear} ` +
            `(${eeCourses.size} courses); shared course ids: ${shared.length}`
        );
    }


    // -----------------------------------------------------
    // 6. Determinism: the same cohort and seed again
    // -----------------------------------------------------

    const repeat = await generateAndWait(tokens.admin, COHORT_CS);

    if (repeat.timetableId) {
        createdTimetableIds.push(repeat.timetableId);
    }

    if (!repeat.ok || !csDoc) {

        check(
            6,
            "Computer Science regenerated with seed 42 is identical to the first run",
            false,
            repeat.ok
                ? "the first Computer Science timetable is unavailable to compare against"
                : repeat.detail
        );

    } else {

        const repeatResponse = await request(
            `/api/timetables/${repeat.timetableId}`,
            { token: tokens.admin }
        );

        const repeatDoc = repeatResponse.json;

        const a = fingerprint(csDoc.schedule);
        const b = fingerprint(repeatDoc?.schedule);

        const identical = a === b && a.length > 0;

        const sameSet =
            sortedFingerprint(csDoc.schedule) ===
            sortedFingerprint(repeatDoc?.schedule);

        check(
            6,
            "Computer Science regenerated with seed 42 is identical to the first run",
            identical,
            identical
                ? `${csDoc.schedule.length} entries match exactly, in order`
                : sameSet
                    ? "same entries but a different order — the engine is not fully deterministic"
                    : `schedules differ (${csDoc.schedule?.length ?? 0} vs ` +
                      `${repeatDoc?.schedule?.length ?? 0} entries)`
        );
    }


    // -----------------------------------------------------
    // 7. Unknown job id
    // -----------------------------------------------------

    const unknownJob = await request(
        `/api/timetables/generate/${UNKNOWN_JOB_ID}/progress`,
        { token: tokens.admin }
    );

    check(
        7,
        "GET /api/timetables/generate/<unknown>/progress → 404",
        unknownJob.status === 404,
        describe(unknownJob)
    );


    // -----------------------------------------------------
    // 8. Publish
    // -----------------------------------------------------

    const publishTarget = second.timetableId || first.timetableId;

    const publishCohort = second.timetableId ? COHORT_EE : COHORT_CS;

    if (!publishTarget) {

        check(8, "PATCH /api/timetables/:id/publish → 2xx", false,
            "no timetable was generated to publish");

    } else {

        // PATCH /:id/publish archives every OTHER published
        // timetable for this cohort. Record them first, so
        // cleanup() can put them back.

        const alreadyPublished = await request(
            "/api/timetables" +
            `?department=${encodeURIComponent(publishCohort.department)}` +
            `&semester=${publishCohort.semester}` +
            `&year=${publishCohort.year}` +
            `&academicYear=${publishCohort.academicYear}` +
            "&status=published",
            { token: tokens.admin }
        );

        if (Array.isArray(alreadyPublished.json)) {

            for (const timetable of alreadyPublished.json) {

                const id = String(timetable._id);

                if (id !== String(publishTarget)) {
                    archivedByPublishIds.push(id);
                }
            }
        }

        const published = await request(
            `/api/timetables/${publishTarget}/publish`,
            { method: "PATCH", token: tokens.admin }
        );

        check(
            8,
            "PATCH /api/timetables/:id/publish → 2xx",
            published.status >= 200 && published.status < 300,
            `${describe(published)} (status now "${published.json?.status || "?"}")`
        );
    }


    // -----------------------------------------------------
    // 9. Export CSV and JSON
    // -----------------------------------------------------

    if (!publishTarget) {

        check(9, "GET /api/timetables/:id/export?format=csv|json → 2xx, non-empty", false,
            "no timetable was generated to export");

    } else {

        const [csv, json] = await Promise.all([
            request(`/api/timetables/${publishTarget}/export?format=csv`, {
                token: tokens.admin,
            }),
            request(`/api/timetables/${publishTarget}/export?format=json`, {
                token: tokens.admin,
            }),
        ]);

        const csvOk =
            csv.status >= 200 && csv.status < 300 && csv.text.trim().length > 0;

        const jsonOk =
            json.status >= 200 && json.status < 300 && json.text.trim().length > 0;

        check(
            9,
            "GET /api/timetables/:id/export?format=csv|json → 2xx, non-empty",
            csvOk && jsonOk,
            `csv ${csv.status} (${csv.text.length} bytes), ` +
            `json ${json.status} (${json.text.length} bytes)`
        );
    }


    // -----------------------------------------------------
    // 10. Config grid readable; config write is admin-only
    // -----------------------------------------------------

    const grid = await request("/api/config/grid", { token: tokens.admin });

    const studentConfigWrite = await request("/api/config", {
        method: "PUT",
        token: tokens.student,
        body: { maxPeriodsPerDay: 99 },
    });

    const gridOk =
        grid.status === 200 &&
        Array.isArray(grid.json?.days) &&
        grid.json.days.length > 0 &&
        Array.isArray(grid.json?.slots) &&
        grid.json.slots.length > 0;

    check(
        10,
        "GET /api/config/grid as admin → grid; PUT /api/config as student → 403",
        gridOk && studentConfigWrite.status === 403,
        `grid ${grid.status} (${grid.json?.days?.length ?? 0} days × ` +
        `${grid.json?.slots?.length ?? 0} slots), student PUT ${studentConfigWrite.status}`
    );


    // -----------------------------------------------------
    // 11. A faculty query is invisible to the student
    // -----------------------------------------------------

    const subject = `Smoke test query ${RUN_ID}`;

    const created = await request("/api/queries", {
        method: "POST",
        token: tokens.faculty,
        body: {
            subject,
            message: "Raised by scripts/smokeApi.js; deleted again by the same run.",
        },
    });

    const queryId = created.json?._id ? String(created.json._id) : null;

    if (queryId) {
        createdQueryIds.push(queryId);
    }

    if (created.status !== 201 || !queryId) {

        check(11, "A faculty query is not visible to the student", false,
            `POST /api/queries as faculty → ${describe(created)} (expected 201)`);

    } else {

        const [asStudent, asFaculty] = await Promise.all([
            request("/api/queries", { token: tokens.student }),
            request("/api/queries", { token: tokens.faculty }),
        ]);

        const has = (response) =>
            Array.isArray(response.json) &&
            response.json.some((query) => String(query._id) === queryId);

        const studentSees = has(asStudent);
        const facultySees = has(asFaculty);

        check(
            11,
            "A faculty query is not visible to the student",
            asStudent.status === 200 && !studentSees && facultySees,
            `student list ${asStudent.status}: ` +
            `${studentSees ? "CONTAINS the query" : "does not contain it"}; ` +
            `author list ${asFaculty.status}: ` +
            `${facultySees ? "contains its own query" : "MISSING its own query"}`
        );
    }


    // -----------------------------------------------------
    // CLEANUP
    // -----------------------------------------------------

    await cleanup(
        tokens.admin,
        createdTimetableIds,
        createdQueryIds,
        archivedByPublishIds
    );

    return summarise();
}


// =========================================================
// CLEANUP
// Everything this run created is removed again, and every
// timetable the publish step archived is published again, so a
// repeat run starts from the state the first one found.
// =========================================================

async function cleanup(adminToken, timetableIds, queryIds, republishIds = []) {

    console.log("\nCleanup");

    // --- notifications the generations and the publish wrote ---
    // Matched by relatedTimetableId, so nothing that existed
    // before this run is ever touched.

    if (timetableIds.length > 0) {

        const list = await request("/api/notifications", { token: adminToken });

        const mine = Array.isArray(list.json)
            ? list.json.filter((notification) =>
                timetableIds.includes(String(notification.relatedTimetableId))
            )
            : [];

        let removed = 0;
        const failures = [];

        for (const notification of mine) {

            const response = await request(
                `/api/notifications/${notification._id}`,
                { method: "DELETE", token: adminToken }
            );

            if (response.status === 204 || response.status === 404) {
                removed += 1;
            } else {
                failures.push(`${notification._id} → ${describe(response)}`);
            }
        }

        cleanupRow(
            "Deleted the notifications this run produced",
            list.status === 200 && failures.length === 0,
            list.status === 200
                ? `${removed}/${mine.length} removed` +
                  (failures.length ? `; ${failures.join("; ")}` : "")
                : `could not list notifications: ${describe(list)}`
        );
    }


    // --- timetables ---

    if (timetableIds.length > 0) {

        let removed = 0;
        const failures = [];

        for (const id of timetableIds) {

            const response = await request(`/api/timetables/${id}`, {
                method: "DELETE",
                token: adminToken,
            });

            if (response.status === 204 || response.status === 404) {
                removed += 1;
            } else {
                failures.push(`${id} → ${describe(response)}`);
            }
        }

        cleanupRow(
            "Deleted the timetables this run generated",
            failures.length === 0,
            `${removed}/${timetableIds.length} removed` +
            (failures.length ? `; ${failures.join("; ")}` : "")
        );
    }


    // --- timetables the publish step archived ---
    // PATCH /:id/publish demotes every other published timetable
    // for the cohort. Those were not created here, so they are
    // restored rather than deleted. This runs after the delete
    // above, so the cohort ends with the same published timetable
    // it started with.

    if (republishIds.length > 0) {

        let restored = 0;
        const failures = [];

        for (const id of republishIds) {

            const response = await request(`/api/timetables/${id}`, {
                method: "PUT",
                token: adminToken,
                body: { status: "published" },
            });

            if (response.status >= 200 && response.status < 300) {
                restored += 1;
            } else if (response.status === 404) {
                // Deleted by someone else while this run was going.
                restored += 1;
            } else {
                failures.push(`${id} → ${describe(response)}`);
            }
        }

        cleanupRow(
            "Re-published the timetables the publish step archived",
            failures.length === 0,
            `${restored}/${republishIds.length} restored` +
            (failures.length ? `; ${failures.join("; ")}` : "")
        );
    }


    // --- queries ---
    // /api/queries has no delete route by design, so this one
    // goes straight to MongoDB.

    if (queryIds.length > 0) {

        let connected = false;

        try {

            await mongoose.connect(MONGO_URI);
            connected = true;

            const { deletedCount } = await Query.deleteMany({
                _id: { $in: queryIds },
            });

            cleanupRow(
                "Deleted the query this run raised (directly in MongoDB)",
                deletedCount === queryIds.length,
                `${deletedCount}/${queryIds.length} removed from ${MONGO_URI}`
            );

        } catch (error) {

            cleanupRow(
                "Deleted the query this run raised (directly in MongoDB)",
                false,
                `${error?.message || error}; left behind: ${queryIds.join(", ")}`
            );

        } finally {

            if (connected) {
                await mongoose.disconnect().catch(() => {});
            }
        }
    }
}


// =========================================================
// SUMMARY
// =========================================================

function summarise() {

    const width = Math.max(
        ...results.map((row) => row.label.length),
        20
    );

    console.log("\n" + "=".repeat(width + 14));
    console.log(`API SMOKE TEST — ${BASE_URL}`);
    console.log("=".repeat(width + 14));

    for (const row of results) {
        console.log(
            `${row.section.padStart(3)}  ${row.label.padEnd(width)}  ` +
            `${row.ok ? "PASS" : "FAIL"}`
        );
    }

    const failed = results.filter((row) => !row.ok);

    console.log("=".repeat(width + 14));
    console.log(
        `${results.length - failed.length}/${results.length} passed, ` +
        `${failed.length} failed`
    );
    console.log("=".repeat(width + 14) + "\n");

    if (failed.length > 0) {

        console.log("Failed:");

        for (const row of failed) {
            console.log(`  ${row.section}. ${row.label}`);
            if (row.detail) {
                console.log(`     ${row.detail}`);
            }
        }

        console.log("");
    }

    return failed.length === 0 ? 0 : 1;
}


// =========================================================
// ENTRY POINT
// =========================================================

main()
    .then((code) => {
        process.exit(code);
    })
    .catch((error) => {
        console.error("\nSmoke test crashed:");
        console.error(error);
        process.exit(1);
    });
