# SmartSchedAI — Dynamic Workflow Plan

Companion to `IMPLEMENTATION_PLAN.md`. Defines how the 11 phases are executed with the Workflow tool: which agents run on which model tier, how work fans out within a phase, and the checkpoint gates that must pass before a phase is committed.

## 1. Principles

**One workflow run per phase group, human checkpoint between runs.** Phases have hard dependencies (auth before guarded routes, schema/flow before GA, identity linking before portal scoping), so the orchestration is five sequential runs. You read each run's result before launching the next; a failed gate stops the run and returns the failure for you to decide on.

**Tiering rule.** Default is to *omit* the model (inherit Opus). Downgrade only when the task is fully specified and mechanical, and never for anything that touches security, the scheduling pipeline, or that has cross-file blast radius.

| Tier | Effort | Use for | Never for |
|---|---|---|---|
| `fable` | `low` | Mechanical sweeps with an exact recipe: URL→`api` replacements, `.env.example`, deleting dead files, alias routes, sample CSVs, `CLAUDE.md` touch-ups, git commits | Anything requiring a judgment call |
| `sonnet` | inherit | Standard feature work with a clear spec: CRUD routes + pages, importer, seed cohort, Socket.io wiring, hooks, verify/smoke scripts, gate runs, refute votes on non-critical findings | Auth policy, scheduling pipeline, GA |
| `opus` (default) | inherit / `high` for review | Auth middleware + route-guard policy, Timetable model + `schedulingContext` + `/generate` pipeline, GA engine, portal scoping across 10 pages, adversarial review + repair of critical phases | — |

**Fan-out rule.** Tasks inside a phase are grouped into *waves*. Tasks in the same wave touch disjoint files and run concurrently in the shared working tree (no worktree isolation needed — cheaper, and the gate sees the merged result). Waves run in order when a later task depends on an earlier one's exports. Only the **gate** agent starts servers or touches Mongo, so parallel implementers never fight over port 5000.

**Checkpoint gate (every phase).**
1. **Build gate** (`sonnet`): `npm run build` + `npm run lint` (frontend), `node --check` on changed backend files, start backend against Docker Mongo, run the phase's test matrix from `IMPLEMENTATION_PLAN.md`. Returns `{pass, failures[]}`.
2. **Repair loop**: on failure, an `opus` repair agent gets the failure list; gate re-runs. Max 2 repairs, then the run stops and returns the failure.
3. **Adversarial review**: N lens reviewers (`opus` on critical phases, `sonnet` otherwise) each produce findings; each medium/high finding is sent to a refuter (`sonnet`, "default to refuted if uncertain"); survivors go to one fix agent (`opus`), then the build gate runs once more.
4. **Commit** (`fable`, low): one commit per phase with the message from the plan, on `smart-scheduling-improvements`.

**Blocked ≠ failed.** An implementer that discovers the spec cannot be satisfied returns `status:"blocked"` with a reason; the run stops *before* the gate so you can decide, rather than the gate "fixing" a design problem.

## 2. Task × tier matrix

| Phase | Wave | Task id | Model | Files (disjoint within wave) |
|---|---|---|---|---|
| 0 | 1 | `p0-dotenv-constants` | opus | `backend/server.js`, `backend/routes/timetableRoute.js` (constants only) |
| 0 | 1 | `p0-dead-code` | fable | rm `frontend/src/components/WeatherCheck.jsx`, `backend/package.json` dep |
| 0 | 1 | `p0-env-examples` | fable | `backend/.env.example`, `frontend/.env.example` |
| 1 | 1 | `p1-auth-middleware` | opus | `backend/middleware/auth.js`, `backend/routes/authRoute.js`, `backend/server.js` (cors) |
| 1 | 1 | `p1-api-client` | sonnet | `frontend/src/lib/api.js` |
| 1 | 2 | `p1-route-guards` | opus | courses/faculty/rooms/timetables/notifications/ai routers (apply `requireAuth`/`requireRole`) |
| 1 | 2 | `p1-sweep-admin` | fable | Dashboard, Courses, Faculty, Rooms, Notifications, Timetable, Login, Chatbot → `api` |
| 1 | 2 | `p1-sweep-faculty` | fable | 5 `Faculty*.jsx` pages → `api` (replace raw `fetch` blocks) |
| 1 | 2 | `p1-sweep-student` | fable | StudentPortal, MyTimetable, MyCourses, MyProfile, StudentNotifications → `api` |
| 2 | 1 | `p2-routing` | sonnet | `frontend/src/App.jsx` (exp check, aliases, login redirect) |
| 3 | 1 | `p3-models` | opus | `backend/models/Timetable.js`, `backend/models/course.js` |
| 3 | 1 | `p3-validator-capacity` | sonnet | `backend/utils/scheduleValidator.js` |
| 3 | 2 | `p3-context-and-route` | opus | `backend/utils/schedulingContext.js`, `backend/routes/timetableRoute.js` (generate/generate-local/GET scoping/publish/export), `backend/utils/timetableGenerator.js` (accept context) |
| 3 | 2 | `p3-timetable-page` | sonnet | `frontend/src/pages/Timetable.jsx` |
| 4 | 1 | `p4-ga-engine` | opus | `backend/utils/geneticScheduler.js`, `backend/scripts/gaSmoke.js` |
| 4 | 2 | `p4-ga-wiring` | opus | `backend/routes/timetableRoute.js` (GA→local fallback, stats) |
| 5 | 1 | `p5-users-route` | sonnet | `backend/routes/usersRoute.js`, `server.js` mount |
| 5 | 1 | `p5-students-route` | sonnet | `backend/routes/studentsRoute.js`, `server.js` mount (coordinate: separate mount lines) |
| 5 | 1 | `p5-test-users-link` | sonnet | `backend/createTestUsers.js` |
| 5 | 2 | `p5-users-page` | sonnet | `frontend/src/pages/Users.jsx`, App route |
| 5 | 2 | `p5-students-page` | sonnet | `frontend/src/pages/Students.jsx`, App route |
| 5 | 2 | `p5-nav-dashboard` | sonnet | `AppShell.jsx`, `ADMIN_NAV`, `Dashboard.jsx` counts |
| 6 | 1 | `p6-seed-cohort` | sonnet | `backend/seedRealisticData.js` |
| 6 | 1 | `p6-csv-normalizers` | sonnet | `backend/utils/csv.js`, `backend/utils/importNormalizers.js` |
| 6 | 2 | `p6-importer` | sonnet | `backend/scripts/importDataset.js`, `import-mappings/*.json` |
| 6 | 2 | `p6-samples` | fable | `backend/scripts/samples/*.csv` |
| 7 | 1 | `p7-notification-model-route` | sonnet | `models/Notification.js`, `routes/notificationsRoute.js`, `utils/notify.js` |
| 7 | 1 | `p7-socket-server` | sonnet | `backend/server.js` (http+io), `package.json` deps |
| 7 | 2 | `p7-socket-client` | sonnet | `frontend/src/hooks/useSocket.js`, `useNotifications.js`, 3 notification pages, portal badges |
| 8 | 1 | `p8-queries-api` | sonnet | `models/Query.js`, `routes/queriesRoute.js`, mount |
| 8 | 1 | `p8-faculty-scope` | opus | 5 `Faculty*.jsx` pages |
| 8 | 1 | `p8-student-scope` | opus | 5 student pages |
| 9 | 1 | `p9-verify-script` | sonnet | `backend/scripts/verifyConstraints.js`, `package.json` scripts |
| 9 | 1 | `p9-smoke-script` | sonnet | `backend/scripts/smokeApi.js` |
| 10 | 1 | `p10-deliverable` | opus | `DELIVERABLE.md` |
| 10 | 1 | `p10-claude-md` | fable | `CLAUDE.md` |

