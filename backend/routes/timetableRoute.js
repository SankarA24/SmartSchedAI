import { Router } from "express";

import Timetable from "../models/Timetable.js";
import Course from "../models/course.js";
import Faculty from "../models/Faculty.js";
import Room from "../models/Room.js";
import SystemConfig from "../models/SystemConfig.js";


import {
    generateTimetableWithAI
} from "../utils/timetableGenerator.js";
import {
    validateSchedule
} from "../utils/scheduleValidator.js";
import {
    generateLocalTimetable
} from "../utils/localScheduler.js";
import {
    generateGeneticTimetable
} from "../utils/geneticScheduler.js";
import {
    DAYS,
    TIME_SLOTS,
    slotLabel,
    DEFAULT_GRID,
    getScheduleGrid
} from "../utils/schedulingConstants.js";
import {
    getWeeklySessions
} from "../utils/schedulingHelpers.js";
import {
    loadSchedulingContext
} from "../utils/schedulingContext.js";
import {
    GENERATION_STEPS,
    createJob,
    getJob,
    hasActiveJob,
    updateJob
} from "../utils/generationJobs.js";
import {
    computeQualityScore
} from "../utils/qualityScore.js";
import {
    createAndEmit
} from "../utils/notify.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const timetablesRouter = Router();

timetablesRouter.use(requireAuth);
const adminOnly = requireRole("admin");


// =======================================================
// HELPERS
// =======================================================

const REQUIRED_GENERATION_FIELDS = [
    "department",
    "semester",
    "year",
    "academicYear"
];

function isBlank(value) {
    return (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
    );
}

// Case-insensitive, anchored department match so
// "computer science" === "Computer Science".
function departmentRegex(value) {
    const escaped = String(value || "")
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    return new RegExp(`^${escaped}$`, "i");
}

function sameDepartment(a, b) {
    return (
        String(a || "").trim().toLowerCase() ===
        String(b || "").trim().toLowerCase()
    );
}

// GA option limits (mirrors LIMITS in geneticScheduler.js).
const GA_LIMITS = {
    populationSize: { min: 10, max: 200 },
    maxGenerations: { min: 10, max: 1000 }
};

// Keep only the GA options the frontend may set, coerce to
// integers and clamp population / generations.
function sanitizeGaOptions(raw) {
    const source =
        raw && typeof raw === "object" ? raw : {};

    const options = {};

    const seed = Number(source.seed);

    if (Number.isFinite(seed)) {
        options.seed = Math.floor(seed);
    }

    for (const key of ["populationSize", "maxGenerations"]) {

        const value = Number(source[key]);

        if (!Number.isFinite(value)) continue;

        const { min, max } = GA_LIMITS[key];

        options[key] = Math.min(
            max,
            Math.max(min, Math.floor(value))
        );
    }

    return options;
}

// Build a Timetable query from optional list filters.
function buildListFilter(query) {
    const filter = {};

    if (!isBlank(query.department)) {
        filter.department = departmentRegex(query.department);
    }

    if (!isBlank(query.semester)) {
        filter.semester = String(query.semester);
    }

    if (!isBlank(query.year)) {
        filter.year = Number(query.year);
    }

    if (!isBlank(query.academicYear)) {
        // Legacy docs store the calendar year in `year`.
        const ay = Number(query.academicYear);

        filter.$or = [
            { academicYear: ay },
            { academicYear: { $exists: false }, year: ay },
            { academicYear: null, year: ay }
        ];
    }

    if (!isBlank(query.status)) {
        filter.status = String(query.status);
    }

    return filter;
}

// Does a timetable belong to the student's cohort?
function matchesStudentGroup(timetable, user) {
    if (!sameDepartment(timetable.department, user.department)) {
        return false;
    }

    if (
        !isBlank(user.semester) &&
        String(timetable.semester) !== String(user.semester)
    ) {
        return false;
    }

    // Legacy docs (pre academicYear) store the calendar year in `year`.
    const legacy = isBlank(timetable.academicYear);

    if (
        !legacy &&
        !isBlank(user.year) &&
        Number(timetable.year) !== Number(user.year)
    ) {
        return false;
    }

    if (
        !isBlank(user.academicYear) &&
        Number(timetable.academicYear ?? timetable.year) !==
            Number(user.academicYear)
    ) {
        return false;
    }

    return true;
}

// Mongo filter for a student's own cohort (published only).
// Client-supplied cohort filters are ignored; a missing JWT
// field means "no constraint", never "client-controlled".
function buildStudentFilter(user) {
    const filter = {
        department: departmentRegex(user.department),
        status: "published"
    };

    if (!isBlank(user.semester)) {
        filter.semester = String(user.semester);
    }

    const conditions = [];

    if (!isBlank(user.academicYear)) {
        const ay = Number(user.academicYear);

        const current = { academicYear: ay };

        if (!isBlank(user.year)) {
            current.year = Number(user.year);
        }

        conditions.push({
            $or: [
                current,
                { academicYear: { $exists: false }, year: ay },
                { academicYear: null, year: ay }
            ]
        });
    } else if (!isBlank(user.year)) {
        conditions.push({
            $or: [
                { year: Number(user.year) },
                { academicYear: { $exists: false } },
                { academicYear: null }
            ]
        });
    }

    if (conditions.length) {
        filter.$and = conditions;
    }

    return filter;
}

