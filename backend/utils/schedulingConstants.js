// backend/utils/schedulingConstants.js
//
// Single source of truth for the timetable grid.
// Every scheduler (genetic, backtracking) and the validator
// must agree on these values, otherwise a schedule that one
// module produces can look invalid to another.

/**
 * Number of teaching weeks in a semester.
 * Used to convert a course's total hours into weekly sessions.
 */
export const WEEKS = 13;


/**
 * Working days of the timetable grid.
 */
export const DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
];


/**
 * Teaching slots of a single day.
 *
 * The lunch break (see BREAK_SLOT) is deliberately absent:
 * because schedulers index into this array, no session can
 * ever be placed during the break.
 */
export const TIME_SLOTS = [
    { start: "09:00", end: "10:00" },
    { start: "10:00", end: "11:00" },
    { start: "11:15", end: "12:15" },
    { start: "14:15", end: "15:15" },
    { start: "15:15", end: "16:15" },
    { start: "16:30", end: "17:30" },
];


/**
 * Protected lunch break. No class may overlap it.
 */
export const BREAK_SLOT = {
    start: "12:15",
    end: "13:15",
};


/**
 * Render a slot as the "HH:MM-HH:MM" label used by the UI and
 * by faculty preference strings.
 *
 * @param {{start: string, end: string}|string} slot
 * @returns {string}
 */
export function slotLabel(slot) {

    if (
        slot &&
        typeof slot === "object"
    ) {
        return `${slot.start}-${slot.end}`;
    }

    return String(slot || "");
}


/**
 * The grid every scheduler falls back to when no SystemConfig
 * document has been loaded. These are exactly today's values,
 * so a caller that passes no grid behaves as it always has.
 */
export const DEFAULT_GRID = {
    days: DAYS,
    slots: TIME_SLOTS,
    breaks: [BREAK_SLOT],
    weeks: WEEKS,
    maxPeriodsPerDay: 6,
    maxConsecutiveHours: 3,
    maxDailyHoursPerFaculty: 6,
    flags: {
        avoidFirstLastPeriod: false,
        preferMorningLabs: true,
        balanceFacultyWorkload: true,
        prioritizeFacultyPreferences: true,
    },
};


/**
 * "HH:MM" -> minutes since midnight. Returns null when the
 * value is not a well formed time.
 *
 * @param {string} value
 * @returns {number|null}
 */
function toMinutes(value) {

    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());

    if (!match) {
        return null;
    }

    return (Number(match[1]) * 60) + Number(match[2]);
}


/**
 * Minutes since midnight -> "HH:MM".
 *
 * @param {number} minutes
 * @returns {string}
 */
function toLabel(minutes) {

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}


/**
 * True when [start, end) overlaps any of the given breaks.
 *
 * @param {number} start minutes since midnight
 * @param {number} end minutes since midnight
 * @param {Array<{start: string, end: string}>} breaks
 * @returns {{start: number, end: number}|null} the overlapped break, or null
 */
function overlappingBreak(start, end, breaks) {

    for (const entry of breaks) {

        const breakStart = toMinutes(entry && entry.start);
        const breakEnd = toMinutes(entry && entry.end);

        if (
            breakStart === null ||
            breakEnd === null
        ) {
            continue;
        }

        if (
            start < breakEnd &&
            end > breakStart
        ) {
            return { start: breakStart, end: breakEnd };
        }
    }

    return null;
}


/**
 * Fallbacks used when a config omits (or mis-states) the
 * values the derivation walk needs.
 */
const DEFAULT_PERIOD_MIN = 60;
const DEFAULT_BREAK_MIN = 15;


/**
 * Derive the teaching slots of a day from a config.
 *
 * Walks from startTime in periodDurationMin steps, inserting
 * breakDurationMin between periods, skipping any window that
 * overlaps a breaks[] entry, and stopping at endTime or once
 * maxPeriodsPerDay slots have been produced.
 *
 * Only reached by a config that explicitly clears slots[]:
 * TIME_SLOTS has irregular inter-period gaps (0, 15, lunch,
 * 0, 15) that no fixed-step walk can reproduce, so
 * SystemConfig defaults slots[] to TIME_SLOTS rather than
 * letting a defaulted document derive a divergent grid.
 *
 * @param {object} config
 * @param {Array<{start: string, end: string}>} breaks
 * @param {number} maxPeriodsPerDay
 * @returns {Array<{start: string, end: string}>}
 */
