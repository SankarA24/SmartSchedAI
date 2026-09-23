// backend/utils/geneticScheduler.js
//
// Genetic-algorithm timetable scheduler.
//
// Runs entirely in memory on the data the route hands it and
// is fully reproducible: the only randomness comes from
// createRng(seed) in prng.js, so the same seed and the same
// inputs always yield the same timetable. Date.now() is used
// solely for the wall-clock time limit (and the duration that
// the same clock reading gives us for free).
//
// The grid (working days and teaching slots) is not hard-coded:
// it is handed in by the caller and defaults to DEFAULT_GRID,
// which is built from the same DAYS/TIME_SLOTS this module used
// to read directly. It is carried on `problem.grid` so every
// inner helper works from one agreed grid.
//
// Chromosome layout (one per individual):
//   facultyGene[courseIdx]            -> index into eligibleFaculty
//   sessionGenes[courseIdx][session]  -> { dayIdx, slotIdx, roomIdx }
//
// One faculty member per course is therefore guaranteed by
// construction; every other rule is enforced through fitness.
//
// Fitness = 1 / (1 + 10 * hard + soft), where `hard` counts the
// violations of hard constraints (clashes, availability,
// workload, duplicate slots) and `soft` sums preference
// penalties. The best chromosome is decoded and then gated by
// the independent validator in scheduleValidator.js.

import { createRng } from "./prng.js";

import { DEFAULT_GRID } from "./schedulingConstants.js";

import {
    getWeeklySessions,
    isWithinAvailability,
    specializationMatches,
    roomTypeMatches,
    roomCapacityMatches,
    courseGroupKey,
    isAvoidedSlot,
    isPreferredSlot,
} from "./schedulingHelpers.js";

import { validateSchedule } from "./scheduleValidator.js";


// -------------------------------------------------------
// Tunables
// -------------------------------------------------------

const DEFAULTS = {
    populationSize: 60,
    maxGenerations: 300,
    mutationRate: 0.15,
    elitism: 2,
    tournamentK: 3,
    timeLimitMs: 20000,
};

const LIMITS = {
    populationSize: { min: 10, max: 200 },
    maxGenerations: { min: 10, max: 1000 },
};

// Generations the best fitness may stay flat (with hard === 0)
// before the run is considered converged.
const STALL_GENERATIONS = 30;

// Share of mutations that re-sample the faculty gene rather
// than a session gene.
const FACULTY_MUTATION_SHARE = 0.2;

const HARD_WEIGHT = 10;

const SOFT_AVOIDED = 3;
const SOFT_PREFERRED = -1;
const SOFT_SAME_DAY_REPEAT = 1;


// -------------------------------------------------------
// Small helpers
// -------------------------------------------------------

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}


function toInt(value, fallback) {

    const number = Number(value);

    return Number.isFinite(number)
        ? Math.floor(number)
        : fallback;
}


/**
 * Deterministic 32-bit FNV-1a hash of a string.
 * Used to derive a seed from the course ids when the caller
 * does not supply one, so unseeded runs are still repeatable
 * for identical data.
 */
function hashString(text) {

    let hash = 0x811c9dc5;

    for (let i = 0; i < text.length; i++) {

        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }

    return hash >>> 0;
}


function deriveSeed(courses) {

    const ids = courses
        .map((course) => String(course._id))
        .sort()
        .join(",");

    // Keep it inside the 31-bit range that the UI accepts.
    return hashString(ids) % 2147483647 || 1;
}


