# SmartSchedAI — Audit Findings

Recorded 2026-09-23. Full read of `main` (commit `f816e6b`) and
`smart-scheduling-improvements` (commit `8fab1fd`), cross-checked file by file.

`main` is the version the GitHub repo still serves. The improvements branch is
11 commits ahead and has never been merged, so **every issue below is still live
for anyone cloning `main`**, even where the branch has already fixed it.

Status column:

- **Fixed on branch** — resolved in `smart-scheduling-improvements`, still broken on `main`.
- **Open** — not fixed anywhere yet. These are real work.

---

## 1. Blocking defects

| # | Issue | Where | Status |
|---|---|---|---|
| 1 | **No auth middleware.** Login signs a 7-day JWT but no route verifies it. Every `/api/*` endpoint including DELETE is open to anyone. The `ProtectedRoute` guard only checks that a non-empty string sits in `localStorage`, so editing `localStorage.user` to `{"role":"admin"}` grants the full admin UI. | `backend/routes/*`, `frontend/src/App.jsx:44-72` | Fixed on branch (`backend/middleware/auth.js`, guards on every router) |
| 2 | **Faculty portal unreachable on a fresh install.** `createTestUsers.js` creates the faculty login as `faculty@smartscheduler.com`; `seedRealisticData.js` creates Faculty records with `@college.edu` addresses. Nothing links them, so the portal renders "Faculty Profile Not Found" and its only button logs you out. | `backend/createTestUsers.js`, `backend/seedRealisticData.js` | Fixed on branch (seed now upserts a Faculty doc and sets `User.facultyId`) |
| 3 | **Admin dashboard CTAs log the admin out.** Three "Generate Timetable" links point at `/timetables/generate`, which is not a route, so they fall through the catch-all to `/login`. | `frontend/src/pages/Dashboard.jsx:316,388,477` | Fixed on branch |
| 4 | **Faculty mark-as-read is a no-op.** Calls `PATCH /api/notifications/:id`; the backend only defines `PUT /api/notifications/:id/read`. Request 404s, and the optimistic state update sits after the `await`, so nothing happens and no error surfaces. | `frontend/src/pages/FacultyNotifications.jsx:90` | Fixed on branch (now uses `PUT .../read`) |

## 2. Scheduling correctness

| # | Issue | Where | Status |
|---|---|---|---|
| 5 | **Students can be scheduled into two classes at once.** The validator's overlap check compares `courseId` against itself, so two *different* courses in the same department and semester can occupy the same slot and still validate. The AI path returns immediately on success, so nothing else catches it. | `backend/utils/timetableGenerator.js:736-777` | Fixed on branch (`scheduleValidator.js:327` adds a student-group conflict check) |
| 6 | **Room capacity is never enforced.** The check reads `course.studentCount ?? course.enrollment ?? course.strength ?? course.capacity ?? 1`. None of those fields exist on the Course model, so required capacity is always 1 and every room passes. | `backend/utils/localScheduler.js:375` | Fixed on branch (`roomCapacityMatches` wired into `scheduleValidator.js:521`) |
| 7 | **Saved timetables lose their labels.** The generator attaches `courseName`, `facultyName`, `roomName` and `timeSlot`, but `ScheduleEntrySchema` declares only six fields and is not `strict: false`, so Mongoose strips them on save. Portal pages then render blanks or raw ObjectIds. | `backend/models/Timetable.js:3-17` | Fixed at source on branch. **Six frontend pages still read the stripped fields** in dead fallback chains: Dashboard, FacultyTimetable, MyCourses, MyTimetable, Rooms, StudentPortal |
| 8 | **Gemini model name is inconsistent and unverified.** The generator requests `gemini-3.6-flash`; the chatbot requests `gemini-2.5-flash`. If the first is invalid, each generate call burns up to 9 API calls and ~27s of backoff before falling back. Run `node checkModels.js` to confirm. Mitigated on the branch because AI is now opt-in and the default path is the genetic algorithm. | `backend/utils/timetableGenerator.js:1538`, `backend/routes/aiRoute.js:23` | **Open** |
| 9 | **The two specialization matchers disagree and the mismatch is papered over.** The local scheduler accepts a one-word match and strips a 15-word stoplist; the validator requires two matching words and has no stoplist. The generate route filters `"is not suitably specialized"` out of the validator's errors and logs a warning rather than reconciling them. | `backend/routes/timetableRoute.js:847-860` | **Open** |

## 3. Data model and API

