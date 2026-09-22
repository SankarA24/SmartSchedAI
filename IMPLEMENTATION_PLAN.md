# SmartSchedAI — Phased Plan for Final Review Readiness

## Context

The client's mail asks for the app to be made "fully functional" for a college project review, without a rewrite. Exploration of the repo (branch `smart-scheduling-improvements`, clean, 2 commits ahead of `main`) shows the mail was written against a project shape that differs from this codebase. Per the user's decisions:

- **Map the mail onto this repo's names**: Faculty ≈ Teacher, Room ≈ Classroom, keep `/faculty-portal` & `/student-portal` and add alias redirects `/admin-dashboard`, `/teacher-dashboard`, `/student-dashboard`.
- **No CSV dataset exists on disk** → build a generic, mapping-driven CSV importer with sample CSVs.
- **Add minimal Socket.io** for live notifications.
- **Implement the genetic algorithm** (frontend GA panel + `prng.js` already exist; backend GA does not).

### Root cause of "always Computer Science / Year 1 / Semester 1" (verified)

| # | Layer | Fact | File |
|---|---|---|---|
| a | Form | Defaults hardcode `department:"Computer Science", semester:"1"`; no `year` field | `frontend/src/pages/Timetable.jsx:336-343` |
| b | API | `/generate` reads only `{department, semester, academicYear}`; course filter uses dept+semester, **ignores academicYear**; AI path same | `backend/routes/timetableRoute.js:240-244, 324-336`; `backend/utils/timetableGenerator.js:1360-1377` |
| c | Data | **All** seeded courses/faculty are CS / semester 1 / year 2026 → any other selection has zero courses | `backend/seedRealisticData.js` |
| d | Schema | `Timetable` has no `academicYear`; `year` conflates study-year and academic-year; no `generationMethod`/stats (strict schema drops them) | `backend/models/Timetable.js` |
| e | View | Student portal falls back to `"Computer Science"/"1"/currentYear` and to "any non-empty timetable" | `frontend/src/pages/StudentPortal.jsx:288-360`, `MyTimetable.jsx`, `MyProfile.jsx` |

### Other verified gaps
- **No auth middleware** anywhere; **no `/register` endpoint** (so no public admin creation to remove — but no user-creation path either). Role enforcement is client-side only (`App.jsx` `ProtectedRoute`).
- Test user `faculty@smartscheduler.com` matches no `Faculty` doc; `FacultyTimetable.jsx:137` uses only `user.facultyId` (null) → empty timetable. Student user has no department/semester.
- `dotenv.config()` runs after route imports in `server.js` → `aiRoute.js` never sees `GOOGLE_API_KEY`.
- `FacultyNotifications.jsx` calls `PATCH /api/notifications/:id`; backend only has `PUT /:id/read`.
- `scheduleValidator.js` does not check room capacity (only `localScheduler.js` does).
- No user mgmt, student mgmt, publish route, export route, queries, analytics, Socket.io, GA backend.

## Status classification

| Item | Status |
|---|---|
| Admin CRUD (courses/faculty/rooms/notifications), login, 3 portals, AI→local fallback pipeline, `scheduleValidator`, `schedulingHelpers`, `schedulingConstants`, `AppShell`, `StatusBadge`, `DataTable` | **EXISTING-OK** (reuse) |
| GA: `prng.js`, GA form panel + `gaOptions` payload, `GARunSummary.jsx` | **IN-PROGRESS** (backend missing) |
| `Student` model, `facultyPortalRoute.js`/`studentPortalRoute.js` (empty) | **IN-PROGRESS** (unused scaffolds) |
| Auth middleware, `/api/users`, `/api/students`, publish/export routes, GA engine, importer, Socket.io, Users/Students pages, `lib/api.js`, alias routes, notification audience | **NEW** |
| `Timetable`/`Course`/`Notification` schemas, `timetableRoute.js`, `Timetable.jsx`, all portal pages, seeds, `server.js`, `App.jsx` | **MODIFY** |
| `WeatherCheck.jsx`, `@google/generative-ai` dep, duplicated constants in `timetableRoute.js` | **REMOVE** |

---

## Phase 0 — Baseline fixes (no behaviour change)
- `backend/server.js`: `import "dotenv/config"` as first import.
- `backend/routes/timetableRoute.js`: replace local `DAYS/TIME_SLOTS/WEEKS/getWeeklySessions` with imports from `utils/schedulingConstants.js` + `utils/schedulingHelpers.js` (`slotLabel` for string slots).
- Remove `frontend/src/components/WeatherCheck.jsx`; drop `@google/generative-ai` from `backend/package.json`.
- Add `backend/.env.example`, `frontend/.env.example` (`VITE_API_URL`).
- Verify: both servers start, 3 logins work, CS/1 generation still works.