function resolveOptions(options = {}) {

    const populationSize = clamp(
        toInt(options.populationSize, DEFAULTS.populationSize),
        LIMITS.populationSize.min,
        LIMITS.populationSize.max
    );

    const maxGenerations = clamp(
        toInt(options.maxGenerations, DEFAULTS.maxGenerations),
        LIMITS.maxGenerations.min,
        LIMITS.maxGenerations.max
    );

    const mutationRateRaw = Number(options.mutationRate);

    const mutationRate = Number.isFinite(mutationRateRaw)
        ? clamp(mutationRateRaw, 0, 1)
        : DEFAULTS.mutationRate;

    const elitism = clamp(
        toInt(options.elitism, DEFAULTS.elitism),
        0,
        Math.max(0, populationSize - 1)
    );

    const tournamentK = clamp(
        toInt(options.tournamentK, DEFAULTS.tournamentK),
        1,
        populationSize
    );

    const timeLimitMs = Math.max(
        1,
        toInt(options.timeLimitMs, DEFAULTS.timeLimitMs)
    );

    return {
        populationSize,
        maxGenerations,
        mutationRate,
        elitism,
        tournamentK,
        timeLimitMs,
    };
}


// -------------------------------------------------------
// Problem precomputation
// -------------------------------------------------------

/**
 * Availability of one entity for every (day, slot) cell of the
 * grid, as a flat boolean array indexed by cellIndex.
 *
 * @param {object} entity faculty or room document
 * @param {{days: string[], slots: Array<{start: string, end: string}>}} grid
 */
function buildAvailabilityMask(entity, grid) {

    const days = grid.days;
    const slots = grid.slots;

    const mask = new Array(days.length * slots.length);

    for (let d = 0; d < days.length; d++) {

        for (let s = 0; s < slots.length; s++) {

            mask[d * slots.length + s] =
                isWithinAvailability(
                    entity,
                    days[d],
                    slots[s].start,
                    slots[s].end
                );
        }
    }

    return mask;
}


/**
 * Preference weight of one faculty member for every cell.
 *
 * @param {object} facultyMember
 * @param {{days: string[], slots: Array<{start: string, end: string}>}} grid
 */
function buildPreferenceMask(facultyMember, grid) {

    const days = grid.days;
    const slots = grid.slots;

    const mask = new Array(days.length * slots.length);

    for (let d = 0; d < days.length; d++) {

        for (let s = 0; s < slots.length; s++) {

            const day = days[d];
            const slot = slots[s];

            let weight = 0;

            if (
                isAvoidedSlot(
                    facultyMember,
                    day,
                    slot.start,
                    slot.end
                )
            ) {
                weight += SOFT_AVOIDED;
            }

            if (
                isPreferredSlot(
                    facultyMember,
                    day,
                    slot.start,
                    slot.end
                )
            ) {
                weight += SOFT_PREFERRED;
            }

            mask[d * slots.length + s] = weight;
        }
    }

    return mask;
}


/**
 * Everything the GA needs about the problem, computed once.
 * The grid travels on the returned object so every helper that
 * receives a problem works from the same days and slots.
 */
function buildProblem({ courses, faculty, rooms, grid }) {

    const warnings = [];

    const facultyInfo = faculty.map((member, index) => {

        const maxHours = Number(member.maxHoursPerWeek);

        return {
            index,
            doc: member,
            id: String(member._id),
            maxHours: Number.isFinite(maxHours) && maxHours > 0
                ? maxHours
                : Infinity,
            availability: buildAvailabilityMask(member, grid),
            preference: buildPreferenceMask(member, grid),
        };
    });

    const roomInfo = rooms.map((room, index) => ({
        index,
        doc: room,
        id: String(room._id),
        availability: buildAvailabilityMask(room, grid),
    }));

    const groupKeys = new Map();

    const courseInfo = courses.map((course, index) => {

        const sessions = Number(getWeeklySessions(course, grid.weeks));

        if (
            !Number.isFinite(sessions) ||
            sessions <= 0
        ) {
            throw new Error(
                `Invalid weekly sessions for course "${course.name}".`
            );
        }

        const eligibleFaculty = facultyInfo.filter(
            (info) => specializationMatches(course, info.doc)
        );

        // Hard constraint: same message as localScheduler so the
        // route falls back and ultimately reports a clear error.
        if (eligibleFaculty.length === 0) {
            throw new Error(
                `No suitably specialized faculty available for course "${course.name}".`
            );
        }

        const eligibleRooms = roomInfo.filter(
            (info) =>
                roomTypeMatches(course, info.doc) &&
                roomCapacityMatches(course, info.doc)
        );

        if (eligibleRooms.length === 0) {
            throw new Error(
                `No suitable room available for course "${course.name}".`
            );
        }

        const groupKey = courseGroupKey(course);

        if (!groupKeys.has(groupKey)) {
            groupKeys.set(groupKey, groupKeys.size);
        }

        return {
            index,
            doc: course,
            id: String(course._id),
            sessions,
            eligibleFaculty,
            eligibleRooms,
            groupIndex: groupKeys.get(groupKey),
        };
    });

    return {
        grid,
        courses: courseInfo,
        faculty: facultyInfo,
        rooms: roomInfo,
        groupCount: groupKeys.size,
        cellCount: grid.days.length * grid.slots.length,
        warnings,
    };
}


