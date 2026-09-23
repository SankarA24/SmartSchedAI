// backend/utils/qualityScore.js
//
// One 0-100 number for "how good is this timetable", plus the four
// sub-scores it is made of. The generation route stores both on
// `metadata.qualityScore` / `metadata.qualityBreakdown`, and the
// frontend QualityScore component renders them.
//
// Two rules shape the implementation:
//
//   1. Every sub-score is derived explicitly (see the constants and
//      the per-score helpers below) — no magic numbers buried in an
//      expression.
//   2. The function is total. Missing, undefined, null, NaN or wrongly
//      typed inputs never produce NaN: a numeric input that cannot be
//      read falls back to its documented default, and a sub-score with
//      nothing to judge falls back to UNKNOWN_SCORE.

import { DEFAULT_GRID } from "./schedulingConstants.js";


/** Weights of the four sub-scores in the overall score. They sum to 1. */
const WEIGHTS = {
    constraintCompliance: 0.4,
    roomUtilization: 0.2,
    facultyBalance: 0.2,
    studentConvenience: 0.2,
};


/** Score used when a sub-score has no data to judge: neither good nor bad. */
const UNKNOWN_SCORE = 50;

/** Each unsatisfied hard constraint costs this much compliance. */
const HARD_VIOLATION_PENALTY = 25;

/** Soft penalty per session is multiplied by this, capped at the next value. */
const SOFT_PENALTY_FACTOR = 10;
const SOFT_PENALTY_CAP = 40;

/** Room occupancy that scores 100; every point away costs the factor below. */
const IDEAL_UTILIZATION_RATE = 75;
const UTILIZATION_FACTOR = 2;

/** Student convenience: cost of one idle slot between two classes. */
const GAP_PENALTY = 5;

/** Student convenience: cost of each hour beyond maxConsecutiveHours. */
const CONSECUTIVE_PENALTY = 8;

/** Student convenience: cost of each unresolved conflict. */
const CONFLICT_PENALTY = 5;

/** Fallback convenience proxy when no schedule is supplied. */
const PROXY_SOFT_FACTOR = 5;
const PROXY_SOFT_CAP = 40;


/**
 * Read a number defensively. Anything that is not finite (undefined,
 * null, "", NaN, an object) becomes the fallback.
 *
 * @param {*} value
 * @param {number} [fallback]
 * @returns {number}
 */
function toNumber(value, fallback = 0) {

    const parsed =
        Number(value);

    return Number.isFinite(parsed)
        ? parsed
        : fallback;
}


/**
 * Clamp to the 0-100 score range and round to a whole number.
 *
 * @param {number} value
 * @returns {number}
 */
function toScore(value) {

    if (!Number.isFinite(value)) {
        return UNKNOWN_SCORE;
    }

    return Math.round(
        Math.min(100, Math.max(0, value))
    );
}


/**
 * Normalise the faculty workloads into a plain array of hour counts.
 * Accepts an array of numbers, an array of `{hours|load|sessions}`
 * objects, or a `facultyId -> hours` map. Unreadable entries drop out.
 *
 * @param {*} facultyLoads
 * @returns {number[]}
 */
function toLoadList(facultyLoads) {

    if (!facultyLoads) {
        return [];
    }

    const raw =
        Array.isArray(facultyLoads)
            ? facultyLoads
            : (typeof facultyLoads === "object"
                ? Object.values(facultyLoads)
                : []);

    const loads = [];

    for (const entry of raw) {

        const value =
            (entry && typeof entry === "object")
                ? toNumber(
                    entry.hours ?? entry.load ?? entry.sessions,
                    NaN
                )
                : toNumber(entry, NaN);

        if (Number.isFinite(value) && value >= 0) {
            loads.push(value);
        }
    }

    return loads;
}


/**
 * How well the schedule respects the constraint model.
 *
 * 100 - 25 per hard violation - the soft penalty carried per session
 * (x10, capped at 40 so a noisy soft score cannot swamp a hard one).
 * With no sessions there is nothing to average over, so only the hard
 * violations count.
 *
 * @param {number} hardViolations
 * @param {number} softPenalty
 * @param {number} sessionCount
 * @returns {number}
 */