Critical phases (reviewers on `opus`, `effort:'high'`): **1, 3, 4, 8**. Review lenses: `security`, `correctness`, `regression` for critical phases; `correctness`, `regression` otherwise.

## 3. Run sequence and human checkpoints

| Run | Phases | What you check before the next run |
|---|---|---|
| A | 0, 1, 2 | Log in as all three roles; admin CRUD still works; URL-hop is bounced |
| B | 3, 4 | Generate CS/Y1/S1/2026; confirm Electronics/Y2/S2/2027 → 404 (no record); seed 42 twice → identical |
| C | 5, 6 | Create a faculty user from Users page → log in → own timetable; import samples; Electronics generation succeeds |
| D | 7, 8 | Publish → live notification in faculty/student tabs; portals show only own data |
| E | 9, 10 | `npm run smoke` / `npm run verify` pass; read `DELIVERABLE.md` |

If a run stops on a gate or a `blocked` task: fix or re-spec, then relaunch with `resumeFromRunId` — completed agents are cached, only the changed/new calls run.

## 4. Runner script (one script, reused for all five runs)

Invoked as `Workflow({ script, args: RUN_X })` where `RUN_X` is one of the payloads in §5.

```js
export const meta = {
  name: 'smartsched-phase-runner',
  description: 'Implement IMPLEMENTATION_PLAN.md phases with tiered agents; gate, review, repair, commit each phase',
  phases: [
    { title: 'Implement' },
    { title: 'Verify' },
    { title: 'Review' },
    { title: 'Repair' },
    { title: 'Commit' },
  ],
}

const REPO = '/home/ubuntu/Documents/gokul/SmartSchedular/SmartSchedAI'
const PLAN = REPO + '/IMPLEMENTATION_PLAN.md'

const TASK_RESULT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'blocked'] },
    filesChanged: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    blockedReason: { type: 'string' },
  },
  required: ['status', 'filesChanged', 'summary'],
}
const GATE = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    failures: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'string' },
  },
  required: ['pass', 'failures'],
}
const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' }, line: { type: 'number' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          summary: { type: 'string' }, fix: { type: 'string' },
        },
        required: ['file', 'severity', 'summary'],
      },
    },
  },
  required: ['findings'],
}
const VERDICT = {
  type: 'object',
  properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['refuted'],
}

const common = `Repo: ${REPO}. Read CLAUDE.md and the relevant "Phase" section of ${PLAN} first.
Rules: do not rewrite the project; make the smallest safe change; keep existing behaviour and test accounts;
match surrounding code style; do NOT start servers, run seeds, or touch MongoDB (the gate agent does that);
do NOT commit. Only edit the files listed for your task unless a one-line import/mount elsewhere is unavoidable — if so, list it.`

const implPrompt = (ph, t) => `${common}
Phase ${ph.id} — ${ph.title}. Task "${t.id}".
Files you own: ${t.files.join(', ')}.
Spec: ${t.spec}
Return status "blocked" with blockedReason if the spec cannot be met without a design change.`

const gatePrompt = (ph, done) => `${common.replace('do NOT start servers, run seeds, or touch MongoDB (the gate agent does that);', '')}
You are the verification gate for Phase ${ph.id} — ${ph.title}. Changes made by implementers:
${done.map(r => `- ${r.summary} (${r.filesChanged.join(', ')})`).join('\n')}
Do: (1) \`cd frontend && npm run lint && npm run build\`; (2) \`node --check\` every changed backend .js;
(3) \`docker start smartschedai-mongo\` if needed, start the backend in the background on port 5000 (kill it when done);
(4) execute this phase's test matrix exactly as written in the plan: ${ph.gate}
Report pass=false with one failure line per failed check, quoting the real error output. Do not fix anything.`

const repairPrompt = (ph, failures) => `${common}
Phase ${ph.id} gate failed. Fix the ROOT CAUSE of each failure below with minimal changes, then stop:
${failures.map(f => '- ' + f).join('\n')}`

const reviewPrompt = (ph, lens) => `${common}
Review the uncommitted diff (\`git diff\` + untracked files) for Phase ${ph.id} through the ${lens} lens only.
Report only real defects with file and line; severity high = breaks a requirement or a security boundary,
medium = wrong behaviour in a realistic case, low = style. Do not edit files.`

const refutePrompt = (f) => `${common}
A reviewer claims: [${f.severity}] ${f.file}:${f.line || '?'} — ${f.summary}
Read the code and try to REFUTE it. Default to refuted=true if you are not certain it is a real defect.`

