import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  Coffee,
  Grid2x2,
  Info,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Timer,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { navForRole } from "@/lib/nav";
import { slotRows } from "@/lib/schedule";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatCard } from "@/components/common/StatCard";
import { SectionCard } from "@/components/common/SectionCard";
import { Callout } from "@/components/common/Callout";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// =====================================================
// SERVER MIRROR
//
// Everything in this block is a line-by-line port of
// `backend/utils/schedulingConstants.js` (DEFAULT_GRID,
// deriveSlots, getScheduleGrid) and of the validator in
// `backend/routes/configRoute.js#validateConfigPayload`.
// It exists so the preview card can show the grid a save
// WOULD produce before the save happens.
//
// It is a mirror, never the authority: every save re-fetches
// GET /api/config/grid and reconciles against it (see
// `performSave`), and any disagreement is reported to the
// admin instead of being hidden.
//
// `lib/schedule.js#buildGrid` is deliberately NOT used for the
// preview: it substitutes DEFAULT_SLOTS / DEFAULT_BREAKS when
// `slots[]` or `breaks[]` are empty, whereas getScheduleGrid
// keeps an empty `breaks[]` empty and returns whatever
// deriveSlots produced. Its `slotRows` helper injects no
// defaults, so that one is used.
// =====================================================

/** Mirrors DAY_NAMES in backend/routes/configRoute.js. */
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** Mirrors DAYS / TIME_SLOTS / BREAK_SLOT in schedulingConstants.js. */
const GRID_DEFAULT_DAYS = DAY_NAMES.slice(0, 5);

const GRID_DEFAULT_SLOTS = [
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
  { start: "11:15", end: "12:15" },
  { start: "14:15", end: "15:15" },
  { start: "15:15", end: "16:15" },
  { start: "16:30", end: "17:30" },
];

const GRID_DEFAULT_BREAKS = [{ start: "12:15", end: "13:15" }];

/** Mirrors DEFAULT_GRID's scalar half. */
const GRID_DEFAULTS = {
  weeks: 13,
  maxPeriodsPerDay: 6,
  maxConsecutiveHours: 3,
  maxDailyHoursPerFaculty: 6,
  flags: {
    avoidFirstLastPeriod: false,
    preferMorningLabs: true,
    balanceFacultyWorkload: true,
    prioritizeFacultyPreferences: true,
  },
};

/** Mirrors DEFAULT_PERIOD_MIN / DEFAULT_BREAK_MIN in deriveSlots. */
const DEFAULT_PERIOD_MIN = 60;
const DEFAULT_BREAK_MIN = 15;

/** Mirrors the min/max on backend/models/SystemConfig.js. */
const LIMITS = {
  periodDurationMin: { min: 30, max: 120 },
  breakDurationMin: { min: 0, max: 30 },
  maxPeriodsPerDay: { min: 1, max: 12 },
  maxConsecutiveHours: { min: 1, max: 6 },
  maxDailyHoursPerFaculty: { min: 1, max: 10 },
  weeksPerSemester: { min: 8, max: 24 },
};

