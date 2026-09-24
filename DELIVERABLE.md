# DELIVERABLE — Smart Classroom & AI Timetable Scheduler

Handover document for the `smart-scheduling-improvements` branch.

This file is written last, deliberately, so that every claim in it can be checked
against a system that actually runs. Every command output pasted below was
produced by running that command on this machine, against the real MongoDB and
the real backend. Nothing here is an intention or a design sketch: where a thing
is not implemented, it is listed in [Known limitations](#9-known-limitations).

---

## 1. What this is and how to run it

### What it is

A MERN application for higher-education timetable management, with three
role-based portals (admin, faculty, student). The core feature is timetable
generation: a seeded **genetic algorithm** by default, a deterministic
**backtracking constraint solver** as the fallback, and an **optional Gemini
path** that is off unless an API key is present.

The repository is **two independent npm projects** — there is no root
`package.json`:

| Directory   | Stack                                                          |
|-------------|----------------------------------------------------------------|
| `backend/`  | Express 5, Mongoose 8, Socket.io 4, ESM (`"type": "module"`)   |
| `frontend/` | React 19, Vite (`rolldown-vite`), Tailwind v4, shadcn/ui, JSX  |

There are **no automated unit tests** anywhere. Verification is done by CLI
scripts in `backend/scripts/` — see section 7.

### Prerequisites

Verified on this machine:

```
node  v22.23.2
npm   10.9.8
mongo docker image mongo:7 (container smartschedai-mongo)
```

macOS is assumed below; nothing in the code is macOS-specific except the port
note.

### Ports — read this before anything else

**Port 5000 is unusable on macOS.** AirPlay Receiver holds it, and a server
started there answers with a ControlCenter `403`, which looks exactly like an
authentication bug and will waste your afternoon. The backend therefore runs on
**5050** here, set by `PORT` in `backend/.env`.

The fallback baked into `frontend/src/lib/api.js` is still
`http://localhost:5000/api`, so **`frontend/.env` must exist** — without it the
frontend talks to AirPlay. `backend/.env.example`, `frontend/.env.example` and
the connection-error hint in `frontend/src/pages/Login.jsx` still say 5000 and
are stale on this point (see limitations).

### Environment files

Both are gitignored. Create them from the `.example` files, then fix the port.

`backend/.env`:

```
PORT=5050
MONGO_URI=mongodb://localhost:27017/smartschedai
JWT_SECRET=<any long random string>
GOOGLE_API_KEY=                      # optional; empty = AI path and /api/ai/chat unavailable
CLIENT_ORIGIN=http://localhost:5173  # CORS origin AND the Socket.io CORS origin
```

`CLIENT_ORIGIN` must match the port Vite actually chose. Vite increments the
port when 5173 is taken, and a mismatch shows up as a CORS failure plus a socket
that never connects.

`frontend/.env`:

```
VITE_API_URL=http://localhost:5050/api
```

### MongoDB

If no local MongoDB is installed:

```bash
docker run -d --name smartschedai-mongo -p 27017:27017 mongo:7
# afterwards
docker start smartschedai-mongo
```

### Install and seed — in this order

```bash
cd backend  && npm install
cd frontend && npm install

# from backend/, with MongoDB up:
node createTestUsers.js      # 1. admin/faculty/student users + linked Faculty/Student docs
node seedRealisticData.js    # 2. courses, faculty and rooms for two cohorts
npm run seed:config          # 3. upsert the active SystemConfig (explicit slots[])
```

The order matters:

1. `createTestUsers.js` creates the three login accounts (password `123456`) and
   links the faculty and student users to their `Faculty` / `Student` documents.
   Without the link, role scoping resolves to "no data", not to "all data".
2. `seedRealisticData.js` upserts two cohorts:
   *Computer Science, Semester 1, Year 1, AY 2026* and
   *Electronics, Semester 2, Year 2, AY 2027*, plus rooms. It is an upsert, so it
   is safe to re-run.
3. `npm run seed:config` writes the singleton `SystemConfig` with an **explicit
   `slots[]`** equal to today's six teaching slots plus the lunch break. Run it
   once against an existing database. A config that later clears `slots[]`
   derives a *different* grid, and saved timetables stop validating.

### The two dev servers

```bash
cd backend  && npm run dev   # nodemon server.js on $PORT (5050)
cd frontend && npm run dev   # Vite on http://localhost:5173
```

Then open the Vite URL and log in.

### Other commands

```bash
# backend/
npm run verify -- --latest            # constraint PASS/FAIL table for a saved timetable
npm run smoke                         # API smoke suite against a RUNNING server
node scripts/gaSmoke.js --seed 42     # headless GA run; prints stats + a schedule sha1
node scripts/importDataset.js --type courses --file scripts/samples/courses.csv --dry-run
node checkModels.js                   # lists Gemini models visible to your GOOGLE_API_KEY

# frontend/
npm run lint
npm run build
npm run preview
```

---

## 2. Test accounts

Created by `node createTestUsers.js`. All three share the password `123456`.

| Email                          | Role    | Notes                                            |
|--------------------------------|---------|--------------------------------------------------|
| `admin@smartscheduler.com`     | admin   | Full access; the only role that may generate      |
| `faculty@smartscheduler.com`   | faculty | "Dr John"; linked to a `Faculty` document         |
| `student@smartscheduler.com`   | student | Linked to a `Student` document (Computer Science) |

**The login form also requires picking the matching role.** `POST /api/auth/login`
compares the selected role against the stored one and returns **403** on a
mismatch ("This account is registered as *X*. Please select the *X* portal."), so
logging the admin in through the student portal is a deliberate failure, not a
bug.

Tokens are valid for 7 days.

---

## 3. Roles and security

### Middleware

`backend/middleware/auth.js` exports exactly two functions:

- `requireAuth` — reads `Authorization: Bearer <token>`, verifies it against
  `JWT_SECRET`, attaches the decoded payload to `req.user`; **401** when the
  header is missing, malformed or the token is invalid/expired.
- `requireRole(...roles)` — must run after `requireAuth`; **403** when
  `req.user.role` is not in the allowed list.

Every router except `POST /api/auth/login` applies `requireAuth` at the router
level, so there is no unauthenticated read anywhere in the API.

### Route groups and guards

| Route group | Endpoints | Guard |
|---|---|---|
| `POST /api/auth/login` | — | none (the only public endpoint) |
| `GET /api/auth/me` | — | `requireAuth` |
| `/api/courses` | `GET /`, `GET /:id` | `requireAuth` |
| | `POST /`, `PUT /:id`, `DELETE /:id` | admin |
| `/api/faculty` | `GET /`, `GET /:id` | `requireAuth` |
| | `POST /`, `DELETE /:id` | admin |
| | `PUT /:id` | admin, **or** the faculty member themselves — and then the body is stripped to `availability` and `preferences` only |
| `/api/rooms` | `GET /`, `GET /:id` | `requireAuth` |
| | `POST /`, `PUT /:id`, `DELETE /:id` | admin |
| `/api/students` | `GET /me`, `PUT /me` | student only |
| | `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` | admin |
| `/api/users` | every endpoint | admin (router-level `requireRole("admin")`) |
| `/api/timetables` | `GET /`, `GET /:id` | `requireAuth` — **and scoped server-side**, see below |
| | `POST /`, `PUT /:id`, `DELETE /:id` | admin |
| | `POST /generate`, `POST /generate-local` | admin |
| | `GET /generate/:jobId/progress` | admin |
| | `PATCH /:id/conflicts/:index/resolve` | admin |
| | `PATCH /:id/publish` | admin |
| | `POST /:id/comments` | `requireAuth` (any role) |
| | `GET /:id/export?format=csv\|json` | `requireAuth` (any role) |
| `/api/config` | `GET /`, `GET /grid` | `requireAuth` (any role) |
| | `PUT /` | **admin only**, whitelisted fields, validated |
| `/api/notifications` | `GET /`, `PUT /:id/read`, `PATCH /:id` | `requireAuth`, filtered by audience |
| | `POST /`, `DELETE /:id` | admin |
| `/api/queries` | `POST /` | faculty **or** student |
| | `GET /` | `requireAuth` — admin sees all, everyone else sees only their own |
| | `PUT /:id/reply` | admin |
| `/api/ai` | `POST /chat` | `requireAuth` |

**`GET /api/timetables` is scoped in the route handler, not in the client.** A
student sees published timetables for their own cohort; a faculty member sees
published timetables containing at least one of their own entries; an admin sees
whatever the query filters select. A faculty or student caller whose `User` is
not linked to a profile resolves to `[]` — never to everything.

### JWT payload

Issued by `POST /api/auth/login`, signed with `JWT_SECRET`, `expiresIn: "7d"`.
Shape (profile fields come from the linked `Faculty` / `Student` document, and
are `null` for an admin or an unlinked user):

```json
{
  "userId":       "<User._id as a string>",
  "role":         "admin | faculty | student",
  "facultyId":    "<Faculty._id> | null",
  "studentId":    "<Student._id> | null",
  "name":         "Admin",
  "email":        "admin@smartscheduler.com",
  "department":   null,
  "semester":     null,
  "year":         null,
  "academicYear": null,
  "section":      null,
  "iat":          1790263509,
  "exp":          1790868309
}
```

Carrying the cohort in the token is what lets role scoping happen without an
extra round trip. `GET /api/auth/me` re-reads the `User` and its linked profile
**server-side** and is the authoritative identity; the copy in `localStorage`
exists only for first paint.

### Socket.io handshake

- `jwtHandshakeAuth` in `server.js` verifies `socket.handshake.auth.token` with
  `JWT_SECRET` — the same contract as `middleware/auth.js`. A missing or invalid
  token is rejected at the handshake. **There is no anonymous connection.**
- On connect, every socket joins `role:<role>` and `user:<userId>`.
- `generation:subscribe` / `generation:unsubscribe` join and leave
  `generation:<jobId>`. **Subscribe is admin-only, enforced on the server**: a
  non-admin emitting it silently never joins the room and sees no progress.
- Events emitted: `notification`, `generation:progress`, `generation:completed`,
  `generation:failed`.
- The Socket.io CORS origin is the same `CLIENT_ORIGIN` as the HTTP CORS origin.

### Notification audience rules

`Notification` carries `audience` (`all | admin | faculty | student`) and an
optional `recipientUserId`.

**`recipientUserId` is EXCLUSIVE, not additive.** A notification addressed to one
user is readable by that user and by nobody else, and `audience` is ignored for
it. `audienceFilter` in `routes/notificationsRoute.js` builds two mutually
exclusive clauses:

1. `recipientUserId === my user id`, or
2. no recipient at all (`recipientUserId: null`, which in Mongo also matches
   documents written before the field existed) **and** an audience of `all` or
   of my own role.

The same filter scopes mark-as-read, so a notification the caller cannot read
**404s** instead of being flipped and echoed back.

`utils/notify.js#createAndEmit` is the only place a notification should be
created: it saves the document and then emits to `user:<id>` alone, or to
`role:<audience>` (all three role rooms when the audience is `all`).

---

## 4. Schema changes across the branch

### New — `models/SystemConfig.js`

A **singleton** document keyed `key: "active"` (immutable, unique). It is the
one place the scheduling grid is configured.

| Field | Type | Default |
|---|---|---|
| `workingDays` | `[String]` | Monday…Friday |
| `startTime` / `endTime` | `String` | `09:00` / `17:30` |
| `periodDurationMin` | `Number` (30–120) | 60 |
| `breakDurationMin` | `Number` (0–30) | 15 |
| `breaks[]` | `[{name, start, end}]` | one "Lunch" 12:15–13:15 |
| `slots[]` | `[{start, end}]` | today's six `TIME_SLOTS` |
| `maxPeriodsPerDay` | `Number` (1–12) | 6 |
| `maxConsecutiveHours` | `Number` (1–6) | 3 |
| `maxDailyHoursPerFaculty` | `Number` (1–10) | 6 |
| `weeksPerSemester` | `Number` (8–24) | 13 |
| `avoidFirstLastPeriod` | `Boolean` | false |
| `preferMorningLabs` | `Boolean` | true |
| `balanceFacultyWorkload` | `Boolean` | true |
| `prioritizeFacultyPreferences` | `Boolean` | true |
| `updatedBy` | `String` | set from the admin's email on `PUT` |

Reads (`GET /api/config`, `GET /api/config/grid`) never create the document —
they return the saved one or the schema defaults. Only the admin `PUT` and
`scripts/seedSystemConfig.js` write it.

### New — `models/Query.js`

Faculty and student questions answered by an admin.

`{ userId, role: "faculty"|"student", name, subject, message, status: "open"|"answered", reply }`
plus timestamps. The author (`userId`, `role`, `name`) is always taken **from the
token**, never from the request body, so a query can only ever belong to the user
who created it.

### Modified — `models/Timetable.js`

- `academicYear: Number` added alongside `department`, `semester`, `year`, and a
  compound index on `{department, semester, year, academicYear, status}`.
- `conflicts[]` gained `resolved`, `resolvedBy`, `resolvedAt`, `resolutionNote`.
- `comments[]` added: `{userId, name, role, text, createdAt}`.
- `metadata` gained the whole generation record: `generationMethod`, `seed`,
  `generations`, `populationSize`, `bestFitness`, `hardViolations`,
  `softPenalty`, `fitnessHistory[]`, `qualityScore`, `qualityBreakdown`
  (`constraintCompliance` / `roomUtilization` / `facultyBalance` /
  `studentConvenience`) and `jobId`.

**`ScheduleEntrySchema` is strict and allows exactly `courseId`, `facultyId`,
`roomId`, `day`, `startTime`, `endTime`.** Any extra field the generator attaches
(`courseName`, `timeSlot`, …) is silently dropped on save. New per-run statistics
must go in `metadata`.

### Modified — `models/Notification.js`

- `audience: "all" | "admin" | "faculty" | "student"` (default `all`).
- `recipientUserId: String | null` (default `null`) — exclusive, see section 3.
- `relatedTimetableId: String | null`.
- `isRead` remains a **single shared flag** (see limitations).

---

## 5. The scheduling pipeline

`runGenerationPipeline` in `routes/timetableRoute.js` is shared by the async and
the synchronous entry points.

1. **Validate and load.** The body must carry `department`, `semester`, `year`,
   `academicYear`; `gaOptions` and `method` are optional.
   `utils/schedulingContext.js#loadSchedulingContext` loads courses (by
   department, case-insensitive and anchored, plus semester, year, academicYear),
   faculty by department, all rooms, **and the config grid**. Empty courses,
   faculty or rooms is a `404`.
2. **AI path — only when `method === "ai"` and `GOOGLE_API_KEY` is set.**
3. **Genetic algorithm** otherwise.
4. **Local backtracking scheduler** when the GA throws, or when its best
   chromosome still has hard violations; also the direct path for
   `/generate-local`.
5. **`validateSchedule`** gates every result regardless of producer, then
   `computeQualityScore` runs, the timetable is saved as `status: "draft"`, and a
   notification is created.

### The config-driven grid

`getScheduleGrid(config)` in `utils/schedulingConstants.js` resolves the
`SystemConfig` document into the single grid that every scheduler, the validator,
the quality score and the frontend read:

```
{ days, slots, breaks, weeks, maxPeriodsPerDay, maxConsecutiveHours,
  maxDailyHoursPerFaculty, flags }
```

**`DAYS`, `TIME_SLOTS`, `BREAK_SLOT` and `WEEKS` in `schedulingConstants.js` are
DEFAULTS, not truth.** They are reached only through `DEFAULT_GRID` when no
config has been loaded. Anything that hardcodes them instead of accepting a grid
argument is a bug.

`slots[]` wins over derivation. `deriveSlots` walks from `startTime` in
`periodDurationMin` steps with `breakDurationMin` between periods, skipping
windows that overlap a break — but the shipped slots have irregular gaps
(0, 15, lunch, 0, 15) that no fixed-step walk reproduces, so `SystemConfig.slots`
**defaults to `TIME_SLOTS`** and derivation is reached only by a config that
explicitly clears `slots[]`.

Live output of `GET /api/config/grid` on this machine, as an admin:

```json
{
  "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  "slots": [
    { "start": "09:00", "end": "10:00" },
    { "start": "10:00", "end": "11:00" },
    { "start": "11:15", "end": "12:15" },
    { "start": "14:15", "end": "15:15" },
    { "start": "15:15", "end": "16:15" },
    { "start": "16:30", "end": "17:30" }
  ],
  "breaks": [{ "name": "Lunch", "start": "12:15", "end": "13:15" }],
  "weeks": 13,
  "maxPeriodsPerDay": 6,
  "maxConsecutiveHours": 3,
  "maxDailyHoursPerFaculty": 6,
  "flags": {
    "avoidFirstLastPeriod": false,
    "preferMorningLabs": true,
    "balanceFacultyWorkload": true,
    "prioritizeFacultyPreferences": true
  }
}
```

`PUT /api/config` is admin-only, accepts only the 15 whitelisted fields above,
and validates day names, break and slot bounds, overlapping slots, and slots that
straddle a break. It returns `{config, grid}`.

### The genetic algorithm — `utils/geneticScheduler.js`

Chromosome layout:

```
facultyGene[courseIdx]           -> index into eligibleFaculty
sessionGenes[courseIdx][session] -> { dayIdx, slotIdx, roomIdx }
```

One faculty member per course is guaranteed **by construction**; every other rule
is enforced through fitness.

```
fitness = 1 / (1 + 10 * hard + soft)
```

`hard` counts violations of hard constraints (clashes, availability, workload,
duplicate slots); `soft` sums preference penalties. Defaults and bounds:

| Tunable | Default | Limits |
|---|---|---|
| `populationSize` | 60 | 10–200 |
| `maxGenerations` | 300 | 10–1000 |
| `mutationRate` | 0.15 | 0–1 |
| `elitism` | 2 | ≤ populationSize − 1 |
| `tournamentK` | 3 | ≤ populationSize |
| `timeLimitMs` | 20000 | — |
| stall window | 30 generations flat with `hard === 0` → converged | — |

All randomness comes from `createRng(seed)` in `utils/prng.js`. `Date.now()` is
used only for the wall-clock limit. Every `progressEvery` generations the run
reports through `onProgress` and yields the event loop with `setImmediate`, so
the HTTP server stays responsive. **Yielding changes when the work happens, never
the order of the random draws** — which is what keeps the run reproducible.

### The backtracking fallback — `utils/localScheduler.js`

`generateLocalTimetable` is a deterministic constraint solver:

- For each course, enumerate every `(faculty, day, slot, room)` combination that
  passes specialization, faculty availability, room availability, room type and
  room capacity. Only faculty with at least `requiredSessions` viable options
  survive. Options are scored: +1000 specialization, +20 / −30 preferred /
  avoided slot, −5 per hour already assigned to that faculty.
- Courses are ordered most-constrained-first (fewest options, then most
  sessions).
- DFS assigns sessions per course, tracking `facultySlotUsage`, `roomSlotUsage`
  and `studentGroupSlotUsage` (student group = `department|semester|year`) as
  sets of composite keys, preferring different days for the same course. Hard cap
  of 250,000 search nodes.
- One faculty teaches all sessions of a course.

**Specialization matching is fuzzy text matching** of `faculty.specialization[]`
against the course's name + code + description (normalised, word-level;
multi-word specializations need at least two overlapping words). Seed data is
tuned so this resolves. New courses or faculty with unrelated wording will make
the local scheduler throw *"No suitably specialized faculty"*. The generate route
deliberately tolerates **specialization-only** validation errors from the local
scheduler's output and logs a warning; no other error class is tolerated.