// Can this user read the given timetable? Returns the
// timetable (schedule narrowed for faculty) or null.
function scopeTimetableForUser(timetable, user) {
    const role = String(user?.role || "").toLowerCase();

    if (role === "student") {

        if (
            timetable.status !== "published" ||
            isBlank(user.department) ||
            !matchesStudentGroup(timetable, user)
        ) {
            return null;
        }

        return timetable;
    }

    if (role === "faculty") {

        const facultyId = String(user.facultyId || "");

        const own = facultyId
            ? (timetable.schedule || []).filter(
                entry => String(entry.facultyId) === facultyId
            )
            : [];

        if (timetable.status !== "published" || !own.length) {
            return null;
        }

        const doc = timetable.toObject
            ? timetable.toObject()
            : { ...timetable };

        doc.schedule = own;

        return doc;
    }

    return timetable;
}

// Saves a notification and pushes it live when the express
// app carries a socket.io instance (app.set("io", io)); the
// app may be null, e.g. when a script drives the pipeline.
async function saveNotification(app, title, message, type, extra = {}) {
    try {
        await createAndEmit(app, { title, message, type, ...extra });
    } catch (error) {
        console.error(
            "Failed to create notification:",
            error.message
        );
    }
}


// =======================================================
// GET ALL TIMETABLES
// Query: ?department&semester&year&academicYear&status
// Role scoping:
//   student → own cohort, published only
//   faculty → timetables containing own entries, published
//   admin   → query filters only
// =======================================================

timetablesRouter.get("/", async (req, res) => {

    try {

        const role = String(req.user?.role || "").toLowerCase();

        let filter = buildListFilter(req.query);


        if (role === "student") {

            if (isBlank(req.user.department)) {
                return res.json([]);
            }

            filter = buildStudentFilter(req.user);

        } else if (role === "faculty") {

            if (isBlank(req.user.facultyId)) {
                return res.json([]);
            }

            filter.status = "published";

            filter.schedule = {
                $elemMatch: {
                    facultyId: String(req.user.facultyId)
                }
            };
        }


        const timetables = await Timetable.find(filter)
            .sort({ createdAt: -1 });

        res.json(timetables);

    } catch (error) {

        console.error(
            "Error fetching timetables:",
            error
        );

        res.status(500).json({
            error: "Failed to fetch timetables"
        });
    }
});


// =======================================================
// GET TIMETABLE BY ID
// =======================================================

timetablesRouter.get("/:id", async (req, res) => {

    try {

        const timetable =
            await Timetable.findById(req.params.id);

        if (!timetable) {

            return res.status(404).json({
                error: "Timetable not found"
            });
        }

        const scoped = scopeTimetableForUser(timetable, req.user);

        if (!scoped) {

            return res.status(403).json({
                error:
                    "You do not have permission to view this timetable"
            });
        }

        res.json(scoped);

    } catch (error) {

        console.error(
            "Error fetching timetable:",
            error
        );

        res.status(500).json({
            error: "Failed to fetch timetable"
        });
    }
});


// =======================================================
// CREATE NEW TIMETABLE
// =======================================================

timetablesRouter.post("/", adminOnly, async (req, res) => {

    try {

        const timetable =
            new Timetable(req.body);

        await timetable.save();

        res.status(201).json(timetable);

    } catch (error) {

        console.error(
            "Error creating timetable:",
            error
        );

        res.status(500).json({
            error: "Failed to create timetable"
        });
    }
});


// =======================================================
// UPDATE TIMETABLE
// =======================================================

timetablesRouter.put("/:id", adminOnly, async (req, res) => {

    try {

        const timetable =
            await Timetable.findByIdAndUpdate(
                req.params.id,
                req.body,
                {
                    new: true,
                    runValidators: true
                }
            );

        if (!timetable) {

            return res.status(404).json({
                error: "Timetable not found"
            });
        }

        res.json(timetable);

    } catch (error) {

        console.error(
            "Error updating timetable:",
            error
        );

        res.status(500).json({
            error: "Failed to update timetable"
        });
    }
});


// =======================================================
// DELETE TIMETABLE
// =======================================================

timetablesRouter.delete("/:id", adminOnly, async (req, res) => {

    try {

        const timetable =
            await Timetable.findByIdAndDelete(
                req.params.id
            );

        if (!timetable) {

            return res.status(404).json({
                error: "Timetable not found"
            });
        }

        res.status(204).send();

    } catch (error) {

        console.error(
            "Error deleting timetable:",
            error
        );

        res.status(500).json({
            error: "Failed to delete timetable"
        });
    }
});


