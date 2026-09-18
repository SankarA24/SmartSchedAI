# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Smart Classroom & AI Timetable Scheduler: a MERN app for higher-ed timetable management with three role-based portals (admin, faculty, student). The core feature is timetable generation, which tries Google Gemini first and falls back to a deterministic constraint-solving scheduler.

The repo is two independent npm projects with no root `package.json`: `backend/` (Express 5 + Mongoose 8, ESM) and `frontend/` (React 19 + Vite + Tailwind v4 + shadcn/ui, plain JSX). There are no tests anywhere.

## Commands

Both projects must be started separately. The frontend hardcodes `http://localhost:5000` as the API base in every page, so the backend must run on port 5000.

```bash
# Backend (from backend/)
npm install
npm run dev                  # nodemon server.js on $PORT (default 5000)
node createTestUsers.js      # creates admin/faculty/student users, password "123456"
node seedRealisticData.js    # upserts 10 courses, 8 faculty, 6 rooms (Computer Science, semester 1, year 2026)
node checkModels.js          # lists Gemini models available to your GOOGLE_API_KEY

# Frontend (from frontend/)
npm install
npm run dev                  # Vite on http://localhost:5173
npm run build
npm run lint                 # eslint flat config (react-hooks, react-refresh)
npm run preview
```

Backend needs a `backend/.env` (gitignored):

```
PORT=5000
MONGO_URI=mongodb://localhost:27017/smartschedai
JWT_SECRET=<any long random string>
GOOGLE_API_KEY=<optional; without it generation always uses the local fallback and /api/ai/chat fails>
```

If no local MongoDB is installed: `docker run -d --name smartschedai-mongo -p 27017:27017 mongo:7`.

Test logins after `createTestUsers.js`: `admin@smartscheduler.com`, `faculty@smartscheduler.com`, `student@smartscheduler.com`, all with password `123456`. The login form also requires picking the matching role; a mismatch returns 403.

## Backend architecture

`server.js` mounts seven routers under `/api/*`: courses, faculty, rooms, timetables, ai, notifications, auth. `routes/facultyPortalRoute.js` and `routes/studentPortalRoute.js` are empty files and are not mounted; the portals get their data by fetching the generic collections and filtering client-side.

**There is no auth middleware.** Login issues a 7-day JWT containing `{userId, role, facultyId, studentId}`, and some frontend pages send it as a Bearer header, but no route verifies it. Every endpoint is open. Role enforcement exists only in the frontend router.

**Notifications are global.** The `Notification` model has no recipient or role field; every portal reads the same list.

### Data model conventions

- `Timetable.schedule[]` entries store `courseId`, `facultyId`, `roomId` as plain strings, not ObjectId refs. Nothing is populated; the frontend resolves names by matching IDs against separately fetched course/faculty/room lists. Extra fields the generator attaches (`courseName`, `timeSlot`, ...) are stripped by the strict subdocument schema on save.
- Availability on `Faculty` and `Room` is keyed by lowercase day (`monday`..`sunday`) with `[{start, end}]` in `"HH:MM"`. Timetable entries use capitalised days (`"Monday"`). Code bridges the two with `day.toLowerCase()`.
- `User.facultyId` / `User.studentId` link users to `Faculty` / `Student` docs as strings. The users created by `createTestUsers.js` leave these null, so `FacultyPortal.jsx` falls back to matching the faculty record by email.
- Room type rules: `lab` courses need a `lab` room; `seminar` needs `seminar_room` or `auditorium`; `lecture` accepts `lecture_hall`, `seminar_room`, or `auditorium`.

### Timetable generation pipeline

`POST /api/timetables/generate` (the endpoint the admin UI calls) runs AI-first with local fallback:

1. `generateTimetableWithAI` in `utils/timetableGenerator.js` filters courses by department + semester and faculty by department (case-insensitive), builds a large prompt containing every entity's ID and constraints, and calls Gemini (`@google/genai`, model `gemini-3.6-flash`). Up to 3 generation attempts, each with up to 3 API retries with linear backoff. Each attempt feeds the previous attempt's validation errors back into the prompt. The response is parsed by stripping markdown fences and slicing from the first `[` to the last `]`.
2. `validateSchedule` (same file, exported) runs ~15 hard checks: valid IDs, days, exact slot match, faculty and room availability, pairwise faculty/room/course overlap, exact session count per course, one faculty per course, specialization match, room type, faculty max weekly hours, and avoided time slots. Any error fails the attempt.
3. If AI throws for any reason (including "AI client is not initialized" when `GOOGLE_API_KEY` is unset), the route calls `generateLocalTimetable` in `utils/localScheduler.js`, re-validates, saves as `status: "draft"`, and responds with `generationMethod: "local-fallback"`.
4. Both paths create a `Notification` on success or failure.

