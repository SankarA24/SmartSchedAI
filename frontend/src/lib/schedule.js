// Pure, framework-free helpers for turning a `{ days, slots, breaks }` grid
// (the shape `backend/utils/schedulingConstants.js#getScheduleGrid` returns)
// and a `Timetable.schedule[]` array into whatever a page wants to render.
// No React, no page imports — only `./status.js`.

import { courseTypeToken } from "./status.js";

/**
 * Fallback grid, mirrors `DAYS` / `TIME_SLOTS` / `BREAK_SLOT` in
 * `backend/utils/schedulingConstants.js`. Used whenever `buildGrid` (or any
 * function taking a `grid`) is called without one, so callers never have to
 * null-check the grid shape.
 */
const DEFAULT_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const DEFAULT_SLOTS = [
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
  { start: "11:15", end: "12:15" },
  { start: "14:15", end: "15:15" },
  { start: "15:15", end: "16:15" },
  { start: "16:30", end: "17:30" },
];

const DEFAULT_BREAKS = [{ name: "Lunch", start: "12:15", end: "13:15" }];

const ISO_WEEKDAY = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

function timeToMinutes(time) {
  const [h, m] = String(time || "").split(":");
  const hours = Number(h);
  const minutes = Number(m);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function formatSlotLabel(start, end) {
  return `${start}-${end}`;
}

/**
 * Normalise a courses/faculty/rooms source — an array of docs keyed by
 * `_id`, a `Map<id, doc>`, or a plain `{ [id]: doc }` object — into a
 * `get(id)` accessor so callers can pass whatever they already fetched.
 */
function toLookup(source) {
  if (!source) return () => null;
  if (source instanceof Map) {
    return (id) => source.get(String(id)) ?? null;
  }
  if (Array.isArray(source)) {
    const byId = new Map();
    for (const item of source) {
      if (item && item._id != null) byId.set(String(item._id), item);
    }
    return (id) => byId.get(String(id)) ?? null;
  }
  return (id) => source[id] ?? source[String(id)] ?? null;
}

/** @param {{courses?:*, faculty?:*, rooms?:*}} [maps] */
function buildLookups(maps) {
  const m = maps || {};
  return {
    course: toLookup(m.courses),
    faculty: toLookup(m.faculty),
    room: toLookup(m.rooms),
  };
}

function slotOrderIndex(entry, slots) {
  const idx = slots.findIndex((s) => s.start === entry?.startTime);
  return idx === -1 ? slots.length + timeToMinutes(entry?.startTime) : idx;
}

/**
 * Build a render-ready grid from the backend's `getScheduleGrid()` shape
 * (`{ days, slots, breaks, weeks, maxPeriodsPerDay, maxConsecutiveHours,
 * maxDailyHoursPerFaculty, flags }`). Missing/partial input falls back to
 * today's hard-coded schedule (see DEFAULT_* above), so `buildGrid()` and
 * `buildGrid(null)` both work.
 *
 * @param {object} [config]
 * @returns {{days:string[], slots:Array<{start:string,end:string,label:string,index:number}>, breaks:Array<{name:string,start:string,end:string}>, rows:Array<object>}}
 */
export function buildGrid(config) {
  const src = config || {};

  const days = Array.isArray(src.days) && src.days.length ? src.days : DEFAULT_DAYS;

  const rawSlots = Array.isArray(src.slots) && src.slots.length ? src.slots : DEFAULT_SLOTS;
  const slots = rawSlots.map((slot, index) => ({
    start: slot.start,
    end: slot.end,
    label: formatSlotLabel(slot.start, slot.end),
    index,
  }));

  // "absent" and "deliberately empty" are different: an admin who deletes
  // every break in /infrastructure saves `breaks: []`, and the grid must then
  // have no break rows. Mirrors `getScheduleGrid`
  // (backend/utils/schedulingConstants.js), which also only falls back when
  // `breaks` is not an array. `slots` above keeps its `.length` check on
  // purpose: the server never returns an empty slot list — `deriveSlots`
  // always produces periods — so an empty one here means "not supplied yet".
  const rawBreaks = Array.isArray(src.breaks) ? src.breaks : DEFAULT_BREAKS;
  const breaks = rawBreaks.map((brk) => ({
    name: brk.name || "Break",
    start: brk.start,
    end: brk.end,
  }));

  const grid = {
    days,
    slots,
    breaks,
    // Passed through verbatim when present so downstream callers (weekStrip,
    // computeStats, …) can read them off the same object; not required by
    // the grid shape above.
    weeks: src.weeks,
    maxPeriodsPerDay: src.maxPeriodsPerDay,
    maxConsecutiveHours: src.maxConsecutiveHours,
    maxDailyHoursPerFaculty: src.maxDailyHoursPerFaculty,
    flags: src.flags,
  };

  grid.rows = slotRows(grid);
  return grid;
}

/**
 * Flatten a grid's slots and breaks into one time-ordered list for
 * rendering a grid's left-hand rows.
 *
 * @param {object} grid — a `buildGrid()` result (or anything with `slots`/`breaks`)
 * @returns {Array<{kind:'slot'|'break', start:string, end:string, label:string, index?:number, name?:string}>}
 */
export function slotRows(grid) {
  const slotRowsList = (grid?.slots || []).map((slot) => ({
    kind: "slot",
    start: slot.start,
    end: slot.end,
    label: slot.label || formatSlotLabel(slot.start, slot.end),
    index: slot.index,
  }));
  const breakRows = (grid?.breaks || []).map((brk) => ({
    kind: "break",
    start: brk.start,
    end: brk.end,
    label: brk.name || "Break",
    name: brk.name || "Break",
  }));
  return [...slotRowsList, ...breakRows].sort(
    (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start)
  );
}

/**
 * Resolve a `Timetable.schedule[]` entry's `courseId`/`facultyId`/`roomId`
 * against fetched collections.
 *
 * @param {{courseId?:string, facultyId?:string, roomId?:string, type?:string}} entry
 * @param {{courses?:*, faculty?:*, rooms?:*}} [maps]
 * @returns {{course:object|null, faculty:object|null, room:object|null, type:string, code:string, label:string}}
 */
export function resolveEntry(entry, maps) {
  const lookups = buildLookups(maps);
  const course = entry ? lookups.course(entry.courseId) : null;
  const faculty = entry ? lookups.faculty(entry.facultyId) : null;
  const room = entry ? lookups.room(entry.roomId) : null;

  const type = course?.type || entry?.type || "lecture";
  const code = course?.code || entry?.courseId || "";
  const label = course?.name || code || entry?.courseId || "";

  return { course, faculty, room, type, code, label };
}

/** @param {{day?:string, startTime?:string}} entry */
export function entryKey(entry) {
  return `${entry?.day}|${entry?.startTime}`;
}

/**
 * Bucket schedule entries by day, each day's entries sorted in grid slot
 * order (not insertion order).
 *
 * @param {Array<object>} schedule
 * @param {{days?:string[], slots?:Array<{start:string}>}} [grid]
 * @returns {Map<string, object[]>}
 */
export function groupByDay(schedule, grid) {
  const days = grid?.days?.length ? grid.days : DEFAULT_DAYS;
  const slots = grid?.slots?.length ? grid.slots : DEFAULT_SLOTS;

  const map = new Map();
  for (const day of days) map.set(day, []);

  for (const entry of schedule || []) {
    const canonicalDay =
      days.find((d) => d.toLowerCase() === String(entry?.day || "").toLowerCase()) || entry?.day;
    if (!canonicalDay) continue;
    if (!map.has(canonicalDay)) map.set(canonicalDay, []);
    map.get(canonicalDay).push(entry);
  }

  for (const entries of map.values()) {
    entries.sort((a, b) => slotOrderIndex(a, slots) - slotOrderIndex(b, slots));
  }

  return map;
}

/**
 * Filter schedule entries by day / facultyId / roomId / batch / search.
 * All filters are optional and combine with AND.
 *
 * `filters.batch` matches a course's `department|semester|year` — pass
 * either that string directly or `{ department, semester, year }`.
 * `filters.search` matches (case-insensitively) against the resolved
 * course name/code, faculty name and room name.
 *
 * @param {Array<object>} schedule
 * @param {{day?:string, facultyId?:string, roomId?:string, batch?:string|object, search?:string}} [filters]
 * @param {{courses?:*, faculty?:*, rooms?:*}} [maps]
 * @returns {object[]}
 */
export function filterEntries(schedule, filters, maps) {
  const { day, facultyId, roomId, batch, search } = filters || {};
  const searchTerm = search ? String(search).trim().toLowerCase() : "";

  return (schedule || []).filter((entry) => {
    if (day && String(entry.day || "").toLowerCase() !== String(day).toLowerCase()) return false;
    if (facultyId && String(entry.facultyId) !== String(facultyId)) return false;
    if (roomId && String(entry.roomId) !== String(roomId)) return false;

    if (batch) {
      const { course } = resolveEntry(entry, maps);
      const batchKey = course ? `${course.department}|${course.semester}|${course.year}` : "";
      const wanted =
        typeof batch === "string" ? batch : `${batch.department}|${batch.semester}|${batch.year}`;
      if (batchKey.toLowerCase() !== String(wanted).toLowerCase()) return false;
    }

    if (searchTerm) {
      const { course, faculty, room, code, label } = resolveEntry(entry, maps);
      const haystack = [label, code, course?.name, course?.code, faculty?.name, room?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }

    return true;
  });
}

/**
 * Build a 7-day-grid-wide week strip (one entry per `grid.days`) around
 * today, shifted by `weekOffset` whole weeks.
 *
 * @param {Array<object>} schedule
 * @param {{weekOffset?:number, grid?:object}} [options]
 * @returns {Array<{date:Date, dayName:string, isToday:boolean, entries:object[]}>}
 */
export function weekStrip(schedule, options) {
  const { weekOffset = 0, grid } = options || {};
  const days = grid?.days?.length ? grid.days : DEFAULT_DAYS;
  const slots = grid?.slots?.length ? grid.slots : DEFAULT_SLOTS;
  const grouped = groupByDay(schedule, { days, slots });

  const now = new Date();
  const todayIso = now.getDay() === 0 ? 7 : now.getDay();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - (todayIso - 1) + weekOffset * 7);

  return days.map((dayName) => {
    const iso = ISO_WEEKDAY[dayName.toLowerCase()] || 1;
    const date = new Date(monday);
    date.setDate(monday.getDate() + (iso - 1));
    return {
      date,
      dayName,
      isToday: date.toDateString() === now.toDateString(),
      entries: grouped.get(dayName) || [],
    };
  });
}

/** Deterministically hash a string into one of the 5 chart tokens. */
function hashToChartToken(value) {
  const str = String(value || "");
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  const bucket = (Math.abs(hash) % 5) + 1;
  return `chart-${bucket}`;
}

/**
 * Pick a `chart-1`..`chart-5` legend token for an entry.
 * `mode:'type'` delegates to `courseTypeToken` from `./status.js`.
 * `mode:'course'` hashes the resolved course code so a subject keeps a
 * stable colour across renders/pages.
 *
 * @param {object} entry
 * @param {'type'|'course'} mode
 * @param {{courses?:*, faculty?:*, rooms?:*}} [maps]
 * @returns {string}
 */
export function colorTokenFor(entry, mode, maps) {
  const resolved = resolveEntry(entry, maps);
  if (mode === "course") {
    return hashToChartToken(resolved.code || entry?.courseId || "");
  }
  return courseTypeToken(resolved.type);
}

/**
 * Summary stats for a schedule, e.g. for a dashboard card row.
 *
 * @param {Array<object>} schedule
 * @param {object} [grid]
 * @param {{courses?:*, faculty?:*, rooms?:*}} [maps]
 * @returns {{totalClasses:number, hoursPerWeek:number, rooms:number, faculty:number, utilization:number}}
 */
export function computeStats(schedule, grid, maps) {
  const entries = schedule || [];
  const totalClasses = entries.length;

  const hoursPerWeek = entries.reduce((sum, entry) => {
    const minutes = timeToMinutes(entry.endTime) - timeToMinutes(entry.startTime);
    return sum + (minutes > 0 ? minutes / 60 : 0);
  }, 0);

  const lookups = buildLookups(maps);
  const roomIds = new Set();
  const facultyIds = new Set();
  for (const entry of entries) {
    const room = lookups.room(entry.roomId);
    roomIds.add(room?._id != null ? String(room._id) : String(entry.roomId));
    const faculty = lookups.faculty(entry.facultyId);
    facultyIds.add(faculty?._id != null ? String(faculty._id) : String(entry.facultyId));
  }

  const dayCount = grid?.days?.length ? grid.days.length : DEFAULT_DAYS.length;
  const slotCount = grid?.slots?.length ? grid.slots.length : DEFAULT_SLOTS.length;
  const capacity = dayCount * slotCount;
  const utilization = capacity > 0 ? Math.round((totalClasses / capacity) * 100) : 0;

  return {
    totalClasses,
    hoursPerWeek: Math.round(hoursPerWeek * 100) / 100,
    rooms: roomIds.size,
    faculty: facultyIds.size,
    utilization,
  };
}
