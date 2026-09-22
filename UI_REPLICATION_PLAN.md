# UI_REPLICATION_PLAN.md

## Preflight findings that shape the design

1. **The current `TIME_SLOTS` cannot be regenerated from a start/end/duration/break formula.** `09:00-10:00, 10:00-11:00, 11:15-12:15, 14:15-15:15, 15:15-16:15, 16:30-17:30` has irregular inter-period gaps (0, 15, lunch, 0, 15). So `SystemConfig` needs an optional explicit `slots[]` override, seeded with exactly today's six slots, and `getScheduleGrid()` only *derives* slots when `slots[]` is absent. Otherwise every existing saved timetable stops validating.
2. **`generateGeneticTimetable` is a tight synchronous `while` loop** (`backend/utils/geneticScheduler.js:785-950`) and `handleGeneration` guards with a module-level `generationInFlight` boolean (`backend/routes/timetableRoute.js:~556`, returns 409). Real progress requires making the GA `async` and `await new Promise(r => setImmediate(r))` on the progress cadence — all callers (route + `scripts/gaSmoke.js`) must be awaited, and the 409 lock becomes a job-registry lock.

## Scope & ground rules

Replicate AlmanacAI's layouts, flows and module concepts using **our** primitives: shadcn "new-york" JSX in `frontend/src/components/ui`, oklch tokens in `frontend/src/index.css`, Inter, lucide, `tw-animate-css`. No Poppins, no gradients, no 3D/liquid effects, no new color palette. Motion limited to `animate-in`/`fade-in`/`duration-150..200` and the existing `transition-colors`.

Scope: timetable module, app shell, admin/faculty/student dashboards. Landing and auth are untouched.

Phases are `U0…U10`. Each lists Goal / Files / APIs / Verify.

---

## Relationship to IMPLEMENTATION_PLAN.md

| Existing phase | Effect |
|---|---|
| **7** (notification scoping + Socket.io) | **Socket.io server task (`p7-socket-server`) is superseded by U4**, which stands up `http.createServer` + `io` + JWT handshake + `role:`/`user:` rooms *and* `generation:<jobId>` rooms. The `Notification` model/route/`utils/notify.js` task (`p7-notification-model-route`) stays as written and should run **inside U4's wave 2** so `notify.js` is written once against the live `io`. `p7-socket-client` becomes U4's `useSocket` hook (shared by notifications and generation). |
| **8** (portal scoping + `Query` model/routes) | Must land **before U9**. U9 re-skins the same 10 portal files; doing it first then re-scoping them means editing them twice. `Query` model + `/api/queries` comes from Phase 8 — U8/U9 only add the *Queries tab UI* on top of it; do not define a second Query model. |
| **9** (verify/smoke scripts) | Extend after U4: `verifyConstraints.js` must load the grid via `getScheduleGrid()` instead of importing `TIME_SLOTS`; `smokeApi.js` must handle 202 + poll `/generate/:jobId/progress` instead of asserting 201. |
| **10** (DELIVERABLE.md, CLAUDE.md) | Absorbs U10; document `SystemConfig`, `/api/config`, async generation, socket contract, and the new component library. |

**Recommended order:** `U0 ‖ U1` → `U2` → `U3` → `U4 (+ Phase 7 notifications)` → `Phase 8` → `U5` → `U6` → `U7` → `U8` → `U9` → `U10 (+ Phase 9, 10)`.

Rationale: U0/U1 are leaves (no dependents broken); U2/U3 are the shared vocabulary every later page consumes; U4 unblocks both generation UI and live notifications; Phase 8's data scoping must precede the portal re-skin.

---

## U0 — UI primitives, deps, shared libs

**Goal:** every primitive and cross-page constant the later phases import exists, with zero visual change to shipped pages.

### NEW — `frontend/src/components/ui/`

Generate in "new-york" JSX style, tokens only (`bg-popover`, `text-popover-foreground`, `border-border`, `ring-ring`), `data-[state=open]:animate-in data-[state=closed]:animate-out fade-in-0 zoom-in-95 duration-150`:

| File | Dep |
|---|---|
| `dialog.jsx` | `@radix-ui/react-dialog` |
| `alert-dialog.jsx` | `@radix-ui/react-alert-dialog` |
| `tabs.jsx` | `@radix-ui/react-tabs` |
| `tooltip.jsx` | `@radix-ui/react-tooltip` |
| `progress.jsx` | `@radix-ui/react-progress` |
| `separator.jsx` | `@radix-ui/react-separator` |
| `switch.jsx` | `@radix-ui/react-switch` |
| `checkbox.jsx` | `@radix-ui/react-checkbox` |
| `scroll-area.jsx` | `@radix-ui/react-scroll-area` |
| `sheet.jsx` | reuses `@radix-ui/react-dialog` |
| `skeleton.jsx` | none (`animate-pulse rounded-md bg-muted`) |
| `alert.jsx` | none (cva variants: `default`, `info`, `success`, `warning`, `destructive`) |
| `sonner.jsx` | `sonner` (`<Toaster theme={isDark?'dark':'light'} toastOptions={{classNames:{toast:'bg-card text-card-foreground border-border'}}} />`) |