## Phase 1 — Backend auth enforcement + shared frontend API client (must ship together)
**Backend**
- NEW `backend/middleware/auth.js`: `requireAuth` (Bearer → `jwt.verify` → `req.user`, else 401), `requireRole(...roles)` (403).
- MODIFY `routes/authRoute.js`: JWT + `user` response extended with `name, email, department, semester, year, academicYear, section` (loaded from linked `Faculty`/`Student` doc). NEW `GET /api/auth/me`. No `/register`.
- Apply guards in each router: GET open to any authenticated role; POST/PUT/DELETE admin-only for courses/faculty/rooms/timetables/notifications; `PUT /api/faculty/:id` also allowed for the faculty's own id (availability/preferences only); `PUT /notifications/:id/read` any role; `/api/ai` any authenticated.
- `cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" })`.

**Frontend**
- NEW `frontend/src/lib/api.js`: `axios.create` with `VITE_API_URL` fallback `http://localhost:5000/api`; request interceptor adds Bearer; 401 response → clear storage → `/login`. Export `getStoredUser()`.
- MODIFY every file containing `http://localhost:5000` (Dashboard, Courses, Faculty, Rooms, Notifications, Timetable, Login, Chatbot, 5 Faculty* pages, 5 student pages) to use `api`. Acceptance: `grep localhost:5000 frontend/src` returns only `lib/api.js`.
- Test: no-token `GET /api/courses` → 401; student `POST /api/courses` → 403; admin CRUD unchanged; existing 3 accounts still log in.

## Phase 2 — Routing hardening + alias routes
- `App.jsx`: `ProtectedRoute` also checks JWT `exp` (decode payload, no lib); add `/admin-dashboard → /`, `/teacher-dashboard → /faculty-portal`, `/student-dashboard → /student-portal`; `/login` when logged in → role home; `*` → role home or `/login`.
- Test: student typing `/faculty-portal` or `/` is bounced; aliases land correctly; expired token → login.

## Phase 3 — Timetable model + end-to-end academicYear/year flow (CRITICAL bug)
- MODIFY `backend/models/Timetable.js`: add `year` (study year 1–4, existing field re-purposed), `academicYear: Number`, `publishedAt`, `metadata.{generationMethod, seed, generations, populationSize, bestFitness, hardViolations, softPenalty, fitnessHistory[{generation,best,average}]}`; index on `{department, semester, year, academicYear, status}`. Read paths use `academicYear ?? year` for old docs.
- MODIFY `backend/models/course.js`: `year` = study year (remove `default: new Date().getFullYear()`), add `academicYear: Number`.
- NEW `backend/utils/schedulingContext.js`: `loadSchedulingContext({department, semester, year, academicYear})` → case-insensitive dept regex + exact semester/year/academicYear for courses, dept regex for faculty, all rooms; returns counts. Used by `/generate`, `/generate-local`, and passed into `generateTimetableWithAI` (which stops re-querying and filtering).
- MODIFY `routes/timetableRoute.js`:
  - `POST /generate` body `{department, semester, year, academicYear, gaOptions?, method?}`; 400 if any missing; **404 with explicit message when zero courses match** (no silent fallback to CS).
  - Pipeline: `method==="ai"` && key → AI; else GA (Phase 4) → local backtracking fallback; every result through `validateSchedule`.
  - Save `name: "${department} - Year ${year} Sem ${semester} (${academicYear})"`, `year`, `academicYear`, metadata stats. Respond `{...doc, generationMethod, stats}`.
  - `GET /` accepts `?department&semester&year&academicYear&status`; server-side role scoping: student → own group + `published`; faculty → `schedule.facultyId` `$elemMatch` own id, published only; admin → all.
  - NEW `PATCH /:id/publish` (archive other published for same group, set `publishedAt`, notify). NEW `GET /:id/export?format=csv|json`.
- MODIFY `utils/scheduleValidator.js`: add room-capacity check via `roomCapacityMatches` from `schedulingHelpers.js`.
- MODIFY `frontend/src/pages/Timetable.jsx`: empty form defaults; Department/AcademicYear selects derived from distinct course values, Year select 1–4; payload adds `year`; list shows `Year · AY`; filter bar; Publish → `PATCH /:id/publish`; Export CSV → export route (keep JSON/print).
- Test matrix: CS/Y1/S1/2026 works; Electronics/Y2/S2/2027 before seed → 404, **no timetable created**; after Phase 6 seed → Electronics-only schedule; old timetables still render.

