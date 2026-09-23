// backend/utils/timetableGenerator.js

import { GoogleGenAI } from "@google/genai";
import Course from "../models/course.js";
import Faculty from "../models/Faculty.js";
import Room from "../models/Room.js";
import Timetable from "../models/Timetable.js";
import Notification from "../models/Notification.js";
import dotenv from "dotenv";
import { DEFAULT_GRID } from "./schedulingConstants.js";
import { getWeeklySessions } from "./schedulingHelpers.js";

dotenv.config({ quiet: true });

// =========================================================
// AI INITIALIZATION
// =========================================================

let genAI;

try {
    if (!process.env.GOOGLE_API_KEY) {
        throw new Error(
            "GOOGLE_API_KEY is not set in environment variables."
        );
    }

    genAI = new GoogleGenAI({
        apiKey: process.env.GOOGLE_API_KEY,
    });

    console.log("Google AI (Gemini) initialized successfully");

} catch (error) {
    console.error(
        "Failed to initialize Google AI:",
        error.message
    );
}


// =========================================================
// CONFIGURATION
// =========================================================
//
// WEEKS, DAYS, TIME_SLOTS, BREAK_SLOT and getWeeklySessions
// used to be private copies of the shared scheduling grid.
// The days, slots, breaks and week count now come from the
// `grid` argument (DEFAULT_GRID, imported from
// ./schedulingConstants.js, when a caller passes none), and
// getWeeklySessions from ./schedulingHelpers.js, so the prompt,
// this file's validator and the metadata all agree with the
// genetic scheduler, the local scheduler and the validator.

const MAX_GENERATION_ATTEMPTS = 3;


// =========================================================
// HELPER - PARSE AI RESPONSE
// =========================================================

function parseAIResponse(text) {

    if (
        !text ||
        typeof text !== "string"
    ) {
        return [];
    }

    let clean = text
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    // Sometimes AI returns extra text before/after JSON.
    const firstBracket = clean.indexOf("[");
    const lastBracket = clean.lastIndexOf("]");

    if (
        firstBracket !== -1 &&
        lastBracket !== -1 &&
        lastBracket > firstBracket
    ) {
        clean = clean.substring(
            firstBracket,
            lastBracket + 1
        );
    }

    try {

        const parsed = JSON.parse(clean);

        return Array.isArray(parsed)
            ? parsed
            : [];

    } catch (error) {

        console.error(
            "Failed to parse AI JSON response:",
            error.message
        );

        return [];
    }
}


// =========================================================
// HELPER - TIME TO MINUTES
// =========================================================

function timeToMinutes(time) {

    if (
        !time ||
        typeof time !== "string"
    ) {
        return null;
    }

    const parts = time.split(":");

    if (parts.length !== 2) {
        return null;
    }

    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);

    if (
        Number.isNaN(hours) ||
        Number.isNaN(minutes) ||
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
    ) {
        return null;
    }

    return (
        hours * 60 +
        minutes
    );
}


// =========================================================
// HELPER - CHECK TIME OVERLAP
// =========================================================

function timeOverlaps(
    start1,
    end1,
    start2,
    end2
) {

    const s1 = timeToMinutes(start1);
    const e1 = timeToMinutes(end1);

    const s2 = timeToMinutes(start2);
    const e2 = timeToMinutes(end2);

    if (
        s1 === null ||
        e1 === null ||
        s2 === null ||
        e2 === null
    ) {
        return false;
    }

    return (
        s1 < e2 &&
        s2 < e1
    );
}


// =========================================================
// HELPER - AVAILABILITY
// =========================================================