// -------------------------------------------------------
// Chromosome construction
// -------------------------------------------------------

/**
 * Occupancy of one chromosome: which (entity, cell) pairs are
 * already taken, so re-sampled sessions can steer clear of the
 * clashes they would otherwise create.
 */
function createOccupancy() {

    return {
        faculty: new Set(),
        rooms: new Set(),
        groups: new Set(),
    };
}


function occupy(occupancy, problem, course, facultyInfo, gene) {

    const cell = gene.dayIdx * problem.grid.slots.length + gene.slotIdx;

    const roomInfo = course.eligibleRooms[gene.roomIdx];

    occupancy.faculty.add(facultyInfo.index * problem.cellCount + cell);
    occupancy.rooms.add(roomInfo.index * problem.cellCount + cell);
    occupancy.groups.add(course.groupIndex * problem.cellCount + cell);
}


function buildOccupancy(chromosome, problem) {

    const occupancy = createOccupancy();

    for (let c = 0; c < problem.courses.length; c++) {

        const course = problem.courses[c];

        const facultyInfo =
            course.eligibleFaculty[chromosome.facultyGene[c]];

        for (const gene of chromosome.sessionGenes[c]) {
            occupy(occupancy, problem, course, facultyInfo, gene);
        }
    }

    return occupancy;
}


/**
 * Sample one session gene for a course taught by the faculty
 * member at facultyChoice. Prefers cells where the faculty
 * member and the room are available and nothing in `occupancy`
 * already uses them; falls back to any available cell, then to
 * a uniform cell when no such combination exists.
 */
function sampleSession(rng, problem, course, facultyChoice, occupancy) {

    const facultyInfo = course.eligibleFaculty[facultyChoice];

    const days = problem.grid.days;
    const slots = problem.grid.slots;

    const free = [];
    const available = [];

    for (let roomIdx = 0; roomIdx < course.eligibleRooms.length; roomIdx++) {

        const roomInfo = course.eligibleRooms[roomIdx];

        for (let d = 0; d < days.length; d++) {

            for (let s = 0; s < slots.length; s++) {

                const cell = d * slots.length + s;

                if (
                    !facultyInfo.availability[cell] ||
                    !roomInfo.availability[cell]
                ) {
                    continue;
                }

                const gene = { dayIdx: d, slotIdx: s, roomIdx };

                available.push(gene);

                if (
                    occupancy &&
                    !occupancy.faculty.has(facultyInfo.index * problem.cellCount + cell) &&
                    !occupancy.rooms.has(roomInfo.index * problem.cellCount + cell) &&
                    !occupancy.groups.has(course.groupIndex * problem.cellCount + cell)
                ) {
                    free.push(gene);
                }
            }
        }
    }

    const chosen =
        rng.pick(free) ||
        rng.pick(available);

    if (chosen) {
        return { ...chosen };
    }

    return {
        dayIdx: rng.int(days.length),
        slotIdx: rng.int(slots.length),
        roomIdx: rng.int(course.eligibleRooms.length),
    };
}