## Phase 4 — Genetic algorithm (finish the IN-PROGRESS scaffold)
- NEW `backend/utils/geneticScheduler.js`: `generateGeneticTimetable({courses, faculty, rooms, options})` → `{schedule, stats}`.
  - Options: `seed, populationSize=60, maxGenerations=300, mutationRate=0.15, elitism=2, tournamentK=3, timeLimitMs=20000` (cap pop ≤200, gens ≤1000).
  - Precompute per course: sessions (`getWeeklySessions`), eligible faculty (`specializationMatches`), eligible rooms (`roomTypeMatches && roomCapacityMatches`); throw the same messages as local scheduler if empty (route falls back).
  - Chromosome: faculty gene per course + `{dayIdx, slotIdx, roomIdx}` per session → one faculty per course by construction.
  - RNG: only `createRng(seed ?? Date.now() % 2^31)` from `prng.js`; no `Math.random`.
  - Fitness: fast internal hard-violation counter (faculty/room/student-group slot sets, availability, break) + soft (`isAvoidedSlot` +3, `isPreferredSlot` −1, same-day repeat +1, load spread); `fitness = 1/(1+10*hard+soft)`. Final best gated by `validateSchedule`.
  - Tournament selection, per-course block crossover, mutation (re-sample day/slot/room, 20% re-sample faculty), elitism, early stop when hard=0 and soft stable 30 gens or time limit. Record `fitnessHistory` per generation.
- MODIFY `timetableRoute.js`: GA → local fallback if GA still has hard>0; `generationMethod: "genetic-algorithm"` (matches `GARunSummary` label) or `"local-fallback"`.
- `GARunSummary.jsx` and `Timetable.jsx` gaOptions: EXISTING-OK.
- NEW optional `backend/scripts/gaSmoke.js` (run GA on seeded data without HTTP).
- Test: seed 42 twice → deep-equal schedules; pop/gens reflected in stats; delete lab rooms → GA and fallback fail with clear 500; avoid-slots produce softPenalty>0.

## Phase 5 — Admin user & student management
- NEW `backend/routes/usersRoute.js` (`/api/users`, admin): `GET /`, `POST /` `{name,email,password,role,facultyId?,studentId?,createProfile?}` (bcrypt; auto-link by email to Faculty/Student; may create profile doc), `PUT /:id` (incl. `resetPassword`), `DELETE /:id` (not self, not last admin). Admin accounts only creatable here.
- NEW `backend/routes/studentsRoute.js` (`/api/students`): admin CRUD, `GET /me` + `PUT /me` for students. Uses existing `models/Student.js`.
- MODIFY `backend/createTestUsers.js` (stay non-destructive, never touch passwords): upsert Faculty doc for `faculty@smartscheduler.com` (Dr John, CS) and Student doc (CS, sem 1, year 1, AY 2026) and link `facultyId`/`studentId`.
- NEW `frontend/src/pages/Users.jsx` (`/users`) and `Students.jsx` (`/students`) using `Data-table.jsx` + shadcn forms; add nav entries in `AppShell.jsx` / `ADMIN_NAV`; `Dashboard.jsx` adds users/students/published counts.
- Test: admin creates faculty user → login → `facultyId` set → own timetable shows; student login carries dept/sem/year.

## Phase 6 — Seed data + generic CSV importer
- MODIFY `backend/seedRealisticData.js`: upsert CS docs to `year:1, academicYear:2026`; add second cohort **Electronics / semester 2 / year 2 / AY 2027** (~6 courses incl. 2 labs, 5 faculty with matching specializations, 2 rooms incl. 1 lab). Keep upsert-by-key semantics.
- NEW `backend/utils/csv.js` (hand-rolled RFC-4180 parser: quotes, CRLF, BOM — no new dep) and `backend/utils/importNormalizers.js` (room type synonyms → enum; equipment split/lowercase/synonyms; expertise → `specialization[]`; availability parse or default Mon–Fri 09:00–17:30; course type `lab|practical→lab`; numeric coercion; student `section` default "A").
- NEW `backend/scripts/importDataset.js`: `--type courses|faculty|rooms|students --file x.csv [--map mapping.json] [--dry-run] [--department] [--academicYear] [--create-users]`; header synonyms built in; upsert keys `code` / `email` / `name+building` / `registerNumber`; `--dry-run` validates via `Model.validate()` and prints per-row action; summary counts.
- NEW `backend/scripts/import-mappings/*.json` and `backend/scripts/samples/{courses,faculty,rooms,students}.csv` (Electronics cohort so importer alone yields a runnable dataset).
- Test: dry-run each sample → 0 errors; run → counts; re-run → all "update", no dupes; Electronics/Y2/S2/2027 generation succeeds.