// =======================================================
// GENERATION PIPELINE (shared by /generate,
// /generate-local and the async job runner)
//
//   1. validate body {department, semester, year,
//      academicYear, gaOptions?, method?}
//   2. loadSchedulingContext → 404 when no courses match
//   3. AI (method === "ai" + GOOGLE_API_KEY) → genetic
//      algorithm → local constraint scheduler fallback
//      (/generate-local skips straight to local)
//   4. validateSchedule on every result
//   5. score, save as draft, notify, respond
//
// POST /generate answers 202 {jobId, steps} and then runs
// the pipeline on the event loop (runGenerationJob), which
// reports every stage through the job registry; clients
// follow it over the socket room `generation:<jobId>` or by
// polling GET /generate/:jobId/progress.
//
// POST /generate-local keeps the synchronous 201 contract
// the scripts depend on, but takes the same lock.
//
// Generation is CPU-bound, so only one run is allowed per
// process at a time: hasActiveJob() (the job registry, in
// place of the old module-level boolean) makes a concurrent
// caller a 409 instead of stalling the event loop twice.
// =======================================================

// Percentage each stage reports when it begins. "Evolving
// schedule" (index 4) spans 45 → 80 as the GA reports
// generations; the callers stamp 100 on completion.
const STEP_PERCENTAGES = [5, 15, 30, 40, 45, 85, 92];

const EVOLVE_STEP_INDEX = 4;
const EVOLVE_PERCENTAGE_BASE = 45;
const EVOLVE_PERCENTAGE_SPAN = 35;

const LAST_STEP_INDEX = GENERATION_STEPS.length - 1;

const BUSY_MESSAGE =
    "A timetable generation is already in progress. Please try again shortly.";


// Errors the pipeline raises for a bad request carry the
// HTTP status the synchronous caller must answer with; the
// async runner turns the very same errors into a failed job
// record, since its response has already been sent.
function pipelineError(status, message) {

    const error = new Error(message);

    error.status = status;

    return error;
}


// null when the body is usable, otherwise the 400 payload.
function validateGenerationBody(body) {

    const missing =
        REQUIRED_GENERATION_FIELDS.filter(
            field => isBlank(body?.[field])
        );

    if (missing.length === 0) {
        return null;
    }

    return {
        error:
            `Missing required fields: ${missing.join(", ")}`,
        missing
    };
}


// The generation inputs, kept on the job record so the
// runner (and a polling client) can read them back.
function generationParams(body) {

    const {
        department,
        semester,
        year,
        academicYear,
        gaOptions,
        method
    } = body || {};

    return {
        department,
        semester,
        year,
        academicYear,
        gaOptions: sanitizeGaOptions(gaOptions),
        method
    };
}


// Hours per faculty member, for the quality score.
function facultyLoadsOf(schedule) {

    const loads = {};

    for (const entry of schedule || []) {

        const key = String(entry.facultyId);

        loads[key] = (loads[key] || 0) + 1;
    }

    return loads;
}


// The configured grid, for quality scoring outside the
// generation pipeline (which already has one loaded).
async function loadActiveGrid() {

    try {

        const config =
            await SystemConfig.findOne({ key: "active" });

        return config
            ? getScheduleGrid(config)
            : DEFAULT_GRID;

    } catch (error) {

        console.error(
            "Failed to load scheduling grid:",
            error.message
        );

        return DEFAULT_GRID;
    }
}


// Answer a failed generation: 404 (and friends) keep their
// own message, anything else stays the historical 500.
function respondGenerationError(res, error, localOnly) {

    if (error?.status) {

        return res.status(error.status).json({
            error: error.message
        });
    }

    return res.status(500).json({

        error:
            localOnly
                ? "Failed to generate timetable locally"
                : "Failed to generate timetable.",

        details:
            error.message
    });
}


// =======================================================
// RUN GENERATION PIPELINE
// Returns the 201 payload. Throws on failure; a thrown
// error with `.status` is a request problem, anything else
// is a genuine generation failure.
// =======================================================