function randomChromosome(rng, problem) {

    const facultyGene = new Array(problem.courses.length);
    const sessionGenes = new Array(problem.courses.length);

    const occupancy = createOccupancy();

    for (let c = 0; c < problem.courses.length; c++) {

        const course = problem.courses[c];

        facultyGene[c] = rng.int(course.eligibleFaculty.length);

        const facultyInfo = course.eligibleFaculty[facultyGene[c]];

        const genes = new Array(course.sessions);

        for (let i = 0; i < course.sessions; i++) {

            genes[i] = sampleSession(
                rng,
                problem,
                course,
                facultyGene[c],
                occupancy
            );

            occupy(occupancy, problem, course, facultyInfo, genes[i]);
        }

        sessionGenes[c] = genes;
    }

    return { facultyGene, sessionGenes };
}


function cloneChromosome(chromosome) {

    return {
        facultyGene: chromosome.facultyGene.slice(),
        sessionGenes: chromosome.sessionGenes.map(
            (genes) => genes.map((gene) => ({ ...gene }))
        ),
    };
}


// -------------------------------------------------------
// Fitness
// -------------------------------------------------------

/**
 * Count hard and soft violations of one chromosome.
 * Uses composite-key Sets so every clash is counted once per
 * offending session beyond the first.
 */
function evaluate(chromosome, problem) {

    let hard = 0;
    let soft = 0;

    const days = problem.grid.days;
    const slots = problem.grid.slots;

    const facultySlots = new Set();
    const roomSlots = new Set();
    const groupSlots = new Set();
    const courseSlots = new Set();

    const facultyLoad = new Array(problem.faculty.length).fill(0);

    for (let c = 0; c < problem.courses.length; c++) {

        const course = problem.courses[c];

        const facultyInfo =
            course.eligibleFaculty[chromosome.facultyGene[c]];

        const genes = chromosome.sessionGenes[c];

        const dayCounts = new Array(days.length).fill(0);

        for (let i = 0; i < genes.length; i++) {

            const gene = genes[i];

            const roomInfo = course.eligibleRooms[gene.roomIdx];

            const cell =
                gene.dayIdx * slots.length + gene.slotIdx;

            const facultyKey = facultyInfo.index * problem.cellCount + cell;
            const roomKey = roomInfo.index * problem.cellCount + cell;
            const groupKey = course.groupIndex * problem.cellCount + cell;
            const courseKey = c * problem.cellCount + cell;

            // Hard: clashes
            if (facultySlots.has(facultyKey)) {
                hard += 1;
            } else {
                facultySlots.add(facultyKey);
            }

            if (roomSlots.has(roomKey)) {
                hard += 1;
            } else {
                roomSlots.add(roomKey);
            }

            if (groupSlots.has(groupKey)) {
                hard += 1;
            } else {
                groupSlots.add(groupKey);
            }

            if (courseSlots.has(courseKey)) {
                hard += 1;
            } else {
                courseSlots.add(courseKey);
            }

            // Hard: availability
            if (!facultyInfo.availability[cell]) {
                hard += 1;
            }

            if (!roomInfo.availability[cell]) {
                hard += 1;
            }

            // Soft: preferences
            soft += facultyInfo.preference[cell];

            // Soft: extra sessions on the same day
            dayCounts[gene.dayIdx] += 1;

            if (dayCounts[gene.dayIdx] > 1) {
                soft += SOFT_SAME_DAY_REPEAT;
            }
        }

        facultyLoad[facultyInfo.index] += genes.length;
    }

    // Hard: workload
    let totalLoad = 0;
    let maxLoad = 0;

    for (let f = 0; f < problem.faculty.length; f++) {

        const load = facultyLoad[f];

        totalLoad += load;
        maxLoad = Math.max(maxLoad, load);

        if (load > problem.faculty[f].maxHours) {
            hard += load - problem.faculty[f].maxHours;
        }
    }

    // Soft: load spread (how far the busiest member sits above
    // an even share of the total load).
    if (problem.faculty.length > 0) {

        const evenShare = Math.ceil(totalLoad / problem.faculty.length);

        soft += Math.max(0, maxLoad - evenShare);
    }

    const softPenalty = Math.max(0, soft);

    return {
        hard,
        soft: softPenalty,
        fitness: 1 / (1 + HARD_WEIGHT * hard + softPenalty),
    };
}


