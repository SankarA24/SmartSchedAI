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
