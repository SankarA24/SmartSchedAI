# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Smart Classroom & AI Timetable Scheduler: a MERN app for higher-ed timetable management with three role-based portals (admin, faculty, student). The core feature is timetable generation: a genetic algorithm by default, an optional Gemini path, and a deterministic backtracking constraint solver as the fallback and as the `/generate-local` baseline.

The repo is two independent npm projects with no root `package.json`: `backend/` (Express 5 + Mongoose 8 + Socket.io 4, ESM) and `frontend/` (React 19 + Vite + Tailwind v4 + shadcn/ui, plain JSX). There are no automated tests anywhere; `backend/scripts/` holds CLI verification tools instead.

## Commands

Both projects must be started separately.

```bash
# Backend (from backend/)
npm install
npm run dev                  # nodemon server.js on $PORT (backend/.env sets 5050)
npm run seed:config          # scripts/seedSystemConfig.js — upsert the active SystemConfig
npm run verify               # scripts/verifyConstraints.js — PASS/FAIL table per rule
npm run smoke                # scripts/smokeApi.js — API smoke suite against a RUNNING server
node scripts/gaSmoke.js      # run the genetic scheduler headless; prints stats + a schedule sha1
node scripts/importDataset.js --type courses --file data/courses.csv   # CSV importer
node createTestUsers.js      # creates admin/faculty/student users, password "123456"
node seedRealisticData.js    # upserts two cohorts — Computer Science S1/Y1/AY2026 and Electronics S2/Y2/AY2027 (16 courses, 13 faculty, 8 rooms total)
node checkModels.js          # lists Gemini models available to your GOOGLE_API_KEY

# Frontend (from frontend/)
npm install
npm run dev                  # Vite on http://localhost:5173
npm run build
npm run lint                 # eslint flat config (react-hooks, react-refresh)
npm run preview
```

### Ports

**The backend port is configurable via `PORT`, and port 5000 is unusable on macOS** — AirPlay Receiver holds it, so a server started there answers with a ControlCenter 403 that looks like an auth bug. `backend/.env` therefore sets `PORT=5050` and `frontend/.env` sets `VITE_API_URL=http://localhost:5050/api`. The fallback baked into `frontend/src/lib/api.js` is still `http://localhost:5000/api`, so the frontend `.env` must be present (`backend/.env.example`, `frontend/.env.example` and the "port 5000" hint in `pages/Login.jsx` are stale on this point).

Backend needs a `backend/.env` (gitignored):

```
PORT=5050
MONGO_URI=mongodb://localhost:27017/smartschedai
JWT_SECRET=<any long random string>
GOOGLE_API_KEY=<optional; without it the AI path is skipped and /api/ai/chat fails>
CLIENT_ORIGIN=http://localhost:5173     # CORS origin, and the Socket.io CORS origin
```

If no local MongoDB is installed: `docker run -d --name smartschedai-mongo -p 27017:27017 mongo:7`.

Test logins after `createTestUsers.js`: `admin@smartscheduler.com`, `faculty@smartscheduler.com`, `student@smartscheduler.com`, all with password `123456`. The login form also requires picking the matching role; a mismatch returns 403. The script links the faculty and student users to their `Faculty` / `Student` docs.

## Backend architecture

`server.js` mounts eleven routers under `/api/*`: courses, faculty, rooms, timetables, ai, notifications, auth, users, students, config, queries. It then wraps the same HTTP server in a Socket.io server and parks it on the app as `app.set("io", io)` — that is how routes and `utils/notify.js` reach the socket layer without importing `server.js`.

### Auth

`middleware/auth.js` exports `requireAuth` (verifies `Authorization: Bearer <token>` against `JWT_SECRET`, attaches `req.user`, 401 otherwise) and `requireRole(...roles)` (403 when `req.user.role` is not allowed). Every router except the login endpoint applies `requireAuth` at the router level; writes are `requireRole("admin")`, `usersRouter` is admin-only end to end, `queriesRouter` uses `requireRole("faculty", "student")` for authoring, and `studentsRouter` has student-only `/me` endpoints.

- Login issues a 7-day JWT carrying `{userId, role, facultyId, studentId, name, email, department, semester, year, academicYear, section}` — the profile fields come from the linked `Faculty` / `Student` doc, which is why role scoping can happen from the token alone.
- `GET /api/auth/me` re-reads the `User` and its linked profile server-side and returns `{user, profile}`. It is the authoritative identity; the cached `localStorage` copy is only for first paint.
- `GET /api/timetables` is scoped **server-side**: a student sees published timetables for their own cohort, a faculty member sees published timetables that contain one of their own entries, an admin sees whatever the query filters select. A faculty/student caller with no link resolves to `[]`, not to everything.

