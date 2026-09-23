// backend/utils/schedulingHelpers.js
//
// Pure constraint helpers shared by the genetic scheduler, the
// backtracking scheduler and the validator.
//
// Nothing in this file touches Mongoose, the network or the
// console, so every function is directly unit-testable.

import { WEEKS } from "./schedulingConstants.js";


/**
 * How many sessions a course needs per week.
 * Prefers an explicit total-hours budget, then hoursPerWeek,
 * then a sane default of 3.
 *
 * The teaching-week count is a parameter so a configured grid
 * can supply its own; it defaults to WEEKS, which is what every
 * existing caller relies on.
 *
 * @param {object} course
 * @param {number} [weeks] teaching weeks in the semester
 * @returns {number}
 */
export function getWeeklySessions(course, weeks = WEEKS) {

    if (
        course.totalHours &&
        Number(course.totalHours) > 0
    ) {
        return Math.ceil(
            Number(course.totalHours) / weeks
        );
    }

    return Number(course.hoursPerWeek) || 3;
}


/**
 * Convert "HH:MM" into minutes past midnight.
 * Returns null (never NaN) for anything unparseable, so callers
 * can guard with `== null`.
 *
 * @param {string} time
 * @returns {number|null}
 */
export function timeToMinutes(time) {

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


/**
 * True when two time ranges of the same day overlap.
 *
 * @returns {boolean}
 */
export function timeOverlaps(
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
        s1 == null ||
        e1 == null ||
        s2 == null ||
        e2 == null
    ) {
        return false;
    }

    return (
        s1 < e2 &&
        s2 < e1
    );
}


/**
 * Lowercase a value and collapse punctuation into single spaces,
 * so free-text fields can be compared word by word.
 *
 * @param {*} value
 * @returns {string}
 */
export function normalizeText(value) {

    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}


/**
 * True when the whole class fits inside one declared availability
 * window of the entity (a faculty member or a room) on that day.
 *
 * @param {object} entity faculty or room document
 * @param {string} day e.g. "Monday"
 * @param {string} startTime "HH:MM"
 * @param {string} endTime "HH:MM"
 * @returns {boolean}
 */
export function isWithinAvailability(
    entity,
    day,
    startTime,
    endTime
) {

    if (!entity) {
        return false;
    }

    // Accept either the entity itself or a bare availability map.
    const availability =
        entity.availability ?? entity;

    const dayKey =
        String(day).toLowerCase();

    const availableSlots =
        availability?.[dayKey];

    if (
        !Array.isArray(availableSlots)
    ) {
        return false;
    }

    const classStart =
        timeToMinutes(startTime);

    const classEnd =
        timeToMinutes(endTime);

    if (
        classStart == null ||
        classEnd == null
    ) {
        return false;
    }

    return availableSlots.some(
        (slot) => {

            const availableStart =
                timeToMinutes(slot?.start);

            const availableEnd =
                timeToMinutes(slot?.end);

            if (
                availableStart == null ||
                availableEnd == null
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


// Words that appear in so many course titles that matching on
// them alone would make every faculty member "specialized".
const GENERIC_WORDS = new Set([
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


/**
 * True when a faculty member is suitably specialized for a course.
 *
 * Matches on an exact phrase, or on any shared meaningful word
 * once the generic stoplist above has been removed. This is the
 * single matcher used by every scheduler AND by the validator:
 * two different rules used to let the schedulers produce
 * timetables the validator rejected.
 *
 * @param {object} course
 * @param {object} faculty
 * @returns {boolean}
 */
export function specializationMatches(course, faculty) {

    const specializations =
        Array.isArray(faculty.specialization)
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
            .filter(
                (word) =>
                    word.length >= 3 &&
                    !GENERIC_WORDS.has(word)
            )
    );

    return specializations.some(
        (specialization) => {

            const specializationText =
                normalizeText(specialization);

            if (!specializationText) {
                return false;
            }

            // Exact phrase, either direction.
            if (
                courseText.includes(specializationText) ||
                specializationText.includes(courseText)
            ) {
                return true;
            }

            const specializationWords =
                specializationText
                    .split(" ")
                    .filter(
                        (word) =>
                            word.length >= 3 &&
                            !GENERIC_WORDS.has(word)
                    );

            return specializationWords.some(
                (word) => courseWords.has(word)
            );
        }
    );
}


/**
 * True when the room kind suits the course kind
 * (labs need labs, seminars need seminar rooms, and so on).
 *
 * @param {object} course
 * @param {object} room
 * @returns {boolean}
 */
export function roomTypeMatches(course, room) {

    const courseType =
        String(course.type || "lecture").toLowerCase();

    const roomType =
        String(room.type || "").toLowerCase();

    if (courseType === "lab") {
        return roomType === "lab";
    }

    if (courseType === "seminar") {
        return (
            roomType === "seminar_room" ||
            roomType === "auditorium"
        );
    }

    return (
        roomType === "lecture_hall" ||
        roomType === "seminar_room" ||
        roomType === "auditorium"
    );
}


/**
 * True when the room is big enough for the course cohort.
 *
 * @param {object} course
 * @param {object} room
 * @returns {boolean}
 */
export function roomCapacityMatches(course, room) {

    const requiredCapacity = Number(
        course.studentCount ??
        course.enrollment ??
        course.strength ??
        course.capacity ??
        1
    );

    const roomCapacity = Number(room.capacity);

    if (!Number.isFinite(roomCapacity)) {
        return false;
    }

    return roomCapacity >= requiredCapacity;
}


/**
 * Identity of the student cohort that attends a course.
 * Two courses sharing this key may never run at the same time.
 *
 * @param {object} course
 * @returns {string}
 */
export function courseGroupKey(course) {

    return [
        course.department,
        course.semester,
        course.year,
    ]
        .map(normalizeText)
        .join("|");
}


/**
 * Compare one stored preference string against a concrete slot.
 * Faculty records store preferences either as "HH:MM-HH:MM" or
 * as "Day HH:MM-HH:MM"; both forms must match.
 */
function preferenceMatchesSlot(
    preference,
    day,
    startTime,
    endTime
) {

    const wanted = normalizeText(preference);

    if (!wanted) {
        return false;
    }

    return (
        wanted === normalizeText(`${startTime}-${endTime}`) ||
        wanted === normalizeText(`${day} ${startTime}-${endTime}`)
    );
}


/**
 * True when the faculty member asked NOT to teach in this slot.
 * Soft constraint: penalised by the GA, reported as a warning.
 *
 * @returns {boolean}
 */
export function isAvoidedSlot(
    faculty,
    day,
    startTime,
    endTime
) {

    const avoid =
        faculty?.preferences?.avoidTimeSlots;

    if (!Array.isArray(avoid)) {
        return false;
    }

    return avoid.some(
        (preference) =>
            preferenceMatchesSlot(
                preference,
                day,
                startTime,
                endTime
            )
    );
}


/**
 * True when the faculty member asked to teach in this slot.
 *
 * @returns {boolean}
 */
export function isPreferredSlot(
    faculty,
    day,
    startTime,
    endTime
) {

    const preferred =
        faculty?.preferences?.preferredTimeSlots;

    if (!Array.isArray(preferred)) {
        return false;
    }

    return preferred.some(
        (preference) =>
            preferenceMatchesSlot(
                preference,
                day,
                startTime,
                endTime
            )
    );
}