### The optional AI path

Only when `method === "ai"` **and** `GOOGLE_API_KEY` is set.
`generateTimetableWithAI` in `utils/timetableGenerator.js` (`@google/genai`,
model string `gemini-3.6-flash`) builds a prompt from the grid and every entity,
retries (3 attempts × up to 3 API retries with linear backoff) feeding the
previous validation errors back into the prompt, parses the reply by stripping
markdown fences and slicing from the first `[` to the last `]`, then validates
and saves.

**This path has never been executed.** See limitations.

### The validator — `utils/scheduleValidator.js`

The independent checker every result must survive before it is stored. Hard rules
land in `errors` (the timetable is rejected); preferences land in `warnings` (the
timetable is still usable). Keeping the checker out of the generators is what
makes "the timetable is valid" mean something.

The 15 checks, in source order:

| # | Rule | Class |
|---|---|---|
| 1 | Schedule must contain entries | hard |
| 2 | Course / faculty / room IDs must resolve | hard |
| 3 | Day must be one of the configured working days | hard |
| 4 | Time slot must be one of the configured slots | hard |
| 5 | Protected break (lunch) must stay empty | hard |
| 6 | Faculty availability | hard |
| 7 | Room availability | hard |
| 8 | Faculty / room / student-group overlapping conflicts | hard |
| 9 | Course weekly session count | hard |
| 10 | One faculty per course | hard |
| 11 | Faculty specialization | hard |
| 12 | Room type matches course type | hard |
| 13 | Faculty maximum weekly hours (`Faculty.maxHoursPerWeek`) | hard |
| 14 | Faculty avoided slots | **soft** (warning) |
| 15 | Room capacity vs course enrollment | hard |