async function runGenerationPipeline({
    params,
    localOnly,
    app,
    jobId
}) {

    const {
        department,
        semester,
        year,
        academicYear,
        gaOptions,
        method
    } = params || {};

    const geneticOptions =
        sanitizeGaOptions(gaOptions);


    // Progress reporting is a no-op without a job id, so the
    // pipeline itself does not care which entry point ran it.
    const report = patch =>
        jobId
            ? updateJob(jobId, patch, app)
            : null;

    const stage = (stepIndex, patch = {}) =>
        report({
            status: "running",
            step: GENERATION_STEPS[stepIndex],
            stepIndex,
            percentage: STEP_PERCENTAGES[stepIndex],
            ...patch
        });


    const groupLabel =
        `${department}, year ${year}, semester ${semester}, academic year ${academicYear}`;


    console.log(
        "\n========================================"
    );

    console.log(
        localOnly
            ? "=== LOCAL CONSTRAINT TIMETABLE GENERATION ==="
            : "=== STARTING TIMETABLE GENERATION ==="
    );

    console.log(
        "========================================"
    );

    console.log(
        "Request:",
        { department, semester, year, academicYear, method }
    );


    // -------------------------------------------------
    // Load scheduling context
    // -------------------------------------------------

    stage(0);

    const context =
        await loadSchedulingContext({
            department,
            semester,
            year,
            academicYear
        });

    const {
        courses: relevantCourses,
        faculty: relevantFaculty,
        rooms: allRooms
    } = context;


    stage(1);


    if (relevantCourses.length === 0) {

        const message =
            `No courses found for ${groupLabel}`;

        console.warn("⚠️", message);

        await saveNotification(
            app,
            "Timetable Generation Skipped",
            message,
            "warning",
            { audience: "admin" }
        );

        throw pipelineError(404, message);
    }


    if (relevantFaculty.length === 0) {

        throw pipelineError(
            404,
            `No faculty found for department ${department}.`
        );
    }


    if (allRooms.length === 0) {

        throw pipelineError(
            404,
            "No rooms are available."
        );
    }


    console.log(
        `Courses: ${context.counts.courses}`
    );

    console.log(
        `Faculty: ${context.counts.faculty}`
    );

    console.log(
        `Rooms: ${context.counts.rooms}`
    );


    // -------------------------------------------------
    // STEP 1: GEMINI AI (optional)
    // -------------------------------------------------

    stage(2);

    const requestedMethod =
        String(method || "").toLowerCase();

    const tryAI =
        !localOnly &&
        requestedMethod === "ai" &&
        Boolean(process.env.GOOGLE_API_KEY);

    let aiAttempted = false;


    if (tryAI) {

        aiAttempted = true;

        try {

            console.log(
                "🤖 Trying Gemini AI scheduler..."
            );

            const createdTimetable =
                await generateTimetableWithAI(
                    {
                        department,
                        semester,
                        year,
                        academicYear
                    },
                    context
                );

            console.log(
                "✅ AI timetable generated and validated."
            );


            // generateTimetableWithAI validates and saves on
            // its own, so STEP 3-6 below never runs for this
            // branch. Report the same two stages and persist
            // the same quality / job metadata, otherwise an AI
            // timetable is the only one without them.

            stage(5);

            const aiSchedule =
                createdTimetable.schedule || [];

            const aiTotalHours =
                createdTimetable.metadata?.totalHours ??
                aiSchedule.length;

            const aiQuality =
                computeQualityScore({
                    hardViolations: 0,
                    softPenalty: 0,
                    sessionCount: aiTotalHours,
                    utilizationRate:
                        createdTimetable.metadata?.utilizationRate ?? 0,
                    facultyLoads:
                        facultyLoadsOf(aiSchedule),
                    conflictCount:
                        createdTimetable.metadata?.conflictCount ?? 0,
                    schedule: aiSchedule,
                    grid: context.grid
                });

            stage(6);

            createdTimetable.metadata.qualityScore =
                aiQuality.overall;

            createdTimetable.metadata.qualityBreakdown =
                aiQuality.breakdown;

            if (jobId) {
                createdTimetable.metadata.jobId = jobId;
            }

            createdTimetable.markModified("metadata");

            // The timetable itself is already saved; a failure to
            // persist the extra metadata must not send us down the
            // GA fallback and create a duplicate.
            try {

                await createdTimetable.save();

            } catch (metadataError) {

                console.warn(
                    "⚠️ Could not persist AI timetable quality metadata:",
                    metadataError.message
                );
            }

            const doc = createdTimetable.toObject();

            return {
                ...doc,
                generationMethod: "ai",
                stats: doc.metadata
            };

        } catch (aiError) {

            console.error(
                "⚠️ AI generation failed:"
            );

            console.error(
                aiError.message
            );

            console.log(
                "🔄 Switching to genetic algorithm scheduler..."
            );
        }
    }


    // -------------------------------------------------
    // STEP 2: GENETIC ALGORITHM (skipped by
    // /generate-local). Falls back to the local
    // constraint scheduler when it throws or the best
    // chromosome still has hard violations.
    // -------------------------------------------------

    let schedule = null;
    let gaStats = null;
    let warning = null;


    if (!localOnly) {

        try {

            console.log(
                "🧬 Running genetic algorithm scheduler...",
                geneticOptions
            );

            stage(3);

            const result =
                await generateGeneticTimetable({
                    courses: relevantCourses,
                    faculty: relevantFaculty,
                    rooms: allRooms,
                    options: geneticOptions,

                    // Observation only: the GA yields the event
                    // loop either way and the RNG stream is
                    // untouched, so progress reporting cannot
                    // change the schedule it produces.
                    onProgress: ({
                        generation,
                        maxGenerations,
                        bestFitness,
                        hard,
                        soft
                    }) => {

                        const span =
                            Number(maxGenerations) > 0
                                ? (Number(generation) / Number(maxGenerations))
                                : 0;

                        report({
                            status: "running",
                            step: GENERATION_STEPS[EVOLVE_STEP_INDEX],
                            stepIndex: EVOLVE_STEP_INDEX,
                            percentage: Math.round(
                                EVOLVE_PERCENTAGE_BASE +
                                (EVOLVE_PERCENTAGE_SPAN * Math.min(1, Math.max(0, span)))
                            ),
                            generation,
                            maxGenerations,
                            bestFitness,
                            hardViolations: hard,
                            softPenalty: soft
                        });
                    }
                });

            if (result.stats.hardViolations > 0) {

                (result.stats.validationErrors || [])
                    .forEach(error => {
                        console.error("❌", error);
                    });

                throw new Error(
                    `Genetic algorithm finished with ${result.stats.hardViolations} hard violation(s) after ${result.stats.generations} generations.`
                );
            }

            schedule = result.schedule;
            gaStats = result.stats;

            console.log(
                `✅ Genetic algorithm generated ${schedule.length} entries ` +
                `(seed ${gaStats.seed}, ${gaStats.generations} generations, ` +
                `fitness ${gaStats.bestFitness.toFixed(4)}, ` +
                `soft penalty ${gaStats.softPenalty}).`
            );

        } catch (gaError) {

            console.error(
                "⚠️ Genetic algorithm failed:"
            );

            console.error(
                gaError.message
            );

            console.log(
                "🔄 Switching to local constraint scheduler..."
            );

            warning =
                `Genetic algorithm did not produce a conflict-free timetable (${gaError.message}). ` +
                "Timetable generated using the local constraint scheduler.";
        }
    }


    // -------------------------------------------------
    // STEP 2b: LOCAL CONSTRAINT SCHEDULER
    // (baseline for /generate-local, fallback otherwise)
    // -------------------------------------------------

    if (!schedule) {

        stage(3);

        stage(EVOLVE_STEP_INDEX, {
            percentage: EVOLVE_PERCENTAGE_BASE
        });

        schedule =
            generateLocalTimetable({
                courses: relevantCourses,
                faculty: relevantFaculty,
                rooms: allRooms,
                days: DAYS,
                timeSlots: TIME_SLOTS.map(slotLabel),
                getWeeklySessions
            });

        console.log(
            `✅ Local scheduler generated ${schedule.length} entries.`
        );
    }


    // -------------------------------------------------
    // STEP 3: FINAL VALIDATION
    // -------------------------------------------------

    stage(5);

    const validation = validateSchedule(
        schedule,
        relevantCourses,
        relevantFaculty,
        allRooms
    );

    if (!validation.valid) {

        console.error(
            "❌ Generated timetable validation failed."
        );

        validation.errors.forEach(error => {
            console.error("❌", error);
        });

        // -------------------------------------------------
        // Local scheduler already prevents faculty / room /
        // student-group / availability conflicts. Do NOT
        // ignore those. Only specialization matching may
        // legitimately differ between the scheduler and the
        // validator.
        // -------------------------------------------------

        const hardErrors = validation.errors.filter(
            error =>
                !error.includes(
                    "is not suitably specialized"
                )
        );

        if (hardErrors.length > 0) {

            throw new Error(
                "Scheduler generated an invalid timetable: " +
                hardErrors.join(" | ")
            );
        }

        console.warn(
            "⚠️ Only specialization validation differs between " +
            "the scheduler and final validator."
        );

    } else {

        console.log(
            "✅ Generated timetable validation passed."
        );
    }


    // -------------------------------------------------
    // STEP 4: CONVERT TO TIMETABLE SCHEMA
    // -------------------------------------------------

    const timetableSchedule =
        schedule.map(entry => ({
            courseId: String(entry.courseId),
            facultyId: String(entry.facultyId),
            roomId: String(entry.roomId),
            day: entry.day,
            startTime: entry.startTime,
            endTime: entry.endTime
        }));


    // -------------------------------------------------
    // STEP 5: METADATA
    // -------------------------------------------------

    const generationMethod =
        gaStats
            ? "genetic-algorithm"
            : (aiAttempted || warning)
                ? "local-fallback"
                : "local";

    const engineLabel =
        gaStats
            ? "genetic algorithm"
            : "local constraint scheduler";

    console.log(
        `🏁 Result produced by: ${engineLabel} (${generationMethod})`
    );

    const totalHours =
        timetableSchedule.length;

    const availableSlots =
        DAYS.length *
        TIME_SLOTS.length;

    const utilizationRate =
        availableSlots > 0
            ? Math.round(
                (totalHours / availableSlots) * 100
            )
            : 0;

    const quality =
        computeQualityScore({
            hardViolations: gaStats ? gaStats.hardViolations : 0,
            softPenalty: gaStats ? gaStats.softPenalty : 0,
            sessionCount: totalHours,
            utilizationRate,
            facultyLoads: facultyLoadsOf(timetableSchedule),
            conflictCount: 0,
            schedule: timetableSchedule,
            grid: context.grid
        });


    // -------------------------------------------------
    // STEP 6: SAVE
    // -------------------------------------------------

    stage(6);

    const timetable =
        new Timetable({

            name:
                `${department} - Year ${year} Sem ${semester} (${academicYear})`,

            semester:
                String(semester),

            year:
                Number(year),

            academicYear:
                Number(academicYear),

            department,

            schedule:
                timetableSchedule,

            status:
                "draft",

            conflicts:
                [],

            metadata: {
                totalHours,
                utilizationRate,
                conflictCount: 0,
                generationMethod,
                qualityScore: quality.overall,
                qualityBreakdown: quality.breakdown,
                ...(jobId ? { jobId } : {}),
                ...(gaStats
                    ? {
                        seed: gaStats.seed,
                        generations: gaStats.generations,
                        populationSize: gaStats.populationSize,
                        bestFitness: gaStats.bestFitness,
                        hardViolations: gaStats.hardViolations,
                        softPenalty: gaStats.softPenalty,
                        fitnessHistory: gaStats.fitnessHistory
                    }
                    : {})
            }
        });


    const created =
        await timetable.save();


    console.log(
        `✅ Timetable saved (${generationMethod}). ID: ${created._id}`
    );


    await saveNotification(
        app,
        "Timetable Generated",
        `Generated a validated timetable "${created.name}" with ${totalHours} entries using the ${engineLabel}.`,
        "success",
        {
            audience: "admin",
            relatedTimetableId: String(created._id)
        }
    );


    // -------------------------------------------------
    // STEP 7: RETURN
    // -------------------------------------------------

    const doc = created.toObject();

    return {

        ...doc,

        generationMethod,

        stats: doc.metadata,

        ...(warning
            ? { warning }
            : {}),

        ...(aiAttempted
            ? {
                message:
                    `AI generation was unavailable or invalid. Timetable generated using the ${engineLabel}.`
            }
            : {})
    };
}