### SystemConfig, `/api/config`, and the derived grid

`models/SystemConfig.js` is a singleton document (`key: "active"`) holding `workingDays`, `startTime`/`endTime`, `periodDurationMin`, `breakDurationMin`, `breaks[]`, an explicit `slots[]` override, `maxPeriodsPerDay`, `maxConsecutiveHours`, `maxDailyHoursPerFaculty`, `weeksPerSemester` and four preference flags.

`getScheduleGrid(config)` in `utils/schedulingConstants.js` resolves that document into the one grid every scheduler, the validator, the quality score and the frontend work from:

```
{ days, slots, breaks, weeks, maxPeriodsPerDay, maxConsecutiveHours, maxDailyHoursPerFaculty, flags }
```

**`DAYS`, `TIME_SLOTS`, `BREAK_SLOT` and `WEEKS` in `schedulingConstants.js` are DEFAULTS, not truth.** They are only reached through `DEFAULT_GRID` when no config has been loaded. Anything that hardcodes them instead of taking a grid argument is a bug: five working days, six one-hour slots and a 12:15–13:15 lunch are what an unconfigured install happens to have, not what the app enforces.

- `slots[]` wins over derivation. Derivation (`deriveSlots`) walks from `startTime` in `periodDurationMin` steps with `breakDurationMin` between periods, skipping windows that overlap a break — but the shipped slots have irregular gaps (0, 15, lunch, 0, 15) that no fixed-step walk reproduces, so `SystemConfig.slots` **defaults to `TIME_SLOTS`** and derivation is reached only by a config that explicitly clears `slots[]`. Clearing it changes the grid and invalidates saved timetables.
- Routes: `GET /api/config` (any authenticated caller; returns the saved doc or the schema defaults without creating it), `PUT /api/config` (**admin only**, whitelisted fields, validated: day names, break/slot bounds, no overlapping slots, no slot straddling a break; returns `{config, grid}`), `GET /api/config/grid` (the derived grid).
- Reads never create the document; only the admin `PUT` and `scripts/seedSystemConfig.js` do.
- `utils/schedulingContext.js#loadSchedulingContext` loads the config alongside courses/faculty/rooms and hands `context.grid` to every generation path.

### Asynchronous generation

`POST /api/timetables/generate` (admin only) answers **202 `{ jobId, steps }`** and then runs the pipeline on the event loop via `setImmediate(() => runGenerationJob(app, jobId))`. Generation is CPU-bound, so exactly one run is allowed per process: `hasActiveJob()` makes a second concurrent caller a **409**.

`utils/generationJobs.js` is the registry:

- `GENERATION_STEPS` — the seven stage names, in order, rendered by the frontend as a stepper, so the strings are part of the contract: *Loading scheduling data, Validating input data, Building constraint model, Initialising population, Evolving schedule, Validating final schedule, Saving timetable*.
- A job record carries `status` (`queued` → `running` → `completed` | `failed`), `step`, `stepIndex`, `percentage`, GA telemetry (`generation`, `maxGenerations`, `bestFitness`, `hardViolations`, `softPenalty`), `timetableId`, `error`, `params` and timestamps.
- `updateJob()` emits the merged record to the room `generation:<jobId>` as `generation:progress`, `generation:completed` or `generation:failed`.
- Jobs live in a plain `Map` **in one process**. They vanish on restart (nodemon included) and are invisible to any other worker; running the backend under cluster/PM2 `-i`/several containers would break both the jobId lookup and the one-run-at-a-time guarantee. Terminal jobs are swept 30 minutes after their last update.

Polling fallback: `GET /api/timetables/generate/:jobId/progress` returns the same record (404 when unknown). The frontend hook treats the socket as primary and polls as the safety net.

`POST /api/timetables/generate-local` (admin only) is still **synchronous 201** — scripts depend on that — but takes the same lock.

### Socket.io

- Handshake auth: `jwtHandshakeAuth` in `server.js` verifies `socket.handshake.auth.token` with `JWT_SECRET` (same contract as `middleware/auth.js`) and rejects a missing or invalid token outright. There is no anonymous connection.
- On connect every socket joins `role:<role>` and `user:<userId>`.
- `generation:subscribe` / `generation:unsubscribe` join and leave `generation:<jobId>`; **subscribe is admin-only server-side**, so a non-admin emitting it simply never joins and sees no progress.
- Events: `notification` (from `utils/notify.js`) and the three `generation:*` events above.