`scripts/verifyConstraints.js` groups these into the 12-row PASS/FAIL table shown
in section 7.

### Asynchronous generation

`POST /api/timetables/generate` (admin) answers **202 `{ jobId, steps }`** and
then runs the pipeline on the event loop via
`setImmediate(() => runGenerationJob(app, jobId))`. Generation is CPU-bound, so
exactly one run is allowed per process: a second concurrent caller gets **409**.

`utils/generationJobs.js` is the registry. `GENERATION_STEPS` is part of the
contract — the frontend renders these seven strings as a stepper:

```
Loading scheduling data
Validating input data
Building constraint model
Initialising population
Evolving schedule
Validating final schedule
Saving timetable
```

A job record carries `status` (`queued` → `running` → `completed` | `failed`),
`step`, `stepIndex`, `percentage`, GA telemetry (`generation`, `maxGenerations`,
`bestFitness`, `hardViolations`, `softPenalty`), `timetableId`, `error`, `params`
and timestamps. `updateJob()` emits the merged record to `generation:<jobId>`.
Terminal jobs are swept 30 minutes after their last update.

Polling fallback: `GET /api/timetables/generate/:jobId/progress` returns the same
record, **404** when the job id is unknown. The frontend treats the socket as
primary and polling as the safety net.

`POST /api/timetables/generate-local` is still a synchronous **201** — scripts
depend on that — but it takes the same single-run lock.