function constraintComplianceScore(hardViolations, softPenalty, sessionCount) {

    const softPerSession =
        sessionCount > 0
            ? (softPenalty / sessionCount)
            : 0;

    const softTerm =
        Math.min(
            SOFT_PENALTY_CAP,
            Math.max(0, softPerSession * SOFT_PENALTY_FACTOR)
        );

    return toScore(
        100
        - (Math.max(0, hardViolations) * HARD_VIOLATION_PENALTY)
        - softTerm
    );
}


/**
 * How well the room grid is used.
 *
 * 75% occupancy scores 100; each point above or below costs 2, so 50%
 * (rooms idle) and 100% (no slack for changes) both score 50. An
 * unknown utilization rate scores UNKNOWN_SCORE rather than 0.
 *
 * @param {*} utilizationRate percentage 0-100
 * @returns {number}
 */
function roomUtilizationScore(utilizationRate) {

    const rate =
        toNumber(utilizationRate, NaN);

    if (!Number.isFinite(rate)) {
        return UNKNOWN_SCORE;
    }

    return toScore(
        100
        - (Math.abs(rate - IDEAL_UTILIZATION_RATE) * UTILIZATION_FACTOR)
    );
}


/**
 * How evenly teaching hours are spread across faculty.
 *
 * 100 minus the coefficient of variation (population standard
 * deviation / mean) as a percentage. One faculty member, or several
 * with identical loads, scores 100; no usable loads scores
 * UNKNOWN_SCORE; a mean of zero (nobody teaches) is treated as
 * perfectly balanced.
 *
 * @param {number[]} loads
 * @returns {number}
 */
function facultyBalanceScore(loads) {

    if (loads.length === 0) {
        return UNKNOWN_SCORE;
    }

    const mean =
        loads.reduce((sum, value) => sum + value, 0) / loads.length;

    if (mean <= 0) {
        return 100;
    }

    const variance =
        loads.reduce(
            (sum, value) => sum + ((value - mean) ** 2),
            0
        ) / loads.length;

    const stdDev =
        Math.sqrt(variance);

    return toScore(
        100 - ((stdDev / mean) * 100)
    );
}


/**
 * Count idle slots between classes and overlong runs of back-to-back
 * classes, per day, for the cohort this timetable belongs to.
 *
 * A timetable holds exactly one student group (department + semester +
 * year), so every entry is a class the same students attend: the day's
 * occupied slot indices are enough. Entries whose startTime is not a
 * slot of the grid are ignored rather than guessed at.
 *
 * @param {Array<{day: string, startTime: string}>} schedule
 * @param {{slots: Array<{start: string}>, maxConsecutiveHours: number}} grid
 * @returns {{gaps: number, overlongHours: number, matched: number}}
 */
function measureStudentDays(schedule, grid) {

    const slots =
        Array.isArray(grid?.slots)
            ? grid.slots
            : DEFAULT_GRID.slots;

    const indexOfSlot = new Map();

    slots.forEach((slot, index) => {
        indexOfSlot.set(String(slot?.start || ""), index);
    });

    const maxConsecutive =
        Math.max(
            1,
            toNumber(
                grid?.maxConsecutiveHours,
                DEFAULT_GRID.maxConsecutiveHours
            )
        );

    /** day -> Set of occupied slot indices */
    const byDay = new Map();

    let matched = 0;

    for (const entry of schedule) {

        const index =
            indexOfSlot.get(String(entry?.startTime || ""));

        if (index === undefined) {
            continue;
        }

        const day =
            String(entry?.day || "");

        if (!byDay.has(day)) {
            byDay.set(day, new Set());
        }

        byDay.get(day).add(index);
        matched += 1;
    }

    let gaps = 0;
    let overlongHours = 0;

    for (const used of byDay.values()) {

        const indices =
            [...used].sort((a, b) => a - b);

        // Idle slots between the first and last class of the day.
        gaps +=
            (indices[indices.length - 1] - indices[0] + 1) - indices.length;

        // Hours beyond maxConsecutiveHours in each unbroken run.
        let run = 1;

        for (let i = 1; i <= indices.length; i += 1) {

            if (i < indices.length && indices[i] === (indices[i - 1] + 1)) {

                run += 1;
                continue;
            }

            overlongHours += Math.max(0, run - maxConsecutive);
            run = 1;
        }
    }

    return { gaps, overlongHours, matched };
}