// =======================================================
// RUN GENERATION JOB
// The asynchronous half of POST /generate: the response
// (202) is already sent, so every outcome — including the
// "no courses" 404 — is reported through the job record.
// =======================================================

export async function runGenerationJob(app, jobId) {

    const job = getJob(jobId);

    if (!job) {

        console.warn(
            `⚠️ Generation job ${jobId} is unknown; nothing to run.`
        );

        return;
    }


    try {

        const payload =
            await runGenerationPipeline({
                params: job.params || {},
                localOnly: false,
                app,
                jobId
            });

        updateJob(
            jobId,
            {
                status: "completed",
                step: GENERATION_STEPS[LAST_STEP_INDEX],
                stepIndex: LAST_STEP_INDEX,
                percentage: 100,
                timetableId: String(payload._id),
                error: null
            },
            app
        );

    } catch (error) {

        console.error(
            "❌ Timetable generation failed:"
        );

        console.error(
            error
        );

        updateJob(
            jobId,
            {
                status: "failed",
                error:
                    error.message || "An unknown error occurred."
            },
            app
        );

        // A request-level problem (404 "no courses", ...) was
        // never notified when it came back as an HTTP status,
        // and the job record already carries it.
        if (!error?.status) {

            await saveNotification(
                app,
                "Timetable Generation Failed",
                error.message || "An unknown error occurred.",
                "error",
                { audience: "admin" }
            );
        }
    }
}