---

## 6. Determinism

All randomness in the genetic algorithm comes from `createRng(seed)` in
`utils/prng.js`. Given the same seed and the same input data, the GA produces
**the same schedule, entry for entry, in the same order**. Async yielding changes
*when* work happens, never the order of the draws, so running under an HTTP
server does not perturb the result.

`scripts/gaSmoke.js` prints a sha1 of the produced schedule so two runs can be
compared by eye.

### Proof — run twice with seed 42, then once with seed 7

Command:

```bash
cd backend
node scripts/gaSmoke.js --seed 42   # run 1
node scripts/gaSmoke.js --seed 42   # run 2
node scripts/gaSmoke.js --seed 7    # control
```

Run 1, actual output (fitness history truncated here for length — the full
history is identical between the two seed-42 runs):

```
Database connected
Context: {"department":"Computer Science","semester":1,"year":1,"academicYear":2026,"courses":10,"faculty":9,"rooms":8}
{
  "generationMethod": "genetic-algorithm",
  "seed": 42,
  "generations": 30,
  "populationSize": 60,
  "bestFitness": 1,
  "hardViolations": 0,
  "softPenalty": 0,
  "fitnessHistory": [
    { "generation": 0, "best": 1, "average": 0.15959349201996273 },
    { "generation": 1, "best": 1, "average": 0.04325711752625297 },
    { "generation": 2, "best": 1, "average": 0.04330718652551455 },
    ...
    { "generation": 30, "best": 1, "average": 0.05958396116625997 }
  ],
  "durationMs": 67,
  "terminatedBy": "converged",
  "warnings": [],
  "validationErrors": []
}
schedule entries: 28
schedule sha1: 811b2f78235a20d0d9a5e224f449306043cd4ae2
```