/**
 * How pleasant the week is for the students.
 *
 * With a schedule: 100 minus 5 per idle slot between classes, 8 per
 * hour beyond maxConsecutiveHours, and 5 per unresolved conflict.
 *
 * Without one (or when no entry matches the grid): the GA's soft
 * penalty already encodes gap and run pressure, so it stands in as a
 * proxy — 100 minus (softPenalty / sessions) x 5, capped at 40, minus
 * the same conflict cost. The proxy is coarser, never NaN.
 *
 * @param {object} input
 * @returns {number}
 */
function studentConvenienceScore({
    schedule,
    grid,
    softPenalty,
    sessionCount,
    conflictCount,
}) {

    const conflictTerm =
        Math.max(0, conflictCount) * CONFLICT_PENALTY;

    if (Array.isArray(schedule) && schedule.length > 0) {

        const { gaps, overlongHours, matched } =
            measureStudentDays(schedule, grid);

        if (matched > 0) {

            return toScore(
                100
                - (gaps * GAP_PENALTY)
                - (overlongHours * CONSECUTIVE_PENALTY)
                - conflictTerm
            );
        }
    }

    const softPerSession =
        sessionCount > 0
            ? (softPenalty / sessionCount)
            : 0;

    const softTerm =
        Math.min(
            PROXY_SOFT_CAP,
            Math.max(0, softPerSession * PROXY_SOFT_FACTOR)
        );

    return toScore(
        100 - softTerm - conflictTerm
    );
}


/**
 * Score a generated timetable.
 *
 * All inputs are optional. Numeric inputs default to 0 (nothing
 * reported), `utilizationRate` and `facultyLoads` fall back to
 * UNKNOWN_SCORE for their own sub-score when absent, and the result is
 * always four whole numbers plus a whole-number overall.
 *
 * @param {object} [input]
 * @param {number} [input.hardViolations] unsatisfied hard constraints
 * @param {number} [input.softPenalty] total soft penalty of the run
 * @param {number} [input.sessionCount] scheduled sessions (schedule.length)
 * @param {number} [input.utilizationRate] percentage of grid slots used
 * @param {number[]|object} [input.facultyLoads] hours per faculty member
 * @param {number} [input.conflictCount] unresolved conflicts on the doc
 * @param {Array<{day: string, startTime: string}>} [input.schedule] the
 *        saved entries; when given, student convenience is measured
 *        instead of approximated
 * @param {object} [input.grid] scheduling grid the schedule was built on
 * @returns {{overall: number, breakdown: {constraintCompliance: number,
 *           roomUtilization: number, facultyBalance: number,
 *           studentConvenience: number}}}
 */
export function computeQualityScore({
    hardViolations,
    softPenalty,
    sessionCount,
    utilizationRate,
    facultyLoads,
    conflictCount,
    schedule,
    grid = DEFAULT_GRID,
} = {}) {

    const hard =
        toNumber(hardViolations, 0);

    const soft =
        toNumber(softPenalty, 0);

    const sessions =
        toNumber(sessionCount, 0);

    const conflicts =
        toNumber(conflictCount, 0);

    const breakdown = {

        constraintCompliance:
            constraintComplianceScore(hard, soft, sessions),

        roomUtilization:
            roomUtilizationScore(utilizationRate),

        facultyBalance:
            facultyBalanceScore(toLoadList(facultyLoads)),

        studentConvenience:
            studentConvenienceScore({
                schedule,
                grid,
                softPenalty: soft,
                sessionCount: sessions,
                conflictCount: conflicts,
            }),
    };

    const weighted =
        (breakdown.constraintCompliance * WEIGHTS.constraintCompliance)
        + (breakdown.roomUtilization * WEIGHTS.roomUtilization)
        + (breakdown.facultyBalance * WEIGHTS.facultyBalance)
        + (breakdown.studentConvenience * WEIGHTS.studentConvenience);

    return {
        overall: toScore(weighted),
        breakdown,
    };
}


export default computeQualityScore;