// =======================================================
// GENERATE TIMETABLE (ASYNC)
// AI (opt-in) → GENETIC ALGORITHM → LOCAL FALLBACK
// Answers 202 {jobId, steps}; progress arrives on the
// socket room `generation:<jobId>` or from the progress
// endpoint below.
// =======================================================

timetablesRouter.post("/generate", adminOnly, (req, res) => {

    const invalid =
        validateGenerationBody(req.body);

    if (invalid) {
        return res.status(400).json(invalid);
    }

    if (hasActiveJob()) {

        return res.status(409).json({
            error: BUSY_MESSAGE
        });
    }

    const jobId =
        createJob({
            userId: req.user?.userId,
            params: generationParams(req.body)
        });

    const app = req.app;

    res.status(202).json({
        jobId,
        steps: GENERATION_STEPS
    });

    setImmediate(() => runGenerationJob(app, jobId));
});


// =======================================================
// GENERATION PROGRESS
// Polling fallback for clients without a live socket.
// =======================================================

timetablesRouter.get(
    "/generate/:jobId/progress",
    adminOnly,
    (req, res) => {

        const job =
            getJob(req.params.jobId);

        if (!job) {

            return res.status(404).json({
                error: "Generation job not found"
            });
        }

        res.json(job);
    }
);


// =======================================================
// GENERATE TIMETABLE USING LOCAL CONSTRAINT ENGINE
// Synchronous 201 contract (scripts depend on it); it
// still takes the generation lock, so /generate and
// /generate-local cannot run at the same time.
// =======================================================

timetablesRouter.post("/generate-local", adminOnly, async (req, res) => {

    const invalid =
        validateGenerationBody(req.body);

    if (invalid) {
        return res.status(400).json(invalid);
    }

    if (hasActiveJob()) {

        return res.status(409).json({
            error: BUSY_MESSAGE
        });
    }

    const params =
        generationParams(req.body);

    const jobId =
        createJob({
            userId: req.user?.userId,
            params: { ...params, localOnly: true }
        });


    try {

        const payload =
            await runGenerationPipeline({
                params,
                localOnly: true,
                app: req.app,
                jobId
            });

        updateJob(
            jobId,
            {
                status: "completed",
                step: GENERATION_STEPS[LAST_STEP_INDEX],
                stepIndex: LAST_STEP_INDEX,
                percentage: 100,
                timetableId: String(payload._id),
                error: null
            },
            req.app
        );

        return res.status(201).json(payload);

    } catch (error) {

        console.error(
            "❌ Timetable generation failed:"
        );

        console.error(
            error
        );

        updateJob(
            jobId,
            {
                status: "failed",
                error:
                    error.message || "An unknown error occurred."
            },
            req.app
        );

        if (!error?.status) {

            await saveNotification(
                req.app,
                "Timetable Generation Failed",
                error.message || "An unknown error occurred.",
                "error",
                { audience: "admin" }
            );
        }

        return respondGenerationError(res, error, true);
    }
});


// =======================================================
// RESOLVE A CONFLICT
// PATCH /:id/conflicts/:index/resolve  { note }
// Marks one conflict resolved, then recomputes the
// unresolved conflict count and the quality score.
// =======================================================

