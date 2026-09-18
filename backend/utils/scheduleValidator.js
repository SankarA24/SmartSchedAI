// backend/utils/scheduleValidator.js
//
// Independent checker for a generated timetable.
//
// Whatever produced the schedule - the genetic algorithm, the
// backtracking baseline, or a human edit - it has to survive this
// file before it is stored. Keeping the checker separate from the
// generators is what makes "the timetable is valid" a claim worth
// something.
//
// Hard rules land in `errors` (the timetable is rejected);
// preferences land in `warnings` (the timetable is still usable).

import {
    DAYS,
    TIME_SLOTS,
    BREAK_SLOT,
} from "./schedulingConstants.js";

import {
    getWeeklySessions,
    timeToMinutes,
    timeOverlaps,
    isWithinAvailability,
    specializationMatches,
    roomTypeMatches,
    courseGroupKey,
    isAvoidedSlot,
} from "./schedulingHelpers.js";


/**
 * Index a list of documents by their stringified _id.
 */
function indexById(items) {

    const map = new Map();

    for (const item of items || []) {
        map.set(String(item._id), item);
    }

    return map;
}


/**
 * Validate a complete weekly timetable.
 *
 * @param {Array} schedule entries {courseId, facultyId, roomId, day, startTime, endTime}
 * @param {Array} relevantCourses courses the timetable must cover
 * @param {Array} relevantFaculty faculty that may be assigned
 * @param {Array} allRooms rooms that may be used
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
export function validateSchedule(
    schedule,
    relevantCourses,
    relevantFaculty,
    allRooms
) {

    const errors = [];
    const warnings = [];


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
            warnings,
        };
    }


    const courseById = indexById(relevantCourses);
    const facultyById = indexById(relevantFaculty);
    const roomById = indexById(allRooms);


    // -------------------------------------------------------
    // 2. Validate IDs
    // -------------------------------------------------------

    schedule.forEach(
        (entry, index) => {

            if (!courseById.has(String(entry.courseId))) {

                errors.push(
                    `Entry ${index + 1}: Invalid courseId ${entry.courseId}`
                );
            }

            if (!facultyById.has(String(entry.facultyId))) {

                errors.push(
                    `Entry ${index + 1}: Invalid facultyId ${entry.facultyId}`
                );
            }

            if (!roomById.has(String(entry.roomId))) {

                errors.push(
                    `Entry ${index + 1}: Invalid roomId ${entry.roomId}`
                );
            }
        }
    );


    // -------------------------------------------------------
    // 3. Validate day
    // -------------------------------------------------------

    for (const entry of schedule) {

        if (!DAYS.includes(entry.day)) {

            errors.push(
                `Invalid day "${entry.day}"`
            );
        }
    }


    // -------------------------------------------------------
    // 4. Validate time slot
    // -------------------------------------------------------

    for (const entry of schedule) {

        const validSlot =
            TIME_SLOTS.some(
                (slot) =>
                    slot.start === entry.startTime &&
                    slot.end === entry.endTime
            );

        if (!validSlot) {

            errors.push(
                `Invalid time slot: ${entry.startTime}-${entry.endTime}`
            );
        }
    }


    // -------------------------------------------------------
    // 5. Protected lunch break
    // -------------------------------------------------------

    for (const entry of schedule) {

        if (
            timeOverlaps(
                entry.startTime,
                entry.endTime,
                BREAK_SLOT.start,
                BREAK_SLOT.end
            )
        ) {

            errors.push(
                `Entry on ${entry.day} ${entry.startTime}-${entry.endTime} overlaps the protected break (${BREAK_SLOT.start}-${BREAK_SLOT.end})`
            );
        }
    }


    // -------------------------------------------------------
    // 6. Faculty availability
    // -------------------------------------------------------

    for (const entry of schedule) {

        const faculty =
            facultyById.get(String(entry.facultyId));

        if (!faculty) {
            continue;
        }

        const available =
            isWithinAvailability(
                faculty,
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
    // 7. Room availability
    // -------------------------------------------------------

    for (const entry of schedule) {

        const room =
            roomById.get(String(entry.roomId));

        if (!room) {
            continue;
        }

        const available =
            isWithinAvailability(
                room,
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
    // 8. Faculty / room / course overlapping conflicts
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

            const first = schedule[i];
            const second = schedule[j];

            if (first.day !== second.day) {
                continue;
            }

            const overlapping =
                timeOverlaps(
                    first.startTime,
                    first.endTime,
                    second.startTime,
                    second.endTime
                );

            if (!overlapping) {
                continue;
            }

            if (
                String(first.facultyId) ===
                String(second.facultyId)
            ) {

                errors.push(
                    `Faculty conflict: faculty ${first.facultyId} has overlapping classes on ${first.day} (${first.startTime}-${first.endTime} and ${second.startTime}-${second.endTime})`
                );
            }

            if (
                String(first.roomId) ===
                String(second.roomId)
            ) {

                errors.push(
                    `Room conflict: room ${first.roomId} has overlapping classes on ${first.day} (${first.startTime}-${first.endTime} and ${second.startTime}-${second.endTime})`
                );
            }

            if (
                String(first.courseId) ===
                String(second.courseId)
            ) {

                errors.push(
                    `Course conflict: course ${first.courseId} has overlapping sessions on ${first.day}`
                );
            }


            // ---------------------------------------------------
            // Student-group conflict: two different courses of the
            // same cohort cannot run at once, or the students
            // would have to be in two rooms at the same time.
            // ---------------------------------------------------

            const firstCourse =
                courseById.get(String(first.courseId));

            const secondCourse =
                courseById.get(String(second.courseId));

            if (
                firstCourse &&
                secondCourse &&
                String(first.courseId) !==
                String(second.courseId) &&
                courseGroupKey(firstCourse) ===
                courseGroupKey(secondCourse)
            ) {

                errors.push(
                    `Student group conflict: "${firstCourse.name}" and "${secondCourse.name}" overlap on ${first.day} (${first.startTime}-${first.endTime})`
                );
            }
        }
    }


    // -------------------------------------------------------
    // 9. Course session count
    // -------------------------------------------------------

    for (const course of relevantCourses) {

        const requiredSessions =
            getWeeklySessions(course);

        const actualSessions =
            schedule.filter(
                (entry) =>
                    String(entry.courseId) ===
                    String(course._id)
            ).length;

        if (actualSessions !== requiredSessions) {

            errors.push(
                `Course "${course.name}" requires ${requiredSessions} sessions but received ${actualSessions}`
            );
        }
    }


    // -------------------------------------------------------
    // 10. One faculty per course
    // -------------------------------------------------------

    const courseFacultyMap = new Map();

    for (const entry of schedule) {

        const courseId = String(entry.courseId);
        const facultyId = String(entry.facultyId);

        if (!courseFacultyMap.has(courseId)) {

            courseFacultyMap.set(courseId, facultyId);

        } else if (
            courseFacultyMap.get(courseId) !== facultyId
        ) {

            const course = courseById.get(courseId);

            errors.push(
                `Course "${course?.name || courseId}" is assigned to multiple faculty members`
            );
        }
    }


    // -------------------------------------------------------
    // 11. Faculty specialization - HARD CONSTRAINT
    // -------------------------------------------------------

    for (const entry of schedule) {

        const course =
            courseById.get(String(entry.courseId));

        const faculty =
            facultyById.get(String(entry.facultyId));

        if (!course || !faculty) {
            continue;
        }

        if (!specializationMatches(course, faculty)) {

            errors.push(
                `Faculty "${faculty.name}" is not suitably specialized for course "${course.name}"`
            );
        }
    }


    // -------------------------------------------------------
    // 12. Room type validation
    // -------------------------------------------------------

    for (const entry of schedule) {

        const course =
            courseById.get(String(entry.courseId));

        const room =
            roomById.get(String(entry.roomId));

        if (!course || !room) {
            continue;
        }

        if (!roomTypeMatches(course, room)) {

            errors.push(
                `Room "${room.name}" of type "${room.type}" is not suitable for course "${course.name}" of type "${course.type || "lecture"}"`
            );
        }
    }


    // -------------------------------------------------------
    // 13. Faculty maximum weekly hours
    // -------------------------------------------------------

    const facultyHours = new Map();

    for (const entry of schedule) {

        const start = timeToMinutes(entry.startTime);
        const end = timeToMinutes(entry.endTime);

        if (
            start == null ||
            end == null ||
            end <= start
        ) {
            continue;
        }

        const duration = (end - start) / 60;

        const facultyId = String(entry.facultyId);

        const current =
            facultyHours.get(facultyId) || 0;

        facultyHours.set(
            facultyId,
            current + duration
        );
    }

    for (const faculty of relevantFaculty) {

        const assignedHours =
            facultyHours.get(String(faculty._id)) || 0;

        if (
            faculty.maxHoursPerWeek &&
            assignedHours > faculty.maxHoursPerWeek
        ) {

            errors.push(
                `Faculty "${faculty.name}" is assigned ${assignedHours.toFixed(2)} hours but maximum allowed is ${faculty.maxHoursPerWeek} hours per week`
            );
        }
    }


    // -------------------------------------------------------
    // 14. Faculty preference - avoided slots (soft)
    // -------------------------------------------------------

    for (const entry of schedule) {

        const faculty =
            facultyById.get(String(entry.facultyId));

        if (!faculty) {
            continue;
        }

        if (
            isAvoidedSlot(
                faculty,
                entry.day,
                entry.startTime,
                entry.endTime
            )
        ) {

            warnings.push(
                `Faculty "${faculty.name}" was assigned to avoided time slot "${entry.day} ${entry.startTime}-${entry.endTime}"`
            );
        }
    }


    // -------------------------------------------------------
    // FINAL RESULT
    // -------------------------------------------------------

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