function isWithinAvailability(
    availability,
    day,
    startTime,
    endTime
) {

    if (!availability) {
        return false;
    }

    const dayKey =
        day.toLowerCase();

    const availableSlots =
        availability[dayKey];

    if (
        !Array.isArray(
            availableSlots
        )
    ) {
        return false;
    }

    const classStart =
        timeToMinutes(startTime);

    const classEnd =
        timeToMinutes(endTime);

    if (
        classStart === null ||
        classEnd === null
    ) {
        return false;
    }

    return availableSlots.some(
        slot => {

            const availableStart =
                timeToMinutes(slot.start);

            const availableEnd =
                timeToMinutes(slot.end);

            if (
                availableStart === null ||
                availableEnd === null
            ) {
                return false;
            }

            return (
                classStart >= availableStart &&
                classEnd <= availableEnd
            );
        }
    );
}


// =========================================================
// HELPER - NORMALIZE TEXT
// =========================================================

function normalizeText(value) {

    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}


// =========================================================
// HELPER - SPECIALIZATION MATCH
// =========================================================

function specializationMatches(course, faculty) {

    const specializations = Array.isArray(faculty.specialization)
        ? faculty.specialization
        : [];

    if (specializations.length === 0) {
        return false;
    }

    const courseText = normalizeText(
        `${course.name || ""} ${course.code || ""} ${course.description || ""}`
    );

    if (!courseText) {
        return false;
    }

    const courseWords = new Set(
        courseText
            .split(" ")
            .filter(word => word.length >= 3)
    );

    return specializations.some(specialization => {

        const specializationText = normalizeText(
            specialization
        );

        if (!specializationText) {
            return false;
        }

        // 1. Exact phrase match
        if (courseText === specializationText) {
            return true;
        }

        // 2. Course contains the complete specialization
        if (courseText.includes(specializationText)) {
            return true;
        }

        // 3. Specialization contains the complete course name
        if (
            specializationText.length >= 6 &&
            specializationText.includes(courseText)
        ) {
            return true;
        }

        // 4. For multi-word specializations,
        // require at least 2 matching meaningful words.
        const specializationWords = specializationText
            .split(" ")
            .filter(word => word.length >= 3);

        if (specializationWords.length >= 2) {

            const matchingWords = specializationWords.filter(
                word => courseWords.has(word)
            );

            return matchingWords.length >= 2;
        }

        // 5. Single-word specialization:
        // require exact word match, not partial substring.
        if (specializationWords.length === 1) {
            return courseWords.has(specializationWords[0]);
        }

        return false;
    });
}


// =========================================================
// HELPER - ROOM TYPE MATCH
// =========================================================

function roomTypeMatches(
    course,
    room
) {

    const courseType =
        String(
            course.type || "lecture"
        ).toLowerCase();

    const roomType =
        String(
            room.type || ""
        ).toLowerCase();

    // Lab course -> lab room only
    if (
        courseType === "lab"
    ) {
        return roomType === "lab";
    }

    // Seminar -> seminar room or auditorium
    if (
        courseType === "seminar"
    ) {
        return (
            roomType === "seminar_room" ||
            roomType === "auditorium"
        );
    }

    // Lecture -> lecture hall / seminar room / auditorium
    return (
        roomType === "lecture_hall" ||
        roomType === "seminar_room" ||
        roomType === "auditorium"
    );
}


// =========================================================
// VALIDATE SCHEDULE
// =========================================================