### Notifications and queries

**Notifications are scoped, not global.** `Notification` carries `audience` (`all` | `admin` | `faculty` | `student`) and an optional `recipientUserId`. `recipientUserId` is **EXCLUSIVE**: a notification addressed to one user is readable by that user and by nobody else, and `audience` is ignored for it. `routes/notificationsRoute.js#audienceFilter` builds mutually exclusive clauses (`recipientUserId === me`, OR no recipient at all with a matching audience), and the same filter scopes mark-as-read so an unreadable notification 404s instead of being flipped. `utils/notify.js#createAndEmit` is the only place a notification should be created: it saves and then emits to `user:<id>` alone, or to `role:<audience>` (all three role rooms for `all`). There is no per-user read state — `isRead` is a single shared flag, so only per-user notifications can be marked read without affecting somebody else.

`/api/queries` (`models/Query.js`): faculty and students raise `{subject, message}`; the author is taken from the token, never from the body. `GET /` returns every query to an admin and only their own to anyone else. `PUT /:id/reply` is admin-only and notifies the author alone.

### Data model conventions

- `Timetable.schedule[]` entries store `courseId`, `facultyId`, `roomId` as plain strings, not ObjectId refs. Nothing is populated; the frontend resolves names by matching IDs against separately fetched course/faculty/room lists. **Extra fields the generator attaches (`courseName`, `timeSlot`, ...) are silently stripped by the strict subdocument schema on save** — `ScheduleEntrySchema` allows exactly `courseId`, `facultyId`, `roomId`, `day`, `startTime`, `endTime`. Anything else must go in `metadata`, which is where `generationMethod`, `seed`, `generations`, `bestFitness`, `hardViolations`, `softPenalty`, `fitnessHistory`, `qualityScore`, `qualityBreakdown` and `jobId` live.
- Availability on `Faculty` and `Room` is keyed by lowercase day (`monday`..`sunday`) with `[{start, end}]` in `"HH:MM"`. Timetable entries use capitalised days (`"Monday"`). Code bridges the two with `day.toLowerCase()`.
- `User.facultyId` / `User.studentId` link users to `Faculty` / `Student` docs as strings. When the link is null, `authRoute.js#loadLinkedProfile` falls back to matching by email.
- Room type rules: `lab` courses need a `lab` room; `seminar` needs `seminar_room` or `auditorium`; `lecture` accepts `lecture_hall`, `seminar_room`, or `auditorium`.

### Timetable generation pipeline

`runGenerationPipeline` in `routes/timetableRoute.js` is shared by the async and the synchronous entry points:

1. Validate the body (`department`, `semester`, `year`, `academicYear`, optional `gaOptions`, optional `method`) and `loadSchedulingContext` — courses by department (case-insensitive, anchored) + semester + year + academicYear, faculty by department, all rooms, plus the config grid. Empty courses/faculty/rooms is a 404.
2. **AI, only when `method === "ai"` and `GOOGLE_API_KEY` is set.** `generateTimetableWithAI` (`utils/timetableGenerator.js`, `@google/genai`, model `gemini-3.6-flash`) builds a prompt from the grid and every entity, retries (3 attempts × up to 3 API retries with linear backoff) feeding the previous validation errors back in, parses the reply by stripping markdown fences and slicing from the first `[` to the last `]`, then validates and saves itself.
3. **Genetic algorithm** (`utils/geneticScheduler.js`) otherwise. It is reproducible: all randomness comes from `createRng(seed)` in `prng.js`, so the same seed and inputs give the same timetable. It yields the event loop every `progressEvery` generations and reports through `onProgress`, which the route maps onto job percentage 45 → 80 within the "Evolving schedule" step. Yielding changes when work happens, never the order of the draws.
4. **Local backtracking scheduler** (`utils/localScheduler.js`) as the fallback when the GA throws or its best chromosome still has hard violations, and as the direct path for `/generate-local`.
5. `validateSchedule` from `utils/scheduleValidator.js` gates every result regardless of producer, then `computeQualityScore` runs, the timetable is saved as `status: "draft"`, and a notification is created.