function deriveSlots(config, breaks, maxPeriodsPerDay) {

    const period = Number(config.periodDurationMin) || DEFAULT_PERIOD_MIN;
    const gap = Number.isFinite(Number(config.breakDurationMin))
        ? Number(config.breakDurationMin)
        : DEFAULT_BREAK_MIN;

    const dayStart = toMinutes(config.startTime);
    const dayEnd = toMinutes(config.endTime);

    if (
        period <= 0 ||
        dayStart === null ||
        dayEnd === null
    ) {
        return TIME_SLOTS.map((slot) => ({ start: slot.start, end: slot.end }));
    }

    const slots = [];

    let cursor = dayStart;

    // The day is finite, so the walk always terminates; the
    // guard only protects against a pathological config.
    while (
        slots.length < maxPeriodsPerDay &&
        (cursor + period) <= dayEnd
    ) {

        const end = cursor + period;
        const clash = overlappingBreak(cursor, end, breaks);

        if (clash) {

            // Resume after the break, never behind the cursor.
            cursor = Math.max(clash.end, cursor + period);
            continue;
        }

        slots.push({ start: toLabel(cursor), end: toLabel(end) });

        cursor = end + gap;
    }

    return slots;
}


/**
 * Resolve a SystemConfig document (or any plain object of the
 * same shape) into the grid every scheduler and the validator
 * work from.
 *
 * Pure: the config is never mutated, and the result depends
 * only on its values, so it is memoizable by `config.updatedAt`.
 *
 * @param {object|null|undefined} config
 * @returns {{days: string[], slots: Array<{start: string, end: string}>,
 *            breaks: Array<{start: string, end: string}>, weeks: number,
 *            maxPeriodsPerDay: number, maxConsecutiveHours: number,
 *            maxDailyHoursPerFaculty: number, flags: object}}
 */
export function getScheduleGrid(config) {

    if (!config) {
        return DEFAULT_GRID;
    }

    const days = Array.isArray(config.workingDays) && config.workingDays.length
        ? config.workingDays.slice()
        : DEFAULT_GRID.days;

    const breaks = Array.isArray(config.breaks)
        ? config.breaks.map((entry) => ({
            name: entry && entry.name,
            start: entry && entry.start,
            end: entry && entry.end,
        }))
        : DEFAULT_GRID.breaks;

    const maxPeriodsPerDay = Number(config.maxPeriodsPerDay) > 0
        ? Number(config.maxPeriodsPerDay)
        : DEFAULT_GRID.maxPeriodsPerDay;

    const slots = Array.isArray(config.slots) && config.slots.length
        ? config.slots.map((slot) => ({ start: slot.start, end: slot.end }))
        : deriveSlots(config, breaks, maxPeriodsPerDay);

    return {
        days,
        slots,
        breaks,
        weeks: Number(config.weeksPerSemester) > 0
            ? Number(config.weeksPerSemester)
            : DEFAULT_GRID.weeks,
        maxPeriodsPerDay,
        maxConsecutiveHours: Number(config.maxConsecutiveHours) > 0
            ? Number(config.maxConsecutiveHours)
            : DEFAULT_GRID.maxConsecutiveHours,
        maxDailyHoursPerFaculty: Number(config.maxDailyHoursPerFaculty) > 0
            ? Number(config.maxDailyHoursPerFaculty)
            : DEFAULT_GRID.maxDailyHoursPerFaculty,
        flags: {
            avoidFirstLastPeriod: config.avoidFirstLastPeriod === undefined
                ? DEFAULT_GRID.flags.avoidFirstLastPeriod
                : Boolean(config.avoidFirstLastPeriod),
            preferMorningLabs: config.preferMorningLabs === undefined
                ? DEFAULT_GRID.flags.preferMorningLabs
                : Boolean(config.preferMorningLabs),
            balanceFacultyWorkload: config.balanceFacultyWorkload === undefined
                ? DEFAULT_GRID.flags.balanceFacultyWorkload
                : Boolean(config.balanceFacultyWorkload),
            prioritizeFacultyPreferences: config.prioritizeFacultyPreferences === undefined
                ? DEFAULT_GRID.flags.prioritizeFacultyPreferences
                : Boolean(config.prioritizeFacultyPreferences),
        },
    };
}