## Phase 7 — Notification scoping + minimal Socket.io
- MODIFY `models/Notification.js`: `audience` enum `all|admin|faculty|student` (default all), `recipientUserId`, `relatedTimetableId`.
- MODIFY `routes/notificationsRoute.js`: GET filtered by audience/role/recipient; add `PATCH /:id` alias of `PUT /:id/read` (fixes FacultyNotifications mismatch).
- Add `socket.io` (backend) / `socket.io-client` (frontend). `server.js`: `http.createServer(app)`, `io` with JWT in `io.use`, rooms `role:<role>` and `user:<id>`, `app.set("io", io)`.
- NEW `backend/utils/notify.js`: `createAndEmit(app, {...})` used by generate/publish and admin POST.
- NEW `frontend/src/hooks/useSocket.js`, `useNotifications.js`; wire into admin Notifications, FacultyNotifications, StudentNotifications, portal bell badges.
- Test: admin publishes → faculty/student tabs update without reload; student doesn't see faculty-only items.

## Phase 8 — Faculty & student portals scoped to own data
- Faculty pages (`FacultyPortal`, `FacultyTimetable`, `FacultyCourses`, `FacultyProfile`, `FacultyNotifications`): identity via `GET /api/auth/me` (keep email fallback); timetable from server-scoped `GET /api/timetables` (published); courses = distinct courseIds from own entries; **analytics card** (hours/week vs `maxHoursPerWeek`, sessions/day, rooms used); profile saves availability/preferences via `PUT /api/faculty/:id`. **Queries**: NEW small `Query` model + `POST/GET /api/queries` (faculty/student create, admin list/reply in Notifications page).
- Student pages (`StudentPortal`, `MyTimetable`, `MyCourses`, `MyProfile`, `StudentNotifications`): remove `"Computer Science"/"1"/currentYear` and "any timetable" fallbacks; use JWT dept/sem/year/academicYear; unlinked → "Profile not linked — contact admin"; **analytics card** (classes/week, hours, courses); `MyProfile` persists via `PUT /api/students/me`.
- Test: Dr John sees only own entries; CS student sees CS only after publish; Electronics student sees Electronics; unlinked student sees message.

## Phase 9 — Constraint verification + test automation
- NEW `backend/scripts/verifyConstraints.js`: loads timetable (id or latest), runs `validateSchedule`, prints PASS/FAIL per rule: teacher conflict, room conflict, student-group conflict, capacity, faculty availability, room availability, workload, lab-room rule, break slot, working days, session duration, session count.
- NEW `backend/scripts/smokeApi.js`: logs in 3 roles, asserts status codes across the matrix (401/403/200), generates two cohorts, asserts records differ. `npm run verify`, `npm run smoke`.
- Manual UI matrix (documented): 3 roles × (login landing, URL-hop attempts, alias routes, own-data visibility); generate CS/Y1/S1 and Electronics/Y2/S2; reproduce seed; publish → live notification; export CSV.

## Phase 10 — Deliverable
- NEW `DELIVERABLE.md`: run commands & seed order; roles/security (middleware table, JWT payload, guards, aliases); test accounts (unchanged: `admin|faculty|student@smartscheduler.com` / `123456`); schema changes; root cause a–e and fix per layer; GA design & constraints table; importer usage; Socket.io; test matrix results; files changed with per-file summary; known limitations (AI path optional without key, CLI-only import, single section per cohort).
- Update `CLAUDE.md` for new modules/routes.

## Ordering & commits
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 (6 and 7 are independent). One commit per phase on `smart-scheduling-improvements`; run both dev servers and the phase's tests before each commit.

## Regressions to watch
- Phase 1: any leftover raw `fetch`/axios without token → 401 bounce loop.
- Phase 3: strict `Timetable` schema drops unknown fields — new stats must live in `metadata`; `Course.year` meaning changes → run seed upsert before generating; old docs lack `academicYear`.
- Phase 4: validator-in-loop cost — use internal counter, cap pop/gens/time.
- Phase 5: `User.email` unique — same-email Faculty/Student must link, not fail.
- Phase 7: `app.listen` → `httpServer.listen`; nodemon restarts drop sockets (client reconnects).
- Phase 8: faculty previously saw drafts; now published only — note in deliverable.

## Verification (end-to-end)
1. `docker start smartschedai-mongo`; `cd backend && npm run dev`; `cd frontend && npm run dev`.
2. `node createTestUsers.js && node seedRealisticData.js` (or importer on samples).
3. `npm run smoke` (backend) → all assertions pass; `npm run verify` on both generated timetables → all PASS.
4. Browser: login each role → correct landing; URL-hop attempts bounced; admin generates CS/Y1/S1/2026 and Electronics/Y2/S2/2027 → records differ in dept/year/sem/AY and course IDs; reproduce with seed → identical; publish → faculty/student portals show only their own, live notification arrives; export CSV downloads.
5. `npm run lint` (frontend) and `npm run build` pass.