`POST /api/timetables/generate-local` bypasses AI entirely. Note it queries `Course.find({department, semester, year})` with exact case, unlike the main route's case-insensitive filter.

### Local scheduler algorithm

`generateLocalTimetable` is a backtracking constraint solver:

- For each course, enumerate every (faculty, day, slot, room) combination that passes specialization, faculty availability, room availability, room type, and room capacity. Only faculty with at least `requiredSessions` viable options are kept. Options are scored (+1000 specialization, +20/-30 preferred/avoided slot, -5 per hour already assigned to that faculty).
- Courses are ordered most-constrained-first (fewest options, then most sessions).
- DFS assigns sessions per course, tracking `facultySlotUsage`, `roomSlotUsage`, and `studentGroupSlotUsage` (student group = department|semester|year) as `Set`s of composite keys, preferring different days for the same course. Hard cap of 250,000 search nodes.
- One faculty teaches all sessions of a course.

### Duplicated logic that must stay in sync

These are copied, not shared. When changing one, change the others:

- `DAYS`, `TIME_SLOTS`, `WEEKS`, `getWeeklySessions` exist in `utils/timetableGenerator.js`, `routes/timetableRoute.js`, and `frontend/src/pages/Timetable.jsx` (the frontend copy adds the `12:15-13:15` break slot for display only).
- `specializationMatches`, `normalizeText`, `timeToMinutes`, `isWithinAvailability`, `roomTypeMatches` exist in both `utils/timetableGenerator.js` and `utils/localScheduler.js`. The two `specializationMatches` implementations have already drifted: the generate route explicitly tolerates specialization-only validation errors from the local scheduler's output and logs a warning when they occur. Faculty preference slots are also compared differently (local scheduler matches the bare `"HH:MM-HH:MM"` string; the validator matches `"Day HH:MM-HH:MM"`).

Specialization matching is fuzzy text matching of `faculty.specialization[]` against the course's name + code + description (normalised, word-level; multi-word specializations need at least two overlapping words). Seed data is tuned so this resolves; new courses or faculty with unrelated wording will make the local scheduler throw "No suitably specialized faculty".

## Frontend architecture

- `App.jsx` defines all routes with a `ProtectedRoute` that reads `token` and `user` (JSON) from `localStorage` and redirects to the role's home on mismatch. Admin lives at `/`, `/courses`, `/faculty`, `/rooms`, `/timetables`, `/notifications`; faculty under `/faculty-portal/*`; students under `/student-portal/*`.
- No shared API client, no env-based base URL. Each page either calls axios with a literal `http://localhost:5000/...` URL or defines its own `API_URL` constant. `Timetable.jsx` alone uses `axios.create`.
- Admin pages use shadcn/ui (`src/components/ui`, "new-york" style, generated as JSX) plus the shared `DataTable` component and `CourseForm` / `Faculty-Form`. Faculty and student portal pages are large single-file components (up to ~1800 lines) with inline style objects and their own nav/logout code rather than shared layout components.
- Portals derive their views client-side: faculty pages fetch all timetables and filter entries by `user.facultyId`; the student timetable filters timetables by the user's department + semester and `status === "published"`.
- `Chatbot.jsx` posts to `/api/ai/chat` (Gemini `gemini-2.5-flash`) with page context and renders the reply with `react-markdown`.
- `@/` resolves to `src/` (see `vite.config.js` and `jsconfig.json`). Vite is pinned to `rolldown-vite` via package overrides.

## Dead or unused code

- `frontend/src/components/WeatherCheck.jsx` imports `node-cron`, `dotenv`, and a Mongoose model in a browser file and is not imported anywhere.
- `@google/generative-ai` is in backend dependencies but never imported; all AI calls use `@google/genai`.
- The `/:id/optimize` route in `timetableRoute.js` is commented out.