`tabs.jsx` must ship **two** variants via a `variant` prop on `TabsList`: `"underline"` (default — `border-b`, active item gets `border-b-2 border-primary text-foreground`, matching the reference's tab style) and `"pill"` (`bg-muted rounded-md`).

### NEW — libs

- `frontend/src/lib/nav.js` — single source of truth, kills the 5 duplicate `ADMIN_NAV` arrays and the 4 duplicate student navs.

  ```
  export const ADMIN_NAV, FACULTY_NAV, STUDENT_NAV      // [{ id, label, path, icon, badgeKey? }]
  export const ADMIN_QUICK_ACTIONS                       // [{ id, label, path, icon }]
  export function navForRole(role)                       // → { brand, nav, quickActions }
  ```

  `ADMIN_NAV`: Dashboard, Create Timetable (`/create-timetable`), Generate (`/generate-timetable`), Timetables (`/view-timetable`), Courses, Faculty, Rooms, Students, Users, Infrastructure (`/infrastructure`), Notifications (`badgeKey:'unread'`).

  `ADMIN_QUICK_ACTIONS`: Create Timetable, Manage Students, Manage Teachers, Manage Rooms, Manage Courses, Infrastructure & Policy.

- `frontend/src/lib/schedule.js` — pure functions, no React:

  ```
  buildGrid(config)                     → { days[], slots[{start,end,label,index}], breaks[{name,start,end}], rows[] }
  slotRows(grid)                        → ordered [{kind:'slot'|'break', ...}] for grid rendering
  resolveEntry(entry, maps)             → { course, faculty, room, type, code, label }
  entryKey(entry)                       → `${day}|${startTime}`
  groupByDay(schedule, grid)            → Map<day, entry[]> (slot-ordered)
  filterEntries(schedule, filters, maps)→ entry[]   // day/facultyId/roomId/batch/search
  weekStrip(schedule, { weekOffset, grid }) → [{ date, dayName, isToday, entries }]
  colorTokenFor(entry, mode, maps)      → 'chart-1'…'chart-5'  // mode: 'type' | 'course'
  computeStats(schedule, grid, maps)    → { totalClasses, hoursPerWeek, rooms, faculty, utilization }
  ```

  `colorTokenFor(_, 'type')` delegates to the existing `courseTypeToken` in `lib/status.js`; `'course'` mode hashes the course code into `chart-1..5` so a per-subject legend is stable.

### MODIFY

- `frontend/src/index.css` — additive only: `--color-chart-6/7/8` (reuse hue-rotated variants of chart-1..5 for larger legends) and a `@media print` addition: `.print-table th, .print-table td { padding: 4px 6px; font-size: 10pt }` and `@page { size: A4 landscape; margin: 10mm }`.
- `frontend/package.json` — add the radix deps above + `sonner` + `recharts`.
- `frontend/src/main.jsx` (or `App.jsx`) — mount `<Toaster />` and `<TooltipProvider>` once at root.

### REMOVE

Nothing yet (deletions happen in U9/U10 once callers migrate).

**Verify:** `npm run lint && npm run build` pass; a throwaway route rendering each new primitive shows correct light/dark/print; no existing page's rendering changes (`git diff` touches no page file except `App.jsx` root wrappers).

---

## U1 — Backend `SystemConfig` + config-driven scheduling grid

**Goal:** working days, period duration, start/end, breaks, max periods/day, max consecutive hours come from a DB document; hard-coded `DAYS`/`TIME_SLOTS`/`BREAK_SLOT` become the *fallback default*, not the law.

### NEW — `backend/models/SystemConfig.js`

Trimmed to what our scheduler/validator can actually honor (everything here is enforced somewhere; nothing is decorative):

```js
{
  key: { type: String, default: 'active', unique: true, immutable: true },
  workingDays: { type: [String], default: ['Monday','Tuesday','Wednesday','Thursday','Friday'] },
  startTime: { type: String, default: '09:00' },
  endTime:   { type: String, default: '17:30' },
  periodDurationMin: { type: Number, default: 60, min: 30, max: 120 },
  breakDurationMin:  { type: Number, default: 15, min: 0,  max: 30 },
  breaks: [{ name: String, start: String, end: String }],   // default: [{name:'Lunch',start:'12:15',end:'13:15'}]
  slots:  [{ start: String, end: String }],                 // OPTIONAL explicit override — wins over derivation
  maxPeriodsPerDay: { type: Number, default: 6, min: 1, max: 12 },
  maxConsecutiveHours: { type: Number, default: 3, min: 1, max: 6 },
  maxDailyHoursPerFaculty: { type: Number, default: 6, min: 1, max: 10 },
  weeksPerSemester: { type: Number, default: 13, min: 8, max: 24 },
  avoidFirstLastPeriod: { type: Boolean, default: false },
  preferMorningLabs:    { type: Boolean, default: true  },
  balanceFacultyWorkload: { type: Boolean, default: true },
  prioritizeFacultyPreferences: { type: Boolean, default: true },
  updatedBy: String,
}  // timestamps
```

Reference fields intentionally dropped: `minGapBetweenExams`, `examWeeks`, `vacationWeeks`, `requireLabAssistant`, `allowSplitSessions`, `groupSimilarSubjects`, `prioritizePopularSlots` — we have no exam/section/assistant model to honor them, and surfacing unenforced switches is a lie in the UI. `academicCalendar` dates are kept only as `weeksPerSemester` (the one value `getWeeklySessions` consumes).

### MODIFY — `backend/utils/schedulingConstants.js`

Keep `WEEKS`, `DAYS`, `TIME_SLOTS`, `BREAK_SLOT`, `slotLabel` exports (back-compat) and add:

```js
export const DEFAULT_GRID = { days: DAYS, slots: TIME_SLOTS, breaks: [BREAK_SLOT], weeks: WEEKS,
                              maxPeriodsPerDay: 6, maxConsecutiveHours: 3, maxDailyHoursPerFaculty: 6, flags: {...} };
export function getScheduleGrid(config) -> { days, slots, breaks, weeks, maxPeriodsPerDay,
                                             maxConsecutiveHours, maxDailyHoursPerFaculty, flags }
```

`getScheduleGrid`: `config?.slots?.length` → use verbatim; else walk from `startTime` in `periodDurationMin` steps, inserting `breakDurationMin` between periods, skipping any window overlapping a `breaks[]` entry, stopping at `endTime` or `maxPeriodsPerDay`. `null`/`undefined` config → `DEFAULT_GRID`. Pure and memoizable by `config.updatedAt`.

### NEW — `backend/routes/configRoute.js` (mounted `/api/config` in `server.js`)

- `GET /` (`requireAuth`) → config doc, upserting defaults on first read.
- `PUT /` (`requireAuth, requireRole('admin')`) → validate (`endTime > startTime`, ≥1 working day, breaks inside the day, slots non-overlapping), set `updatedBy`, save, return `{ config, grid }`. Emits a `config:updated` socket event once U4 lands.
- `GET /grid` (`requireAuth`) → `getScheduleGrid(config)` — the single shape the frontend renders from.

### MODIFY — grid threading (the core of this phase)

All four consumers take an optional `grid` and default to `DEFAULT_GRID`, so existing callers keep working:

- `backend/utils/geneticScheduler.js` — `generateGeneticTimetable({ courses, faculty, rooms, options, grid = DEFAULT_GRID })`. Replace every module-scope `DAYS`/`TIME_SLOTS` read (lines ~188-760) with `grid.days`/`grid.slots`. `buildAvailabilityMask`, `buildPreferenceMask`, `buildProblem`, `sampleSession`, `decode`, `evaluate` all take/close over `problem.grid`. Add soft penalties for the new flags: `avoidFirstLastPeriod` (+2 per first/last-slot session), `maxConsecutiveHours` (+5 per run exceeding), `maxDailyHoursPerFaculty` (+5 per overflow hour), `preferMorningLabs` (+1 per lab after midday).
- `backend/utils/localScheduler.js` — `generateLocalTimetable({ ..., grid = DEFAULT_GRID })`.
- `backend/utils/scheduleValidator.js` — `validateSchedule(schedule, courses, faculty, rooms, grid = DEFAULT_GRID)`; day check against `grid.days`, slot match against `grid.slots`, break check loops `grid.breaks`, plus new hard checks for `maxPeriodsPerDay` and `maxConsecutiveHours`.
- `backend/utils/timetableGenerator.js` — delete its private `DAYS`/`TIME_SLOTS`/`BREAK_SLOT`/`getWeeklySessions` (lines 46-110); import from `schedulingConstants`/`schedulingHelpers` and take `grid` so the AI prompt lists the configured slots.
- `backend/utils/schedulingContext.js` — `loadSchedulingContext()` also loads `SystemConfig` and returns `{ ..., config, grid }`.
- `backend/utils/schedulingHelpers.js` — `getWeeklySessions(course, weeks = WEEKS)`.

### NEW — `backend/scripts/seedSystemConfig.js`

Upserts the active config with **explicit `slots[]` equal to today's six `TIME_SLOTS`** and `breaks:[{name:'Lunch',start:'12:15',end:'13:15'}]`. Add `"seed:config"` to `backend/package.json` scripts, and call it from `seedRealisticData.js` so a fresh DB is grid-identical to today.

**Verify:** `node scripts/seedSystemConfig.js` then `node scripts/gaSmoke.js` → identical schedule to before (seeded run is byte-identical). `GET /api/config/grid` returns the six slots. Set `workingDays` to Mon–Sat + `maxPeriodsPerDay: 7`, drop `slots[]`, regenerate → schedule uses Saturday and 7 derived periods; `verifyConstraints.js` passes. Non-admin `PUT /api/config` → 403.

---

## U2 — App shell v2 + common components

**Goal:** the reference's sticky header + collapsible sidebar + quick actions + chatbot FAB, on our tokens, used by all three roles.

### MODIFY — `frontend/src/components/AppShell.jsx`

Extend without breaking existing callers (`nav`, `brand`, `onLogout`, `children` keep working):

```jsx
<AppShell
  brand={{ title, subtitle, icon }}
  nav={[{ id, label, path, icon, badge?, section? }]}
  quickActions={[{ id, label, path, icon }]}   // renders a "Quick Actions" group below "Navigation"
  header={{ notifications: n, onNotificationsClick, settingsPath, actions }}
  collapsible                                  // default true; state in localStorage 'shell.sidebar'
  chatbot={{ context }}                        // renders <ChatbotFab/> when present
  onLogout
>
```

- Sidebar `w-72` ↔ `w-20`, `transition-[width] duration-200`; collapsed shows icon-only with `<Tooltip>` labels; section labels (`Navigation`, `Quick Actions`) are `text-[11px] uppercase tracking-wide text-muted-foreground px-3 py-2`, hidden when collapsed. Persisted in `localStorage`.
- Sticky header on **all** breakpoints (today it's `lg:hidden`): icon tile + title/subtitle, then `ThemeToggle`, bell with `badge` (`absolute -top-0.5 -right-0.5 size-4 rounded-full bg-destructive text-[10px]`), settings gear → `/infrastructure`, logout. `print:hidden`.
- Mobile: sidebar becomes a `<Sheet side="left">` triggered by a hamburger in the header; the current horizontal scroll-nav is removed.

### NEW — `frontend/src/components/common/`

| File | Props |
|---|---|
| `StatCard.jsx` | `{ label, value, icon, delta?, deltaLabel?, tone='default'\|'success'\|'warning'\|'destructive', href?, loading? }` |
| `SectionCard.jsx` | `{ title, description, icon, actions, footer, padded=true, children }` |
| `CategoryCard.jsx` | `{ icon, title, description, status:'complete'\|'in-progress'\|'pending', items:[{label,value}], onClick, disabled }` — status pill via `StatusBadge`, trailing `ArrowRight`, `hover:border-primary/40` |
| `Stepper.jsx` | `{ steps:[{id,label,description,icon}], current, completed:[ids], onStepClick, orientation='horizontal' }` |
| `ProgressChecklist.jsx` | `{ steps:[{id,label}], currentIndex, status:'running'\|'done'\|'failed', percentage, detail }` — vertical, `Loader2 animate-spin` / `CheckCircle2` / `XCircle` |
| `Callout.jsx` | `{ tone='info', title, icon, children }` — wraps `ui/alert` |
| `EmptyState.jsx` | `{ icon, title, description, action }` |
| `ConfirmDialog.jsx` | `{ open, onOpenChange, title, description, confirmLabel='Confirm', destructive, onConfirm, loading }` |
| `FilterBar.jsx` | `{ filters:[{id,label,type:'select'\|'search',options,value,placeholder}], onChange, onReset, right }` |
| `ChatbotFab.jsx` | `{ context }` — fixed `bottom-6 right-6`, `size-12 rounded-full bg-primary shadow-md`, opens `<Sheet side="right">` hosting the restyled `Chatbot` |

### MODIFY

- `frontend/src/components/Chatbot.jsx` — replace hardwired white/blue classes with tokens (`bg-card`, `bg-primary text-primary-foreground` bubbles, `border-border`); remove its own floating shell (now `ChatbotFab`'s job); keep the `/api/ai/chat` call and `react-markdown` rendering.
- `frontend/src/components/Data-table.jsx` — retokenize (drop `slate-*`), add `entityName` prop so copy stops saying "courses", add `loading` → `Skeleton` rows and `empty` → `EmptyState`.

**Verify:** all existing admin pages still render with `nav={ADMIN_NAV}` unchanged; collapse persists across reload; keyboard tab order reaches every nav item collapsed and expanded; print hides shell chrome.

---

## U3 — Shared timetable component set

**Goal:** one renderer replaces the four in the repo (admin matrix in `pages/Timetable.jsx:96`, faculty day accordion, two student row lists).

### NEW — `frontend/src/components/timetable/`

```
TimetableGrid.jsx
  { schedule, grid, maps:{courses,faculty,rooms}, viewMode='standard'|'byFaculty'|'byRoom'|'byBatch',
    groupValue, colorMode='type'|'course', filters, density='comfortable'|'compact',
    onCellClick, printable=false, showLegend=true, highlightConflicts=[] }
  rows = slots (+ break rows spanning all day columns, muted, label from grid.breaks[].name),
  cols = grid.days. Cell = course code + name, faculty, room, chip for type;
  left border 2px in colorTokenFor(...). printable → <table class="print-table"> (institutional
  layout mirroring the reference TimetableDisplay) instead of CSS grid.

TimetableListView.jsx  { schedule, grid, maps, groupBy='day'|'course', filters }
TimetableLegend.jsx    { mode, items:[{label, token}] }
TimetableCard.jsx      { timetable, counts:{classes,conflicts}, onView, onPublish, onExport, onDelete, busy }
QualityScore.jsx       { score, breakdown:{constraintCompliance,roomUtilization,facultyBalance,studentConvenience},
                         size='sm'|'lg' }   // bar tinted success ≥80 / warning ≥60 / destructive
ConflictsDialog.jsx    { open, onOpenChange, conflicts, canResolve, onResolve(index, note), maps }
CommentsDialog.jsx     { open, onOpenChange, comments, onAdd(text), busy }
WeekStrip.jsx          { days, weekOffset, onPrev, onNext, onToday, onEntryClick }
DataValidationPanel.jsx{ entities:[{id,label,icon,count,issues:[],status}], onRefresh, loading }
AlgorithmCard.jsx      { id, name, description, icon, advantages:[], considerations:[],
                         selected, recommended, onSelect, disabled, disabledReason }
GenerationProgress.jsx { steps, currentIndex, percentage, generation, maxGenerations,
                         bestFitness, hardViolations, status, error, onCancel }
```

### NEW — `frontend/src/hooks/`

- `useSystemConfig.js` — context provider + hook; fetches `/api/config/grid` once, exposes `{ grid, config, loading, refresh }`. Provider mounted in `App.jsx` inside `ProtectedRoute`.
- `useTimetableData.js` — `useTimetableData({ department, semester, year, academicYear, status })` → `{ timetables, courses, faculty, rooms, maps, loading, error, refresh }`; builds `Map`s by `_id` once so pages stop re-deriving name lookups.

### NEW — `frontend/src/components/charts/` (recharts, tokens only)

- `ChartFrame.jsx` `{ title, description, actions, height=260, children }` — `ResponsiveContainer` + card.
- `DepartmentPie.jsx` `{ data:[{name,value}] }`
- `WeeklyActivityArea.jsx` `{ data:[{label,value}], dataKey }`
- `UtilizationBar.jsx` `{ data:[{name,value}], max=100 }`

Colors are literal `"var(--chart-1)"`…`"var(--chart-5)"` strings (recharts passes them through to SVG `fill`/`stroke`), so dark mode and print follow the tokens with no JS. Axis/grid use `var(--border)` / `var(--muted-foreground)`; tooltip is a custom `content` component rendered with `bg-popover border-border` rather than recharts' default.

**Verify:** a scratch page renders `TimetableGrid` from a saved timetable in all 4 view modes and both color modes, matching the current admin grid's data; `printable` renders a clean A4 landscape table; charts legible in light/dark.

---

## U4 — Socket.io server + async generation + quality/conflicts/comments backend

**Goal:** `/generate` returns `202 {jobId}` immediately, GA progress streams live. **This supersedes IMPLEMENTATION_PLAN Phase 7's `p7-socket-server` task.**

### MODIFY — `backend/server.js`

```js
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: CLIENT_ORIGIN, credentials: true } });
io.use(jwtHandshakeAuth);            // token from handshake.auth.token → socket.data.user, else next(err)
io.on('connection', s => {
  s.join(`role:${s.data.user.role}`);
  s.join(`user:${s.data.user.userId}`);
  s.on('generation:subscribe', jobId => { if (s.data.user.role === 'admin') s.join(`generation:${jobId}`); });
  s.on('generation:unsubscribe', jobId => s.leave(`generation:${jobId}`));
});
app.set('io', io);
httpServer.listen(PORT, ...);        // app.listen is removed
```

Add `socket.io` to `backend/package.json`.

### NEW — `backend/utils/generationJobs.js`

In-memory registry (documented single-process limitation):

```js
createJob({ userId, params }) -> jobId          // crypto.randomUUID()
getJob(jobId) -> { jobId, status:'queued'|'running'|'completed'|'failed', step, stepIndex,
                   percentage, generation, maxGenerations, bestFitness, hardViolations,
                   softPenalty, timetableId, error, params, startedAt, updatedAt }
updateJob(jobId, patch)  // also emits to `generation:${jobId}` via app.get('io')
hasActiveJob() -> boolean                        // replaces the generationInFlight boolean
sweep()                                          // setInterval, drops terminal jobs older than 30 min
export const GENERATION_STEPS = [
  'Loading scheduling data', 'Validating input data', 'Building constraint model',
  'Initialising population', 'Evolving schedule', 'Validating final schedule', 'Saving timetable'];
```

### MODIFY — `backend/utils/geneticScheduler.js`

```js
export async function generateGeneticTimetable({ courses, faculty, rooms, options, grid, onProgress })
```

- Every `progressEvery` generations (default `Math.max(1, Math.floor(maxGenerations / 50))`): `await onProgress({ generation, maxGenerations, bestFitness, hard, soft, elapsedMs })` then `await new Promise(r => setImmediate(r))` to yield the event loop. Same yield inside the initial-population loop.
- **Determinism is preserved** because the RNG stream is untouched by yielding — the smoke test asserting seed-42 reproducibility must still pass.
- Callers to update: `backend/routes/timetableRoute.js`, `backend/scripts/gaSmoke.js` (add `await`).

### MODIFY — `backend/routes/timetableRoute.js`

- `POST /generate` (admin): validate body → `409` if `hasActiveJob()` → `createJob` → `res.status(202).json({ jobId, steps: GENERATION_STEPS })` → `setImmediate(() => runGenerationJob(app, jobId))`.
- NEW `runGenerationJob(app, jobId)` — the current `handleGeneration` body, refactored: each stage calls `updateJob` with `step`/`stepIndex`/`percentage`; the GA's `onProgress` maps generation → `percentage = 45 + 35 * generation/maxGenerations` inside the "Evolving schedule" step. On success: compute quality, save, `updateJob({status:'completed', timetableId})`, emit `generation:completed`; also `createAndEmit` the notification (Phase 7's `notify.js`). On throw: `updateJob({status:'failed', error})` + `generation:failed`.
- NEW `GET /generate/:jobId/progress` (admin) → the job record, `404` if unknown (polling fallback; frontend uses it when the socket is not connected).
- `POST /generate-local` keeps the synchronous 201 contract (used by scripts/smoke).
- NEW `PATCH /:id/conflicts/:index/resolve` (admin) `{ note }` → sets `resolved/resolvedBy/resolvedAt/resolutionNote`, recomputes `metadata.conflictCount` and quality, returns doc.
- NEW `POST /:id/comments` (any auth) `{ text }` → pushes `{ userId, name, role, text, createdAt }`; `GET /:id` already returns them.

### NEW — `backend/utils/qualityScore.js`

```js
computeQualityScore({ hardViolations, softPenalty, sessionCount, utilizationRate, facultyLoads, conflictCount })
 -> { overall, breakdown: { constraintCompliance, roomUtilization, facultyBalance, studentConvenience } }
```

`constraintCompliance = 100 - 25*hard - min(40, softPenalty/sessionCount*10)`; `roomUtilization = 100 - |utilizationRate - 75| * 2` (clamped); `facultyBalance = 100 - stdDev(loads)/mean * 100`; `studentConvenience` penalizes per-day gaps and >`maxConsecutiveHours` runs. `overall` = weighted 0.4/0.2/0.2/0.2, clamped 0–100, rounded.

### MODIFY — `backend/models/Timetable.js`

- `conflicts[]`: add `severity` (`low|medium|high|critical`, default `medium`), `resolved` (Boolean), `resolvedBy`, `resolvedAt`, `resolutionNote`.
- `metadata`: add `qualityScore: Number`, `qualityBreakdown: { constraintCompliance, roomUtilization, facultyBalance, studentConvenience }`, `jobId: String`.
- NEW top-level `comments: [{ userId, name, role, text, createdAt }]`.

(The strict-schema trap from IMPLEMENTATION_PLAN still applies — anything new must be declared or it is silently dropped.)

### NEW — `frontend/src/hooks/`

- `useSocket.js` — singleton `io(API_ORIGIN, { auth:{ token }, autoConnect:true })`, reconnect handling, `{ socket, connected }`. Shared with Phase 7's notification badge.
- `useGenerationProgress.js` — `useGenerationProgress(jobId)` → `{ status, step, stepIndex, percentage, generation, maxGenerations, bestFitness, hardViolations, timetableId, error }`. Subscribes to `generation:<jobId>`; if `!connected` after 2 s, falls back to polling `/generate/:jobId/progress` every 1.5 s; always does one final fetch on terminal status.

### NEW — `frontend/package.json`: `socket.io-client`.

**Verify:** `POST /api/timetables/generate` returns 202 within ~100 ms; a socket client receives ≥10 `generation:progress` events with monotonically non-decreasing `percentage` and ends on `generation:completed`; with the socket blocked, polling drives the same UI; seed 42 twice → identical schedules (GA determinism survives the yields); second concurrent generate → 409; non-admin `generation:subscribe` does not join the room; `node --check` + backend boots on `httpServer.listen`.

---

## U5 — `/generate-timetable` page

**Goal:** reference's Generate flow: validation → algorithm selection → CTA → live progress → complete.

### NEW — `frontend/src/pages/GenerateTimetable.jsx` (route `/generate-timetable`)

Sections, top to bottom:

1. **Data Validation Status** (`DataValidationPanel`) — entities Courses / Faculty / Rooms / Students / Configuration; counts from `useTimetableData`; issues computed client-side (courses with no eligible faculty by specialization, no room of the required type, faculty with no availability, rooms below max class size, config with 0 working days). Footer `Callout`: `success` "Ready to generate" or `warning` "N minor issues — generation may fall back".
2. **Algorithm Selection** — `AlgorithmCard` × 4: **Genetic** (recommended, maps `method:'genetic'`), **Backtracking** (our local scheduler — the reference's "CSP" slot, honestly named), **AI-assisted** (Gemini, `disabled` + `disabledReason` when `/api/config` reports no key), **Hybrid** (GA → backtracking fallback, which is today's actual default). Each with Advantages / Considerations lists. No "Greedy" card — we have no greedy engine and shipping a dead option is worse than four honest ones.
3. **Advanced Settings** (collapsible) — `seed`, `populationSize`, `maxGenerations`, `mutationRate`, `elitism`, `timeLimitMs`; optimization-goal checkboxes bound to the `SystemConfig` flags (`balanceFacultyWorkload`, `preferMorningLabs`, `avoidFirstLastPeriod`, `prioritizeFacultyPreferences`) with a note that they are saved to system config, plus a link to `/infrastructure`.
4. **Ready to Generate** — target summary (dept/year/sem/AY read from query string or selects) + large CTA; disabled while `hasActiveJob`.
5. **Progress** — `GenerationProgress` fed by `useGenerationProgress`, plus a live fitness sparkline (reuse `GARunSummary`'s SVG chart on the streaming `fitnessHistory`).
6. **Complete** — check icon, 3 mini stats (classes, quality score, conflicts), buttons View / Download / Regenerate.

### MODIFY — `frontend/src/components/GARunSummary.jsx` — accept `live` (partial history, no `onReproduce`).

**Verify:** generate from the page → checklist advances step by step, fitness chart animates, completion navigates to `/view-timetable/:id`; kill the socket mid-run → polling keeps the UI live; a forced failure (delete all lab rooms) shows the failed step with the server's error text.

---

## U6 — `/create-timetable` wizard + `/infrastructure`

### NEW — `frontend/src/pages/CreateTimetable.jsx` (route `/create-timetable`)

`Stepper`: Basic Info → Teachers → Students → Classrooms → Programs & Courses → Infrastructure & Policy.

- **Step 1**: 2-col `Select`s — Academic Year, Department, Year (1–4), Semester. Options derived from distinct `Course` values (same source `pages/Timetable.jsx` already uses), not hard-coded. Persisted to `sessionStorage` under `createTimetable.draft`.
- **Steps 2–5**: `CategoryCard` hub — Teachers / Students / Classrooms / Programs & Courses / Infrastructure & Policy. Each shows live counts scoped to step-1 selections, a status pill (`complete` when count ≥ threshold and no blocking issues, `in-progress` when partial, `pending` when zero), 2–3 bullet sub-items, and routes to the existing management page with `?returnTo=/create-timetable`.
- Footer `Callout` (info) + **Generate Timetable** CTA → `/generate-timetable?department=…&year=…&semester=…&academicYear=…`, disabled until step 1 is complete and every category is at least `in-progress`.

### NEW — `frontend/src/pages/Infrastructure.jsx` (route `/infrastructure`)

"System Configuration" header + 4 `StatCard`s (Working days, Periods/day, Period duration, Total weekly slots) + `SectionCard` with underline `Tabs`:

| Tab | Fields (all bound to `SystemConfig`) |
|---|---|
| General Policies | `maxPeriodsPerDay`, `maxConsecutiveHours`, `maxDailyHoursPerFaculty`, `weeksPerSemester` |
| Working Hours | `startTime`, `endTime`, `periodDurationMin`, `breakDurationMin`, `workingDays` multi-toggle, `breaks[]` editor; right column = **Current Schedule Preview** card showing `getScheduleGrid` output (slot list + break rows + totals), recomputed client-side via `lib/schedule.buildGrid` before saving |
| Advanced Constraints | `avoidFirstLastPeriod`, `preferMorningLabs`, `balanceFacultyWorkload`, `prioritizeFacultyPreferences` + **Constraint Summary** `Callout` |

Each tab has its own Save (`PUT /api/config`) with dirty tracking and a `ConfirmDialog` warning that changing the grid invalidates existing draft timetables. Reference's "Academic Calendar" and "Holidays & Events" tabs are **omitted** — nothing downstream consumes them; `weeksPerSemester` lives under General Policies instead.

### MODIFY — `frontend/src/App.jsx` — add both routes under `ProtectedRoute role="admin"`.

**Verify:** wizard state survives navigating to `/faculty` and back; preview card matches `GET /api/config/grid` after save; saving a 4-day week then generating produces a 4-column grid everywhere (admin, faculty, student).

---

## U7 — `/view-timetable` list + detail

### NEW — `frontend/src/pages/ViewTimetable.jsx` (route `/view-timetable`)

`FilterBar` (department, year, semester, academicYear, status, search) + `TimetableCard` list (name + status pill, dept•year•sem, created/published dates, `QualityScore` bar, classes/conflicts counts, View / Publish / Export). `EmptyState` when none. `ConfirmDialog` for Publish and Delete.

### NEW — `frontend/src/pages/ViewTimetableDetail.jsx` (route `/view-timetable/:id`)

- **Info card**: fields + `StatusBadge` + `QualityScore size="lg"` with breakdown + Conflicts button (count badge) + Comments button.
- **Controls card**: view-mode `Select` (Standard / By Faculty / By Room / By Batch), grid↔list toggle, color-mode toggle (type ↔ course), Comment / Export CSV / Export JSON / Print, then `FilterBar` (Day, Faculty, Room, Batch, search).
- **Body**: `TimetableGrid` or `TimetableListView`.
- **Statistics card**: 4 big numbers from `computeStats`.
- `ConflictsDialog` (severity-colored cards, Resolve + note → `PATCH /:id/conflicts/:index/resolve`, resolved list collapsed) and `CommentsDialog` (→ `POST /:id/comments`).

### MODIFY

- `frontend/src/App.jsx` — add routes; `/timetables` becomes `<Navigate to="/view-timetable" replace />` (alias kept).
- `frontend/src/pages/Timetable.jsx` — reduced to the *generation-form-free* legacy shell is not worth keeping: its grid (lines 96-320), `ADMIN_NAV` (41), `DAYS`/`TIME_SLOTS` (62-85) and export helpers are superseded. **Plan: delete the file in U10** once `/create-timetable` + `/generate-timetable` + `/view-timetable` cover its three jobs; until then leave it reachable at `/timetables-legacy` for one phase so the migration is revertible.

**Verify:** all 4 view modes render the same class count; filters compose; Publish archives siblings and flips the pill; CSV/JSON export unchanged byte-wise from the current route; Print produces the institutional table with break rows; resolving a conflict decrements the badge and bumps the quality score.

---

## U8 — Admin dashboard

### MODIFY — `frontend/src/pages/Dashboard.jsx`

Replace the flat 10-tile layout with the reference structure, using `lib/nav.js` and the new shell:

- 4 `StatCard`s (Courses, Faculty, Rooms, Published timetables) with deltas.
- Underline `Tabs`: **Overview** / **Timetables** / **Analytics** / **Queries**.
  - Overview: `DepartmentPie` (courses by department) + `WeeklyActivityArea` (classes per weekday from the active timetable) side by side; `UtilizationBar` (room utilization) full width; Recent Timetables (`TimetableCard` compact) + Notifications list.
  - Timetables: filtered list reusing `ViewTimetable`'s card list.
  - Analytics: faculty workload distribution + slot occupancy heat row, both from `computeStats`.
  - Queries: consumes **Phase 8's** `/api/queries` (admin list + reply). If Phase 8 has not landed, render `EmptyState` "Queries module not enabled" — do **not** create a second `Query` model.
- `AppShell` gets `quickActions={ADMIN_QUICK_ACTIONS}` and `chatbot`.

**Verify:** counts match the API; charts readable in dark mode and print; tab state in the URL hash so refresh keeps position.

---

## U9 — Portal migrations (faculty, student) + remaining admin pages

**Precondition: IMPLEMENTATION_PLAN Phase 8 must be complete** (own-data scoping), otherwise these files get rewritten twice.

| File | Action |
|---|---|
| `pages/Rooms.jsx` | drop custom slate shell → `AppShell` + `nav.js` + `PageHeader` + `DataTable` |
| `pages/Notifications.jsx` | same; add live badge via `useSocket` |
| `pages/FacultyPortal.jsx` | rebuild as faculty dashboard: `WeekStrip` + 4 `StatCard`s + tabs My Schedule / My Courses / Queries / Analytics / Notifications |
| `pages/FacultyTimetable.jsx` | **delete the day-accordion renderer**; use `TimetableGrid` (`viewMode="byFaculty"`, `groupValue=user.facultyId`) |
| `pages/FacultyCourses.jsx` | course cards on `SectionCard`; remove own sidebar |
| `pages/FacultyNotifications.jsx`, `FacultyProfile.jsx` | `AppShell` + tokens; strip inline styles |
| `pages/StudentPortal.jsx` | student dashboard: `WeekStrip` + stat tiles + tabs |
| `pages/MyTimetable.jsx` | **delete row-list renderer**; use `TimetableGrid` (`viewMode="byBatch"`) |
| `pages/MyCourses.jsx` | **delete second row-list renderer**; course cards |
| `pages/StudentNotifications.jsx`, `MyProfile.jsx` | `AppShell` + tokens; remove inline style objects |
| `pages/Login.jsx` | tokens only for the inline style objects (no redesign — out of scope) |

All 10 portal files lose their private nav arrays and `ThemeToggle`/logout code in favour of `navForRole(role)` + `AppShell`.

**Verify:** `grep -rn "style={{" frontend/src/pages` returns nothing outside chart internals; `grep -rn "ADMIN_NAV\|const NAV" frontend/src/pages` returns nothing; all three roles' pages render identically in light/dark; faculty and student see only their own entries (Phase 8 guarantee preserved).

---

## U10 — Cleanup, dedup, docs, final verification

- **DELETE** `frontend/src/pages/Timetable.jsx` (and the `/timetables-legacy` route) once U5–U7 are signed off; keep `/timetables` → `/view-timetable` redirect.
- **DELETE** the duplicated `DAYS`/`TIME_SLOTS` copies in the frontend (now `useSystemConfig`) — closes the "duplicated logic that must stay in sync" item in `CLAUDE.md` for the frontend side.
- **MODIFY** `CLAUDE.md`: new `SystemConfig`/`/api/config`/grid derivation section; async generation + socket contract; component library map; note that `DAYS`/`TIME_SLOTS` are now defaults, not truth.
- **MODIFY** `DELIVERABLE.md` (Phase 10): add UI replication summary + screenshots list.
- **MODIFY** `backend/scripts/verifyConstraints.js` — load grid from config; `backend/scripts/smokeApi.js` — handle 202 + poll.

---

## Final test matrix

| # | Scenario | Expected |
|---|---|---|
| 1 | `seedSystemConfig` then seed-42 GA twice | identical schedules; grid = today's 6 slots |
| 2 | Config → Mon–Sat, 7 periods, 45 min, no `slots[]` | admin grid, faculty grid, student grid, CSV export and print all show 6 days × 7 periods |
| 3 | `POST /generate` | 202 + `jobId` in <200 ms; ≥10 progress events; `generation:completed` carries `timetableId` |
| 4 | Socket blocked (devtools offline) | polling fallback drives the same checklist; completion still navigates |
| 5 | Two concurrent generates | second → 409, UI shows "already in progress" |
| 6 | Non-admin emits `generation:subscribe` | room not joined; no progress leaked |
| 7 | Non-admin `PUT /api/config` | 403; UI hides `/infrastructure` from non-admin nav |
| 8 | Resolve a conflict | badge decrements, quality score recomputes, resolved list grows |
| 9 | Add a comment as faculty | visible to admin on the detail page |
| 10 | View modes ×4 × color modes ×2 | class count identical in every combination |
| 11 | Print `/view-timetable/:id` | A4 landscape institutional table, break rows, legend, no shell chrome |
| 12 | Light/dark toggle on every new page | no hard-coded color escapes (visual diff) |
| 13 | Sidebar collapse | persists across reload and across roles |
| 14 | `npm run lint && npm run build` | clean |
| 15 | `npm run verify` / `npm run smoke` | pass against a config-derived grid |
| 16 | Keyboard-only traversal of wizard, tabs, dialogs | focus trap in dialogs, visible `ring` on all controls |

---

## Workflow tiering (runner args per WORKFLOW_PLAN.md rules)

`opus` = default (omit model). Downgrade only for mechanical, fully-specified work; never for the scheduling pipeline, socket/auth boundary, or config→grid threading.

| Phase | Wave | Task id | Model | Files |
|---|---|---|---|---|
| U0 | 1 | `u0-ui-primitives` | sonnet | `components/ui/{dialog,alert-dialog,tabs,tooltip,progress,separator,switch,checkbox,scroll-area,sheet,skeleton,alert,sonner}.jsx`, `package.json` |
| U0 | 1 | `u0-nav-lib` | fable | `lib/nav.js` |
| U0 | 2 | `u0-schedule-lib` | sonnet | `lib/schedule.js` |
| U0 | 2 | `u0-css-tokens` | fable | `index.css` (chart-6..8, print table rules) |
| U1 | 1 | `u1-config-model-grid` | **opus** | `models/SystemConfig.js`, `utils/schedulingConstants.js` |
| U1 | 2 | `u1-grid-threading` | **opus** | `geneticScheduler.js`, `localScheduler.js`, `scheduleValidator.js`, `timetableGenerator.js`, `schedulingContext.js`, `schedulingHelpers.js` |
| U1 | 2 | `u1-config-route` | sonnet | `routes/configRoute.js`, `server.js` mount, `scripts/seedSystemConfig.js` |
| U2 | 1 | `u2-appshell` | **opus** | `components/AppShell.jsx` |
| U2 | 1 | `u2-common` | sonnet | `components/common/*` |
| U2 | 2 | `u2-chatbot-datatable` | fable | `Chatbot.jsx`, `Data-table.jsx` retokenize |
| U3 | 1 | `u3-timetable-grid` | **opus** | `components/timetable/{TimetableGrid,TimetableListView,TimetableLegend}.jsx` |
| U3 | 1 | `u3-timetable-misc` | sonnet | `components/timetable/{TimetableCard,QualityScore,ConflictsDialog,CommentsDialog,WeekStrip,DataValidationPanel,AlgorithmCard,GenerationProgress}.jsx` |
| U3 | 1 | `u3-charts` | sonnet | `components/charts/*` |
| U3 | 2 | `u3-hooks` | sonnet | `hooks/{useSystemConfig,useTimetableData}.js`, `App.jsx` provider |
| U4 | 1 | `u4-socket-server` | **opus** | `server.js`, `package.json` |
| U4 | 1 | `u4-jobs-quality` | **opus** | `utils/generationJobs.js`, `utils/qualityScore.js`, `models/Timetable.js` |
| U4 | 2 | `u4-ga-async` | **opus** `effort:high` | `utils/geneticScheduler.js`, `scripts/gaSmoke.js` |
| U4 | 2 | `u4-generate-route` | **opus** | `routes/timetableRoute.js` (202, job runner, progress, conflicts/resolve, comments) |
| U4 | 2 | `u4-notify` (Phase 7 carry-over) | sonnet | `models/Notification.js`, `routes/notificationsRoute.js`, `utils/notify.js` |
| U4 | 3 | `u4-socket-hooks` | sonnet | `hooks/{useSocket,useGenerationProgress}.js`, `package.json` |
| U5 | 1 | `u5-generate-page` | sonnet | `pages/GenerateTimetable.jsx`, `App.jsx` route, `GARunSummary.jsx` |
| U6 | 1 | `u6-wizard` | sonnet | `pages/CreateTimetable.jsx`, route |
| U6 | 1 | `u6-infrastructure` | **opus** | `pages/Infrastructure.jsx`, route (grid preview must match server derivation exactly) |
| U7 | 1 | `u7-view-list` | sonnet | `pages/ViewTimetable.jsx`, route + `/timetables` alias |
| U7 | 2 | `u7-view-detail` | sonnet | `pages/ViewTimetableDetail.jsx`, route |
| U8 | 1 | `u8-dashboard` | sonnet | `pages/Dashboard.jsx` |
| U9 | 1 | `u9-admin-pages` | fable | `pages/{Rooms,Notifications}.jsx` shell swap |
| U9 | 1 | `u9-faculty-pages` | **opus** | 5 `Faculty*.jsx` (delete accordion renderer, preserve Phase 8 scoping) |
| U9 | 1 | `u9-student-pages` | **opus** | 5 student pages (delete 2 row-list renderers, preserve scoping) |
| U9 | 2 | `u9-login-tokens` | fable | `pages/Login.jsx` inline styles → tokens |
| U10 | 1 | `u10-cleanup` | sonnet | delete `pages/Timetable.jsx`, dedup constants, route cleanup |
| U10 | 1 | `u10-scripts` | sonnet | `scripts/verifyConstraints.js`, `scripts/smokeApi.js` |
| U10 | 2 | `u10-docs` | fable | `CLAUDE.md`, `DELIVERABLE.md` |

**Critical phases (reviewers `opus`, `effort:'high'`, lenses `security` + `correctness` + `regression`): U1, U4, U9.** Others: `correctness` + `regression` on `sonnet`.

**Run grouping with human checkpoints:** Run F = `U0, U1`; Run G = `U2, U3`; Run H = `U4` (+Phase 7 notifications) then **Phase 8**; Run I = `U5, U6, U7`; Run J = `U8, U9`; Run K = `U10` (+Phase 9, 10).

---

## Critical files for implementation

- `backend/utils/schedulingConstants.js`
- `backend/utils/geneticScheduler.js`
- `backend/routes/timetableRoute.js`
- `frontend/src/components/AppShell.jsx`
- `frontend/src/pages/Timetable.jsx`