timetablesRouter.patch(
    "/:id/conflicts/:index/resolve",
    adminOnly,
    async (req, res) => {

        try {

            const timetable =
                await Timetable.findById(req.params.id);

            if (!timetable) {

                return res.status(404).json({
                    error: "Timetable not found"
                });
            }


            const conflicts =
                timetable.conflicts || [];

            const index =
                Number(req.params.index);

            if (
                !Number.isInteger(index) ||
                index < 0 ||
                index >= conflicts.length
            ) {

                return res.status(404).json({
                    error: "Conflict not found"
                });
            }


            const note =
                String(req.body?.note ?? "").trim();

            const conflict = conflicts[index];

            conflict.resolved = true;
            conflict.resolvedBy = String(
                req.user?.userId || req.user?.name || ""
            );
            conflict.resolvedAt = new Date();

            if (note) {
                conflict.resolutionNote = note;
            }


            const unresolved =
                conflicts.filter(item => !item.resolved).length;

            if (!timetable.metadata) {
                timetable.metadata = {};
            }

            const metadata =
                timetable.metadata;

            const quality =
                computeQualityScore({
                    hardViolations: metadata.hardViolations,
                    softPenalty: metadata.softPenalty,
                    sessionCount: (timetable.schedule || []).length,
                    utilizationRate: metadata.utilizationRate,
                    facultyLoads: facultyLoadsOf(timetable.schedule),
                    conflictCount: unresolved,
                    schedule: timetable.schedule,
                    grid: await loadActiveGrid()
                });

            timetable.metadata.conflictCount = unresolved;
            timetable.metadata.qualityScore = quality.overall;
            timetable.metadata.qualityBreakdown = quality.breakdown;

            const updated =
                await timetable.save();

            res.json(updated);

        } catch (error) {

            console.error(
                "Error resolving conflict:",
                error
            );

            res.status(500).json({
                error: "Failed to resolve conflict"
            });
        }
    }
);


// =======================================================
// ADD A COMMENT
// POST /:id/comments  { text }
// Open to every authenticated role, but only on a
// timetable the caller may read: scopeTimetableForUser is
// applied here exactly as GET /:id applies it, so a draft
// or another cohort's timetable is a 403 here too. The
// response carries the created comment alone — returning
// the whole thread would disclose more than the caller's
// scope allows.
// =======================================================

// Defensive bounds on unbounded user input, in the spirit of
// sanitizeGaOptions: a comment array is embedded in the
// timetable document, which has a 16MB ceiling.
const MAX_COMMENT_LENGTH = 2000;
const MAX_COMMENTS_PER_TIMETABLE = 500;

timetablesRouter.post("/:id/comments", async (req, res) => {

    try {

        const text =
            String(req.body?.text ?? "").trim();

        if (!text) {

            return res.status(400).json({
                error: "text is required"
            });
        }

        if (text.length > MAX_COMMENT_LENGTH) {

            return res.status(400).json({
                error:
                    `text must be at most ${MAX_COMMENT_LENGTH} characters`
            });
        }


        const timetable =
            await Timetable.findById(req.params.id);

        if (!timetable) {

            return res.status(404).json({
                error: "Timetable not found"
            });
        }

        if (!scopeTimetableForUser(timetable, req.user)) {

            return res.status(403).json({
                error:
                    "You do not have permission to comment on this timetable"
            });
        }

        if (
            (timetable.comments || []).length >=
            MAX_COMMENTS_PER_TIMETABLE
        ) {

            return res.status(400).json({
                error:
                    `This timetable already has the maximum of ${MAX_COMMENTS_PER_TIMETABLE} comments`
            });
        }


        const comment = {
            userId: String(req.user?.userId || ""),
            name: req.user?.name || "",
            role: String(req.user?.role || ""),
            text,
            createdAt: new Date()
        };

        timetable.comments.push(comment);

        const updated =
            await timetable.save();

        const comments =
            updated.comments || [];

        res.status(201).json({
            comment: comments[comments.length - 1]
        });

    } catch (error) {

        console.error(
            "Error adding comment:",
            error
        );

        res.status(500).json({
            error: "Failed to add comment"
        });
    }
});


// =======================================================
// PUBLISH TIMETABLE
// Sets status → published, stamps publishedAt and
// archives any other published timetable for the same
// department / semester / year / academicYear.
// =======================================================

timetablesRouter.patch("/:id/publish", adminOnly, async (req, res) => {

    try {

        const timetable =
            await Timetable.findById(req.params.id);

        if (!timetable) {

            return res.status(404).json({
                error: "Timetable not found"
            });
        }


        timetable.status = "published";
        timetable.publishedAt = new Date();

        await timetable.save();


        const archived =
            await Timetable.updateMany(
                {
                    _id: { $ne: timetable._id },
                    department: timetable.department,
                    semester: timetable.semester,
                    year: timetable.year,
                    academicYear: timetable.academicYear ?? null,
                    status: "published"
                },
                {
                    $set: { status: "archived" }
                }
            );


        await saveNotification(
            req.app,
            "Timetable Published",
            `"${timetable.name}" is now published.` +
            (
                archived.modifiedCount > 0
                    ? ` ${archived.modifiedCount} previously published timetable(s) archived.`
                    : ""
            ),
            "success",
            { relatedTimetableId: String(timetable._id) }
        );


        res.json({
            ...timetable.toObject(),
            archivedCount: archived.modifiedCount
        });

    } catch (error) {

        console.error(
            "Error publishing timetable:",
            error
        );

        res.status(500).json({
            error: "Failed to publish timetable"
        });
    }
});