The three sha1 values actually produced:

```
seed 42, run 1 : 28 entries : 811b2f78235a20d0d9a5e224f449306043cd4ae2
seed 42, run 2 : 28 entries : 811b2f78235a20d0d9a5e224f449306043cd4ae2   <- identical
seed  7        : 28 entries : 35ea324e528a57cb059808e9e704fdc40e689276   <- different
```

Diffing the complete stdout of the two seed-42 runs gives exactly one differing
line:

```
168c168
<   "durationMs": 67,
---
>   "durationMs": 69,
```

That is the wall-clock duration, which is measured with `Date.now()` and is not
part of the schedule. **Everything that describes the timetable — every fitness
history entry, the entry count, and the schedule sha1 — is byte-identical.** A
different seed produces a different schedule, which is what proves the sha1 is
actually a function of the run and not a constant.

The same property is asserted over HTTP by smoke test 6 in section 7:
*"Computer Science regenerated with seed 42 is identical to the first run —
28 entries match exactly, in order."*

---

## 7. Test results

There are no unit tests. These two CLI suites are the gate.

### `npm run verify` — constraint verification

`scripts/verifyConstraints.js` loads a saved timetable (`--id <id>` or
`--latest`, optionally narrowed by `--department` / `--academicYear`), rebuilds
the scheduling context, resolves the grid **from `SystemConfig`**, runs
`validateSchedule`, prints a PASS/FAIL table grouped by rule, and exits `1` on
any FAIL. Run with no arguments it prints its usage and exits `1`.

Command and actual output:

```
$ cd backend && npm run verify -- --latest

> backend@1.0.0 verify
> node scripts/verifyConstraints.js --latest

Database connected
Timetable: {"id":"6ab3dd919c9da36ebfc2a963","name":"Computer Science - Year 1 Sem 1 (2026)","department":"Computer Science","semester":"1","year":1,"academicYear":2026,"status":"draft"}
Context: {"courses":10,"faculty":9,"rooms":8}
Grid: {"source":"SystemConfig","days":5,"slots":6,"breaks":1,"weeks":13,"dayNames":"Monday, Tuesday, Wednesday, Thursday, Friday","firstSlot":"09:00-10:00","lastSlot":"16:30-17:30"}
RULE                    STATUS  COUNT
----------------------  ------  -----
Teacher conflict        PASS    0
Room conflict           PASS    0
Student-group conflict  PASS    0
Room capacity           PASS    0
Faculty availability    PASS    0
Room availability       PASS    0
Faculty workload        PASS    0
Lab-room rule           PASS    0
Break slot              PASS    0
Working days            PASS    0
Session duration        PASS    0
Session count           PASS    0

exit code 0
```

Note the `Grid:` line: `"source":"SystemConfig"` confirms the check ran against
the configured grid, not against the compiled-in defaults.