// -------------------------------------------------------
// Genetic operators
// -------------------------------------------------------

function tournamentSelect(rng, population, k) {

    let best = population[rng.int(population.length)];

    for (let i = 1; i < k; i++) {

        const challenger = population[rng.int(population.length)];

        if (challenger.score.fitness > best.score.fitness) {
            best = challenger;
        }
    }

    return best;
}


/**
 * Per-course block crossover: each course's faculty gene and
 * all of its session genes come from the same parent, so the
 * child inherits internally consistent blocks.
 */
function crossover(rng, parentA, parentB) {

    const facultyGene = new Array(parentA.facultyGene.length);
    const sessionGenes = new Array(parentA.facultyGene.length);

    for (let c = 0; c < facultyGene.length; c++) {

        const source = rng.chance(0.5) ? parentA : parentB;

        facultyGene[c] = source.facultyGene[c];

        sessionGenes[c] = source.sessionGenes[c].map(
            (gene) => ({ ...gene })
        );
    }

    return { facultyGene, sessionGenes };
}


function mutate(rng, chromosome, problem, mutationRate) {

    const occupancy = buildOccupancy(chromosome, problem);

    for (let c = 0; c < problem.courses.length; c++) {

        const course = problem.courses[c];

        // Re-sample the faculty gene for a share of mutations.
        if (
            course.eligibleFaculty.length > 1 &&
            rng.chance(mutationRate * FACULTY_MUTATION_SHARE)
        ) {
            chromosome.facultyGene[c] =
                rng.int(course.eligibleFaculty.length);
        }

        const facultyInfo =
            course.eligibleFaculty[chromosome.facultyGene[c]];

        const genes = chromosome.sessionGenes[c];

        for (let i = 0; i < genes.length; i++) {

            if (rng.chance(mutationRate)) {

                genes[i] = sampleSession(
                    rng,
                    problem,
                    course,
                    chromosome.facultyGene[c],
                    occupancy
                );

                occupy(occupancy, problem, course, facultyInfo, genes[i]);
            }
        }
    }

    return chromosome;
}


function compareByFitness(a, b) {
    return b.score.fitness - a.score.fitness;
}


// -------------------------------------------------------
// Decoding
// -------------------------------------------------------

function decode(chromosome, problem) {

    const schedule = [];

    for (let c = 0; c < problem.courses.length; c++) {

        const course = problem.courses[c];

        const facultyInfo =
            course.eligibleFaculty[chromosome.facultyGene[c]];

        for (const gene of chromosome.sessionGenes[c]) {

            const roomInfo = course.eligibleRooms[gene.roomIdx];
            const slot = problem.grid.slots[gene.slotIdx];

            schedule.push({
                courseId: course.id,
                facultyId: facultyInfo.id,
                roomId: roomInfo.id,
                day: problem.grid.days[gene.dayIdx],
                startTime: slot.start,
                endTime: slot.end,
            });
        }
    }

    return schedule;
}


// -------------------------------------------------------
// Entry point
// -------------------------------------------------------

/**
 * Generate a weekly timetable with a genetic algorithm.
 *
 * @param {object} params
 * @param {Array} params.courses courses to schedule
 * @param {Array} params.faculty faculty that may be assigned
 * @param {Array} params.rooms rooms that may be used
 * @param {object} [params.options] GA tunables (see DEFAULTS)
 * @param {object} [params.grid] scheduling grid; defaults to
 *        DEFAULT_GRID, i.e. today's days and slots
 * @returns {{schedule: Array, stats: object}}
 */