/** Port of schedulingConstants.js#toMinutes. */
function toMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Port of schedulingConstants.js#toLabel. */
function toLabel(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** Port of schedulingConstants.js#overlappingBreak. */
function overlappingBreak(start, end, breaks) {
  for (const entry of breaks) {
    const breakStart = toMinutes(entry && entry.start);
    const breakEnd = toMinutes(entry && entry.end);
    if (breakStart === null || breakEnd === null) continue;
    if (start < breakEnd && end > breakStart) {
      return { start: breakStart, end: breakEnd };
    }
  }
  return null;
}

/**
 * True when deriveSlots would bail out to the hard-coded
 * TIME_SLOTS instead of walking the day. Same three conditions
 * as the guard at the top of deriveSlots.
 */
function derivationFallsBack(config) {
  const period = Number(config.periodDurationMin) || DEFAULT_PERIOD_MIN;
  return (
    period <= 0 ||
    toMinutes(config.startTime) === null ||
    toMinutes(config.endTime) === null
  );
}

/** Port of schedulingConstants.js#deriveSlots. */
function deriveSlots(config, breaks, maxPeriodsPerDay) {
  const period = Number(config.periodDurationMin) || DEFAULT_PERIOD_MIN;
  const gap = Number.isFinite(Number(config.breakDurationMin))
    ? Number(config.breakDurationMin)
    : DEFAULT_BREAK_MIN;

  const dayStart = toMinutes(config.startTime);
  const dayEnd = toMinutes(config.endTime);

  if (period <= 0 || dayStart === null || dayEnd === null) {
    return GRID_DEFAULT_SLOTS.map((slot) => ({ start: slot.start, end: slot.end }));
  }

  const slots = [];
  let cursor = dayStart;

  while (slots.length < maxPeriodsPerDay && cursor + period <= dayEnd) {
    const end = cursor + period;
    const clash = overlappingBreak(cursor, end, breaks);

    if (clash) {
      cursor = Math.max(clash.end, cursor + period);
      continue;
    }

    slots.push({ start: toLabel(cursor), end: toLabel(end) });
    cursor = end + gap;
  }

  return slots;
}

/** Port of schedulingConstants.js#getScheduleGrid. */
function deriveGrid(config) {
  if (!config) {
    return {
      days: GRID_DEFAULT_DAYS,
      slots: GRID_DEFAULT_SLOTS,
      breaks: GRID_DEFAULT_BREAKS,
      ...GRID_DEFAULTS,
    };
  }

  const days =
    Array.isArray(config.workingDays) && config.workingDays.length
      ? config.workingDays.slice()
      : GRID_DEFAULT_DAYS;

  const breaks = Array.isArray(config.breaks)
    ? config.breaks.map((entry) => ({
        name: entry && entry.name,
        start: entry && entry.start,
        end: entry && entry.end,
      }))
    : GRID_DEFAULT_BREAKS;

  const maxPeriodsPerDay =
    Number(config.maxPeriodsPerDay) > 0
      ? Number(config.maxPeriodsPerDay)
      : GRID_DEFAULTS.maxPeriodsPerDay;

  const slots =
    Array.isArray(config.slots) && config.slots.length
      ? config.slots.map((slot) => ({ start: slot.start, end: slot.end }))
      : deriveSlots(config, breaks, maxPeriodsPerDay);

  return {
    days,
    slots,
    breaks,
    weeks:
      Number(config.weeksPerSemester) > 0
        ? Number(config.weeksPerSemester)
        : GRID_DEFAULTS.weeks,
    maxPeriodsPerDay,
    maxConsecutiveHours:
      Number(config.maxConsecutiveHours) > 0
        ? Number(config.maxConsecutiveHours)
        : GRID_DEFAULTS.maxConsecutiveHours,
    maxDailyHoursPerFaculty:
      Number(config.maxDailyHoursPerFaculty) > 0
        ? Number(config.maxDailyHoursPerFaculty)
        : GRID_DEFAULTS.maxDailyHoursPerFaculty,
    flags: {
      avoidFirstLastPeriod:
        config.avoidFirstLastPeriod === undefined
          ? GRID_DEFAULTS.flags.avoidFirstLastPeriod
          : Boolean(config.avoidFirstLastPeriod),
      preferMorningLabs:
        config.preferMorningLabs === undefined
          ? GRID_DEFAULTS.flags.preferMorningLabs
          : Boolean(config.preferMorningLabs),
      balanceFacultyWorkload:
        config.balanceFacultyWorkload === undefined
          ? GRID_DEFAULTS.flags.balanceFacultyWorkload
          : Boolean(config.balanceFacultyWorkload),
      prioritizeFacultyPreferences:
        config.prioritizeFacultyPreferences === undefined
          ? GRID_DEFAULTS.flags.prioritizeFacultyPreferences
          : Boolean(config.prioritizeFacultyPreferences),
    },
  };
}

/** Stable, comparable shape for "are these two grids the same grid?". */
function canonicalGrid(grid) {
  return JSON.stringify({
    days: (grid?.days || []).map((day) => String(day)),
    slots: (grid?.slots || []).map((slot) => `${slot?.start}-${slot?.end}`),
    breaks: (grid?.breaks || []).map(
      (brk) => `${brk?.name || ""}@${brk?.start}-${brk?.end}`
    ),
    weeks: Number(grid?.weeks),
    maxPeriodsPerDay: Number(grid?.maxPeriodsPerDay),
    maxConsecutiveHours: Number(grid?.maxConsecutiveHours),
    maxDailyHoursPerFaculty: Number(grid?.maxDailyHoursPerFaculty),
    flags: {
      avoidFirstLastPeriod: Boolean(grid?.flags?.avoidFirstLastPeriod),
      preferMorningLabs: Boolean(grid?.flags?.preferMorningLabs),
      balanceFacultyWorkload: Boolean(grid?.flags?.balanceFacultyWorkload),
      prioritizeFacultyPreferences: Boolean(grid?.flags?.prioritizeFacultyPreferences),
    },
  });
}

function sameGrid(a, b) {
  return canonicalGrid(a) === canonicalGrid(b);
}

function slotLabels(grid) {
  return (grid?.slots || []).map((slot) => `${slot?.start}-${slot?.end}`);
}

function breakLabels(grid) {
  return (grid?.breaks || []).map(
    (brk) => `${brk?.name ? `${brk.name} ` : ""}${brk?.start}-${brk?.end}`
  );
}

/**
 * What differs between two grids, split by consequence:
 *
 *  - `structural` — days, periods and breaks. Entries of an existing
 *    timetable are matched against these exactly, so changing one
 *    invalidates timetables built on the old grid.
 *  - `policy` — limits, teaching weeks and the preference flags.
 *    They change what future runs do (or, for the flags, nothing at
 *    all yet); they never invalidate a saved timetable.
 */
function gridDifferences(current, next) {
  const lines = [];
  const policy = [];

  const currentDays = (current?.days || []).join(", ");
  const nextDays = (next?.days || []).join(", ");
  if (currentDays !== nextDays) {
    lines.push(`Working days ${currentDays || "none"} → ${nextDays || "none"}`);
  }

  const currentSlots = slotLabels(current);
  const nextSlots = slotLabels(next);
  if (currentSlots.join("|") !== nextSlots.join("|")) {
    if (currentSlots.length !== nextSlots.length) {
      lines.push(`Periods per day ${currentSlots.length} → ${nextSlots.length}`);
    }
    const max = Math.max(currentSlots.length, nextSlots.length);
    for (let i = 0; i < max; i += 1) {
      if (currentSlots[i] !== nextSlots[i]) {
        lines.push(
          `Period ${i + 1} ${currentSlots[i] || "—"} → ${nextSlots[i] || "—"}`
        );
      }
    }
  }

  const currentBreaks = breakLabels(current).join(", ");
  const nextBreaks = breakLabels(next).join(", ");
  if (currentBreaks !== nextBreaks) {
    lines.push(`Breaks ${currentBreaks || "none"} → ${nextBreaks || "none"}`);
  }

  const scalars = [
    ["Teaching weeks", "weeks"],
    ["Max periods/day", "maxPeriodsPerDay"],
    ["Max consecutive hours", "maxConsecutiveHours"],
    ["Max daily hours per faculty", "maxDailyHoursPerFaculty"],
  ];
  for (const [label, key] of scalars) {
    if (Number(current?.[key]) !== Number(next?.[key])) {
      // When one of these actually resized the day, the slot
      // comparison above has already reported that structurally.
      policy.push(`${label} ${current?.[key]} → ${next?.[key]}`);
    }
  }

  const flags = [
    ["Avoid first/last period", "avoidFirstLastPeriod"],
    ["Prefer morning labs", "preferMorningLabs"],
    ["Balance faculty workload", "balanceFacultyWorkload"],
    ["Prioritize faculty preferences", "prioritizeFacultyPreferences"],
  ];
  for (const [label, key] of flags) {
    const before = Boolean(current?.flags?.[key]);
    const after = Boolean(next?.flags?.[key]);
    if (before !== after) {
      policy.push(`${label} ${before ? "on" : "off"} → ${after ? "on" : "off"}`);
    }
  }

  return { structural: lines, policy };
}

/** Both halves of a grid difference as one flat list. */
function allDifferences(delta) {
  return [...(delta?.structural || []), ...(delta?.policy || [])];
}

// =====================================================
// DRAFT STATE
// =====================================================

const TAB_FIELDS = {
  general: [
    "maxPeriodsPerDay",
    "maxConsecutiveHours",
    "maxDailyHoursPerFaculty",
    "weeksPerSemester",
  ],
  hours: [
    "workingDays",
    "startTime",
    "endTime",
    "periodDurationMin",
    "breakDurationMin",
    "breaks",
    "slots",
  ],
  advanced: [
    "avoidFirstLastPeriod",
    "preferMorningLabs",
    "balanceFacultyWorkload",
    "prioritizeFacultyPreferences",
  ],
};

const TAB_LABELS = {
  general: "General Policies",
  hours: "Working Hours",
  advanced: "Advanced Constraints",
};

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolOr(value, fallback) {
  return value === undefined || value === null ? fallback : Boolean(value);
}

/** SystemConfig document → editable draft (same field names). */
function toDraft(config) {
  const c = config || {};
  return {
    workingDays: Array.isArray(c.workingDays)
      ? c.workingDays.slice()
      : GRID_DEFAULT_DAYS.slice(),
    startTime: c.startTime || "09:00",
    endTime: c.endTime || "17:30",
    periodDurationMin: numberOr(c.periodDurationMin, DEFAULT_PERIOD_MIN),
    breakDurationMin: numberOr(c.breakDurationMin, DEFAULT_BREAK_MIN),
    breaks: (Array.isArray(c.breaks) ? c.breaks : []).map((brk) => ({
      name: brk?.name || "",
      start: brk?.start || "",
      end: brk?.end || "",
    })),
    slots: (Array.isArray(c.slots) ? c.slots : []).map((slot) => ({
      start: slot?.start || "",
      end: slot?.end || "",
    })),
    maxPeriodsPerDay: numberOr(c.maxPeriodsPerDay, GRID_DEFAULTS.maxPeriodsPerDay),
    maxConsecutiveHours: numberOr(
      c.maxConsecutiveHours,
      GRID_DEFAULTS.maxConsecutiveHours
    ),
    maxDailyHoursPerFaculty: numberOr(
      c.maxDailyHoursPerFaculty,
      GRID_DEFAULTS.maxDailyHoursPerFaculty
    ),
    weeksPerSemester: numberOr(c.weeksPerSemester, GRID_DEFAULTS.weeks),
    avoidFirstLastPeriod: boolOr(
      c.avoidFirstLastPeriod,
      GRID_DEFAULTS.flags.avoidFirstLastPeriod
    ),
    preferMorningLabs: boolOr(
      c.preferMorningLabs,
      GRID_DEFAULTS.flags.preferMorningLabs
    ),
    balanceFacultyWorkload: boolOr(
      c.balanceFacultyWorkload,
      GRID_DEFAULTS.flags.balanceFacultyWorkload
    ),
    prioritizeFacultyPreferences: boolOr(
      c.prioritizeFacultyPreferences,
      GRID_DEFAULTS.flags.prioritizeFacultyPreferences
    ),
  };
}

function pick(source, fields) {
  const out = {};
  for (const field of fields) out[field] = source[field];
  return out;
}

function isTabDirty(draft, saved, tab) {
  return (
    JSON.stringify(pick(draft, TAB_FIELDS[tab])) !==
    JSON.stringify(pick(saved, TAB_FIELDS[tab]))
  );
}

/**
 * What the server would hold after saving `tab`: the saved
 * document with only this tab's fields overlaid. PUT /api/config
 * merges field by field, so this is exactly the merge it does.
 */
function mergedFor(draft, saved, tab) {
  return { ...saved, ...pick(draft, TAB_FIELDS[tab]) };
}

function buildPayload(draft, tab) {
  if (tab === "general") {
    return {
      maxPeriodsPerDay: Number(draft.maxPeriodsPerDay),
      maxConsecutiveHours: Number(draft.maxConsecutiveHours),
      maxDailyHoursPerFaculty: Number(draft.maxDailyHoursPerFaculty),
      weeksPerSemester: Number(draft.weeksPerSemester),
    };
  }

  if (tab === "hours") {
    return {
      workingDays: draft.workingDays.slice(),
      startTime: draft.startTime,
      endTime: draft.endTime,
      periodDurationMin: Number(draft.periodDurationMin),
      breakDurationMin: Number(draft.breakDurationMin),
      breaks: draft.breaks.map((brk) => ({
        name: brk.name ? brk.name : undefined,
        start: brk.start,
        end: brk.end,
      })),
      // [] tells getScheduleGrid to derive the day from
      // startTime / endTime / periodDurationMin / breaks.
      slots: draft.slots.map((slot) => ({ start: slot.start, end: slot.end })),
    };
  }

  return {
    avoidFirstLastPeriod: Boolean(draft.avoidFirstLastPeriod),
    preferMorningLabs: Boolean(draft.preferMorningLabs),
    balanceFacultyWorkload: Boolean(draft.balanceFacultyWorkload),
    prioritizeFacultyPreferences: Boolean(draft.prioritizeFacultyPreferences),
  };
}

function rangeError(label, value, key) {
  const { min, max } = LIMITS[key];
  const parsed = Number(value);
  if (value === "" || value === null || !Number.isFinite(parsed)) {
    return `${label} is required.`;
  }
  if (!Number.isInteger(parsed)) {
    return `${label} must be a whole number.`;
  }
  if (parsed < min || parsed > max) {
    return `${label} must be between ${min} and ${max}.`;
  }
  return null;
}

/**
 * Port of backend/routes/configRoute.js#timeToMinutes. The route
 * parses times slightly more loosely than schedulingConstants.js
 * does, so the validator mirror uses its own version rather than
 * the grid mirror's.
 */
function routeTimeToMinutes(time) {
  if (typeof time !== "string") return NaN;
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

/** Mirrors MAX_SLOTS in backend/routes/configRoute.js. */
const MAX_SLOTS = 24;

/**
 * Port of backend/routes/configRoute.js#validateConfigPayload.
 *
 * PUT /api/config merges the submitted fields into the stored
 * document and then validates the whole thing, so a fault anywhere
 * in the configuration blocks every tab — including tabs that did
 * not cause it. Running the same check here turns that 400 into
 * something the admin can read before pressing Save.
 */
function validateMerged(candidate) {
  const errors = [];

  const startMin = routeTimeToMinutes(candidate.startTime);
  const endMin = routeTimeToMinutes(candidate.endTime);

  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) {
    errors.push('Day start and day end must be valid "HH:MM" times.');
  } else if (endMin <= startMin) {
    errors.push("Day end must be after day start.");
  }

  if (!Array.isArray(candidate.workingDays) || candidate.workingDays.length === 0) {
    errors.push("At least one working day is required.");
  } else if (candidate.workingDays.length > DAY_NAMES.length) {
    errors.push(`At most ${DAY_NAMES.length} working days are allowed.`);
  } else {
    for (const day of candidate.workingDays) {
      if (!DAY_NAMES.includes(day)) {
        errors.push(`Working day "${day}" is not a day of the week.`);
      }
    }
  }

  if (Number.isFinite(startMin) && Number.isFinite(endMin)) {
    for (const brk of candidate.breaks || []) {
      const label = brk.name ? `Break "${brk.name}"` : "Break";
      const brkStart = routeTimeToMinutes(brk.start);
      const brkEnd = routeTimeToMinutes(brk.end);

      if (!Number.isFinite(brkStart) || !Number.isFinite(brkEnd) || brkEnd <= brkStart) {
        errors.push(`${label} has an invalid start/end.`);
        continue;
      }

      if (brkStart < startMin || brkEnd > endMin) {
        errors.push(`${label} must fall between day start and day end.`);
      }
    }
  }

  const slots = Array.isArray(candidate.slots) ? candidate.slots : [];
  if (slots.length > 0) {
    const parsed = slots
      .map((slot) => ({
        label: `${slot.start}-${slot.end}`,
        start: routeTimeToMinutes(slot.start),
        end: routeTimeToMinutes(slot.end),
      }))
      .sort((a, b) => a.start - b.start);

    const hasInvalidSlot = parsed.some(
      (slot) =>
        !Number.isFinite(slot.start) || !Number.isFinite(slot.end) || slot.end <= slot.start
    );
    if (hasInvalidSlot) {
      errors.push("Every fixed slot must start before it ends.");
    }

    for (let i = 1; i < parsed.length; i += 1) {
      if (parsed[i].start < parsed[i - 1].end) {
        errors.push("Fixed slots must not overlap each other.");
        break;
      }
    }

    const maxSlots =
      Number(candidate.maxPeriodsPerDay) > 0 ? Number(candidate.maxPeriodsPerDay) : MAX_SLOTS;

    if (slots.length > maxSlots) {
      errors.push(
        `The fixed slot list has ${slots.length} periods but max periods per day is ${maxSlots}. Raise the cap in General Policies, or switch Working Hours to derived slots.`
      );
    }

    for (const slot of parsed) {
      if (!Number.isFinite(slot.start) || !Number.isFinite(slot.end)) continue;

      for (const brk of candidate.breaks || []) {
        const brkStart = routeTimeToMinutes(brk.start);
        const brkEnd = routeTimeToMinutes(brk.end);

        if (!Number.isFinite(brkStart) || !Number.isFinite(brkEnd) || brkEnd <= brkStart) {
          continue;
        }

        if (slot.start < brkEnd && slot.end > brkStart) {
          errors.push(
            `Slot ${slot.label} overlaps break ${brk.name || `${brk.start}-${brk.end}`}.`
          );
        }
      }
    }
  }

  return errors;
}

/**
 * Everything that must hold before a tab may be saved: the schema's
 * own min/max (a range violation reaches the server as a Mongoose
 * ValidationError and comes back as an opaque 500), the server's
 * document-wide validator, and one stricter client-only rule — a
 * configuration that derives no teaching period at all is stored
 * happily by the server and then has nowhere to put a class.
 */
function validateTab(draft, saved, tab) {
  const merged = mergedFor(draft, saved, tab);
  const errors = [];

  const ranges =
    tab === "general"
      ? [
          ["Max periods per day", "maxPeriodsPerDay"],
          ["Max consecutive hours", "maxConsecutiveHours"],
          ["Max daily hours per faculty", "maxDailyHoursPerFaculty"],
          ["Weeks per semester", "weeksPerSemester"],
        ]
      : tab === "hours"
        ? [
            ["Period duration", "periodDurationMin"],
            ["Gap between periods", "breakDurationMin"],
          ]
        : [];

  for (const [label, key] of ranges) {
    const error = rangeError(label, draft[key], key);
    if (error) errors.push(error);
  }

  if (!errors.length) {
    errors.push(...validateMerged(merged));

    if (!errors.length && !deriveGrid(merged).slots.length) {
      errors.push(
        "This configuration derives 0 teaching periods, so nothing could be scheduled. Widen the day, shorten the period, or move the breaks."
      );
    }
  }

  return Array.from(new Set(errors));
}

// =====================================================
// SMALL FIELD PRIMITIVES
// =====================================================

function FieldShell({ id, label, hint, disabledReason, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {disabledReason ? (
        <p className="text-xs font-medium text-muted-foreground">{disabledReason}</p>
      ) : null}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function NumberField({ id, label, hint, value, onChange, limitKey, disabled, disabledReason }) {
  const { min, max } = LIMITS[limitKey];
  return (
    <FieldShell id={id} label={label} hint={hint} disabledReason={disabled ? disabledReason : null}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value === "" || value === null || value === undefined ? "" : value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value === "" ? "" : Number(event.target.value))
        }
      />
    </FieldShell>
  );
}

function TimeField({ id, label, hint, value, onChange, disabled, disabledReason }) {
  return (
    <FieldShell id={id} label={label} hint={hint} disabledReason={disabled ? disabledReason : null}>
      <Input
        id={id}
        type="time"
        value={value || ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldShell>
  );
}

function ToggleRow({ id, label, description, enforcement, checked, onCheckedChange }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
        {enforcement ? (
          <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <Info className="size-3" />
            {enforcement}
          </span>
        ) : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function ErrorList({ errors }) {
  if (!errors.length) return null;
  return (
    <Callout tone="destructive" title="Fix before saving" icon={AlertTriangle}>
      <ul className="list-disc space-y-1 pl-4">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </Callout>
  );
}

function SaveBar({ dirty, errors, saving, onSave, onReset }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
      {dirty ? (
        <span className="mr-auto text-xs text-muted-foreground">Unsaved changes</span>
      ) : (
        <span className="mr-auto text-xs text-muted-foreground">No changes</span>
      )}
      <Button type="button" variant="outline" onClick={onReset} disabled={!dirty || saving}>
        <RotateCcw className="size-4" />
        Reset
      </Button>
      <Button type="button" onClick={onSave} disabled={!dirty || saving || errors.length > 0}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Save changes
      </Button>
    </div>
  );
}

// =====================================================
// SCHEDULE PREVIEW
// =====================================================

function SchedulePreview({ grid, serverGrid, dirty, slotMode, fellBack, capNote }) {
  const rows = useMemo(
    () =>
      slotRows({
        slots: (grid.slots || []).map((slot, index) => ({ ...slot, index })),
        breaks: grid.breaks || [],
      }),
    [grid]
  );

  const matches = serverGrid ? sameGrid(grid, serverGrid) : false;
  const weekly = (grid.days?.length || 0) * (grid.slots?.length || 0);

  return (
    <SectionCard
      title="Current Schedule Preview"
      description="The grid GET /api/config/grid will return once this tab is saved."
      icon={Grid2x2}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              matches
                ? "inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success"
                : "inline-flex items-center rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning"
            }
          >
            {matches ? "Matches the live grid" : "Differs from the live grid"}
          </span>
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            {slotMode === "explicit" ? "Fixed slot list" : "Derived from working hours"}
          </span>
          {dirty ? (
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              Unsaved
            </span>
          ) : null}
        </div>

        {fellBack ? (
          <Callout tone="warning" title="Falling back to the built-in grid" icon={AlertTriangle}>
            Day start, day end or period duration is unusable, so the server would
            return the six built-in periods instead of deriving a day.
          </Callout>
        ) : null}

        {grid.slots?.length ? (
          <ol className="flex flex-col gap-1.5">
            {rows.map((row) =>
              row.kind === "slot" ? (
                <li
                  key={`slot-${row.start}-${row.end}`}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">Period {(row.index ?? 0) + 1}</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {row.start} – {row.end}
                  </span>
                </li>
              ) : (
                <li
                  key={`break-${row.start}-${row.end}`}
                  className="flex items-center justify-between rounded-md border border-dashed border-border bg-muted px-3 py-2 text-sm"
                >
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Coffee className="size-3.5" />
                    {row.name || "Break"}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {row.start} – {row.end}
                  </span>
                </li>
              )
            )}
          </ol>
        ) : (
          <Callout tone="destructive" title="No teaching periods" icon={AlertTriangle}>
            This configuration produces an empty day, so nothing can be scheduled.
          </Callout>
        )}

        <dl className="grid grid-cols-3 gap-2 border-t border-border pt-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Days</dt>
            <dd className="font-medium text-foreground">{grid.days?.length || 0}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Periods/day</dt>
            <dd className="font-medium text-foreground">{grid.slots?.length || 0}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Weekly slots</dt>
            <dd className="font-medium text-foreground">{weekly}</dd>
          </div>
        </dl>

        <p className="text-xs text-muted-foreground">
          Columns: {grid.days?.join(", ") || "none"}.
        </p>

        {capNote ? <p className="text-xs text-muted-foreground">{capNote}</p> : null}
      </div>
    </SectionCard>
  );
}

// =====================================================
// PAGE
// =====================================================

export default function InfrastructurePage() {
  const { refresh } = useSystemConfig();

  const [saved, setSaved] = useState(() => toDraft(null));
  const [draft, setDraft] = useState(() => toDraft(null));
  const [meta, setMeta] = useState({ updatedAt: null, updatedBy: null });
  const [serverGrid, setServerGrid] = useState(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [mismatch, setMismatch] = useState(null);

  const [activeTab, setActiveTab] = useState("general");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [configRes, gridRes] = await Promise.all([
        api.get("/config"),
        api.get("/config/grid"),
      ]);
      const nextDraft = toDraft(configRes.data);
      setSaved(nextDraft);
      setDraft(nextDraft);
      setMeta({
        updatedAt: configRes.data?.updatedAt || null,
        updatedBy: configRes.data?.updatedBy || null,
      });
      setServerGrid(gridRes.data || null);
    } catch (error) {
      console.error("Infrastructure: failed to load system config", error);
      setLoadError(
        error?.response?.data?.error || "Could not load the system configuration."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaveError(null);
    setMismatch(null);
  };

  const dirty = {
    general: isTabDirty(draft, saved, "general"),
    hours: isTabDirty(draft, saved, "hours"),
    advanced: isTabDirty(draft, saved, "advanced"),
  };

  // A failed read leaves `saved` at the schema defaults; saving then
  // would overwrite the stored document with values nobody chose.
  const unreadable = loadError
    ? ["The stored configuration could not be read, so saving would overwrite it with defaults. Reload first."]
    : [];

  const errors = {
    general: [...unreadable, ...validateTab(draft, saved, "general")],
    hours: [...unreadable, ...validateTab(draft, saved, "hours")],
    advanced: [...unreadable, ...validateTab(draft, saved, "advanced")],
  };

  // The grid each tab's save would produce, derived exactly the
  // way the server does it from the document the merge yields.
  const previewGrid = useMemo(
    () => deriveGrid(mergedFor(draft, saved, "hours")),
    [draft, saved]
  );
  const pendingGrid = useMemo(
    () => deriveGrid(mergedFor(draft, saved, activeTab)),
    [draft, saved, activeTab]
  );

  const slotMode = draft.slots.length ? "explicit" : "derived";
  const fellBack = slotMode === "derived" && derivationFallsBack(draft);

  const gridDelta = serverGrid
    ? gridDifferences(serverGrid, pendingGrid)
    : { structural: [], policy: [] };

  const resetTab = (tab) => {
    setDraft((current) => ({ ...current, ...pick(saved, TAB_FIELDS[tab]) }));
    setSaveError(null);
    setMismatch(null);
  };

  const performSave = async () => {
    const tab = activeTab;
    const expected = deriveGrid(mergedFor(draft, saved, tab));

    setSaving(true);
    setSaveError(null);
    setMismatch(null);

    try {
      await api.put("/config", buildPayload(draft, tab));

      // The preview above is a client port; the server's own
      // derivation is the authority, so re-read both documents
      // and reconcile rather than trusting the local result.
      const [configRes, gridRes] = await Promise.all([
        api.get("/config"),
        api.get("/config/grid"),
      ]);

      const nextDraft = toDraft(configRes.data);
      setSaved(nextDraft);
      setDraft((current) => ({ ...current, ...pick(nextDraft, TAB_FIELDS[tab]) }));
      setMeta({
        updatedAt: configRes.data?.updatedAt || null,
        updatedBy: configRes.data?.updatedBy || null,
      });
      setServerGrid(gridRes.data || null);

      if (!sameGrid(expected, gridRes.data)) {
        setMismatch(allDifferences(gridDifferences(expected, gridRes.data || {})));
      }

      await refresh();
      setConfirmOpen(false);
      toast.success(`${TAB_LABELS[tab]} saved`);
    } catch (error) {
      console.error("Infrastructure: failed to save system config", error);
      const message =
        error?.response?.data?.error || "The server rejected this configuration.";
      setSaveError(message);
      setConfirmOpen(false);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDescription = () => {
    const summarise = (lines) => {
      const shown = lines.slice(0, 6);
      const extra = lines.length - shown.length;
      return `${shown.join("; ")}${extra > 0 ? `; and ${extra} more` : ""}`;
    };

    const policyPart = gridDelta.policy.length
      ? ` Policy changes: ${summarise(gridDelta.policy)}.`
      : "";

    if (gridDelta.structural.length) {
      return `This changes the teaching grid: ${summarise(gridDelta.structural)}. Existing timetables were generated against the current grid, so every draft whose entries no longer match a period or a working day will fail validation and has to be regenerated; published timetables keep their saved entries but will be drawn on the new grid.${policyPart}`;
    }

    if (gridDelta.policy.length) {
      return `Save ${TAB_LABELS[activeTab]}? The teaching grid — days, periods and breaks — is unchanged, so existing timetables stay valid.${policyPart}`;
    }

    return `Save ${TAB_LABELS[activeTab]}? None of these values reach the grid the schedulers work from, so nothing about generation changes; they are stored for the next time slots are derived.`;
  };

  const daysStat = serverGrid?.days?.length ?? 0;
  const periodsStat = serverGrid?.slots?.length ?? 0;
  const durations = (serverGrid?.slots || [])
    .map((slot) => (toMinutes(slot.end) ?? 0) - (toMinutes(slot.start) ?? 0))
    .filter((minutes) => minutes > 0);
  const uniqueDurations = Array.from(new Set(durations)).sort((a, b) => a - b);
  const durationStat = uniqueDurations.length === 1 ? `${uniqueDurations[0]} min` : uniqueDurations.length ? "Mixed" : "—";
  const durationDelta =
    uniqueDurations.length > 1
      ? `${uniqueDurations[0]}–${uniqueDurations[uniqueDurations.length - 1]} min`
      : undefined;

  const shell = navForRole("admin");

  return (
    <AppShell
      brand={shell.brand}
      nav={shell.nav}
      quickActions={shell.quickActions}
      chatbot={{ context: "Admin system configuration (infrastructure & policy)" }}
    >
      <PageHeader
        title="System Configuration"
        description={
          meta.updatedAt
            ? `Infrastructure and scheduling policy. Last saved ${new Date(
                meta.updatedAt
              ).toLocaleString()}${meta.updatedBy ? ` by ${meta.updatedBy}` : ""}.`
            : "Infrastructure and scheduling policy for every timetable this system generates."
        }
        actions={
          <Button type="button" variant="outline" onClick={load} disabled={loading || saving}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            Reload
          </Button>
        }
      />

      {loadError ? (
        <div className="mb-6">
          <Callout tone="destructive" title="Configuration unavailable" icon={AlertTriangle}>
            {loadError} The values below are the schema defaults and have not been read
            from the server.
          </Callout>
        </div>
      ) : null}

      {mismatch ? (
        <div className="mb-6">
          <Callout
            tone="destructive"
            title="Preview disagreed with the server"
            icon={AlertTriangle}
          >
            The saved grid is not the one the preview showed:{" "}
            {mismatch.join("; ") || "the two grids differ"}. The page now shows the
            server's grid, which is the one every scheduler uses. Please report this —
            the preview is a mirror of the server's derivation and should never drift.
          </Callout>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Working days"
          value={daysStat}
          delta={(serverGrid?.days || []).map((day) => day.slice(0, 3)).join(" · ")}
          icon={CalendarDays}
          loading={loading}
        />
        <StatCard
          label="Periods per day"
          value={periodsStat}
          delta={serverGrid ? `cap ${serverGrid.maxPeriodsPerDay}` : undefined}
          icon={Grid2x2}
          loading={loading}
        />
        <StatCard
          label="Period duration"
          value={durationStat}
          delta={durationDelta}
          icon={Timer}
          loading={loading}
        />
        <StatCard
          label="Total weekly slots"
          value={daysStat * periodsStat}
          delta={`${daysStat} days × ${periodsStat} periods`}
          icon={Clock}
          loading={loading}
          tone={daysStat * periodsStat === 0 ? "destructive" : "default"}
        />
      </div>

      <SectionCard
        title="Scheduling configuration"
        description="Each tab saves on its own. Everything here is read by the generator, the validator or the quality score — where it is not, the field says so."
        icon={Settings2}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList variant="underline" className="w-full justify-start overflow-x-auto">
            {Object.keys(TAB_LABELS).map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {TAB_LABELS[tab]}
                {dirty[tab] ? (
                  <span
                    aria-label="unsaved changes"
                    className="ml-1 inline-block size-1.5 rounded-full bg-primary"
                  />
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ---------------- GENERAL POLICIES ---------------- */}
          <TabsContent value="general" className="pt-6">
            <div className="flex flex-col gap-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <NumberField
                  id="maxPeriodsPerDay"
                  label="Max periods per day"
                  limitKey="maxPeriodsPerDay"
                  value={draft.maxPeriodsPerDay}
                  onChange={(value) => setField("maxPeriodsPerDay", value)}
                  hint="Caps the grid: derivation stops after this many periods, and a fixed slot list longer than this is rejected. It is not a per-batch daily cap during generation."
                />
                <NumberField
                  id="maxConsecutiveHours"
                  label="Max consecutive hours"
                  limitKey="maxConsecutiveHours"
                  value={draft.maxConsecutiveHours}
                  onChange={(value) => setField("maxConsecutiveHours", value)}
                  hint="Used when scoring a finished timetable (student-convenience penalty in utils/qualityScore.js). The schedulers do not yet avoid long runs while generating."
                />
                <NumberField
                  id="maxDailyHoursPerFaculty"
                  label="Max daily hours per faculty"
                  limitKey="maxDailyHoursPerFaculty"
                  value={draft.maxDailyHoursPerFaculty}
                  onChange={(value) => setField("maxDailyHoursPerFaculty", value)}
                  hint="Recorded only — no scheduler or scorer reads it yet. Weekly limits come from each faculty member's own Max hours per week."
                />
                <NumberField
                  id="weeksPerSemester"
                  label="Weeks per semester"
                  limitKey="weeksPerSemester"
                  value={draft.weeksPerSemester}
                  onChange={(value) => setField("weeksPerSemester", value)}
                  hint="Divides each course's total hours into weekly sessions, so this directly changes how many classes the generator must place."
                />
              </div>

              <ErrorList errors={errors.general} />
              {saveError && activeTab === "general" ? (
                <Callout tone="destructive" title="Save failed" icon={AlertTriangle}>
                  {saveError}
                </Callout>
              ) : null}

              <SaveBar
                dirty={dirty.general}
                errors={errors.general}
                saving={saving}
                onSave={() => setConfirmOpen(true)}
                onReset={() => resetTab("general")}
              />
            </div>
          </TabsContent>

          {/* ---------------- WORKING HOURS ---------------- */}
          <TabsContent value="hours" className="pt-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="flex flex-col gap-6 lg:col-span-2">
                <div className="flex flex-col gap-2">
                  <Label>Slot source</Label>
                  <div className="inline-flex w-fit rounded-lg border border-border p-1">
                    <button
                      type="button"
                      aria-pressed={slotMode === "explicit"}
                      disabled={!previewGrid.slots.length && slotMode === "derived"}
                      onClick={() =>
                        setField(
                          "slots",
                          previewGrid.slots.map((slot) => ({
                            start: slot.start,
                            end: slot.end,
                          }))
                        )
                      }
                      className={
                        slotMode === "explicit"
                          ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                          : "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                      }
                    >
                      Fixed slot list
                    </button>
                    <button
                      type="button"
                      aria-pressed={slotMode === "derived"}
                      onClick={() => setField("slots", [])}
                      className={
                        slotMode === "derived"
                          ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                          : "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      }
                    >
                      Derive from working hours
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {slotMode === "explicit"
                      ? "The grid is exactly the fixed list shown in the preview — today's institutional periods, whose uneven gaps no fixed-step walk reproduces. Period duration and the gap between periods are stored but do not shape it."
                      : "The server walks the day from the start time in period-duration steps, inserting the gap between periods, skipping any window that overlaps a break, and stopping at the end time or at max periods per day."}
                  </p>
                  {slotMode === "explicit" ? (
                    <p className="text-xs text-muted-foreground">
                      Switching to derived clears the fixed list; switching back freezes
                      whatever the preview currently shows.
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <TimeField
                    id="startTime"
                    label="Day start"
                    value={draft.startTime}
                    onChange={(value) => setField("startTime", value)}
                    hint={
                      slotMode === "derived"
                        ? "First period starts here."
                        : "With a fixed slot list this only bounds where breaks may fall."
                    }
                  />
                  <TimeField
                    id="endTime"
                    label="Day end"
                    value={draft.endTime}
                    onChange={(value) => setField("endTime", value)}
                    hint={
                      slotMode === "derived"
                        ? "No period may end after this."
                        : "With a fixed slot list this only bounds where breaks may fall."
                    }
                  />
                  <NumberField
                    id="periodDurationMin"
                    label="Period duration (minutes)"
                    limitKey="periodDurationMin"
                    value={draft.periodDurationMin}
                    onChange={(value) => setField("periodDurationMin", value)}
                    disabled={slotMode === "explicit"}
                    disabledReason="Only used when slots are derived. Switch Slot source to “Derive from working hours” to make this shape the day."
                    hint="Length of every derived period."
                  />
                  <NumberField
                    id="breakDurationMin"
                    label="Gap between periods (minutes)"
                    limitKey="breakDurationMin"
                    value={draft.breakDurationMin}
                    onChange={(value) => setField("breakDurationMin", value)}
                    disabled={slotMode === "explicit"}
                    disabledReason="Only used when slots are derived. Switch Slot source to “Derive from working hours” to make this shape the day."
                    hint="Idle minutes inserted after each derived period. This is not the lunch break — add that below."
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Working days</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAY_NAMES.map((day) => {
                      const on = draft.workingDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            const next = on
                              ? draft.workingDays.filter((d) => d !== day)
                              : [...draft.workingDays, day];
                            setField(
                              "workingDays",
                              DAY_NAMES.filter((d) => next.includes(d))
                            );
                          }}
                          className={
                            on
                              ? "rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
                              : "rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                          }
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    These become the grid's columns, always in Monday-to-Sunday order.
                    Removing a day removes it everywhere — admin, faculty and student views.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-4">
                    <Label>Breaks</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setField("breaks", [
                          ...draft.breaks,
                          { name: "", start: "", end: "" },
                        ])
                      }
                    >
                      <Plus className="size-4" />
                      Add break
                    </Button>
                  </div>

                  {draft.breaks.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                      No breaks. Nothing is protected: a derived day runs straight through,
                      and classes may be placed at any hour of it.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {draft.breaks.map((brk, index) => (
                        <div
                          key={`break-row-${index}`}
                          className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
                        >
                          <FieldShell id={`break-name-${index}`} label="Name">
                            <Input
                              id={`break-name-${index}`}
                              value={brk.name}
                              placeholder="Lunch"
                              onChange={(event) => {
                                const next = draft.breaks.slice();
                                next[index] = { ...brk, name: event.target.value };
                                setField("breaks", next);
                              }}
                            />
                          </FieldShell>
                          <FieldShell id={`break-start-${index}`} label="Start">
                            <Input
                              id={`break-start-${index}`}
                              type="time"
                              value={brk.start}
                              onChange={(event) => {
                                const next = draft.breaks.slice();
                                next[index] = { ...brk, start: event.target.value };
                                setField("breaks", next);
                              }}
                            />
                          </FieldShell>
                          <FieldShell id={`break-end-${index}`} label="End">
                            <Input
                              id={`break-end-${index}`}
                              type="time"
                              value={brk.end}
                              onChange={(event) => {
                                const next = draft.breaks.slice();
                                next[index] = { ...brk, end: event.target.value };
                                setField("breaks", next);
                              }}
                            />
                          </FieldShell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${brk.name || `break ${index + 1}`}`}
                            onClick={() =>
                              setField(
                                "breaks",
                                draft.breaks.filter((_, i) => i !== index)
                              )
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    No class may overlap a break. A break must fall inside the day, and
                    with a fixed slot list it must not cut across an existing period.
                  </p>
                </div>

                <ErrorList errors={errors.hours} />
                {saveError && activeTab === "hours" ? (
                  <Callout tone="destructive" title="Save failed" icon={AlertTriangle}>
                    {saveError}
                  </Callout>
                ) : null}

                <SaveBar
                  dirty={dirty.hours}
                  errors={errors.hours}
                  saving={saving}
                  onSave={() => setConfirmOpen(true)}
                  onReset={() => resetTab("hours")}
                />
              </div>

              <div className="lg:col-span-1">
                <SchedulePreview
                  grid={previewGrid}
                  serverGrid={serverGrid}
                  dirty={dirty.hours}
                  slotMode={slotMode}
                  fellBack={fellBack}
                  capNote={
                    dirty.general
                      ? `General Policies has an unsaved max periods per day (${saved.maxPeriodsPerDay} → ${draft.maxPeriodsPerDay}). This preview uses the saved ${saved.maxPeriodsPerDay}, because saving this tab alone does not send that field.`
                      : `Capped at ${saved.maxPeriodsPerDay} periods per day (General Policies).`
                  }
                />
              </div>
            </div>
          </TabsContent>

          {/* ---------------- ADVANCED CONSTRAINTS ---------------- */}
          <TabsContent value="advanced" className="pt-6">
            <div className="flex flex-col gap-6">
              <Callout tone="warning" title="Recorded, not yet enforced" icon={AlertTriangle}>
                These four flags are stored in the system configuration and returned by{" "}
                <code>GET /api/config/grid</code>, but no scheduler reads them today. The
                penalties that would act on them are deliberately deferred. Changing them
                will not change the timetable the generator produces.
              </Callout>

              <div className="grid gap-3">
                <ToggleRow
                  id="avoidFirstLastPeriod"
                  label="Avoid first and last period"
                  description="Preference for leaving the opening and closing period of a day free."
                  enforcement="No penalty implemented — nothing reads this flag."
                  checked={draft.avoidFirstLastPeriod}
                  onCheckedChange={(value) => setField("avoidFirstLastPeriod", value)}
                />
                <ToggleRow
                  id="preferMorningLabs"
                  label="Prefer morning labs"
                  description="Preference for placing lab sessions before the lunch break."
                  enforcement="No penalty implemented — nothing reads this flag."
                  checked={draft.preferMorningLabs}
                  onCheckedChange={(value) => setField("preferMorningLabs", value)}
                />
                <ToggleRow
                  id="balanceFacultyWorkload"
                  label="Balance faculty workload"
                  description="Preference for spreading teaching hours evenly across faculty."
                  enforcement="Flag not read. Both engines already spread load unconditionally: the backtracking scheduler penalises hours already assigned, the genetic one penalises exceeding a faculty member's weekly cap."
                  checked={draft.balanceFacultyWorkload}
                  onCheckedChange={(value) => setField("balanceFacultyWorkload", value)}
                />
                <ToggleRow
                  id="prioritizeFacultyPreferences"
                  label="Prioritize faculty preferences"
                  description="Preference for honouring each faculty member's preferred and avoided time slots."
                  enforcement="Flag not read. Both engines already reward preferred slots and punish avoided ones on every run."
                  checked={draft.prioritizeFacultyPreferences}
                  onCheckedChange={(value) =>
                    setField("prioritizeFacultyPreferences", value)
                  }
                />
              </div>

              <Callout tone="info" title="Constraint summary" icon={Info}>
                <ul className="list-disc space-y-1 pl-4">
                  <li>
                    Grid in force: {serverGrid?.days?.length ?? 0} working days ×{" "}
                    {serverGrid?.slots?.length ?? 0} periods ={" "}
                    {(serverGrid?.days?.length ?? 0) * (serverGrid?.slots?.length ?? 0)}{" "}
                    weekly slots, with{" "}
                    {serverGrid?.breaks?.length ?? 0} protected break
                    {(serverGrid?.breaks?.length ?? 0) === 1 ? "" : "s"}.
                  </li>
                  <li>
                    Enforced while generating: room type and capacity, faculty and room
                    availability, faculty specialization, each faculty member's weekly
                    hour cap, one faculty per course, and no double-booking of a faculty
                    member, a room or a student group.
                  </li>
                  <li>
                    Enforced by the grid itself: {saved.weeksPerSemester} teaching weeks
                    decide each course's weekly sessions, and no class can land on a break
                    or outside a period.
                  </li>
                  <li>
                    Scored after the fact: runs longer than {saved.maxConsecutiveHours}{" "}
                    consecutive hours cost student-convenience points in the quality score.
                  </li>
                  <li>
                    Recorded but inert: the four flags above, and max daily hours per
                    faculty.
                  </li>
                </ul>
              </Callout>

              <ErrorList errors={errors.advanced} />
              {saveError && activeTab === "advanced" ? (
                <Callout tone="destructive" title="Save failed" icon={AlertTriangle}>
                  {saveError}
                </Callout>
              ) : null}

              <SaveBar
                dirty={dirty.advanced}
                errors={errors.advanced}
                saving={saving}
                onSave={() => setConfirmOpen(true)}
                onReset={() => resetTab("advanced")}
              />
            </div>
          </TabsContent>
        </Tabs>
      </SectionCard>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Save ${TAB_LABELS[activeTab]}?`}
        description={confirmDescription()}
        confirmLabel="Save configuration"
        destructive={gridDelta.structural.length > 0}
        loading={saving}
        onConfirm={performSave}
      />
    </AppShell>
  );
}