### `npm run smoke` — API smoke suite

`scripts/smokeApi.js` runs against an **already-running** backend (it starts no
server of its own), logs in as all three roles, asserts the status-code matrix,
drives a real asynchronous generation to completion through the 202 + polling
contract, and deletes everything it created afterwards. Publishing is the one
step that touches pre-existing data — `PATCH /:id/publish` archives every other
published timetable for the same cohort — so the script records those ids before
it publishes and sets them back to `published` in cleanup, as its own cleanup
row.

Command and actual output:

```
$ cd backend && npm run smoke

> backend@1.0.0 smoke
> node scripts/smokeApi.js


API smoke test against http://localhost:5050
(the server must already be running; this script starts none)

PASS  1    Login as admin, faculty and student; each response carries its role
            admin 200/admin   faculty 200/faculty   student 200/student
PASS  2    GET /api/courses without a token → 401
            401 Authentication required
PASS  3    POST /api/courses as student → 403
            403 You do not have permission to perform this action
PASS  4    Generate Computer Science Y1 S1 AY2026 (seed 42): 202 + jobId + steps, polls to completion
            202 → jobId 7f85c81a-6e45-451e-bdcc-d37ac5d788a7, 7 steps, completed after 2 poll(s) → timetable 6ab5406f59372858fb9a7611
PASS  5    Two cohorts differ in department / year / semester / academicYear and share no courses
            Computer Science/Y1/S1/AY2026 (10 courses) vs Electronics/Y2/S2/AY2027 (6 courses); shared course ids: 0
PASS  6    Computer Science regenerated with seed 42 is identical to the first run
            28 entries match exactly, in order
PASS  7    GET /api/timetables/generate/<unknown>/progress → 404
            404 Generation job not found
PASS  8    PATCH /api/timetables/:id/publish → 2xx
            200 {"metadata":{"qualityBreakdown":{"constraintCompliance":99,"roomUtilization":70,"facultyBalance":100,"studentConvenience":60},"totalHours":1 (status now "published")
PASS  9    GET /api/timetables/:id/export?format=csv|json → 2xx, non-empty
            csv 200 (1233 bytes), json 200 (2902 bytes)
PASS  10   GET /api/config/grid as admin → grid; PUT /api/config as student → 403
            grid 200 (5 days × 6 slots), student PUT 403
PASS  11   A faculty query is not visible to the student
            student list 200: does not contain it; author list 200: contains its own query

Cleanup
PASS  --   Deleted the notifications this run produced
            4/4 removed
PASS  --   Deleted the timetables this run generated
            3/3 removed
PASS  --   Deleted the query this run raised (directly in MongoDB)
            1/1 removed from mongodb://localhost:27017/smartschedai

========================================================================================================
API SMOKE TEST — http://localhost:5050
========================================================================================================
  1  Login as admin, faculty and student; each response carries its role                         PASS
  2  GET /api/courses without a token → 401                                                      PASS
  3  POST /api/courses as student → 403                                                          PASS
  4  Generate Computer Science Y1 S1 AY2026 (seed 42): 202 + jobId + steps, polls to completion  PASS
  5  Two cohorts differ in department / year / semester / academicYear and share no courses      PASS
  6  Computer Science regenerated with seed 42 is identical to the first run                     PASS
  7  GET /api/timetables/generate/<unknown>/progress → 404                                       PASS
  8  PATCH /api/timetables/:id/publish → 2xx                                                     PASS
  9  GET /api/timetables/:id/export?format=csv|json → 2xx, non-empty                             PASS
 10  GET /api/config/grid as admin → grid; PUT /api/config as student → 403                      PASS
 11  A faculty query is not visible to the student                                               PASS
 --  Deleted the notifications this run produced                                                 PASS
 --  Deleted the timetables this run generated                                                   PASS
 --  Deleted the query this run raised (directly in MongoDB)                                     PASS
========================================================================================================
14/14 passed, 0 failed
========================================================================================================
```

The re-publish cleanup row does not appear above because this database had no
published timetable for the Electronics cohort before the run; it is printed
only when the publish step actually archived something.

### Frontend lint and build

```
$ cd frontend && npm run lint

> frontend@0.0.0 lint
> eslint .

.../frontend/src/components/CourseForm.jsx
  46:6  warning  React Hook useEffect has a missing dependency: 'defaultData'. ...  react-hooks/exhaustive-deps

.../frontend/src/components/Faculty-Form.jsx
  53:6  warning  React Hook useEffect has missing dependencies: 'initialData.availability', ...  react-hooks/exhaustive-deps

✖ 2 problems (0 errors, 2 warnings)
```

Two pre-existing `react-hooks/exhaustive-deps` warnings in the two form
components; **zero errors**.

```
$ cd frontend && npm run build

> frontend@0.0.0 build
> vite build

rolldown-vite v7.1.12 building for production...
✓ 2719 modules transformed.
dist/index.html                 0.74 kB │ gzip:   0.40 kB
dist/assets/index-2Ec3Esiq.css  89.80 kB │ gzip:  15.71 kB
dist/assets/index-BXoa0UNx.js   1,482.85 kB │ gzip: 432.04 kB

(!) Some chunks are larger than 500 kB after minification.
✓ built in 366ms
```

The build succeeds. The single 1.48 MB JS chunk is one bundle with no code
splitting — a size warning, not a failure.

### What these suites do **not** cover

- The Socket.io transport. Smoke test 4 drives generation through the **polling**
  fallback; the live `generation:progress` stream, the admin-only
  `generation:subscribe` guard and the 409-on-concurrent-generate path are not
  asserted by any script.