Other timetable endpoints: `PATCH /:id/conflicts/:index/resolve` (admin; recomputes the unresolved count and the quality score), `POST /:id/comments` (any authenticated role), `PATCH /:id/publish` (admin; archives the previous published timetable for the cohort), `GET /:id/export?format=csv|json`. `POST /:id/optimize` is commented out.

### Scheduling modules

The grid-aware helpers live in one place each — do not re-implement them:

- `utils/schedulingHelpers.js` — `getWeeklySessions`, `timeToMinutes`, `timeOverlaps`, `normalizeText`, `isWithinAvailability`, `specializationMatches`, `roomTypeMatches`, `roomCapacityMatches`, `courseGroupKey`, `isAvoidedSlot`, `isPreferredSlot`. The GA, the local scheduler and the validator all import from here.
- `utils/scheduleValidator.js` — `validateSchedule`, the independent checker. Hard rules land in `errors` (rejected), preferences in `warnings`. Keeping it out of the generators is what makes "the timetable is valid" mean anything. (`timetableGenerator.js` still exports an older `validateSchedule` used by its own AI path; the route imports the one from `scheduleValidator.js`.)
- `utils/qualityScore.js` — `computeQualityScore` (constraint compliance, room utilization, faculty balance, student convenience).

**Specialization matching is fuzzy text matching** of `faculty.specialization[]` against the course's name + code + description (normalised, word-level; multi-word specializations need at least two overlapping words). Seed data is tuned so this resolves; new courses or faculty with unrelated wording will make the local scheduler throw "No suitably specialized faculty". The generate route deliberately tolerates *specialization-only* validation errors on the local scheduler's output and logs a warning — no other error class is tolerated.

### Local scheduler algorithm

`generateLocalTimetable` is a backtracking constraint solver:

- For each course, enumerate every (faculty, day, slot, room) combination that passes specialization, faculty availability, room availability, room type, and room capacity. Only faculty with at least `requiredSessions` viable options are kept. Options are scored (+1000 specialization, +20/-30 preferred/avoided slot, -5 per hour already assigned to that faculty).
- Courses are ordered most-constrained-first (fewest options, then most sessions).
- DFS assigns sessions per course, tracking `facultySlotUsage`, `roomSlotUsage`, and `studentGroupSlotUsage` (student group = department|semester|year) as `Set`s of composite keys, preferring different days for the same course. Hard cap of 250,000 search nodes.
- One faculty teaches all sessions of a course.

### Scripts (`backend/scripts/`)

- `seedSystemConfig.js` (`npm run seed:config`) — upserts the active `SystemConfig` with an explicit `slots[]` equal to today's six teaching slots plus the lunch break. Run it once against an existing database, otherwise a config that later clears `slots[]` derives a different grid and saved timetables stop validating.
- `verifyConstraints.js` (`npm run verify`) — `--id <id>` or `--latest [--department ... --academicYear ...]`; loads the timetable, runs it through `validateSchedule` against the config-derived grid, prints a PASS/FAIL table grouped by rule, exits 1 on any FAIL.
- `gaSmoke.js` — `node scripts/gaSmoke.js [--department ... --semester ... --year ... --seed 42 --pop 60 --gens 300] [--no-labs]`; runs the GA against seeded data without HTTP and prints run stats plus a sha1 of the schedule, so two same-seed runs can be compared by eye. `--no-labs` rewrites lab rooms to lecture halls **in memory only** to exercise the "No suitable room" failure path.
- `smokeApi.js` (`npm run smoke`) — end-to-end API smoke suite over HTTP against an **already-running** backend (it starts no server; `BASE_URL` defaults to `http://localhost:5050`). Logs in as all three roles, asserts the status-code matrix, drives one asynchronous generation through the 202 + polling contract for each seeded cohort, publishes and exports, raises one query, then deletes everything it created and re-publishes any timetable the publish step archived. Exits 1 if any row failed.
- `importDataset.js` — mapping-driven CSV importer for courses/faculty/rooms/students, with `--dry-run`, per-type defaults (`--department`, `--academicYear`, `--year`, `--semester`), optional `--create-users`, and sample CSVs plus mappings in `scripts/samples/` and `scripts/import-mappings/`. Upsert keys: courses → `code`; faculty → email, else name+department; rooms → name+building; students → `registerNumber`.

## Frontend architecture