export function generateGeneticTimetable({
    courses = [],
    faculty = [],
    rooms = [],
    options = {},
    grid = DEFAULT_GRID,
} = {}) {

    if (
        !Array.isArray(courses) ||
        courses.length === 0
    ) {
        throw new Error(
            "No courses available for genetic scheduling."
        );
    }

    if (
        !Array.isArray(faculty) ||
        faculty.length === 0
    ) {
        throw new Error(
            "No faculty available for genetic scheduling."
        );
    }

    if (
        !Array.isArray(rooms) ||
        rooms.length === 0
    ) {
        throw new Error(
            "No rooms available for genetic scheduling."
        );
    }

    const settings = resolveOptions(options);

    const seedRaw = Number(options.seed);

    const seed = Number.isFinite(seedRaw)
        ? Math.floor(seedRaw)
        : deriveSeed(courses);

    const rng = createRng(seed);

    const problem = buildProblem({ courses, faculty, rooms, grid });

    const warnings = problem.warnings.slice();

    const startedAt = Date.now();

    // ---------------------------------------------------
    // Initial population
    // ---------------------------------------------------

    let population = [];

    let terminatedBy = "max-generations";

    for (let i = 0; i < settings.populationSize; i++) {

        // Building the initial population is itself unbounded work;
        // honour the time limit here too (at least one chromosome
        // is always built so the loop below has a best individual).
        if (
            i > 0 &&
            Date.now() - startedAt >= settings.timeLimitMs
        ) {
            terminatedBy = "time-limit";
            break;
        }

        const chromosome = randomChromosome(rng, problem);

        population.push({
            chromosome,
            score: evaluate(chromosome, problem),
        });
    }

    population.sort(compareByFitness);

    let best = population[0];

    let stallGenerations = 0;
    let generations = 0;

    const fitnessHistory = [];

    const recordGeneration = (generation) => {

        let total = 0;

        for (const individual of population) {
            total += individual.score.fitness;
        }

        fitnessHistory.push({
            generation,
            best: population[0].score.fitness,
            average: total / population.length,
        });
    };

    recordGeneration(0);

    // ---------------------------------------------------
    // Evolution loop
    // ---------------------------------------------------

    while (generations < settings.maxGenerations) {

        if (Date.now() - startedAt >= settings.timeLimitMs) {
            terminatedBy = "time-limit";
            break;
        }

        const next = [];

        for (let i = 0; i < settings.elitism; i++) {
            next.push({
                chromosome: cloneChromosome(population[i].chromosome),
                score: population[i].score,
            });
        }

        while (next.length < settings.populationSize) {

            const parentA = tournamentSelect(
                rng,
                population,
                settings.tournamentK
            );

            const parentB = tournamentSelect(
                rng,
                population,
                settings.tournamentK
            );

            const child = mutate(
                rng,
                crossover(rng, parentA.chromosome, parentB.chromosome),
                problem,
                settings.mutationRate
            );

            next.push({
                chromosome: child,
                score: evaluate(child, problem),
            });
        }

        next.sort(compareByFitness);

        population = next;
        generations += 1;

        recordGeneration(generations);

        if (population[0].score.fitness > best.score.fitness) {
            best = population[0];
            stallGenerations = 0;
        } else {
            stallGenerations += 1;
        }

        if (
            best.score.hard === 0 &&
            stallGenerations >= STALL_GENERATIONS
        ) {
            terminatedBy = "converged";
            break;
        }
    }

    // ---------------------------------------------------
    // Decode and gate by the independent validator
    // ---------------------------------------------------

    const schedule = decode(best.chromosome, problem);

    const validation = validateSchedule(
        schedule,
        courses,
        faculty,
        rooms,
        grid
    );

    const hardErrors = [];

    for (const error of validation.errors) {

        if (error.includes("is not suitably specialized")) {
            warnings.push(error);
        } else {
            hardErrors.push(error);
        }
    }

    for (const warning of validation.warnings || []) {
        warnings.push(warning);
    }

    const durationMs = Date.now() - startedAt;

    return {
        schedule,
        stats: {
            generationMethod: "genetic-algorithm",
            seed,
            generations,
            populationSize: settings.populationSize,
            bestFitness: best.score.fitness,
            hardViolations: hardErrors.length,
            softPenalty: best.score.soft,
            fitnessHistory,
            durationMs,
            terminatedBy,
            warnings,
            validationErrors: hardErrors,
        },
    };
}
