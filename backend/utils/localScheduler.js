// =======================================================
// LOCAL CONSTRAINT-BASED TIMETABLE SCHEDULER
// =======================================================
//
// Deterministic fallback scheduler for college timetable
// generation.
//
// Responsibilities:
// 1. Faculty specialization
// 2. Faculty availability
// 3. Faculty workload
// 4. Room availability
// 5. Room type
// 6. Room capacity
// 7. Faculty conflict prevention
// 8. Room conflict prevention
// 9. Student-group conflict prevention
// 10. Same faculty for all sessions of a course
// 11. Different-day preference
//
// This deterministic solver is kept as the academic
// baseline the genetic algorithm is compared against.
// =======================================================


// -------------------------------------------------------
// SHARED CONSTRAINT HELPERS
//
// Specialization, availability, room and student-group rules
// live in schedulingHelpers.js so that this scheduler, the
// genetic scheduler and the validator all judge a timetable
// by exactly the same standard.
// -------------------------------------------------------

import {
    getWeeklySessions as defaultGetWeeklySessions,
    isWithinAvailability,
    specializationMatches,
    roomTypeMatches,
    roomCapacityMatches,
    courseGroupKey,
} from "./schedulingHelpers.js";

import { DEFAULT_GRID } from "./schedulingConstants.js";


/**
 * Split a slot ("09:00-10:00" or {start, end}) into start/end times.
 */
function slotToParts(slot) {

    if (
        slot &&
        typeof slot === "object"
    ) {
        return {
            startTime: slot.start,
            endTime: slot.end,
        };
    }

    const parts = String(slot)
        .split("-")
        .map((value) => value.trim());

    return {
        startTime: parts[0],
        endTime: parts[1],
    };
}


/**
 * Key identifying one cell of the timetable grid.
 */
function createSlotKey(
    day,
    startTime,
    endTime
) {
    return `${day}-${startTime}-${endTime}`;
}


/**
 * Soft score for placing a faculty member in a slot label:
 * rewards a preferred slot, punishes an avoided one.
 */
function getFacultyPreferenceScore(
    faculty,
    slot
) {

    const preferences =
        faculty.preferences || {};

    const preferred =
        Array.isArray(
            preferences.preferredTimeSlots
        )
            ? preferences.preferredTimeSlots
            : [];

    const avoid =
        Array.isArray(
            preferences.avoidTimeSlots
        )
            ? preferences.avoidTimeSlots
            : [];

    let score = 0;

    if (preferred.includes(slot)) {
        score += 20;
    }

    if (avoid.includes(slot)) {
        score -= 30;
    }

    return score;
}


// -------------------------------------------------------
// 11. LOCAL SCHEDULER
// -------------------------------------------------------

