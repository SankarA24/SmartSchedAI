// backend/utils/schedulingContext.js

import Course from "../models/course.js";
import Faculty from "../models/Faculty.js";
import Room from "../models/Room.js";

// =========================================================
// ESCAPE REGEX
// Builds a case-insensitive, anchored regex so that
// "computer science" matches "Computer Science" but not
// "Computer Science Engineering".
// =========================================================

function anchoredRegex(value) {
    const escaped = String(value || "")
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    return new RegExp(`^${escaped}$`, "i");
}


// =========================================================
// LOAD SCHEDULING CONTEXT
// Single source of truth for the data that every
// generation path (AI, GA, local) works on.
//
// courses : department (case-insensitive) + semester
//           + year (study year) + academicYear
// faculty : department (case-insensitive)
// rooms   : all
// =========================================================

export async function loadSchedulingContext({
    department,
    semester,
    year,
    academicYear,
}) {

    const departmentRegex = anchoredRegex(department);

    const courses = await Course.find({
        department: departmentRegex,
        semester: Number(semester),
        year: Number(year),
        academicYear: Number(academicYear),
    });

    const faculty = await Faculty.find({
        department: departmentRegex,
    });

    const rooms = await Room.find({});

    return {
        courses,
        faculty,
        rooms,
        counts: {
            courses: courses.length,
            faculty: faculty.length,
            rooms: rooms.length,
        },
    };
}
