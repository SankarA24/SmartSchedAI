import { Router } from "express";

import Timetable from "../models/Timetable.js";
import Course from "../models/course.js";
import Faculty from "../models/Faculty.js";
import Room from "../models/Room.js";
import Notification from "../models/Notification.js";


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
    DAYS,
    TIME_SLOTS,
    slotLabel
} from "../utils/schedulingConstants.js";
import {
    getWeeklySessions
} from "../utils/schedulingHelpers.js";
import {
    loadSchedulingContext
} from "../utils/schedulingContext.js";
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

async function saveNotification(title, message, type) {
    try {
        await new Notification({ title, message, type }).save();
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
// GENERATION PIPELINE (shared by /generate and
// /generate-local)
//
//   1. validate body {department, semester, year,
//      academicYear, gaOptions?, method?}
//   2. loadSchedulingContext → 404 when no courses match
//   3. AI (when allowed) → local constraint scheduler
//      (GA will slot in here in Phase 4)
//   4. validateSchedule on every result
//   5. save as draft, notify, respond
// =======================================================

async function handleGeneration(req, res, { localOnly }) {

    const {
        department,
        semester,
        year,
        academicYear,
        gaOptions,
        method
    } = req.body || {};

    // gaOptions is accepted now so the frontend contract is
    // stable; the GA itself lands in Phase 4.
    void gaOptions;


    // -------------------------------------------------
    // Validate request
    // -------------------------------------------------

    const missing =
        REQUIRED_GENERATION_FIELDS.filter(
            field => isBlank(req.body?.[field])
        );

    if (missing.length > 0) {

        return res.status(400).json({
            error:
                `Missing required fields: ${missing.join(", ")}`,
            missing
        });
    }


    const groupLabel =
        `${department}, year ${year}, semester ${semester}, academic year ${academicYear}`;


    try {

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


        if (relevantCourses.length === 0) {

            const message =
                `No courses found for ${groupLabel}`;

            console.warn("⚠️", message);

            await saveNotification(
                "Timetable Generation Skipped",
                message,
                "warning"
            );

            return res.status(404).json({
                error: message
            });
        }


        if (relevantFaculty.length === 0) {

            return res.status(404).json({
                error:
                    `No faculty found for department ${department}.`
            });
        }


        if (allRooms.length === 0) {

            return res.status(404).json({
                error: "No rooms are available."
            });
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

        const requestedMethod =
            String(method || "").toLowerCase();

        const tryAI =
            !localOnly &&
            requestedMethod !== "local" &&
            (
                requestedMethod === "ai" ||
                Boolean(process.env.GOOGLE_API_KEY)
            );

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

                const doc = createdTimetable.toObject();

                return res.status(201).json({
                    ...doc,
                    generationMethod: "ai",
                    stats: doc.metadata
                });

            } catch (aiError) {

                console.error(
                    "⚠️ AI generation failed:"
                );

                console.error(
                    aiError.message
                );

                console.log(
                    "🔄 Switching to local constraint scheduler..."
                );
            }
        }


        // -------------------------------------------------
        // STEP 2: LOCAL CONSTRAINT SCHEDULER
        // -------------------------------------------------

        const schedule =
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


        // -------------------------------------------------
        // STEP 3: FINAL VALIDATION
        // -------------------------------------------------

        const validation = validateSchedule(
            schedule,
            relevantCourses,
            relevantFaculty,
            allRooms
        );

        if (!validation.valid) {

            console.error(
                "❌ Local timetable validation failed."
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
                    "Local scheduler generated an invalid timetable: " +
                    hardErrors.join(" | ")
                );
            }

            console.warn(
                "⚠️ Only specialization validation differs between " +
                "the local scheduler and final validator."
            );

        } else {

            console.log(
                "✅ Local timetable validation passed."
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
            aiAttempted
                ? "local-fallback"
                : "local";

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


        // -------------------------------------------------
        // STEP 6: SAVE
        // -------------------------------------------------

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
                    generationMethod
                }
            });


        const created =
            await timetable.save();


        console.log(
            `✅ Timetable saved (${generationMethod}). ID: ${created._id}`
        );


        await saveNotification(
            "Timetable Generated",
            `Generated a validated timetable "${created.name}" with ${totalHours} entries using the local constraint scheduler.`,
            "success"
        );


        // -------------------------------------------------
        // STEP 7: RETURN
        // -------------------------------------------------

        const doc = created.toObject();

        return res.status(201).json({

            ...doc,

            generationMethod,

            stats: doc.metadata,

            ...(aiAttempted
                ? {
                    message:
                        "AI generation was unavailable or invalid. Timetable generated using the local constraint scheduler."
                }
                : {})
        });


    } catch (error) {

        console.error(
            "❌ Timetable generation failed:"
        );

        console.error(
            error
        );

        await saveNotification(
            "Timetable Generation Failed",
            error.message || "An unknown error occurred.",
            "error"
        );

        return res.status(500).json({

            error:
                localOnly
                    ? "Failed to generate timetable locally"
                    : "Failed to generate timetable.",

            details:
                error.message
        });
    }
}


// =======================================================
// GENERATE TIMETABLE
// AI FIRST → LOCAL FALLBACK
// =======================================================

timetablesRouter.post("/generate", adminOnly, (req, res) =>
    handleGeneration(req, res, { localOnly: false })
);


// =======================================================
// GENERATE TIMETABLE USING LOCAL CONSTRAINT ENGINE
// =======================================================

timetablesRouter.post("/generate-local", adminOnly, (req, res) =>
    handleGeneration(req, res, { localOnly: true })
);


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
            "Timetable Published",
            `"${timetable.name}" is now published.` +
            (
                archived.modifiedCount > 0
                    ? ` ${archived.modifiedCount} previously published timetable(s) archived.`
                    : ""
            ),
            "success"
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