export function validateSchedule(
    schedule,
    relevantCourses,
    relevantFaculty,
    allRooms,
    grid = DEFAULT_GRID
) {

    const errors = [];

    // -------------------------------------------------------
    // 1. Schedule must contain entries
    // -------------------------------------------------------

    if (
        !Array.isArray(schedule) ||
        schedule.length === 0
    ) {

        errors.push(
            "Generated schedule is empty."
        );

        return {
            valid: false,
            errors,
        };
    }


    // -------------------------------------------------------
    // 2. Validate IDs
    // -------------------------------------------------------

    schedule.forEach(
        (entry, index) => {

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

            if (!course) {

                errors.push(
                    `Entry ${index + 1}: Invalid courseId ${entry.courseId}`
                );
            }

            if (!faculty) {

                errors.push(
                    `Entry ${index + 1}: Invalid facultyId ${entry.facultyId}`
                );
            }

            if (!room) {

                errors.push(
                    `Entry ${index + 1}: Invalid roomId ${entry.roomId}`
                );
            }
        }
    );


    // -------------------------------------------------------
    // 3. Validate day
    // -------------------------------------------------------

    for (
        const entry of schedule
    ) {

        if (
            !grid.days.includes(
                entry.day
            )
        ) {

            errors.push(
                `Invalid day "${entry.day}"`
            );
        }
    }


    // -------------------------------------------------------
    // 4. Validate time slot
    // -------------------------------------------------------

    for (
        const entry of schedule
    ) {

        const validSlot =
            grid.slots.some(
                slot =>
                    slot.start ===
                        entry.startTime &&
                    slot.end ===
                        entry.endTime
            );

        if (!validSlot) {

            errors.push(
                `Invalid time slot: ${entry.startTime}-${entry.endTime}`
            );
        }
    }


    // -------------------------------------------------------
    // 5. Faculty availability
    // -------------------------------------------------------

    for (
        const entry of schedule
    ) {

        const faculty =
            relevantFaculty.find(
                f =>
                    String(f._id) ===
                    String(entry.facultyId)
            );

        if (!faculty) {
            continue;
        }

        const available =
            isWithinAvailability(
                faculty.availability,
                entry.day,
                entry.startTime,
                entry.endTime
            );

        if (!available) {

            errors.push(
                `Faculty "${faculty.name}" is not available on ${entry.day} from ${entry.startTime}-${entry.endTime}`
            );
        }
    }


    // -------------------------------------------------------
    // 6. Room availability
    // -------------------------------------------------------

    for (
        const entry of schedule
    ) {

        const room =
            allRooms.find(
                r =>
                    String(r._id) ===
                    String(entry.roomId)
            );

        if (!room) {
            continue;
        }

        const available =
            isWithinAvailability(
                room.availability,
                entry.day,
                entry.startTime,
                entry.endTime
            );

        if (!available) {

            errors.push(
                `Room "${room.name}" is not available on ${entry.day} from ${entry.startTime}-${entry.endTime}`
            );
        }
    }


    // -------------------------------------------------------
    // 7. Faculty overlapping conflict
    // -------------------------------------------------------

    for (
        let i = 0;
        i < schedule.length;
        i++
    ) {

        for (
            let j = i + 1;
            j < schedule.length;
            j++
        ) {

            const first =
                schedule[i];

            const second =
                schedule[j];

            if (
                String(first.facultyId) ===
                    String(second.facultyId) &&

                first.day ===
                    second.day &&

                timeOverlaps(
                    first.startTime,
                    first.endTime,
                    second.startTime,
                    second.endTime
                )
            ) {

                errors.push(
                    `Faculty conflict: faculty ${first.facultyId} has overlapping classes on ${first.day} (${first.startTime}-${first.endTime} and ${second.startTime}-${second.endTime})`
                );
            }
        }
    }


    // -------------------------------------------------------
    // 8. Room overlapping conflict
    // -------------------------------------------------------

    for (
        let i = 0;
        i < schedule.length;
        i++
    ) {

        for (
            let j = i + 1;
            j < schedule.length;
            j++
        ) {

            const first =
                schedule[i];

            const second =
                schedule[j];

            if (
                String(first.roomId) ===
                    String(second.roomId) &&

                first.day ===
                    second.day &&

                timeOverlaps(
                    first.startTime,
                    first.endTime,
                    second.startTime,
                    second.endTime
                )
            ) {

                errors.push(
                    `Room conflict: room ${first.roomId} has overlapping classes on ${first.day} (${first.startTime}-${first.endTime} and ${second.startTime}-${second.endTime})`
                );
            }
        }
    }


    // -------------------------------------------------------
    // 9. Course overlapping conflict
    // -------------------------------------------------------

    for (
        let i = 0;
        i < schedule.length;
        i++
    ) {

        for (
            let j = i + 1;
            j < schedule.length;
            j++
        ) {

            const first =
                schedule[i];

            const second =
                schedule[j];

            if (
                String(first.courseId) ===
                    String(second.courseId) &&

                first.day ===
                    second.day &&

                timeOverlaps(
                    first.startTime,
                    first.endTime,
                    second.startTime,
                    second.endTime
                )
            ) {

                errors.push(
                    `Course conflict: course ${first.courseId} has overlapping sessions on ${first.day}`
                );
            }
        }
    }


    // -------------------------------------------------------
    // 10. Course session count
    // -------------------------------------------------------

    for (
        const course of relevantCourses
    ) {

        const requiredSessions =
            getWeeklySessions(course, grid.weeks);

        const actualSessions =
            schedule.filter(
                entry =>
                    String(
                        entry.courseId
                    ) ===
                    String(course._id)
            ).length;

        if (
            actualSessions !==
            requiredSessions
        ) {

            errors.push(
                `Course "${course.name}" requires ${requiredSessions} sessions but received ${actualSessions}`
            );
        }
    }


    // -------------------------------------------------------
    // 11. One faculty per course
    // -------------------------------------------------------

    const courseFacultyMap =
        new Map();

    for (
        const entry of schedule
    ) {

        const courseId =
            String(entry.courseId);

        const facultyId =
            String(entry.facultyId);

        if (
            !courseFacultyMap.has(
                courseId
            )
        ) {

            courseFacultyMap.set(
                courseId,
                facultyId
            );

        } else {

            const existingFaculty =
                courseFacultyMap.get(
                    courseId
                );

            if (
                existingFaculty !==
                facultyId
            ) {

                const course =
                    relevantCourses.find(
                        c =>
                            String(c._id) ===
                            courseId
                    );

                errors.push(
                    `Course "${course?.name || courseId}" is assigned to multiple faculty members`
                );
            }
        }
    }


// -------------------------------------------------------
// 12. Faculty specialization - HARD CONSTRAINT
// -------------------------------------------------------
// A faculty member must be suitably specialized for the
// assigned course. An unsuitable assignment is treated
// as a validation error and the timetable will be rejected.

for (const entry of schedule) {

    const course = relevantCourses.find(
        c => String(c._id) === String(entry.courseId)
    );

    const faculty = relevantFaculty.find(
        f => String(f._id) === String(entry.facultyId)
    );

    if (!course || !faculty) {
        continue;
    }

    const matched = specializationMatches(
        course,
        faculty
    );

    if (!matched) {

        errors.push(
            `Faculty "${faculty.name}" is not suitably specialized for course "${course.name}"`
        );

    }
}


    // -------------------------------------------------------
    // 13. Room type validation
    // -------------------------------------------------------

    for (
        const entry of schedule
    ) {

        const course =
            relevantCourses.find(
                c =>
                    String(c._id) ===
                    String(entry.courseId)
            );

        const room =
            allRooms.find(
                r =>
                    String(r._id) ===
                    String(entry.roomId)
            );

        if (
            !course ||
            !room
        ) {
            continue;
        }

        if (
            !roomTypeMatches(
                course,
                room
            )
        ) {

            errors.push(
                `Room "${room.name}" of type "${room.type}" is not suitable for course "${course.name}" of type "${course.type || "lecture"}"`
            );
        }
    }


    // -------------------------------------------------------
    // 14. Faculty maximum weekly hours
    // -------------------------------------------------------

    const facultyHours =
        new Map();

    for (
        const entry of schedule
    ) {

        const start =
            timeToMinutes(
                entry.startTime
            );

        const end =
            timeToMinutes(
                entry.endTime
            );

        if (
            start === null ||
            end === null ||
            end <= start
        ) {
            continue;
        }

        const duration =
            (end - start) / 60;

        const facultyId =
            String(entry.facultyId);

        const current =
            facultyHours.get(
                facultyId
            ) || 0;

        facultyHours.set(
            facultyId,
            current + duration
        );
    }

    for (
        const faculty of relevantFaculty
    ) {

        const facultyId =
            String(faculty._id);

        const assignedHours =
            facultyHours.get(
                facultyId
            ) || 0;

        if (
            faculty.maxHoursPerWeek &&
            assignedHours >
                faculty.maxHoursPerWeek
        ) {

            errors.push(
                `Faculty "${faculty.name}" is assigned ${assignedHours.toFixed(2)} hours but maximum allowed is ${faculty.maxHoursPerWeek} hours per week`
            );
        }
    }


    // -------------------------------------------------------
    // 15. Faculty preference - avoid slots
    // -------------------------------------------------------

    for (
        const entry of schedule
    ) {

        const faculty =
            relevantFaculty.find(
                f =>
                    String(f._id) ===
                    String(entry.facultyId)
            );

        if (!faculty) {
            continue;
        }

        const avoidSlots =
            faculty.preferences
                ?.avoidTimeSlots || [];

        if (
            avoidSlots.length === 0
        ) {
            continue;
        }

        const entryLabel =
            `${entry.day} ${entry.startTime}-${entry.endTime}`;

        const isAvoided =
            avoidSlots.some(
                slot =>
                    normalizeText(
                        slot
                    ) ===
                    normalizeText(
                        entryLabel
                    )
            );

        if (isAvoided) {

            errors.push(
                `Faculty "${faculty.name}" was assigned to avoided time slot "${entryLabel}"`
            );
        }
    }


    // -------------------------------------------------------
    // FINAL RESULT
    // -------------------------------------------------------

    return {
        valid:
            errors.length === 0,

        errors,
    };
}