- Anything rendered in a browser. See limitations.

---

## 8. Files changed

Generated from `git diff --numstat main` (committed work on this branch plus the
working tree), grouped by area. Totals: **145 files, +32,866 / −10,730**.
`git diff` does not see untracked files, so two new files fall outside those
numbers: `DELIVERABLE.md` itself, and `backend/scripts/smokeApi.js` (1,034
lines) — named in the `backend/scripts` row below, but not counted in its
12 files / +1,400.

| Area | Files | +/− | What changed |
|---|---|---|---|
| `backend/middleware` | 1 | +56 / −0 | New `auth.js`: `requireAuth` and `requireRole`, the whole authorisation surface. |
| `backend/models` | 6 | +189 / −1 | New `SystemConfig` and `Query`; `academicYear`, conflict-resolution fields, comments and the `metadata` generation record on `Timetable`; `audience` + exclusive `recipientUserId` on `Notification`. |
| `backend/routes` | 13 | +2,746 / −567 | Router-level auth on every router; async 202 generation + job progress + conflicts/comments/publish/export in `timetableRoute.js`; new `configRoute`, `queriesRoute`, `usersRoute`, `studentsRoute`; audience-scoped notifications; server-side scoping of `GET /api/timetables`. |
| `backend/utils` | 13 | +4,388 / −629 | New seeded GA (`geneticScheduler`, `prng`), independent `scheduleValidator`, `qualityScore`, `generationJobs`, `notify`, `schedulingConstants` + `schedulingContext` + `schedulingHelpers` (the config→grid path), CSV and import normalizers; `localScheduler` and `timetableGenerator` reworked to take a grid instead of hardcoding one. |
| `backend/scripts` | 12 | +1,400 / −0 | New `gaSmoke.js`, `verifyConstraints.js`, `seedSystemConfig.js`, `importDataset.js`, plus sample CSVs and import mappings. Also new, but untracked and so outside these numbers: `smokeApi.js` (1,034 lines). |
| `backend` (root) | 6 | +586 / −39 | `server.js` gains the Socket.io server with handshake auth and room joins and eleven mounted routers; `createTestUsers.js` links profiles; `seedRealisticData.js` adds the second cohort; `package.json` adds `seed:config`, `verify`, `smoke`. Includes `package-lock.json`. |
| `frontend/pages` | 24 | +13,026 / −9,088 | New admin pages `CreateTimetable`, `GenerateTimetable`, `ViewTimetable`, `ViewTimetableDetail`, `Infrastructure`, `Users`, `Students`; every faculty and student page rewritten onto the shared shell and scoped to its own data; legacy `pages/Timetable.jsx` deleted. |
| `frontend/components` | 32 | +3,837 / −133 | New `AppShell`; `components/common/*` (cards, stepper, checklist, dialogs, empty states); `components/timetable/*` (grid, list view, legend, quality score, conflicts, comments, generation progress); `components/charts/*` (recharts wrappers). |
| `frontend/components/ui` | 15 | +855 / −0 | shadcn/ui primitives added: dialog, alert-dialog, tabs, tooltip, progress, separator, switch, checkbox, scroll-area, sheet, skeleton, alert, sonner. |
| `frontend/hooks` | 5 | +851 / −0 | New `useIdentity`, `useSystemConfig`, `useTimetableData`, `useSocket`, `useGenerationProgress`. |
| `frontend/lib` | 5 | +574 / −0 | New `api.js` (the single axios client with token + 401 interceptors), `nav.js` (the single navigation source), `schedule.js`, `status.js`, `theme.js`. |
| `frontend` (root) | 8 | +2,928 / −273 | `App.jsx` routing with `ProtectedRoute`, expiry check, alias redirects and the config provider; design tokens and print rules in `index.css`; `vite.config.js` alias. Includes `package-lock.json`. |
| docs (repo root) | 5 | +1,430 / −0 | `CLAUDE.md`, `FINDINGS.md`, `IMPLEMENTATION_PLAN.md`, `UI_REPLICATION_PLAN.md`, `WORKFLOW_PLAN.md`. |

Commit history on the branch (`git log --oneline main..HEAD`, newest first):

```
95d69a6 feat(ui): migrate dashboard and portals onto the shared shell
a433eaf fix(config): honour the configured grid on the AI path and empty breaks
01f3cae feat(admin): generate, create, infrastructure and view timetable pages
b49b578 docs: record the audit findings behind this branch's work
c374b67 fix(notifications): treat a recipient as exclusive, not additive
7cd9bc8 feat(portals): scope faculty and student views to their own data
b29e459 feat(generation): async generation over Socket.io with scoped notifications
55c17da feat(ui): app shell v2, common components and shared timetable renderer
87fcc7b feat(config): SystemConfig-driven scheduling grid
57eac08 feat(ui): shadcn primitives, shared nav and schedule libraries
8fab1fd docs(plan): phased UI replication plan for timetable module and portals
d5c5b16 fix(login): distinguish unreachable server from bad credentials
015d1d2 feat(data): second cohort seed + generic CSV importer with samples
044133b feat(admin): user and student management
861c858 feat(scheduler): seeded genetic algorithm with validator-based fitness
63f5af3 fix(timetable): academicYear/year flow end-to-end, publish/export routes
6856ddd feat(routing): alias dashboards, expiry check
d85a368 feat(auth): JWT middleware, role guards, shared API client
53730ac chore: baseline fixes (dotenv order, shared scheduling constants, dead code)
```

---

## 9. Known limitations

