// backend/utils/generationJobs.js
//
// Registry for asynchronous timetable generation runs.
//
// POST /api/timetables/generate answers 202 with a jobId and then
// runs the generator on the event loop, so the caller needs a place
// to read progress from and the socket layer needs something to push.
// That place is this module.
//
// SINGLE-PROCESS LIMITATION
// -------------------------
// Jobs live in a plain Map inside this Node process. They are lost on
// restart (nodemon included), they are invisible to any other process,
// and hasActiveJob() only knows about runs started here. That is
// deliberate: generation is CPU-bound and synchronous, so exactly one
// run per process is wanted anyway. Running the backend behind more
// than one worker (cluster, PM2 -i, several containers) would give each
// worker its own registry: a client could then be handed a jobId that
// the worker serving its next request has never heard of, and the
// "one generation at a time" guarantee would become "one per worker".
// Moving to several workers therefore means moving this state into
// Mongo or Redis first.
//
// SOCKET INSTANCE
// ---------------
// updateJob() broadcasts to the `generation:${jobId}` room, which needs
// the Socket.IO server. It is NOT imported from server.js: server.js
// imports the routers, which import this module, so importing back
// would close a cycle. The io instance arrives one of two ways:
//
//   setIo(io)                          // explicit, e.g. from server.js
//   updateJob(jobId, patch, app)       // express app or io, per call
//
// With neither, updates still apply and are simply not broadcast.

import { randomUUID } from "node:crypto";


/**
 * The seven stages a generation run reports, in order. The index of
 * the current stage is the job's `stepIndex`, and the frontend renders
 * this array as a stepper, so the strings are part of the contract.
 */
export const GENERATION_STEPS = [
    "Loading scheduling data",
    "Validating input data",
    "Building constraint model",
    "Initialising population",
    "Evolving schedule",
    "Validating final schedule",
    "Saving timetable",
];


/** Statuses that mean the run is over, one way or the other. */
const TERMINAL_STATUSES = new Set([
    "completed",
    "failed",
]);


/** Statuses that mean the run still holds the generation lock. */
const ACTIVE_STATUSES = new Set([
    "queued",
    "running",
]);


/** How long a finished job stays readable before sweep() drops it. */
const JOB_TTL_MS = 30 * 60 * 1000;


/** How often the sweeper runs. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;


/** jobId -> job record. */
const jobs = new Map();


/** Socket.IO server set through setIo(), or null. */
let ioInstance = null;


/**
 * Remember the Socket.IO server so updateJob() can broadcast without
 * being handed it on every call.
 *
 * @param {object|null} io a Socket.IO server instance
 * @returns {void}
 */
export function setIo(io) {

    ioInstance =
        io || null;
}


/**
 * Coerce whatever a caller passed into a Socket.IO server.
 *
 * Accepts the io instance itself, or an express app (or anything else
 * with a `.get`), in which case `app.get("io")` is read — that is where
 * server.js parks it.
 *
 * @param {object} [source] io instance, express app, or nothing
 * @returns {object|null}
 */
function resolveIo(source) {

    if (!source) {
        return ioInstance;
    }

    if (typeof source.to === "function") {
        return source;
    }

    if (typeof source.get === "function") {

        const fromApp =
            source.get("io");

        if (fromApp) {
            return fromApp;
        }
    }

    return ioInstance;
}


/**
 * Pick the socket event name for a job state. The frontend listens for
 * all three on the `generation:${jobId}` room.
 *
 * @param {string} status
 * @returns {string}
 */
function eventNameFor(status) {

    if (status === "completed") {
        return "generation:completed";
    }

    if (status === "failed") {
        return "generation:failed";
    }

    return "generation:progress";
}


/**
 * Copy a record before handing it out, so a caller cannot mutate the
 * registry by accident.
 *
 * @param {object} job
 * @returns {object}
 */
function snapshot(job) {

    return { ...job };
}


