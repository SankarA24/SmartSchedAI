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
// Gemini can be used as the AI layer.
// This scheduler is the deterministic fallback.
// =======================================================


// -------------------------------------------------------
// 1. BASIC HELPERS
// -------------------------------------------------------

function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}


function timeToMinutes(time) {
    if (!time || typeof time !== "string") {
        return NaN;
    }

    const [hours, minutes] =
        time.split(":").map(Number);

    if (
        Number.isNaN(hours) ||
        Number.isNaN(minutes)
    ) {
        return NaN;
    }

    return hours * 60 + minutes;
}


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


function createSlotKey(
    day,
    startTime,
    endTime
) {
    return `${day}-${startTime}-${endTime}`;
}


// -------------------------------------------------------
// 2. SPECIALIZATION MATCHING
// -------------------------------------------------------

function specializationMatches(
    course,
    faculty
) {
    const specializations =
        Array.isArray(
            faculty.specialization
        )
            ? faculty.specialization
            : [];

    if (
        specializations.length === 0
    ) {
        return false;
    }

    const courseText =
        normalizeText(
            `${course.name || ""} ${
                course.code || ""
            } ${
                course.description || ""
            }`
        );

    if (!courseText) {
        return false;
    }

    const genericWords =
        new Set([
            "programming",
            "systems",
            "system",
            "management",
            "design",
            "development",
            "technology",
            "technologies",
            "engineering",
            "science",
            "computer",
            "data",
            "applications",
            "laboratory",
            "lab",
        ]);

    const courseWords =
        new Set(
            courseText
                .split(" ")
                .filter(
                    (word) =>
                        word.length >= 3 &&
                        !genericWords.has(word)
                )
        );

    return specializations.some(
        (specialization) => {

            const specializationText =
                normalizeText(
                    specialization
                );

            if (
                !specializationText
            ) {
                return false;
            }

            // Exact phrase
            if (
                courseText.includes(
                    specializationText
                ) ||
                specializationText.includes(
                    courseText
                )
            ) {
                return true;
            }

            const specializationWords =
                specializationText
                    .split(" ")
                    .filter(
                        (word) =>
                            word.length >= 3 &&
                            !genericWords.has(word)
                    );

            return specializationWords.some(
                (word) =>
                    courseWords.has(word)
            );
        }
    );
}


// -------------------------------------------------------
// 3. FACULTY AVAILABILITY
// -------------------------------------------------------

function isWithinAvailability(
    faculty,
    day,
    startTime,
    endTime
) {
    const dayKey =
        String(day).toLowerCase();

    const availability =
        faculty.availability?.[
            dayKey
        ] || [];

    if (
        !Array.isArray(
            availability
        )
    ) {
        return false;
    }

    const start =
        timeToMinutes(startTime);

    const end =
        timeToMinutes(endTime);

    if (
        Number.isNaN(start) ||
        Number.isNaN(end)
    ) {
        return false;
    }

    return availability.some(
        (slot) => {

            const availableStart =
                timeToMinutes(
                    slot.start
                );

            const availableEnd =
                timeToMinutes(
                    slot.end
                );

            return (
                start >=
                    availableStart &&
                end <=
                    availableEnd
            );
        }
    );
}


// -------------------------------------------------------
// 4. ROOM AVAILABILITY
// -------------------------------------------------------

function isRoomAvailable(
    room,
    day,
    startTime,
    endTime
) {
    const dayKey =
        String(day).toLowerCase();

    const availability =
        room.availability?.[
            dayKey
        ] || [];

    if (
        !Array.isArray(
            availability
        )
    ) {
        return false;
    }

    const start =
        timeToMinutes(startTime);

    const end =
        timeToMinutes(endTime);

    if (
        Number.isNaN(start) ||
        Number.isNaN(end)
    ) {
        return false;
    }

    return availability.some(
        (slot) => {

            const availableStart =
                timeToMinutes(
                    slot.start
                );

            const availableEnd =
                timeToMinutes(
                    slot.end
                );

            return (
                start >=
                    availableStart &&
                end <=
                    availableEnd
            );
        }
    );
}