Read this section before you promise anything to anyone.

### The AI path is unverified

`GOOGLE_API_KEY` is **empty** in `backend/.env` on this machine, so
`generateTimetableWithAI` has never run — not once, not in any test, not in any
gate. The model string in `utils/timetableGenerator.js` is `"gemini-3.6-flash"`
and **has never been confirmed against the live Google API**; if that model name
is wrong, the AI path fails at the first call. `POST /api/ai/chat` (the chatbot)
uses a different string, `"gemini-2.5-flash"`, and is equally unexercised. Treat
the entire AI surface as unproven code. `node checkModels.js` lists the models a
real key can actually see, and is the first thing to run before trusting this
path.

### The generation job registry is in-memory and single-process

`utils/generationJobs.js` keeps jobs in a plain `Map` inside one Node process.
Consequences, all of them real:

- Jobs **do not survive a restart** — including a nodemon reload. A browser
  polling `/generate/:jobId/progress` across a restart gets a 404 for a job that
  really did run.
- They are **invisible to any other worker**. Running the backend under
  `cluster`, PM2 `-i`, or several containers breaks both the `jobId` lookup and
  the one-run-at-a-time (409) guarantee, because each worker has its own `Map`
  and its own lock.

This is a single-worker deployment only. Fixing it means moving the registry into
MongoDB or Redis.

### Four advanced scheduling constraints are stored but not enforced

`SystemConfig` persists, `PUT /api/config` accepts, and `GET /api/config/grid`
returns these four flags — and **nothing in the scheduler, the validator or the
quality score reads them**:

- `avoidFirstLastPeriod`
- `preferMorningLabs`
- `balanceFacultyWorkload`
- `prioritizeFacultyPreferences`

They appear as `grid.flags` and are never consumed outside
`utils/schedulingConstants.js` itself. Toggling them in the UI changes a stored
value and nothing else about the generated timetable.

Two numeric fields are in the same position, worth knowing:

- `maxDailyHoursPerFaculty` is resolved onto the grid and then never read. The
  workload rule the validator actually enforces is `Faculty.maxHoursPerWeek`, a
  per-faculty field, weekly rather than daily.
- `maxConsecutiveHours` is read **only** by `utils/qualityScore.js`, as a soft
  student-convenience penalty. It is not a hard constraint; nothing rejects a
  schedule for breaching it.
- `maxPeriodsPerDay` is used only to cap slot derivation, and derivation itself
  is unreachable unless a config explicitly clears `slots[]`.

### The importer is CLI-only

`scripts/importDataset.js` is a good importer — mapping-driven, `--dry-run`,
per-row action table, sensible upsert keys, optional `--create-users` — but it is
reachable **only from a terminal on the server**. There is no upload endpoint and
no UI. An administrator cannot import a CSV without shell access to the machine.

### Notifications have a single shared read flag

`Notification.isRead` is one boolean on one document. For a broadcast
(`recipientUserId: null`), the first person who marks it read marks it read **for
everybody in that audience**. Only per-user notifications can be marked read
safely. Real per-user read state needs a separate collection or a `readBy[]`
array; neither exists.

### Nothing in this branch has been exercised in a browser

This is the largest gap in the handover, and it is deliberate about being stated.

Every gate on this branch was **API-level** (`npm run smoke` over HTTP, `npm run
verify`, `node scripts/gaSmoke.js`) or **build-level** (`npm run lint`, `npm run
build` — both run for this document, results in section 7). **No page in this
application has been opened in a browser during this work.** Consequently:

- The manual test matrix in `UI_REPLICATION_PLAN.md` ("Final test matrix",
  16 scenarios) is **entirely unrun**. That includes the live socket progress
  stream, the socket-blocked polling fallback, the two-concurrent-generates 409
  in the UI, conflict resolution, the four view modes × two colour modes, the A4
  print layout, light/dark on every new page, sidebar-collapse persistence and
  keyboard-only traversal.
- Rendering bugs, layout breakage, dark-mode colour escapes, focus traps and
  accessibility issues in the new component library are **unknown**, not absent.
- The live Socket.io event path — as opposed to the polling fallback that smoke
  test 4 uses — has not been observed working end to end from a real client.

Treat the UI as "compiles, and lints with no errors", not as "works".

### Smaller known rough edges

- `backend/.env.example` and `frontend/.env.example` still name **port 5000**, as
  does the connection-error hint in `frontend/src/pages/Login.jsx`. Copying an
  example file verbatim on macOS produces the AirPlay 403 described in section 1.
- `POST /api/timetables/:id/optimize` exists in `timetableRoute.js` but is
  **commented out**.
- There are **no automated unit tests** in either project. `npm test` in
  `backend/` is still the npm default stub that exits 1.
- Specialization matching is fuzzy text matching. Courses or faculty whose
  wording does not overlap will make the local scheduler throw *"No suitably
  specialized faculty"*; the seed data is tuned to avoid this, real data may not
  be.
- One section per cohort. `department|semester|year` is the student-group key;
  there is no notion of parallel sections within a cohort.
- `FacultyPortal.jsx`, `StudentPortal.jsx`, `Dashboard.jsx`,
  `GenerateTimetable.jsx` and `Infrastructure.jsx` are still 1,000+ line single
  files, even though they now use `AppShell` and the shared components.
- `npm run verify` with no arguments prints usage and exits `1`. It needs
  `--latest` or `--id <id>` to actually check anything — do not mistake the usage
  message for a pass, and note that the exit code of a usage error is
  indistinguishable from the exit code of a real FAIL.