// =========================================================
// BUILD AI PROMPT
// =========================================================

function buildPrompt(
    department,
    semester,
    academicYear,
    relevantCourses,
    relevantFaculty,
    allRooms,
    previousErrors = [],
    grid = DEFAULT_GRID
) {

    const breakLabel = grid.breaks
        .map(brk => `${brk.start}-${brk.end}`)
        .join(", ");

    return `
You are an expert university timetable scheduling system.

Generate a complete weekly timetable for a real college/university.

The timetable MUST satisfy all hard constraints.

========================================================
ACADEMIC INFORMATION
========================================================

Department:
${department}

Semester:
${semester}

Academic Year:
${academicYear}

Weeks in Academic Term:
${grid.weeks}

Available Days:
${JSON.stringify(grid.days)}

Available Time Slots:
${JSON.stringify(grid.slots)}

Mandatory Break:
${breakLabel}

DO NOT schedule any class during the break.

========================================================
COURSES
========================================================

${relevantCourses.map(course => `
Course:
- Name: ${course.name}
- Code: ${course.code}
- ID: ${course._id}
- Type: ${course.type || "lecture"}
- Credits: ${course.credits}
- Hours Per Week: ${course.hoursPerWeek || 3}
- Required Weekly Sessions: ${getWeeklySessions(course, grid.weeks)}
- Description: ${course.description || "N/A"}
- Prerequisites: ${JSON.stringify(course.prerequisites || [])}
`).join("\n")}

========================================================
FACULTY
========================================================

${relevantFaculty.map(faculty => `
Faculty:
- Name: ${faculty.name}
- ID: ${faculty._id}
- Department: ${faculty.department}
- Specializations: ${JSON.stringify(faculty.specialization || [])}
- Maximum Hours Per Week: ${faculty.maxHoursPerWeek}

Availability:
${JSON.stringify(faculty.availability || {})}

Preferred Time Slots:
${JSON.stringify(
    faculty.preferences?.preferredTimeSlots || []
)}

Avoid Time Slots:
${JSON.stringify(
    faculty.preferences?.avoidTimeSlots || []
)}
`).join("\n")}

========================================================
ROOMS
========================================================

${allRooms.map(room => `
Room:
- Name: ${room.name}
- ID: ${room._id}
- Building: ${room.building}
- Floor: ${room.floor}
- Type: ${room.type}
- Capacity: ${room.capacity}
- Equipment: ${JSON.stringify(room.equipment || [])}

Availability:
${JSON.stringify(room.availability || {})}
`).join("\n")}

========================================================
HARD CONSTRAINTS
========================================================

1. Schedule EVERY course for exactly its required weekly sessions.

2. Assign exactly ONE faculty member to each course.

3. Faculty specialization MUST match the course subject.

4. Faculty MUST be available during the assigned day and time.

5. Faculty MUST NOT exceed maxHoursPerWeek.

6. A faculty member MUST NOT teach two courses at the same time.

7. A room MUST NOT contain two courses at the same time.

8. The room MUST be available during the assigned day and time.

9. Lab courses MUST use lab rooms.

10. Seminar courses MUST use seminar rooms or auditoriums.

11. Lecture courses MUST use lecture halls, seminar rooms, or auditoriums.

12. Use ONLY the supplied faculty IDs.

13. Use ONLY the supplied course IDs.

14. Use ONLY the supplied room IDs.

15. Use ONLY the supplied days.

16. Use ONLY the supplied time slots.

17. Never schedule during any of: ${breakLabel}.

18. Respect faculty avoid-time preferences.

19. Try to satisfy faculty preferred-time preferences whenever possible.

20. Do not create duplicate schedule entries.

21. Do not invent faculty, courses, rooms, IDs, days or times.

========================================================
QUALITY REQUIREMENTS
========================================================

- Distribute classes reasonably across the working days.
- Avoid unnecessary concentration of the same course on one day.
- Avoid unnecessary gaps for faculty where possible.
- Make the timetable practical for a real college.
- Do not schedule a faculty member outside availability.
- Do not schedule a room outside availability.
- Prefer balanced faculty workloads.
- Prefer a balanced daily academic load.

========================================================
PREVIOUS VALIDATION ERRORS
========================================================

${
    previousErrors.length > 0
        ? previousErrors.join("\n")
        : "This is the first generation attempt."
}

If previous validation errors are provided, FIX ALL OF THEM.

========================================================
OUTPUT FORMAT
========================================================

Return ONLY a JSON array.

Do NOT return markdown.

Do NOT return explanations.

Do NOT return comments.

Each object MUST have exactly:

{
    "courseId": "string",
    "facultyId": "string",
    "roomId": "string",
    "day": "Monday",
    "startTime": "09:00",
    "endTime": "10:00"
}

Generate the complete timetable now.
`;
}