const fixPrompt = (ph, fs) => `${common}
Fix these confirmed review findings for Phase ${ph.id} with minimal changes:
${fs.map(f => `- ${f.file}:${f.line || '?'} ${f.summary}${f.fix ? ' → ' + f.fix : ''}`).join('\n')}`

const commitPrompt = (ph) => `Repo: ${REPO}. Stage all changes for Phase ${ph.id} and commit on the current branch
(smart-scheduling-improvements) with message:\n${ph.commit}\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\nDo nothing else.`

const key = f => `${f.file}:${f.line || 0}:${f.summary.slice(0, 40)}`
const out = []

for (const ph of args.phases) {
  log(`Phase ${ph.id}: ${ph.title}`)
  const critical = !!ph.critical
  const reviewModel = critical ? undefined : 'sonnet'   // undefined = inherit opus

  // ---- Implement: waves of file-disjoint tasks -------------------------
  const done = []
  for (const wave of ph.waves) {
    const rs = await parallel(wave.map(t => () =>
      agent(implPrompt(ph, t), {
        label: `impl:${t.id}`, phase: 'Implement', schema: TASK_RESULT,
        ...(t.model ? { model: t.model } : {}), ...(t.effort ? { effort: t.effort } : {}),
      })))
    done.push(...rs.filter(Boolean))
  }
  const blocked = done.filter(r => r.status === 'blocked')
  if (blocked.length) {
    log(`Phase ${ph.id} BLOCKED: ${blocked.map(b => b.blockedReason).join(' | ')}`)
    return { stoppedAt: ph.id, blocked, completed: out }
  }

  // ---- Verify gate + repair loop ---------------------------------------
  let gate = null
  for (let attempt = 0; attempt <= 2; attempt++) {
    gate = await agent(gatePrompt(ph, done), { label: `gate:${ph.id}#${attempt}`, phase: 'Verify', model: 'sonnet', schema: GATE })
    if (!gate || gate.pass || attempt === 2) break
    log(`Phase ${ph.id} gate failed (${gate.failures.length}) — repair ${attempt + 1}/2`)
    await agent(repairPrompt(ph, gate.failures), { label: `repair:${ph.id}#${attempt + 1}`, phase: 'Repair', schema: TASK_RESULT })
  }
  if (!gate || !gate.pass) return { stoppedAt: ph.id, gateFailed: gate, completed: out }

  // ---- Adversarial review ----------------------------------------------
  const lenses = critical ? ['security', 'correctness', 'regression'] : ['correctness', 'regression']
  const reviews = await parallel(lenses.map(lens => () =>
    agent(reviewPrompt(ph, lens), {
      label: `review:${ph.id}:${lens}`, phase: 'Review', schema: FINDINGS,
      ...(reviewModel ? { model: reviewModel } : { effort: 'high' }),
    })))
  const seen = new Set()
  const candidates = reviews.filter(Boolean).flatMap(r => r.findings)
    .filter(f => f.severity !== 'low')
    .filter(f => !seen.has(key(f)) && seen.add(key(f)))
  const votes = await parallel(candidates.map(f => () =>
    agent(refutePrompt(f), { label: `refute:${f.file.split('/').pop()}`, phase: 'Review', model: 'sonnet', schema: VERDICT })))
  const confirmed = candidates.filter((f, i) => votes[i] && !votes[i].refuted)
  log(`Phase ${ph.id} review: ${candidates.length} findings, ${confirmed.length} confirmed`)
  if (confirmed.length) {
    await agent(fixPrompt(ph, confirmed), { label: `fix:${ph.id}`, phase: 'Repair', schema: TASK_RESULT })
    const regate = await agent(gatePrompt(ph, done), { label: `gate:${ph.id}#post-review`, phase: 'Verify', model: 'sonnet', schema: GATE })
    if (!regate || !regate.pass) return { stoppedAt: ph.id, gateFailed: regate, completed: out }
  }

  // ---- Commit checkpoint -----------------------------------------------
  await agent(commitPrompt(ph), { label: `commit:${ph.id}`, phase: 'Commit', model: 'fable', effort: 'low' })
  out.push({ phase: ph.id, tasks: done.map(d => d.summary), reviewConfirmed: confirmed.length })
}
return { completed: out }
```

Agent count per run: ~(tasks + 1–3 gates + 2–3 reviews + refutes + 1 commit) per phase — Run A ≈ 25–30, Run B ≈ 18–22, others ≈ 20–25. Above the default 15-agent guideline; the user has opted into the scale.

## 5. `args` payloads per run

Each `spec` points at the plan section and adds only what the implementer needs to work without reading the other tasks. `gate` is the test matrix the verify agent must execute. `critical` turns on opus/high-effort review with the security lens.

### Run A — Phases 0, 1, 2

```json
{ "phases": [
  { "id": 0, "title": "Baseline fixes", "commit": "chore: baseline fixes (dotenv order, shared scheduling constants, dead code)",
    "gate": "backend starts; GET /api/courses returns the seeded list; frontend lint+build pass; POST /api/timetables/generate {department:'Computer Science',semester:1,academicYear:2026} still returns 201 via local-fallback.",
    "waves": [[
      { "id": "p0-dotenv-constants", "files": ["backend/server.js","backend/routes/timetableRoute.js"],
        "spec": "Make `import \"dotenv/config\"` the first import in server.js and remove the later dotenv.config(). In timetableRoute.js delete the local DAYS/TIME_SLOTS/WEEKS/getWeeklySessions and import DAYS, TIME_SLOTS, slotLabel from ../utils/schedulingConstants.js and getWeeklySessions from ../utils/schedulingHelpers.js; where the route passed string slots to generateLocalTimetable, pass TIME_SLOTS.map(slotLabel). Behaviour must be identical." },
      { "id": "p0-dead-code", "model": "fable", "effort": "low", "files": ["frontend/src/components/WeatherCheck.jsx","backend/package.json"],
        "spec": "Delete frontend/src/components/WeatherCheck.jsx (confirm with grep it is imported nowhere). Remove the unused @google/generative-ai dependency from backend/package.json and run `npm install` in backend to refresh the lockfile." },
      { "id": "p0-env-examples", "model": "fable", "effort": "low", "files": ["backend/.env.example","frontend/.env.example"],
        "spec": "Create backend/.env.example with PORT=5000, MONGO_URI=mongodb://localhost:27017/smartschedai, JWT_SECRET=change-me, GOOGLE_API_KEY=, CLIENT_ORIGIN=http://localhost:5173 and one-line comments. Create frontend/.env.example with VITE_API_URL=http://localhost:5000/api." }
    ]] },
  { "id": 1, "title": "Auth enforcement + shared API client", "critical": true, "commit": "feat(auth): JWT middleware, role guards, shared API client",
    "gate": "curl GET /api/courses without token → 401; login as student@smartscheduler.com/123456 then POST /api/courses → 403; admin token CRUD on /api/courses works; `grep -rn localhost:5000 frontend/src` matches only src/lib/api.js; all three test accounts log in; frontend lint+build pass.",
    "waves": [
      [
        { "id": "p1-auth-middleware", "files": ["backend/middleware/auth.js","backend/routes/authRoute.js","backend/server.js"],
          "spec": "Create middleware/auth.js exporting requireAuth (Bearer → jwt.verify with JWT_SECRET → req.user; 401 otherwise) and requireRole(...roles) (403). In authRoute.js: keep login semantics unchanged for existing users; extend the JWT payload AND the returned user object with name, email, department, semester, year, academicYear, section by loading the linked Faculty (via facultyId, else by email) or Student (via studentId, else by email) doc when present; add GET /me (requireAuth) returning the refreshed user + linked profile. Do NOT add /register. In server.js set cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }). Do not guard other routers (a separate task does)." },
        { "id": "p1-api-client", "model": "sonnet", "files": ["frontend/src/lib/api.js"],
          "spec": "Create lib/api.js: axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' }); request interceptor adds Authorization: Bearer <localStorage.token>; response interceptor on 401 clears token+user and redirects to /login (skip redirect when the request URL is /auth/login). Export default `api` and named `getStoredUser()` (safe JSON.parse of localStorage.user)." }
      ],
      [
        { "id": "p1-route-guards", "files": ["backend/routes/coursesRoute.js","backend/routes/facultyRoute.js","backend/routes/roomsRoute.js","backend/routes/timetableRoute.js","backend/routes/notificationsRoute.js","backend/routes/aiRoute.js"],
          "spec": "Apply the guards from middleware/auth.js: every router `use(requireAuth)`; GET handlers open to any role; POST/PUT/DELETE require admin — except PUT /api/faculty/:id which also allows role faculty when req.user.facultyId === req.params.id and then only updates availability and preferences; PUT /api/notifications/:id/read allowed for any role; /api/ai any authenticated role. Keep handler bodies unchanged." },
        { "id": "p1-sweep-admin", "model": "fable", "effort": "low", "files": ["frontend/src/pages/Dashboard.jsx","frontend/src/pages/Courses.jsx","frontend/src/pages/Faculty.jsx","frontend/src/pages/Rooms.jsx","frontend/src/pages/Notifications.jsx","frontend/src/pages/Timetable.jsx","frontend/src/pages/Login.jsx","frontend/src/components/Chatbot.jsx"],
          "spec": "Replace every axios call / axios.create / raw fetch that targets http://localhost:5000 with the shared client: `import api from '@/lib/api'` and `api.get('/courses')` etc. (baseURL already includes /api). Login keeps posting {email,password,role} to '/auth/login' via api and must store data.user unchanged. Preserve component logic exactly." },
        { "id": "p1-sweep-faculty", "model": "fable", "effort": "low", "files": ["frontend/src/pages/FacultyPortal.jsx","frontend/src/pages/FacultyTimetable.jsx","frontend/src/pages/FacultyCourses.jsx","frontend/src/pages/FacultyNotifications.jsx","frontend/src/pages/FacultyProfile.jsx"],
          "spec": "Same sweep: all http://localhost:5000 axios/fetch calls → `api` from '@/lib/api'. For raw fetch blocks with manual Authorization headers, replace with api.get/patch and drop the manual header. Keep the PATCH /notifications/:id call as api.patch for now (Phase 7 adds the alias). Preserve logic." },
        { "id": "p1-sweep-student", "model": "fable", "effort": "low", "files": ["frontend/src/pages/StudentPortal.jsx","frontend/src/pages/MyTimetable.jsx","frontend/src/pages/MyCourses.jsx","frontend/src/pages/MyProfile.jsx","frontend/src/pages/StudentNotifications.jsx"],
          "spec": "Same sweep as above for the five student pages: replace the local fetch/api helper functions with the shared `api` client; keep Promise.allSettled shapes and response-unwrapping logic intact." }
      ]
    ] },
  { "id": 2, "title": "Routing hardening + alias routes", "commit": "feat(routing): alias dashboards, expiry check",
    "gate": "As student, visiting /faculty-portal and / redirects to /student-portal; /teacher-dashboard as faculty lands on /faculty-portal; /admin-dashboard as admin lands on /; /student-dashboard as student lands on /student-portal; a token with past exp redirects to /login; frontend lint+build pass.",
    "waves": [[
      { "id": "p2-routing", "model": "sonnet", "files": ["frontend/src/App.jsx"],
        "spec": "In ProtectedRoute also decode the JWT payload (base64url, no library) and treat exp*1000 < now as logged out (clear storage). Add redirect routes /admin-dashboard→/, /teacher-dashboard→/faculty-portal, /student-dashboard→/student-portal. /login when already logged in → role home. Wildcard → role home if logged in else /login. Keep all existing routes." }
    ]] }
] }
```

### Run B — Phases 3, 4

```json
{ "phases": [
  { "id": 3, "title": "Timetable model + end-to-end academicYear/year flow", "critical": true, "commit": "fix(timetable): academicYear/year flow end-to-end, publish/export routes",
    "gate": "Admin POST /api/timetables/generate {department:'Computer Science',semester:1,year:1,academicYear:2026} → 201, saved doc has year 1 and academicYear 2026 and name 'Computer Science - Year 1 Sem 1 (2026)'; same call with department 'Electronics', year 2, semester 2, academicYear 2027 → 404 mentioning those values and NO new timetable document is created (count before/after); missing `year` → 400; GET /api/timetables?department=Computer%20Science filters; PATCH /:id/publish sets status published; GET /:id/export?format=csv returns text/csv; pre-existing timetables without academicYear still returned by GET; frontend lint+build pass and Timetable.jsx form has no 'Computer Science' literal.",
    "waves": [
      [
        { "id": "p3-models", "files": ["backend/models/Timetable.js","backend/models/course.js"],
          "spec": "Timetable: add academicYear Number, publishedAt Date, metadata.generationMethod String, seed, generations, populationSize, bestFitness, hardViolations, softPenalty Numbers, fitnessHistory [{generation,best,average}] (_id:false); index {department,semester,year,academicYear,status}. Course: remove `default: new Date().getFullYear()` from year (year = study year 1–4), add academicYear Number. Keep everything else." },
        { "id": "p3-validator-capacity", "model": "sonnet", "files": ["backend/utils/scheduleValidator.js"],
          "spec": "Add a hard check using roomCapacityMatches from schedulingHelpers.js: error when a course's expected class size (course.expectedStudents || course.capacity || 0 → skip if 0) exceeds room.capacity. Follow the existing check numbering/message style." }
      ],
      [
        { "id": "p3-context-and-route", "files": ["backend/utils/schedulingContext.js","backend/routes/timetableRoute.js","backend/utils/timetableGenerator.js"],
          "spec": "Create utils/schedulingContext.js exporting loadSchedulingContext({department,semester,year,academicYear}) → {courses,faculty,rooms,counts} using case-insensitive anchored regex on department and exact Number matches on semester/year/academicYear for courses, department regex for faculty, all rooms. In timetableRoute.js: /generate and /generate-local read {department,semester,year,academicYear,gaOptions,method}; 400 listing missing fields; call loadSchedulingContext; if courses.length===0 respond 404 `No courses found for <department>, year <year>, semester <semester>, academic year <academicYear>` and create nothing; pipeline stays AI (only when method==='ai' or as today when key present)→local for now (GA is Phase 4) with validateSchedule on every result; save name `${department} - Year ${year} Sem ${semester} (${academicYear})`, year, academicYear, metadata; respond {...doc.toObject(), generationMethod, stats}. GET / accepts department/semester/year/academicYear/status query filters and scopes by req.user.role: student → own department/semester/year/academicYear (from req.user) and status published; faculty → schedule $elemMatch {facultyId: req.user.facultyId} and status published; admin → all. Add PATCH /:id/publish (admin: set published+publishedAt, archive other published docs with same department/semester/year/academicYear, create Notification) and GET /:id/export?format=csv|json (rows: day,startTime,endTime,courseCode,courseName,faculty,room; resolve names by id). Make generateTimetableWithAI accept an optional preloaded context {courses,faculty,rooms} and skip its own DB filtering when given; it must also filter by year and academicYear if it still queries." },
        { "id": "p3-timetable-page", "model": "sonnet", "files": ["frontend/src/pages/Timetable.jsx"],
          "spec": "Form defaults become empty strings for department/semester/year/academicYear; Department select from distinct course.department values, Academic Year select from distinct course.academicYear values (fallback current year), Year select 1–4, Semester select 1–8; payload adds year (int); validation requires all four; list cards show `Year {year} · Sem {semester} · AY {academicYear ?? year}`; add a filter bar (department/academicYear/status) applied client-side; Publish button → api.patch(`/timetables/${id}/publish`), Unpublish keeps PUT with status draft; add 'Export CSV' calling GET /timetables/:id/export?format=csv (open as blob download) next to the existing JSON/print buttons. Keep GA panel and GARunSummary usage." }
      ]
    ] },
  { "id": 4, "title": "Genetic algorithm", "critical": true, "commit": "feat(scheduler): seeded genetic algorithm with validator-based fitness",
    "gate": "`node backend/scripts/gaSmoke.js --seed 42` twice prints identical schedule hashes and hardViolations 0 on seeded CS data; POST /generate with gaOptions {seed:42,populationSize:20,maxGenerations:50} → metadata.generationMethod 'genetic-algorithm', metadata.seed 42, populationSize 20, generations ≤ 50, fitnessHistory non-empty; the saved schedule passes validateSchedule; with all lab rooms temporarily renamed to lecture_hall in a copy of the data (do it in-memory in gaSmoke via a flag, not in Mongo) GA throws and the route falls back / errors clearly; restore nothing in DB.",
    "waves": [
      [
        { "id": "p4-ga-engine", "files": ["backend/utils/geneticScheduler.js","backend/scripts/gaSmoke.js"],
          "spec": "Implement generateGeneticTimetable({courses,faculty,rooms,options}) exactly per IMPLEMENTATION_PLAN.md Phase 4: options seed/populationSize(60,≤200)/maxGenerations(300,≤1000)/mutationRate/elitism/tournamentK/timeLimitMs; precompute eligible faculty (specializationMatches) and rooms (roomTypeMatches && roomCapacityMatches) per course, throwing the same messages as localScheduler when empty; chromosome = one faculty gene per course + {dayIdx,slotIdx,roomIdx} per session; RNG only from createRng in prng.js (never Math.random/Date in decisions; timeLimitMs may use Date.now for the stop only); fast internal hard counter mirroring validator checks (faculty/room/student-group slot clashes, availability, break, workload) + soft penalties via isAvoidedSlot/isPreferredSlot/same-day repeat; fitness 1/(1+10*hard+soft); tournament, per-course crossover, mutation, elitism, early stop; return {schedule:[{courseId,facultyId,roomId,day,startTime,endTime}], stats:{generationMethod:'genetic-algorithm',seed,generations,populationSize,bestFitness,hardViolations,softPenalty,fitnessHistory,durationMs}} and run validateSchedule on the final best. gaSmoke.js: connect to Mongo, loadSchedulingContext for CS/1/1/2026 (args), run GA with --seed/--pop/--gens flags, print stats and a stable hash of the schedule, optional --no-labs flag that rewrites room types in memory to prove failure handling." }
      ],
      [
        { "id": "p4-ga-wiring", "files": ["backend/routes/timetableRoute.js"],
          "spec": "In /generate: order = (method==='ai' && key) ? AI : GA; if GA throws or returns hardViolations>0 → generateLocalTimetable with generationMethod 'local-fallback' and a warning in the response; run validateSchedule; persist stats into metadata; respond {...doc, generationMethod, stats}. Pass gaOptions {seed,populationSize,maxGenerations} through after clamping. Log which engine produced the result." }
      ]
    ] }
] }
```

### Run C — Phases 5, 6

```json
{ "phases": [
  { "id": 5, "title": "Admin user & student management", "commit": "feat(admin): user and student management",
    "gate": "node backend/createTestUsers.js is idempotent and afterwards faculty@smartscheduler.com has facultyId set and student@smartscheduler.com has studentId set with department 'Computer Science', semester 1, year 1, academicYear 2026 — passwords unchanged (login still works with 123456); admin POST /api/users {role:'faculty',...,createProfile:true} → 201 and login for that user returns facultyId; student POST /api/users → 403; DELETE own admin → 400; GET /api/students as admin lists; frontend lint+build pass; /users and /students routes render for admin.",
    "waves": [
      [
        { "id": "p5-users-route", "model": "sonnet", "files": ["backend/routes/usersRoute.js","backend/server.js"],
          "spec": "Admin-only /api/users: GET (no password), POST {name,email,password,role in admin|faculty|student,facultyId?,studentId?,createProfile?,profile?} — bcrypt hash; if facultyId/studentId absent, auto-link by email to an existing Faculty/Student; if createProfile, create the Faculty (needs department,maxHoursPerWeek,specialization) or Student (registerNumber,department,semester,academicYear,section) doc from `profile` then link; 409 on duplicate email. PUT /:id (name, role links, resetPassword). DELETE /:id (400 if self or last admin). Mount in server.js on its own line `app.use('/api/users', usersRouter)`." },
        { "id": "p5-students-route", "model": "sonnet", "files": ["backend/routes/studentsRoute.js","backend/server.js"],
          "spec": "/api/students: admin CRUD (GET /, GET /:id, POST, PUT /:id, DELETE /:id) on models/Student.js plus GET /me and PUT /me for role student (resolve by req.user.studentId else email; PUT /me may only change section/phone-like non-academic fields — add `phone` String to the Student schema). Mount in server.js on its own line `app.use('/api/students', studentsRouter)` (another task adds /api/users on a separate line; keep both)." },
        { "id": "p5-test-users-link", "model": "sonnet", "files": ["backend/createTestUsers.js"],
          "spec": "Keep the script non-destructive and never modify passwords. After ensuring the three users exist: upsert a Faculty doc {email:'faculty@smartscheduler.com', name:'Dr John', department:'Computer Science', specialization:['Programming','Data Structures','Algorithms'], maxHoursPerWeek:20, availability Mon–Fri 09:00–17:30} and set the faculty user's facultyId if null; upsert a Student doc {registerNumber:'CS2026001', email:'student@smartscheduler.com', department:'Computer Science', semester:1, academicYear:2026, section:'A'} plus `year:1` if the schema has it, and set studentId if null. Print what was linked." }
      ],
      [
        { "id": "p5-users-page", "model": "sonnet", "files": ["frontend/src/pages/Users.jsx","frontend/src/App.jsx"],
          "spec": "Admin page at /users (ProtectedRoute role admin, inside AppShell like Courses.jsx) using Data-table.jsx and shadcn inputs/selects: list users; create user form with role, and when role is faculty/student a 'create profile' toggle exposing the profile fields; reset password; delete with confirm. Use the shared api client." },
        { "id": "p5-students-page", "model": "sonnet", "files": ["frontend/src/pages/Students.jsx","frontend/src/App.jsx"],
          "spec": "Admin page at /students mirroring Courses.jsx structure (Data-table + form) for /api/students CRUD: name, registerNumber, email, department, semester, year, academicYear, section. Add the route in App.jsx (another task adds /users — keep both)." },
        { "id": "p5-nav-dashboard", "model": "sonnet", "files": ["frontend/src/components/AppShell.jsx","frontend/src/pages/Timetable.jsx","frontend/src/pages/Dashboard.jsx"],
          "spec": "Add 'Users' (/users) and 'Students' (/students) to the admin nav wherever it is defined (AppShell nav config and the ADMIN_NAV constant in Timetable.jsx). Dashboard: add stat cards for students (/api/students) and users (/api/users) and show the published-timetables count; keep existing cards." }
      ]
    ] },
  { "id": 6, "title": "Seed data + generic CSV importer", "commit": "feat(data): second cohort seed + generic CSV importer with samples",
    "gate": "node backend/seedRealisticData.js is idempotent; CS courses now have year 1 + academicYear 2026; Electronics cohort exists (courses semester 2 year 2 academicYear 2027, faculty department Electronics, rooms incl. one lab); `node backend/scripts/importDataset.js --type courses --file backend/scripts/samples/courses.csv --dry-run` reports 0 errors for all four types; real import then re-import shows all rows as update with no duplicates (count docs before/after); POST /generate for Electronics/2/2/2027 → 201 with only Electronics course ids in the schedule.",
    "waves": [
      [
        { "id": "p6-seed-cohort", "model": "sonnet", "files": ["backend/seedRealisticData.js"],
          "spec": "Keep upsert semantics. Set year:1, academicYear:2026 on the CS courses. Add an Electronics cohort: 6 courses (codes EC201–EC206, 2 of type lab, semester 2, year 2, academicYear 2027, names like 'Digital Electronics', 'Signals and Systems', 'Microprocessors Lab'), 5 faculty (department 'Electronics', specializations overlapping the course names word-for-word so specializationMatches resolves, maxHoursPerWeek 18–20, Mon–Fri availability), 2 rooms ('E201' lecture_hall cap 60, 'E-Lab-1' lab cap 40, building 'Electronics Block')." },
        { "id": "p6-csv-normalizers", "model": "sonnet", "files": ["backend/utils/csv.js","backend/utils/importNormalizers.js"],
          "spec": "csv.js: parseCsv(text) → {headers, rows:[{}]} handling quoted fields, doubled quotes, CRLF, BOM, trailing newline; no dependency. importNormalizers.js: normalizeRoomType (lecture/classroom/lh→lecture_hall, lab/laboratory/computer lab→lab, seminar→seminar_room, auditorium/hall→auditorium), normalizeEquipment (split on ; , |, lowercase, synonyms projector/smart board→smartboard, ac), normalizeSpecialization (split on ; , | /), normalizeCourseType (lab|practical→lab, seminar→seminar, else lecture), parseAvailability('Mon 09:00-12:00; Tue 14:00-17:00' → {monday:[{start,end}],...}) with default Mon–Fri 09:00–17:30 when blank, toInt, headerKey (lowercase, strip spaces/underscores) and HEADER_SYNONYMS per type (teacher|instructor|faculty name→name, expertise|skills|specialisation→specialization, room no|room→name, reg no|roll→registerNumber, etc.). Export all." }
      ],
      [
        { "id": "p6-importer", "model": "sonnet", "files": ["backend/scripts/importDataset.js","backend/scripts/import-mappings/courses.json","backend/scripts/import-mappings/faculty.json","backend/scripts/import-mappings/rooms.json","backend/scripts/import-mappings/students.json"],
          "spec": "CLI: --type courses|faculty|rooms|students --file path [--map mapping.json] [--dry-run] [--department X] [--academicYear N] [--create-users]. Load CSV via utils/csv.js, map headers via mapping file {columns:{csvHeader:field}, defaults:{}} merged over HEADER_SYNONYMS, normalize via importNormalizers, apply CLI defaults, build docs, validate with Model.validate() (collect errors per row), upsert by key (course code / faculty email else name+department / room name+building / student registerNumber). --dry-run prints per-row insert|update|skip|error and writes nothing. --create-users creates User docs for faculty/students with a printed default password and links ids. Print a summary table. Mapping JSON files document every supported field with the default synonyms." },
        { "id": "p6-samples", "model": "fable", "effort": "low", "files": ["backend/scripts/samples/courses.csv","backend/scripts/samples/faculty.csv","backend/scripts/samples/rooms.csv","backend/scripts/samples/students.csv"],
          "spec": "Write four sample CSVs (8–12 rows each) for an 'Electronics' cohort (semester 2, year 2, academic year 2027) using messy but realistic headers the importer must map (e.g. 'Teacher Name', 'Expertise', 'Room No', 'Type' with values like 'Computer Lab', 'Features' like 'Projector; AC', 'Reg No'). Faculty expertise must overlap course names so scheduling works." }
      ]
    ] }
] }
```

### Run D — Phases 7, 8

```json
{ "phases": [
  { "id": 7, "title": "Notification scoping + Socket.io", "commit": "feat(notifications): audience scoping + Socket.io live push",
    "gate": "backend starts via httpServer with socket.io; a node socket.io-client connecting with a faculty JWT receives a 'notification' event when admin POSTs /api/notifications {audience:'faculty'}; a student socket does not; GET /api/notifications as student excludes audience 'faculty'; PATCH /api/notifications/:id marks read; PATCH /api/timetables/:id/publish emits; frontend lint+build pass.",
    "waves": [
      [
        { "id": "p7-notification-model-route", "model": "sonnet", "files": ["backend/models/Notification.js","backend/routes/notificationsRoute.js","backend/utils/notify.js"],
          "spec": "Notification: add audience enum all|admin|faculty|student default all, recipientUserId String null, relatedTimetableId String null. Route GET: filter {$or:[{audience:'all'},{audience:req.user.role},{recipientUserId:req.user.userId}]}; POST accepts audience; add PATCH /:id as an alias of PUT /:id/read. utils/notify.js: createAndEmit(app,{title,message,type,audience,recipientUserId,relatedTimetableId}) saves and, if app.get('io') exists, emits 'notification' to room role:<audience> (or all role rooms when 'all') and user:<recipientUserId>. Use it from the notifications POST." },
        { "id": "p7-socket-server", "model": "sonnet", "files": ["backend/server.js","backend/package.json"],
          "spec": "npm install socket.io in backend. server.js: http.createServer(app); new Server(httpServer,{cors:{origin: CLIENT_ORIGIN}}); io.use verifies socket.handshake.auth.token with JWT_SECRET and joins rooms role:<role> and user:<userId>; app.set('io', io); httpServer.listen(PORT). Keep all mounts." }
      ],
      [
        { "id": "p7-socket-client", "model": "sonnet", "files": ["frontend/package.json","frontend/src/hooks/useSocket.js","frontend/src/hooks/useNotifications.js","frontend/src/pages/Notifications.jsx","frontend/src/pages/FacultyNotifications.jsx","frontend/src/pages/StudentNotifications.jsx","frontend/src/pages/FacultyPortal.jsx","frontend/src/pages/StudentPortal.jsx","frontend/src/routes/timetableRoute.js"],
          "spec": "npm install socket.io-client in frontend. useSocket(): singleton io(VITE_API_URL origin, {auth:{token}}) with reconnect; useNotifications(): initial api.get('/notifications') + live prepend on 'notification' + unreadCount + markRead. Wire into the three notification pages and a bell badge in FacultyPortal/StudentPortal headers. Also change timetableRoute.js generate/publish to call createAndEmit from utils/notify.js instead of Notification.create (audience 'all' for publish, 'admin' for generation results)." }
      ]
    ] },
  { "id": 8, "title": "Portals scoped to own data", "critical": true, "commit": "feat(portals): scope faculty/student views to own identity",
    "gate": "Faculty login (faculty@smartscheduler.com) after publishing a CS timetable containing Dr John: /faculty-portal and /faculty-portal/timetable show only entries whose facultyId equals the linked Faculty _id (verify against the API); student login shows the CS published timetable only, and after unpublishing shows an empty state — never a draft; a student user with studentId null sees 'Profile not linked'; grep the ten portal pages for 'Computer Science' literal → none; faculty can POST /api/queries and admin can GET them; frontend lint+build pass.",
    "waves": [[
      { "id": "p8-queries-api", "model": "sonnet", "files": ["backend/models/Query.js","backend/routes/queriesRoute.js","backend/server.js"],
        "spec": "Query {userId, role, name, subject, message, status open|answered, reply, createdAt}. POST (faculty/student create own), GET (admin all; others own), PUT /:id/reply (admin sets reply+answered → createAndEmit to recipientUserId). Mount /api/queries." },
      { "id": "p8-faculty-scope", "files": ["frontend/src/pages/FacultyPortal.jsx","frontend/src/pages/FacultyTimetable.jsx","frontend/src/pages/FacultyCourses.jsx","frontend/src/pages/FacultyProfile.jsx","frontend/src/pages/FacultyNotifications.jsx"],
        "spec": "Resolve identity once via api.get('/auth/me') (keep email fallback to /faculty list only if facultyId missing). Fetch timetables via api.get('/timetables') — the server already scopes to own published entries; still filter entries by facultyId client-side for safety. Courses = distinct courseIds from own entries. Add an Analytics card (weekly hours vs maxHoursPerWeek, sessions per day, distinct rooms). Add a small 'Ask a query' form posting to /api/queries and listing own queries. Profile: save availability/preferences via api.put(`/faculty/${id}`). Remove the 'Computer Science' fallback in FacultyCourses. Keep each page's existing layout; use useNotifications where notifications are shown." },
      { "id": "p8-student-scope", "files": ["frontend/src/pages/StudentPortal.jsx","frontend/src/pages/MyTimetable.jsx","frontend/src/pages/MyCourses.jsx","frontend/src/pages/MyProfile.jsx","frontend/src/pages/StudentNotifications.jsx"],
        "spec": "Remove every 'Computer Science'/'1'/currentYear default and the 'any non-empty timetable' fallback. Identity from getStoredUser() refreshed by api.get('/auth/me'); if studentId is null render 'Profile not linked — contact admin' instead of data. Timetable = api.get('/timetables') (server-scoped, published only) → pick newest; empty state when none. MyCourses filters by user.department+semester (+year if present). Add an Analytics card (classes/week, hours/week, courses). Add an 'Ask a query' form + own list via /api/queries. MyProfile: academic fields read-only from /auth/me; editable phone/section persisted via api.put('/students/me'). Keep existing visual layouts." }
    ]] }
] }
```

### Run E — Phases 9, 10

```json
{ "phases": [
  { "id": 9, "title": "Constraint verification + test automation", "commit": "test: constraint verifier and API smoke scripts",
    "gate": "`npm run verify -- --latest` prints a PASS/FAIL table with all rules PASS for both the CS and Electronics timetables; `npm run smoke` exits 0 and prints the matrix (3 logins land on correct role, 401/403 checks, two generations whose department/year/semester/academicYear and course id sets differ, seed reproducibility, publish, export).",
    "waves": [[
      { "id": "p9-verify-script", "model": "sonnet", "files": ["backend/scripts/verifyConstraints.js","backend/package.json"],
        "spec": "Load a timetable by --id or --latest (optionally --department/--academicYear), load its courses/faculty/rooms, run validateSchedule and additionally group errors by rule into a PASS/FAIL table: teacher conflict, room conflict, student-group conflict, capacity, faculty availability, room availability, workload, lab-room rule, break slot, working days, session duration, session count. Exit 1 on any FAIL. Add `verify` and `smoke` npm scripts (smoke → scripts/smokeApi.js)." },
      { "id": "p9-smoke-script", "model": "sonnet", "files": ["backend/scripts/smokeApi.js"],
        "spec": "Node script using fetch against BASE_URL (default http://localhost:5000): log in as the three test accounts; assert admin/faculty/student role in response; 401 without token; 403 student POST /api/courses; generate CS/1/1/2026 and Electronics/2/2/2027 with seed 42 and assert the two records differ in department/year/semester/academicYear and have disjoint courseId sets; generate CS again with seed 42 and assert identical schedule; publish one; export csv; delete the smoke-created timetables at the end. Print a table and exit non-zero on failure." }
    ]] },
  { "id": 10, "title": "Deliverable", "commit": "docs: deliverable and CLAUDE.md update",
    "gate": "DELIVERABLE.md exists with every section listed in IMPLEMENTATION_PLAN.md Phase 10 and a files-changed table generated from `git diff --stat main..HEAD`; CLAUDE.md commands/architecture sections mention the new routes, scripts and modules; frontend build passes.",
    "waves": [[
      { "id": "p10-deliverable", "files": ["DELIVERABLE.md"],
        "spec": "Write DELIVERABLE.md per the Phase 10 outline: run commands and seed order, roles/security table, test accounts (unchanged), schema changes, root cause a–e with the fix per layer, GA design + constraints table, importer usage, Socket.io, test matrix results (run `npm run smoke` and `npm run verify` and paste real output), files changed with per-file summary from git, known limitations. Be factual — only claim what the scripts actually printed." },
      { "id": "p10-claude-md", "model": "fable", "effort": "low", "files": ["CLAUDE.md"],
        "spec": "Update CLAUDE.md: new commands (verify, smoke, importDataset, gaSmoke), auth middleware and route-guard policy, new routers (/api/users, /api/students, /api/queries), Timetable/Course/Notification schema additions, GA module and fallback order, Socket.io, shared frontend api client, alias routes. Remove statements that are no longer true (e.g. 'There is no auth middleware', 'Notifications are global', WeatherCheck dead code)." }
    ]] }
] }
```

## 6. How to launch

```
Workflow({ script: <§4 script>, args: <Run A JSON> })   → review → Run B → … → Run E
```

Between runs: read the returned `completed[]` summary, spot-check in the browser per §3, and `git log` to confirm the per-phase commits. On a stop (`stoppedAt`), fix or re-spec, then `Workflow({ scriptPath, args, resumeFromRunId })`.
