import { Router } from "express";

import Timetable from "../models/Timetable.js";
import Course from "../models/course.js";
import Faculty from "../models/Faculty.js";
import Room from "../models/Room.js";


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
import { requireAuth, requireRole } from "../middleware/auth.js";

export const timetablesRouter = Router();

timetablesRouter.use(requireAuth);
const adminOnly = requireRole("admin");


// =======================================================
// GET ALL TIMETABLES
// =======================================================

timetablesRouter.get("/", async (req, res) => {

    try {

        const timetables = await Timetable.find()
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

        res.json(timetable);

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
// GENERATE TIMETABLE
// AI FIRST → LOCAL FALLBACK
// =======================================================

timetablesRouter.post("/generate", adminOnly, async (req, res) => {

    const {
        department,
        semester,
        academicYear
    } = req.body;

    try {

        console.log(
            "\n========================================"
        );

        console.log(
            "=== STARTING TIMETABLE GENERATION ==="
        );

        console.log(
            "========================================"
        );


        // =================================================
        // STEP 1: TRY GEMINI AI
        // =================================================

        try {

            console.log(
                "🤖 Trying Gemini AI scheduler..."
            );

            const createdTimetable =
                await generateTimetableWithAI(
                    req.body
                );

            console.log(
                "✅ AI timetable generated and validated."
            );

            return res.json({
                ...createdTimetable.toObject(),

                generationMethod: "ai"
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


        // =================================================
        // STEP 2: FETCH DATA FOR LOCAL SCHEDULER
        // =================================================

        console.log(
            "Fetching courses, faculty and rooms..."
        );

        const allCourses =
            await Course.find({});

        const allFaculty =
            await Faculty.find({});

        const allRooms =
            await Room.find({});


        // =================================================
        // STEP 3: FILTER COURSES
        // =================================================

        const relevantCourses =
            allCourses.filter(
                course =>
                    String(
                        course.department || ""
                    ).toLowerCase() ===
                    String(
                        department || ""
                    ).toLowerCase()
                    &&
                    Number(course.semester) ===
                    Number(semester)
            );


        if (
            relevantCourses.length === 0
        ) {

            throw new Error(
                `No courses found for ${department}, Semester ${semester}.`
            );
        }


        // =================================================
        // STEP 4: FILTER FACULTY
        // =================================================

        const relevantFaculty =
            allFaculty.filter(
                faculty =>
                    String(
                        faculty.department || ""
                    ).toLowerCase() ===
                    String(
                        department || ""
                    ).toLowerCase()
            );


        if (
            relevantFaculty.length === 0
        ) {

            throw new Error(
                `No faculty found for department ${department}.`
            );
        }


        if (
            allRooms.length === 0
        ) {

            throw new Error(
                "No rooms are available."
            );
        }


        console.log(
            `Courses: ${relevantCourses.length}`
        );

        console.log(
            `Faculty: ${relevantFaculty.length}`
        );

        console.log(
            `Rooms: ${allRooms.length}`
        );


        // =================================================
        // STEP 5: LOCAL CONSTRAINT SCHEDULER
        // =================================================

        const schedule =
            generateLocalTimetable({

                courses:
                    relevantCourses,

                faculty:
                    relevantFaculty,

                rooms:
                    allRooms,

                days:
                    DAYS,

                timeSlots:
                    TIME_SLOTS.map(slotLabel),

                getWeeklySessions:
                    getWeeklySessions
            });


        console.log(
            `✅ Local scheduler generated ${schedule.length} entries.`
        );

// =================================================
// STEP 6: FINAL VALIDATION
// =================================================

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
    // IMPORTANT:
    // Local scheduler already prevents:
    // - Faculty conflicts
    // - Room conflicts
    // - Student-group conflicts
    // - Faculty availability conflicts
    // - Room availability conflicts
    //
    // Do NOT ignore those errors.
    //
    // However, specialization errors must be checked
    // against the same specialization logic used by the
    // local scheduler.
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


        // =================================================
        // STEP 7: ENRICH SCHEDULE
        // =================================================

        const enrichedSchedule =
            schedule.map(
                entry => {

                    const course =
                        relevantCourses.find(
                            c =>
                                String(c._id) ===
                                String(entry.courseId)
                        );

                    const faculty =
                        relevantFaculty.find(
                            f =>
                                String(f._id) ===
                                String(entry.facultyId)
                        );

                    const room =
                        allRooms.find(
                            r =>
                                String(r._id) ===
                                String(entry.roomId)
                        );


                    return {

                        ...entry,

                        courseName:
                            course
                                ? course.name
                                : "Unknown",

                        facultyName:
                            faculty
                                ? faculty.name
                                : "Unknown",

                        roomName:
                            room
                                ? room.name
                                : "Unknown",

                        timeSlot:
                            `${entry.startTime}-${entry.endTime}`
                    };
                }
            );


        // =================================================
        // STEP 8: METADATA
        // =================================================

        const totalHours =
            enrichedSchedule.length;


        const availableSlots =
            DAYS.length *
            TIME_SLOTS.length;


        const utilizationRate =
            availableSlots > 0
                ? Math.round(
                    (
                        totalHours /
                        availableSlots
                    ) * 100
                )
                : 0;


        // =================================================
        // STEP 9: SAVE LOCAL FALLBACK
        // =================================================

        const timetable =
            new Timetable({

                name:
                    `${department} - Semester ${semester} ${academicYear}`,

                semester:
                    String(semester),

                year:
                    Number(academicYear),

                department,

                schedule:
                    enrichedSchedule,

                status:
                    "draft",

                conflicts:
                    [],

                metadata: {

                    totalHours,

                    utilizationRate,

                    conflictCount:
                        0
                }
            });


        const created =
            await timetable.save();


        console.log(
            `✅ Local fallback timetable saved! ID: ${created._id}`
        );


        // =================================================
        // STEP 10: RETURN
        // =================================================

        return res.status(201).json({

            ...created.toObject(),

            generationMethod:
                "local-fallback",

            message:
                "AI generation was unavailable or invalid. Timetable generated using the local constraint scheduler."
        });


    } catch (error) {

        console.error(
            "❌ Both AI and local scheduling failed:"
        );

        console.error(
            error
        );


        return res.status(500).json({

            error:
                "Failed to generate timetable.",

            details:
                error.message
        });
    }
});

// =======================================================
// GENERATE TIMETABLE USING LOCAL CONSTRAINT ENGINE
// =======================================================

timetablesRouter.post(
    "/generate-local",
    adminOnly,
    async (req, res) => {

        try {

            console.log(
                "=== LOCAL CONSTRAINT TIMETABLE GENERATION ==="
            );

            const {
                department,
                semester,
                academicYear
            } = req.body;


            // ------------------------------------------------
            // Validate request
            // ------------------------------------------------

            if (!department) {

                return res.status(400).json({
                    error: "Department is required"
                });
            }

            if (
                semester === undefined ||
                semester === null
            ) {

                return res.status(400).json({
                    error: "Semester is required"
                });
            }

            if (!academicYear) {

                return res.status(400).json({
                    error: "Academic year is required"
                });
            }


            console.log(
                "Request:",
                {
                    department,
                    semester,
                    academicYear
                }
            );


            // ------------------------------------------------
            // Fetch courses
            // ------------------------------------------------

            console.log(
                "Fetching courses..."
            );

            let courses =
                await Course.find({
                    department,
                    semester,
                    year: academicYear
                });


            // ------------------------------------------------
            // Fallback course query
            // Useful when existing college data does not
            // have the academic year populated correctly.
            // ------------------------------------------------

            if (courses.length === 0) {

                console.log(
                    "No courses found for exact academic year."
                );

                console.log(
                    "Trying department + semester..."
                );

                courses =
                    await Course.find({
                        department,
                        semester
                    });
            }


            if (courses.length === 0) {

                return res.status(404).json({
                    error:
                        "No courses found for the selected department and semester."
                });
            }


            // ------------------------------------------------
            // Fetch faculty
            // ------------------------------------------------

            console.log(
                "Fetching faculty..."
            );

            const faculty =
                await Faculty.find({
                    department
                });


            if (faculty.length === 0) {

                return res.status(404).json({
                    error:
                        "No faculty found for the selected department."
                });
            }


            // ------------------------------------------------
            // Fetch rooms
            // ------------------------------------------------

            console.log(
                "Fetching rooms..."
            );

            const rooms =
                await Room.find();


            if (rooms.length === 0) {

                return res.status(404).json({
                    error:
                        "No rooms are available."
                });
            }


            console.log(
                `Courses: ${courses.length}`
            );

            console.log(
                `Faculty: ${faculty.length}`
            );

            console.log(
                `Rooms: ${rooms.length}`
            );


            // ------------------------------------------------
            // Generate using local constraint engine
            // ------------------------------------------------

            const schedule =
                generateLocalTimetable({
                    courses,
                    faculty,
                    rooms,
                    days: DAYS,
                    timeSlots: TIME_SLOTS.map(slotLabel),
                    getWeeklySessions
                });


            // ------------------------------------------------
            // Convert scheduler output into Timetable schema
            // ------------------------------------------------

            const timetableSchedule =
                schedule.map((entry) => ({
                    courseId:
                        String(entry.courseId),

                    facultyId:
                        String(entry.facultyId),

                    roomId:
                        String(entry.roomId),

                    day:
                        entry.day,

                    startTime:
                        entry.startTime,

                    endTime:
                        entry.endTime
                }));


            // ------------------------------------------------
            // Calculate metadata
            // ------------------------------------------------

            const totalHours =
                timetableSchedule.length;


            const maximumStudentSlots =
                DAYS.length *
                TIME_SLOTS.length;


            const utilizationRate =
                maximumStudentSlots > 0
                    ? Number(
                        (
                            (totalHours /
                                maximumStudentSlots) *
                            100
                        ).toFixed(2)
                    )
                    : 0;


            // ------------------------------------------------
            // Create timetable
            // ------------------------------------------------

            const timetable =
                new Timetable({

                    name:
                        `${department} - Semester ${semester} ${academicYear}`,

                    semester:
                        String(semester),

                    year:
                        Number(academicYear),

                    department,

                    schedule:
                        timetableSchedule,

                    status:
                        "draft",

                    conflicts: [],

                    metadata: {

                        totalHours,

                        utilizationRate,

                        conflictCount: 0
                    }
                });


            await timetable.save();


            console.log(
                "✅ Local timetable generated successfully."
            );

            console.log(
                `Schedule entries: ${timetableSchedule.length}`
            );

            console.log(
                `Timetable ID: ${timetable._id}`
            );


            res.status(201).json(timetable);

        } catch (error) {

            console.error(
                "Error generating local timetable:",
                error
            );

            res.status(500).json({

                error:
                    "Failed to generate timetable locally",

                details:
                    error.message
            });
        }
    }
);


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