| # | Issue | Where | Status |
|---|---|---|---|
| 10 | **Notifications are global.** The model has no recipient or role field and the route does an unfiltered `find()`. Admin, faculty and students all read the same list, and one person marking something read changes it for everyone. | `backend/models/Notification.js` | **Open** — this is Phase 7 of the implementation plan |
| 11 | **Two empty route files.** `facultyPortalRoute.js` and `studentPortalRoute.js` are 0 bytes and unmounted. The portals compensate by fetching the full global collections and filtering in the browser. | `backend/routes/` | **Open** — still 0 bytes on the branch |
| 12 | **Timetable entries store IDs as plain strings, not ObjectId refs.** Nothing is populated; the frontend resolves names by matching IDs against separately fetched lists. Deleting a course does not cascade. | `backend/models/Timetable.js` | Open by design, worth revisiting |

## 4. Frontend and hygiene

| # | Issue | Where | Status |
|---|---|---|---|
| 13 | **`http://localhost:5000` hardcoded in 39 places across 18 files**, with no environment variable anywhere. Nothing works outside localhost. | `frontend/src/` | Fixed on branch (`frontend/src/lib/api.js` is now the only occurrence) |
| 14 | **`WeatherCheck.jsx` is backend code in the frontend tree.** Imports `node-cron` and `dotenv` (neither is a frontend dependency), reads `process.env` (undefined under Vite), and calls `new Notification(...).save()` against the browser DOM global. Orphaned, and would break `vite build` on first import. | `frontend/src/components/WeatherCheck.jsx` | Fixed on branch (deleted) |
| 15 | **Three incompatible styling systems.** Admin pages use Tailwind plus shadcn; faculty pages use hand-rolled Tailwind; student pages and Login are 100% inline style objects with zero `className`. | `frontend/src/pages/` | **Open** — this is UI phase U9 |
| 16 | **Heavy copy-paste.** `MyCourses.jsx`, `StudentNotifications.jsx` and `MyProfile.jsx` share lines 1-94 verbatim. The faculty nav array is byte-identical in five files. `handleLogout` appears 11 times. Four different timetable renderers exist for the same data. | `frontend/src/pages/` | **Open** — UI phases U3 and U9 |
| 17 | **Accessibility is effectively absent.** Across ~12,250 lines, `aria-*`, `alt=`, `htmlFor` and `role=` appear once in total. No form label is programmatically associated with its input. Timetables are grids of `<div>`s rather than tables. | `frontend/src/` | **Open** |
| 18 | **No tests and no test tooling anywhere.** No runner, no assertion library, no CI config. `backend` test script still exits 1. | repo-wide | **Open** — Phase 9 |

## 5. Hardcoded values that should be configuration

Working days (Mon-Fri only, despite the models supporting Sat/Sun), the six time
slots, the 13-week term length, the lunch break, GA tuning weights, the 250,000
node search cap, and a 15-word English computer-science stoplist used for
specialization matching. Several of these are duplicated across two or three
files in two different encodings.

UI phase U1 addresses this with a `SystemConfig` document and a
`getScheduleGrid()` derivation. **Open.**

---

## What remains to be built

`IMPLEMENTATION_PLAN.md` phases 0-6 are complete and committed. Phases 7-10 are
untouched: notification scoping and Socket.io, portal data scoping plus the
query model, the constraint verifier and API smoke scripts, and the deliverable
document.

`UI_REPLICATION_PLAN.md` phases U0-U10 are entirely unstarted. I checked twelve
expected artifacts and all twelve are missing.

Recommended order, from the UI plan itself:

```
U0 || U1  ->  U2  ->  U3  ->  U4 (+ Phase 7 notifications)  ->  Phase 8
          ->  U5  ->  U6  ->  U7  ->  U8  ->  U9  ->  U10 (+ Phases 9, 10)
```

Phase 8 must land before U9, otherwise the same ten portal files get rewritten
twice. U4 supersedes the Socket.io server task inside Phase 7, so those two
should not both be built.

Independent of all the above: verify the Gemini model name (#8), reconcile the
specialization matchers (#9), delete the two empty route files (#11), remove the
dead field-fallback branches (#7), and give the student notifications page a
working mark-as-read (it currently has none and filters on fields the model
never defines).

Finally, merge this branch into `main`.

---

## Local setup notes (macOS)

**Port 5000 is not usable on macOS.** It is held by ControlCenter (the AirPlay
Receiver). The Express server appears to start but every request is answered by
`Server: AirTunes` with `HTTP 403`. Either turn AirPlay Receiver off in System
Settings, or set a different `PORT` in `backend/.env` and point
`VITE_API_URL` in `frontend/.env` at it.

**Vite picks its port dynamically.** If 5173 is taken it walks upward. The
backend's `CLIENT_ORIGIN` is a single exact origin, so whatever port Vite lands
on has to be written back into `backend/.env` or the browser gets a CORS
failure. Worth allowing a list of origins in dev.

Working local configuration as of 2026-09-23: MongoDB in Docker
(`smartschedai-mongo`, `mongo:7`), backend on 5050, frontend on 5176.