/**
 * Register a new run. The job starts `queued`; the runner moves it to
 * `running` with its first updateJob() call.
 *
 * @param {{userId?: string, params?: object}} [input]
 * @returns {string} the new jobId
 */
export function createJob({ userId, params } = {}) {

    const jobId =
        randomUUID();

    const now =
        new Date();

    jobs.set(jobId, {

        jobId,
        userId: userId || null,
        status: "queued",

        step: GENERATION_STEPS[0],
        stepIndex: 0,
        percentage: 0,

        generation: 0,
        maxGenerations: 0,
        bestFitness: null,
        hardViolations: null,
        softPenalty: null,

        timetableId: null,
        error: null,

        params: params || null,
        startedAt: now,
        updatedAt: now,
    });

    return jobId;
}


/**
 * Read one job.
 *
 * @param {string} jobId
 * @returns {object|null} a copy of the record, or null when unknown
 *                        (the route answers 404 on null)
 */
export function getJob(jobId) {

    const job =
        jobs.get(jobId);

    return job
        ? snapshot(job)
        : null;
}


/**
 * Merge a patch into a job and broadcast the result.
 *
 * `jobId`, `startedAt` and `params` are never overwritten by the patch;
 * `updatedAt` is always stamped. When a Socket.IO server is available
 * the merged record is emitted to the `generation:${jobId}` room as
 * generation:progress / generation:completed / generation:failed.
 *
 * @param {string} jobId
 * @param {object} [patch] fields to merge
 * @param {object} [ioOrApp] io instance or express app; falls back to
 *                           whatever setIo() was given
 * @returns {object|null} the merged record, or null when unknown
 */
export function updateJob(jobId, patch = {}, ioOrApp = null) {

    const job =
        jobs.get(jobId);

    if (!job) {
        return null;
    }

    const merged = {

        ...job,
        ...patch,

        jobId: job.jobId,
        params: job.params,
        startedAt: job.startedAt,
        updatedAt: new Date(),
    };

    jobs.set(jobId, merged);

    const record =
        snapshot(merged);

    const io =
        resolveIo(ioOrApp);

    if (io) {

        try {

            io
                .to(`generation:${jobId}`)
                .emit(eventNameFor(record.status), record);

        } catch (error) {

            // A broken socket layer must never fail a generation run.
            console.error(
                `⚠️  Could not emit progress for job ${jobId}:`,
                error?.message || error
            );
        }
    }

    return record;
}


/**
 * True while any job is queued or running.
 *
 * This is the generation lock: the route answers 409 instead of
 * starting a second CPU-bound run in the same process. It replaces the
 * module-level `generationInFlight` boolean in timetableRoute.js.
 *
 * @returns {boolean}
 */
export function hasActiveJob() {

    for (const job of jobs.values()) {

        if (ACTIVE_STATUSES.has(job.status)) {
            return true;
        }
    }

    return false;
}


/**
 * Drop finished jobs that nobody is going to read any more.
 *
 * Only terminal jobs are dropped, and only once JOB_TTL_MS has passed
 * since their last update — an active run is never swept, however long
 * it takes.
 *
 * @param {number} [now] epoch ms, injectable for tests
 * @returns {number} how many records were removed
 */
export function sweep(now = Date.now()) {

    let removed = 0;

    for (const [jobId, job] of jobs) {

        if (!TERMINAL_STATUSES.has(job.status)) {
            continue;
        }

        const updatedAt =
            job.updatedAt instanceof Date
                ? job.updatedAt.getTime()
                : Number(job.updatedAt) || 0;

        if ((now - updatedAt) > JOB_TTL_MS) {

            jobs.delete(jobId);
            removed += 1;
        }
    }

    return removed;
}


// The sweeper is unref'd: it must never be the reason the process
// stays alive (scripts that import a router would otherwise hang).
const sweepTimer =
    setInterval(
        () => sweep(),
        SWEEP_INTERVAL_MS
    );

if (typeof sweepTimer?.unref === "function") {
    sweepTimer.unref();
}