// =======================================================
// EXPORT TIMETABLE
// GET /:id/export?format=csv|json
// Rows: day,startTime,endTime,courseCode,courseName,
//       faculty,room
// =======================================================

function csvCell(value) {
    const text = String(value ?? "");

    return /[",\n\r]/.test(text)
        ? `"${text.replace(/"/g, '""')}"`
        : text;
}

timetablesRouter.get("/:id/export", async (req, res) => {

    try {

        const format =
            String(req.query.format || "csv").toLowerCase();

        if (format !== "csv" && format !== "json") {

            return res.status(400).json({
                error: "format must be csv or json"
            });
        }


        const timetable =
            await Timetable.findById(req.params.id);

        if (!timetable) {

            return res.status(404).json({
                error: "Timetable not found"
            });
        }


        // -------------------------------------------------
        // Role scoping
        // -------------------------------------------------

        const role = String(req.user?.role || "").toLowerCase();

        let entries = timetable.schedule || [];


        if (role === "student") {

            if (
                timetable.status !== "published" ||
                isBlank(req.user.department) ||
                !matchesStudentGroup(timetable, req.user)
            ) {

                return res.status(403).json({
                    error:
                        "You do not have permission to export this timetable"
                });
            }

        } else if (role === "faculty") {

            const facultyId = String(req.user.facultyId || "");

            entries = facultyId
                ? entries.filter(
                    entry => String(entry.facultyId) === facultyId
                )
                : [];

            if (timetable.status !== "published" || !entries.length) {

                return res.status(403).json({
                    error:
                        "You do not have permission to export this timetable"
                });
            }
        }


        // -------------------------------------------------
        // Resolve names
        // -------------------------------------------------

        const unique = key =>
            [...new Set(entries.map(entry => String(entry[key])))];

        const [courses, faculty, rooms] =
            await Promise.all([
                Course.find({ _id: { $in: unique("courseId") } }),
                Faculty.find({ _id: { $in: unique("facultyId") } }),
                Room.find({ _id: { $in: unique("roomId") } })
            ]);

        const byId = list =>
            new Map(list.map(doc => [String(doc._id), doc]));

        const courseById = byId(courses);
        const facultyById = byId(faculty);
        const roomById = byId(rooms);


        const dayIndex = day =>
            DAYS.indexOf(day) === -1 ? DAYS.length : DAYS.indexOf(day);

        const rows =
            [...entries]
                .sort((a, b) =>
                    dayIndex(a.day) - dayIndex(b.day) ||
                    String(a.startTime).localeCompare(String(b.startTime))
                )
                .map(entry => {

                    const course = courseById.get(String(entry.courseId));
                    const member = facultyById.get(String(entry.facultyId));
                    const room = roomById.get(String(entry.roomId));

                    return {
                        day: entry.day,
                        startTime: entry.startTime,
                        endTime: entry.endTime,
                        courseCode: course ? course.code : "",
                        courseName: course ? course.name : "Unknown",
                        faculty: member ? member.name : "Unknown",
                        room: room ? room.name : "Unknown"
                    };
                });


        // -------------------------------------------------
        // Respond
        // -------------------------------------------------

        const baseName =
            String(timetable.name || "timetable")
                .replace(/[^a-z0-9]+/gi, "_")
                .replace(/^_+|_+$/g, "") || "timetable";


        if (format === "json") {

            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${baseName}.json"`
            );

            return res.json({
                id: timetable._id,
                name: timetable.name,
                department: timetable.department,
                semester: timetable.semester,
                year: timetable.year,
                academicYear: timetable.academicYear ?? null,
                status: timetable.status,
                rows
            });
        }


        const header = [
            "day",
            "startTime",
            "endTime",
            "courseCode",
            "courseName",
            "faculty",
            "room"
        ];

        const csv =
            [
                header.join(","),
                ...rows.map(row =>
                    header.map(key => csvCell(row[key])).join(",")
                )
            ].join("\r\n");

        res.setHeader("Content-Type", "text/csv; charset=utf-8");

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${baseName}.csv"`
        );

        return res.send(csv);

    } catch (error) {

        console.error(
            "Error exporting timetable:",
            error
        );

        res.status(500).json({
            error: "Failed to export timetable"
        });
    }
});


// =======================================================
// AI OPTIMIZATION
// =======================================================

// Keep this section disabled until the basic generation
// and local fallback system are fully tested.


// timetablesRouter.post("/:id/optimize", async (req, res) => {

//     try {

//         const timetable =
//             await Timetable.findById(req.params.id);

//         if (!timetable) {

//             return res.status(404).json({
//                 error: "Timetable not found"
//             });
//         }

//         // Optimization logic will be added later.

//         res.json(timetable);

//     } catch (error) {

//         console.error(
//             "Error optimizing timetable:",
//             error
//         );

//         res.status(500).json({
//             error: "Failed to optimize timetable"
//         });
//     }
// });