- **One API client.** `src/lib/api.js` exports a configured axios instance: `baseURL` from `VITE_API_URL`, a request interceptor attaching the stored JWT, and a response interceptor that clears storage and redirects to `/login` on 401. It is the only file importing `axios`; nothing else builds URLs.
- **One navigation source.** `src/lib/nav.js` holds `ADMIN_NAV`, `FACULTY_NAV`, `STUDENT_NAV`, `ADMIN_QUICK_ACTIONS` and `navForRole(role)`. `components/AppShell.jsx` renders the sidebar/topbar/theme toggle/chatbot FAB from it; every routed page except `Login` renders inside `AppShell`.
- **Routing.** `App.jsx` defines routes with a `ProtectedRoute` that reads `token` + `user` from `localStorage`, treats an expired JWT as logged out, redirects on role mismatch, and wraps authenticated routes in `SystemConfigProvider`. Admin: `/`, `/create-timetable`, `/generate-timetable`, `/view-timetable`, `/view-timetable/:id`, `/infrastructure`, `/courses`, `/faculty`, `/rooms`, `/students`, `/users`, `/notifications`. Faculty: `/faculty-portal/*`. Students: `/student-portal/*`. `/timetables`, `/admin-dashboard`, `/teacher-dashboard`, `/student-dashboard` are alias redirects.
- **Component library.**
  - `components/common/` — `SectionCard`, `StatCard`, `CategoryCard`, `Callout`, `EmptyState`, `FilterBar`, `Stepper`, `ProgressChecklist`, `ConfirmDialog`, `ChatbotFab`.
  - `components/timetable/` — `TimetableGrid`, `TimetableListView`, `TimetableLegend`, `TimetableCard`, `WeekStrip`, `QualityScore`, `ConflictsDialog`, `CommentsDialog`, `DataValidationPanel`, `AlgorithmCard`, `GenerationProgress`.
  - `components/charts/` — `ChartFrame`, `DepartmentPie`, `UtilizationBar`, `WeeklyActivityArea` (recharts).
  - `components/ui/` — the 22 shadcn/ui primitives ("new-york" style, generated as JSX): alert, alert-dialog, badge, button, card, checkbox, dialog, dropdown-menu, input, label, progress, scroll-area, select, separator, sheet, skeleton, sonner, switch, table, tabs, textarea, tooltip.
  - `components/` (the directory itself) — `AppShell.jsx` plus `Data-table.jsx`, `CourseForm.jsx`, `Faculty-Form.jsx`, `StatusBadge.jsx`, `GARunSummary.jsx`, `Chatbot.jsx`.
- **Hooks.**
  - `useIdentity` — the single answer to "who is logged in": cached user for first paint, then `GET /api/auth/me`, plus a faculty-only email fallback when `facultyId` is still null.
  - `useSystemConfig` / `SystemConfigProvider` — fetches `GET /api/config/grid` once and exposes `grid` (normalised through `lib/schedule.js#buildGrid`, with precomputed `rows`) and the raw `config`. **Pages must render from this grid, never from a local copy of days/slots.**
  - `useTimetableData` — fetches timetables (scoped by filters) plus courses/faculty/rooms and derives the `_id` → doc `Map`s that `lib/schedule.js#resolveEntry` expects.
  - `useSocket` — one shared Socket.io connection for the whole app; origin derived from the axios base URL, JWT taken from `localStorage`, rebuilt when the token changes, torn down by `disconnectSocket()` on logout.
  - `useGenerationProgress` — drives one async generation job: subscribes to `generation:<jobId>`, polls `GET /api/timetables/generate/:jobId/progress` as the fallback, and refetches once on a terminal status so a dropped last event cannot strand the UI.
- **Other libs.** `lib/schedule.js` (pure grid/schedule helpers, no React), `lib/status.js` (status → badge variant), `lib/theme.js` (light/dark with `localStorage`), `lib/utils.js` (`cn`).
- `Chatbot.jsx` posts to `/api/ai/chat` (Gemini `gemini-2.5-flash`) with page context and renders the reply with `react-markdown`.
- `@/` resolves to `src/` (see `vite.config.js` and `jsconfig.json`). Vite is pinned to `rolldown-vite` via package overrides.

## Known rough edges

- The job registry is in-process only (see above) — one backend worker, always.
- `POST /:id/optimize` in `timetableRoute.js` is commented out.
- `backend/.env.example`, `frontend/.env.example` and the connection-error message in `pages/Login.jsx` still name port 5000.
- The faculty and student portal dashboards (`FacultyPortal.jsx`, `StudentPortal.jsx`) and `Dashboard.jsx`, `GenerateTimetable.jsx`, `Infrastructure.jsx` are still 1000+ line single files, even though they now use `AppShell` and the shared components.