// -------------------------------------------------------
// 5. ROOM TYPE
// -------------------------------------------------------

function roomTypeMatches(
    course,
    room
) {
    const courseType =
        String(
            course.type ||
                "lecture"
        ).toLowerCase();

    const roomType =
        String(
            room.type || ""
        ).toLowerCase();

    if (
        courseType === "lab"
    ) {
        return (
            roomType === "lab"
        );
    }

    if (
        courseType === "seminar"
    ) {
        return (
            roomType ===
                "seminar_room" ||
            roomType ===
                "auditorium"
        );
    }

    return (
        roomType ===
            "lecture_hall" ||
        roomType ===
            "seminar_room" ||
        roomType ===
            "auditorium"
    );
}


// -------------------------------------------------------
// 6. ROOM CAPACITY
// -------------------------------------------------------

function roomCapacityMatches(
    course,
    room
) {
    const requiredCapacity =
        Number(
            course.studentCount ??
            course.enrollment ??
            course.strength ??
            course.capacity ??
            1
        );

    const roomCapacity =
        Number(
            room.capacity
        );

    if (
        !Number.isFinite(
            roomCapacity
        )
    ) {
        return false;
    }

    return (
        roomCapacity >=
        requiredCapacity
    );
}


// -------------------------------------------------------
// 7. FACULTY PREFERENCE
// -------------------------------------------------------

function getFacultyPreferenceScore(
    faculty,
    slot
) {
    const preferences =
        faculty.preferences ||
        {};

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

    if (
        preferred.includes(slot)
    ) {
        score += 20;
    }

    if (
        avoid.includes(slot)
    ) {
        score -= 30;
    }

    return score;
}


// -------------------------------------------------------
// 8. WEEKLY SESSION COUNT
// -------------------------------------------------------

function defaultGetWeeklySessions(
    course
) {
    const hours =
        Number(
            course.hoursPerWeek
        );

    if (
        Number.isFinite(hours) &&
        hours > 0
    ) {
        return Math.ceil(hours);
    }

    const credits =
        Number(
            course.credits
        );

    if (
        Number.isFinite(credits) &&
        credits > 0
    ) {
        return Math.ceil(
            credits
        );
    }

    return 1;
}


// -------------------------------------------------------
// 9. STUDENT GROUP
// -------------------------------------------------------

function courseGroupKey(
    course
) {
    return [
        course.department,
        course.semester,
        course.year,
    ]
        .map(normalizeText)
        .join("|");
}


// -------------------------------------------------------
// 10. FACULTY SCORING
// -------------------------------------------------------

function facultyScore(
    course,
    faculty,
    facultyHours
) {
    let score = 0;

    if (
        specializationMatches(
            course,
            faculty
        )
    ) {
        score += 1000;
    }

    score +=
        getFacultyPreferenceScore(
            faculty,
            ""
        );

    const currentHours =
        facultyHours.get(
            String(faculty._id)
        ) || 0;

    score -=
        currentHours * 5;

    return score;
}


// -------------------------------------------------------
// 11. LOCAL SCHEDULER
// -------------------------------------------------------

export function generateLocalTimetable({
    courses = [],
    faculty = [],
    rooms = [],
    days = [],
    timeSlots = [],
    getWeeklySessions =
        defaultGetWeeklySessions,
}) {

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
                                            !isRoomAvailable(
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

        const usedDays =
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


                // ---------------------------------------
                // Prefer different days
                //
                // This is a preference, NOT a hard
                // constraint.
                // ---------------------------------------

                let dayPenalty = 0;

                if (
                    usedDays.has(
                        option.day
                    )
                ) {
                    dayPenalty = 20;
                }


                // Add temporary score

                option._searchScore =
                    option.score -
                    dayPenalty;


                selected.push(
                    option
                );

                usedCourseSlots.add(
                    slotKey
                );

                usedDays.add(
                    option.day
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


                // Recalculate days
                usedDays.clear();

                for (
                    const item of
                    selected
                ) {
                    usedDays.add(
                        item.day
                    );
                }


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