// =========================================================
// GENERATE TIMETABLE
// =========================================================

export async function generateTimetableWithAI(
    request,
    context = null,
    grid = DEFAULT_GRID
) {

    console.log(
        "=== STARTING AI TIMETABLE GENERATION ==="
    );

    console.log(
        "Request:",
        request
    );

    if (!genAI) {

        throw new Error(
            "AI client is not initialized. Check GOOGLE_API_KEY."
        );
    }

    try {

        const {
            department,
            semester,
            year,
            academicYear,
        } = request;


        // ---------------------------------------------------
        // Validate request
        // ---------------------------------------------------

        if (
            !department ||
            !semester ||
            !academicYear
        ) {

            throw new Error(
                "Department, semester, and academic year are required."
            );
        }


        // ---------------------------------------------------
        // Resolve courses, faculty and rooms
        // When a pre-loaded context is supplied (see
        // utils/schedulingContext.js) skip the DB queries
        // and the department/semester filtering entirely.
        // ---------------------------------------------------

        let relevantCourses;

        let relevantFaculty;

        let allRooms;


        if (
            context &&
            Array.isArray(context.courses) &&
            Array.isArray(context.faculty) &&
            Array.isArray(context.rooms)
        ) {

            console.log(
                "Using pre-loaded scheduling context..."
            );

            relevantCourses =
                context.courses;

            relevantFaculty =
                context.faculty;

            allRooms =
                context.rooms;

        } else {

            console.log(
                "Fetching courses, faculty and rooms..."
            );

            const allCourses =
                await Course.find({});

            const allFaculty =
                await Faculty.find({});

            allRooms =
                await Room.find({});


            // -----------------------------------------------
            // Filter courses
            // -----------------------------------------------

            relevantCourses =
                allCourses.filter(
                    course =>
                        (
                            course.department ||
                            ""
                        )
                            .toLowerCase() ===
                            department.toLowerCase()
                        &&
                        Number(
                            course.semester
                        ) ===
                        Number(
                            semester
                        )
                );


            // -----------------------------------------------
            // Filter faculty
            // -----------------------------------------------

            relevantFaculty =
                allFaculty.filter(
                    faculty =>
                        (
                            faculty.department ||
                            ""
                        )
                            .toLowerCase() ===
                        department.toLowerCase()
                );
        }


        if (
            relevantCourses.length === 0
        ) {

            throw new Error(
                `No courses found for ${department}, Semester ${semester}.`
            );
        }


        if (
            relevantFaculty.length === 0
        ) {

            throw new Error(
                `No faculty found for department ${department}.`
            );
        }


        // ---------------------------------------------------
        // Validate basic database data
        // ---------------------------------------------------

        const coursesWithoutHours =
            relevantCourses.filter(
                course =>
                    !getWeeklySessions(
                        course,
                        grid.weeks
                    )
            );

        if (
            coursesWithoutHours.length > 0
        ) {

            throw new Error(
                "One or more courses do not have valid weekly hours."
            );
        }


        // ---------------------------------------------------
        // Log input information
        // ---------------------------------------------------

        console.log(
            `Courses: ${relevantCourses.length}`
        );

        console.log(
            `Faculty: ${relevantFaculty.length}`
        );

        console.log(
            `Rooms: ${allRooms.length}`
        );


        // ---------------------------------------------------
        // AI generation with retry
        // ---------------------------------------------------

        let schedule = null;

        let validation = null;

        let lastErrors = [];


        for (
            let attempt = 1;
            attempt <= MAX_GENERATION_ATTEMPTS;
            attempt++
        ) {

            console.log(
                `\n=== AI GENERATION ATTEMPT ${attempt}/${MAX_GENERATION_ATTEMPTS} ===`
            );


            const prompt =
                buildPrompt(
                    department,
                    semester,
                    academicYear,
                    relevantCourses,
                    relevantFaculty,
                    allRooms,
                    lastErrors,
                    grid
                );


            console.log(
                "Sending scheduling request to Gemini..."
            );


let response;

for (let aiAttempt = 1; aiAttempt <= 3; aiAttempt++) {
    try {
        console.log(
            `Calling Gemini API (attempt ${aiAttempt}/3)...`
        );

        response = await genAI.models.generateContent({
            model: "gemini-3.6-flash",
            contents: prompt,
        });

        break;

    } catch (error) {

        console.error(
            `Gemini API attempt ${aiAttempt} failed:`,
            error.message
        );

        if (aiAttempt === 3) {
            throw error;
        }

        // Wait before retrying
        const delay = aiAttempt * 3000;

        console.log(
            `Waiting ${delay / 1000} seconds before retry...`
        );

        await new Promise(
            resolve => setTimeout(resolve, delay)
        );
    }
}


            const responseText =
                response.text;


            console.log(
                "AI response received:",
                responseText
                    ? "Success"
                    : "Empty"
            );


            schedule =
                parseAIResponse(
                    responseText
                );


            if (
                schedule.length === 0
            ) {

                lastErrors = [
                    "AI returned an empty or invalid JSON schedule."
                ];

                console.error(
                    lastErrors[0]
                );

                continue;
            }


            console.log(
                `AI generated ${schedule.length} schedule entries.`
            );


            // ------------------------------------------------
            // VALIDATE
            // ------------------------------------------------

            validation =
                validateSchedule(
                    schedule,
                    relevantCourses,
                    relevantFaculty,
                    allRooms,
                    grid
                );


            if (
                validation.valid
            ) {

                console.log(
                    "✅ Timetable validation passed."
                );

                break;
            }


            // ------------------------------------------------
            // VALIDATION FAILED
            // ------------------------------------------------

            console.error(
                `❌ Timetable validation failed with ${validation.errors.length} error(s).`
            );


            validation.errors.forEach(
                error =>
                    console.error(
                        "❌",
                        error
                    )
            );


            lastErrors =
                validation.errors;


            if (
                attempt <
                MAX_GENERATION_ATTEMPTS
            ) {

                console.log(
                    "Regenerating timetable using validation errors..."
                );
            }
        }


        // ---------------------------------------------------
        // Final validation result
        // ---------------------------------------------------

        if (
            !validation ||
            !validation.valid
        ) {

            const errors =
                validation?.errors ||
                lastErrors ||
                [
                    "Unable to generate a valid timetable."
                ];


            throw new Error(
                `Unable to generate a conflict-free timetable after ${MAX_GENERATION_ATTEMPTS} attempts.\n\n` +
                errors.join("\n")
            );
        }


        // ---------------------------------------------------
        // Enrich schedule
        // ---------------------------------------------------

        const enrichedSchedule =
            schedule.map(
                entry => {

                    const course =
                        relevantCourses.find(
                            c =>
                                String(c._id) ===
                                String(
                                    entry.courseId
                                )
                        );

                    const faculty =
                        relevantFaculty.find(
                            f =>
                                String(f._id) ===
                                String(
                                    entry.facultyId
                                )
                        );

                    const room =
                        allRooms.find(
                            r =>
                                String(r._id) ===
                                String(
                                    entry.roomId
                                )
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
                            `${entry.startTime}-${entry.endTime}`,
                    };
                }
            );


        // ---------------------------------------------------
        // Calculate metadata
        // ---------------------------------------------------

        const totalHours =
            enrichedSchedule.length;

        const availableSlots =
            grid.days.length *
            grid.slots.length;

        const utilizationRate =
            availableSlots > 0
                ? Math.round(
                    (
                        totalHours /
                        availableSlots
                    ) * 100
                )
                : 0;


        // ---------------------------------------------------
        // Create timetable document
        // ---------------------------------------------------

        const timetableData = {

            name:
                year !== undefined && year !== null
                    ? `${department} - Year ${year} Sem ${semester} (${academicYear})`
                    : `${department} - Semester ${semester} ${academicYear}`,

            department,

            semester:
                String(
                    semester
                ),

            year:
                year !== undefined && year !== null
                    ? Number(year)
                    : parseInt(
                        academicYear
                    ),

            academicYear:
                Number(
                    academicYear
                ),

            schedule:
                enrichedSchedule,

            conflicts:
                [],

            status:
                "draft",

            metadata: {

                totalHours,

                utilizationRate,

                conflictCount:
                    0,

                generationMethod:
                    "ai",
            },
        };


        // ---------------------------------------------------
        // Save only VALID timetable
        // ---------------------------------------------------

        const timetable =
            new Timetable(
                timetableData
            );

        const created =
            await timetable.save();


        console.log(
            `✅ Timetable saved successfully! ID: ${created._id}`
        );


        // ---------------------------------------------------
        // Success notification
        // ---------------------------------------------------

        await new Notification({

            title:
                "AI Timetable Generated",

            message:
                `Generated a validated timetable "${created.name}" with ${totalHours} entries.`,

            type:
                "success",

        }).save();


        return created;


    } catch (err) {

        console.error(
            "Error in generateTimetableWithAI:",
            err
        );


        // ---------------------------------------------------
        // Error notification
        // ---------------------------------------------------

        try {

            await new Notification({

                title:
                    "Timetable Generation Failed",

                message:
                    err.message ||
                    "An unknown error occurred.",

                type:
                    "error",

            }).save();

        } catch (
            notificationError
        ) {

            console.error(
                "Failed to create error notification:",
                notificationError.message
            );
        }


        throw err;
    }
}