export function generateLocalTimetable({
    courses = [],
    faculty = [],
    rooms = [],
    days,
    timeSlots,
    grid = DEFAULT_GRID,
    getWeeklySessions =
        defaultGetWeeklySessions,
}) {

    // Callers that already pass days/timeSlots explicitly keep
    // behaving identically; grid only fills in what they omitted.
    days =
        Array.isArray(days) && days.length
            ? days
            : grid.days;

    timeSlots =
        Array.isArray(timeSlots) && timeSlots.length
            ? timeSlots
            : grid.slots;

    console.log(
        "=========================================="
    );

    console.log(
        "=== STARTING LOCAL CONSTRAINT SCHEDULER ==="
    );

    console.log(
        "=========================================="
    );


    // ---------------------------------------------------
    // Validate input
    // ---------------------------------------------------

    if (
        !Array.isArray(courses) ||
        courses.length === 0
    ) {
        throw new Error(
            "No courses available for local scheduling."
        );
    }

    if (
        !Array.isArray(faculty) ||
        faculty.length === 0
    ) {
        throw new Error(
            "No faculty available for local scheduling."
        );
    }

    if (
        !Array.isArray(rooms) ||
        rooms.length === 0
    ) {
        throw new Error(
            "No rooms available for local scheduling."
        );
    }

    if (
        !Array.isArray(days) ||
        days.length === 0
    ) {
        throw new Error(
            "No working days configured."
        );
    }

    if (
        !Array.isArray(timeSlots) ||
        timeSlots.length === 0
    ) {
        throw new Error(
            "No timetable time slots configured."
        );
    }


    // ---------------------------------------------------
    // Normalize time slots
    // ---------------------------------------------------

    const normalizedSlots =
        timeSlots
            .map((slot) => {

                const {
                    startTime,
                    endTime,
                } =
                    slotToParts(
                        slot
                    );

                return {
                    startTime,
                    endTime,
                    slot:
                        typeof slot ===
                        "string"
                            ? slot
                            :
                              `${startTime}-${endTime}`,
                };
            })
            .filter(
                (slot) =>
                    slot.startTime &&
                    slot.endTime
            );


    // ---------------------------------------------------
    // State
    // ---------------------------------------------------

    const schedule = [];

    const facultyHours =
        new Map();

    const facultySlotUsage =
        new Set();

    const roomSlotUsage =
        new Set();

    const studentGroupSlotUsage =
        new Set();

    const courseFacultyMap =
        new Map();


    // ---------------------------------------------------
    // Initialize faculty workload
    // ---------------------------------------------------

    for (
        const member of faculty
    ) {
        facultyHours.set(
            String(member._id),
            0
        );
    }


    // ---------------------------------------------------
    // Prepare courses
    // ---------------------------------------------------

    const courseData =
        courses.map(
            (course) => {

                const requiredSessions =
                    Number(
                        getWeeklySessions(
                            course
                        )
                    );

                if (
                    !Number.isFinite(
                        requiredSessions
                    ) ||
                    requiredSessions <= 0
                ) {
                    throw new Error(
                        `Invalid weekly sessions for course "${course.name}".`
                    );
                }


                // ---------------------------------------
                // Find specialized faculty
                // ---------------------------------------

                let facultyCandidates =
                    faculty.filter(
                        (member) =>
                            specializationMatches(
                                course,
                                member
                            )
                    );


                                // -------------------------------------------------------
                // SPECIALIZATION IS A HARD CONSTRAINT
                // -------------------------------------------------------
                //
                // Never assign a faculty member who is not suitably
                // specialized for the course.
                //
                // The final validator also treats specialization as
                // a hard constraint, so the local scheduler must use
                // the same rule.
                //

                if (facultyCandidates.length === 0) {

                    throw new Error(
                        `No suitably specialized faculty available for course "${course.name}".`
                    );
                }


                const facultyOptions =
                    [];


                // ---------------------------------------
                // Build faculty + slot + room options
                // ---------------------------------------

                for (
                    const member of
                    facultyCandidates
                ) {

                    const facultyId =
                        String(
                            member._id
                        );


                    let possibleSlots =
                        [];


                    for (
                        const day of days
                    ) {

                        for (
                            const slot of
                            normalizedSlots
                        ) {

                            if (
                                !isWithinAvailability(
                                    member,
                                    day,
                                    slot.startTime,
                                    slot.endTime
                                )
                            ) {
                                continue;
                            }


                            const roomOptions =
                                rooms.filter(
                                    (room) => {

                                        if (
                                            !isWithinAvailability(
                                                room,
                                                day,
                                                slot.startTime,
                                                slot.endTime
                                            )
                                        ) {
                                            return false;
                                        }

                                        if (
                                            !roomTypeMatches(
                                                course,
                                                room
                                            )
                                        ) {
                                            return false;
                                        }

                                        if (
                                            !roomCapacityMatches(
                                                course,
                                                room
                                            )
                                        ) {
                                            return false;
                                        }

                                        return true;
                                    }
                                );


                            if (
                                roomOptions.length ===
                                0
                            ) {
                                continue;
                            }


                            for (
                                const room of
                                roomOptions
                            ) {

                                const score =
                                    (
                                        specializationMatches(
                                            course,
                                            member
                                        )
                                            ? 1000
                                            : 0
                                    ) +
                                    getFacultyPreferenceScore(
                                        member,
                                        slot.slot
                                    ) -
                                    (
                                        facultyHours.get(
                                            facultyId
                                        ) || 0
                                    ) * 5;


                                possibleSlots.push({
                                    course,
                                    faculty:
                                        member,
                                    room,
                                    day,
                                    startTime:
                                        slot.startTime,
                                    endTime:
                                        slot.endTime,
                                    slot:
                                        slot.slot,
                                    score,
                                });
                            }
                        }
                    }


                    if (
                        possibleSlots.length >=
                        requiredSessions
                    ) {

                        facultyOptions.push({
                            faculty:
                                member,

                            options:
                                possibleSlots,

                            score:
                                possibleSlots.length
                                +
                                (
                                    specializationMatches(
                                        course,
                                        member
                                    )
                                        ? 1000
                                        : 0
                                ),
                        });
                    }
                }


                // ---------------------------------------
                // Sort faculty choices
                // ---------------------------------------

                facultyOptions.sort(
                    (a, b) => {

                        const aHours =
                            facultyHours.get(
                                String(
                                    a.faculty._id
                                )
                            ) || 0;

                        const bHours =
                            facultyHours.get(
                                String(
                                    b.faculty._id
                                )
                            ) || 0;


                        const aSpecialized =
                            specializationMatches(
                                course,
                                a.faculty
                            );

                        const bSpecialized =
                            specializationMatches(
                                course,
                                b.faculty
                            );


                        if (
                            aSpecialized !==
                            bSpecialized
                        ) {
                            return bSpecialized
                                ? 1
                                : -1;
                        }


                        return (
                            aHours -
                            bHours
                        );
                    }
                );


                console.log(
                    `📚 ${course.name}: ${requiredSessions} sessions, ${facultyOptions.length} faculty choices`
                );


                if (
                    facultyOptions.length ===
                    0
                ) {
                    throw new Error(
                        `No faculty can teach "${course.name}" for the required ${requiredSessions} sessions.`
                    );
                }


                return {
                    course,
                    requiredSessions,
                    facultyOptions,
                };
            }
        );


    // ---------------------------------------------------
    // Course ordering
    //
    // Most constrained first.
    // ---------------------------------------------------

    courseData.sort(
        (a, b) => {

            const aOptions =
                Math.min(
                    ...a.facultyOptions.map(
                        (item) =>
                            item.options.length
                    )
                );

            const bOptions =
                Math.min(
                    ...b.facultyOptions.map(
                        (item) =>
                            item.options.length
                    )
                );


            if (
                aOptions !==
                bOptions
            ) {
                return (
                    aOptions -
                    bOptions
                );
            }


            return (
                b.requiredSessions -
                a.requiredSessions
            );
        }
    );


    console.log(
        "=========================================="
    );

    console.log(
        "=== COURSE ORDER ==="
    );

    console.log(
        "=========================================="
    );


    courseData.forEach(
        (item, index) => {

            console.log(
                `${index + 1}. ${item.course.name} - ${item.requiredSessions} sessions`
            );
        }
    );


    // ---------------------------------------------------
    // Search configuration
    // ---------------------------------------------------

    const MAX_SEARCH_NODES =
        250000;

    let searchNodes = 0;

    let searchLimitReached =
        false;


    // ---------------------------------------------------
    // Helper: choose sessions for one course
    // ---------------------------------------------------

    function selectSessions(
        course,
        facultyMember,
        options,
        requiredSessions,
        onSuccess
    ) {

        const selected = [];

        const usedCourseSlots =
            new Set();


        function search(
            optionStartIndex
        ) {

            searchNodes++;


            if (
                searchNodes >
                MAX_SEARCH_NODES
            ) {
                searchLimitReached =
                    true;

                return false;
            }


            // -------------------------------------------
            // Completed course
            // -------------------------------------------

            if (
                selected.length >=
                requiredSessions
            ) {

                return onSuccess(
                    selected
                );
            }


            // -------------------------------------------
            // Not enough remaining options
            // -------------------------------------------

            const remaining =
                options.length -
                optionStartIndex;

            if (
                remaining <
                (
                    requiredSessions -
                    selected.length
                )
            ) {
                return false;
            }


            // -------------------------------------------
            // Try options
            // -------------------------------------------

            for (
                let i =
                    optionStartIndex;

                i <
                options.length;

                i++
            ) {

                const option =
                    options[i];


                const slotKey =
                    createSlotKey(
                        option.day,
                        option.startTime,
                        option.endTime
                    );


                // Same course cannot occupy
                // the same student slot.

                if (
                    usedCourseSlots.has(
                        slotKey
                    )
                ) {
                    continue;
                }


                const facultyKey =
                    `${facultyMember._id}-${slotKey}`;


                const roomKey =
                    `${option.room._id}-${slotKey}`;


                const studentKey =
                    `${courseGroupKey(
                        course
                    )}-${slotKey}`;


                // Faculty conflict

                if (
                    facultySlotUsage.has(
                        facultyKey
                    )
                ) {
                    continue;
                }


                // Room conflict

                if (
                    roomSlotUsage.has(
                        roomKey
                    )
                ) {
                    continue;
                }


                // Student group conflict

                if (
                    studentGroupSlotUsage.has(
                        studentKey
                    )
                ) {
                    continue;
                }


                selected.push(
                    option
                );

                usedCourseSlots.add(
                    slotKey
                );

                facultySlotUsage.add(
                    facultyKey
                );

                roomSlotUsage.add(
                    roomKey
                );

                studentGroupSlotUsage.add(
                    studentKey
                );


                const currentHours =
                    facultyHours.get(
                        String(
                            facultyMember._id
                        )
                    ) || 0;


                facultyHours.set(
                    String(
                        facultyMember._id
                    ),
                    currentHours + 1
                );


                // ---------------------------------------
                // Continue
                // ---------------------------------------

                if (
                    search(
                        i + 1
                    )
                ) {
                    return true;
                }


                // ---------------------------------------
                // Rollback
                // ---------------------------------------

                selected.pop();

                usedCourseSlots.delete(
                    slotKey
                );

                facultySlotUsage.delete(
                    facultyKey
                );

                roomSlotUsage.delete(
                    roomKey
                );

                studentGroupSlotUsage.delete(
                    studentKey
                );


                facultyHours.set(
                    String(
                        facultyMember._id
                    ),
                    currentHours
                );


                if (
                    searchLimitReached
                ) {
                    return false;
                }
            }


            return false;
        }


        // Try highest-scoring options first.

        options.sort(
            (a, b) =>
                b.score -
                a.score
        );


        return search(0);
    }


    // ---------------------------------------------------
    // Main course backtracking
    // ---------------------------------------------------

    function placeCourse(
        courseIndex
    ) {

        if (
            courseIndex >=
            courseData.length
        ) {
            return true;
        }


        if (
            searchLimitReached
        ) {
            return false;
        }


        const {
            course,
            requiredSessions,
            facultyOptions,
        } =
            courseData[
                courseIndex
            ];


        // -------------------------------------------
        // Try faculty choices
        // -------------------------------------------

        for (
            const facultyOption of
            facultyOptions
        ) {

            if (
                searchLimitReached
            ) {
                return false;
            }


            const facultyMember =
                facultyOption.faculty;


            const facultyId =
                String(
                    facultyMember._id
                );


            const currentFacultyHours =
                facultyHours.get(
                    facultyId
                ) || 0;


            const maxHours =
                Number(
                    facultyMember.maxHoursPerWeek
                );


            // If workload limit exists,
            // make sure the faculty can handle
            // the entire course.

            if (
                Number.isFinite(
                    maxHours
                ) &&
                (
                    currentFacultyHours +
                    requiredSessions
                ) >
                maxHours
            ) {
                continue;
            }


            const selectedSessions =
                [];


            const success =
                selectSessions(
                    course,
                    facultyMember,
                    facultyOption.options,
                    requiredSessions,
                    (
                        selected
                    ) => {

                        selectedSessions.push(
                            ...selected
                        );

                        return true;
                    }
                );


            if (
                !success
            ) {

                // selectSessions may have
                // temporarily changed state.
                //
                // It should already have
                // rolled back unsuccessful
                // paths.

                selectedSessions.length =
                    0;

                continue;
            }


            // ---------------------------------------
            // Save course assignment
            // ---------------------------------------

            courseFacultyMap.set(
                String(course._id),
                facultyId
            );


            for (
                const option of
                selectedSessions
            ) {

                schedule.push({
                    courseId:
                        option.course._id,

                    facultyId:
                        option.faculty._id,

                    roomId:
                        option.room._id,

                    day:
                        option.day,

                    startTime:
                        option.startTime,

                    endTime:
                        option.endTime,

                    type:
                        option.course.type ||
                        "lecture",
                });
            }


            console.log(
                `✅ Scheduled ${course.name}: ${selectedSessions.length}/${requiredSessions} sessions with ${facultyMember.name}`
            );


            // ---------------------------------------
            // Next course
            // ---------------------------------------

            if (
                placeCourse(
                    courseIndex + 1
                )
            ) {
                return true;
            }


            // ---------------------------------------
            // Rollback complete course
            // ---------------------------------------

            courseFacultyMap.delete(
                String(course._id)
            );


            for (
                const option of
                selectedSessions
            ) {

                const slotKey =
                    createSlotKey(
                        option.day,
                        option.startTime,
                        option.endTime
                    );


                const facultyKey =
                    `${facultyId}-${slotKey}`;


                const roomKey =
                    `${option.room._id}-${slotKey}`;


                const studentKey =
                    `${courseGroupKey(
                        course
                    )}-${slotKey}`;


                facultySlotUsage.delete(
                    facultyKey
                );

                roomSlotUsage.delete(
                    roomKey
                );

                studentGroupSlotUsage.delete(
                    studentKey
                );


                const currentHours =
                    facultyHours.get(
                        facultyId
                    ) || 0;


                facultyHours.set(
                    facultyId,
                    Math.max(
                        0,
                        currentHours - 1
                    )
                );


                const index =
                    schedule.findIndex(
                        (entry) =>
                            String(
                                entry.courseId
                            ) ===
                            String(
                                course._id
                            ) &&
                            String(
                                entry.facultyId
                            ) ===
                            facultyId &&
                            entry.day ===
                            option.day &&
                            entry.startTime ===
                            option.startTime &&
                            entry.endTime ===
                            option.endTime
                    );


                if (
                    index !== -1
                ) {
                    schedule.splice(
                        index,
                        1
                    );
                }
            }
        }


        return false;
    }


    // ---------------------------------------------------
    // Start solver
    // ---------------------------------------------------

    console.log(
        "=========================================="
    );

    console.log(
        "=== STARTING BACKTRACKING SOLVER ==="
    );

    console.log(
        "=========================================="
    );


    const success =
        placeCourse(0);


    if (
        !success
    ) {

        if (
            searchLimitReached
        ) {

            console.error(
                `❌ Local scheduler reached the ${MAX_SEARCH_NODES} search-node safety limit.`
            );

            throw new Error(
                "Local constraint scheduler search limit reached. The current college constraints are too restrictive for the configured timetable slots."
            );
        }


        throw new Error(
            "Local constraint scheduler could not find a complete timetable satisfying the available constraints."
        );
    }


    // ---------------------------------------------------
    // Final validation
    // ---------------------------------------------------

    console.log(
        "=========================================="
    );

    console.log(
        "=== FINAL LOCAL TIMETABLE VALIDATION ==="
    );

    console.log(
        "=========================================="
    );


    for (
        const course of courses
    ) {

        const required =
            Number(
                getWeeklySessions(
                    course
                )
            );


        const entries =
            schedule.filter(
                (entry) =>
                    String(
                        entry.courseId
                    ) ===
                    String(
                        course._id
                    )
            );


        if (
            entries.length !==
            required
        ) {
            throw new Error(
                `Local scheduler produced ${entries.length} sessions for "${course.name}" but ${required} are required.`
            );
        }
    }


    // -----------------------------------------------
    // Faculty conflict validation
    // -----------------------------------------------

    const facultySeen =
        new Set();


    for (
        const entry of
        schedule
    ) {

        const key =
            `${entry.facultyId}-${entry.day}-${entry.startTime}-${entry.endTime}`;


        if (
            facultySeen.has(key)
        ) {
            throw new Error(
                `Faculty conflict detected for ${entry.facultyId}.`
            );
        }


        facultySeen.add(key);
    }


    // -----------------------------------------------
    // Room conflict validation
    // -----------------------------------------------

    const roomSeen =
        new Set();


    for (
        const entry of
        schedule
    ) {

        const key =
            `${entry.roomId}-${entry.day}-${entry.startTime}-${entry.endTime}`;


        if (
            roomSeen.has(key)
        ) {
            throw new Error(
                `Room conflict detected for ${entry.roomId}.`
            );
        }


        roomSeen.add(key);
    }


    // -----------------------------------------------
    // Student-group conflict validation
    // -----------------------------------------------

    const studentSeen =
        new Set();


    for (
        const entry of
        schedule
    ) {

        const course =
            courses.find(
                (item) =>
                    String(
                        item._id
                    ) ===
                    String(
                        entry.courseId
                    )
            );


        if (!course) {
            continue;
        }


        const key =
            `${courseGroupKey(course)}-${entry.day}-${entry.startTime}-${entry.endTime}`;


        if (
            studentSeen.has(key)
        ) {
            throw new Error(
                `Student group conflict detected on ${entry.day} ${entry.startTime}.`
            );
        }


        studentSeen.add(key);
    }


    // ---------------------------------------------------
    // Final result
    // ---------------------------------------------------

    console.log(
        "=========================================="
    );

    console.log(
        `✅ LOCAL TIMETABLE GENERATED SUCCESSFULLY`
    );

    console.log(
        `✅ Total schedule entries: ${schedule.length}`
    );

    console.log(
        `✅ Search nodes explored: ${searchNodes}`
    );

    console.log(
        "=========================================="
    );


    console.log(
        "✅ Faculty conflicts prevented."
    );

    console.log(
        "✅ Room conflicts prevented."
    );

    console.log(
        "✅ Student-group conflicts prevented."
    );

    console.log(
        "✅ Faculty availability respected."
    );

    console.log(
        "✅ Room availability respected."
    );


    return schedule;
}