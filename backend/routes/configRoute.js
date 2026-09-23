import { Router } from "express";

import SystemConfig from "../models/SystemConfig.js";
import { getScheduleGrid } from "../utils/schedulingConstants.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const configRouter = Router();

configRouter.use(requireAuth);
const adminOnly = requireRole("admin");

// Fields an admin may change via PUT /. `key` is immutable and
// `updatedBy` is set by the server, never by the client.
const EDITABLE_FIELDS = [
  "workingDays",
  "startTime",
  "endTime",
  "periodDurationMin",
  "breakDurationMin",
  "breaks",
  "slots",
  "maxPeriodsPerDay",
  "maxConsecutiveHours",
  "maxDailyHoursPerFaculty",
  "weeksPerSemester",
  "avoidFirstLastPeriod",
  "preferMorningLabs",
  "balanceFacultyWorkload",
  "prioritizeFacultyPreferences",
];


// =====================================================
// HELPERS
// =====================================================

function timeToMinutes(time) {
  if (typeof time !== "string") return NaN;
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

// The only day names a schedule entry ever carries.
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// Hard ceiling on an explicit slots[] override when the
// candidate carries no usable maxPeriodsPerDay.
const MAX_SLOTS = 24;

// Read the singleton config doc. Returns null when it does not
// exist yet: reads never create it, so the config stays
// admin-owned state (see loadOrCreateConfig).
async function loadConfig() {
  return SystemConfig.findOne({ key: "active" });
}

// Load the singleton config doc, creating it with schema
// defaults when it does not exist. Only the admin-only PUT (and
// scripts/seedSystemConfig.js) may bring it into being.
async function loadOrCreateConfig() {
  return SystemConfig.findOneAndUpdate(
    { key: "active" },
    {},
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// Validates a (plain-object) candidate config before it is
// saved. Returns an array of error messages; empty = valid.
function validateConfigPayload(candidate) {
  const errors = [];

  const startMin = timeToMinutes(candidate.startTime);
  const endMin = timeToMinutes(candidate.endTime);

  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) {
    errors.push('startTime and endTime must be valid "HH:MM" strings');
  } else if (endMin <= startMin) {
    errors.push("endTime must be after startTime");
  }

  if (!Array.isArray(candidate.workingDays) || candidate.workingDays.length === 0) {
    errors.push("At least one working day is required");
  } else if (candidate.workingDays.length > DAY_NAMES.length) {
    errors.push(`At most ${DAY_NAMES.length} working days are allowed`);
  } else {
    for (const day of candidate.workingDays) {
      if (!DAY_NAMES.includes(day)) {
        errors.push(`Working day "${day}" must be one of ${DAY_NAMES.join(", ")}`);
      }
    }
  }

  if (Number.isFinite(startMin) && Number.isFinite(endMin)) {
    for (const brk of candidate.breaks || []) {
      const brkStart = timeToMinutes(brk.start);
      const brkEnd = timeToMinutes(brk.end);

      if (!Number.isFinite(brkStart) || !Number.isFinite(brkEnd) || brkEnd <= brkStart) {
        errors.push(`Break "${brk.name || ""}" has an invalid start/end`);
        continue;
      }

      if (brkStart < startMin || brkEnd > endMin) {
        errors.push(`Break "${brk.name || ""}" must fall within startTime and endTime`);
      }
    }
  }

  const slots = Array.isArray(candidate.slots) ? candidate.slots : [];
  if (slots.length > 0) {
    const parsed = slots
      .map((slot) => ({ start: timeToMinutes(slot.start), end: timeToMinutes(slot.end) }))
      .sort((a, b) => a.start - b.start);

    const hasInvalidSlot = parsed.some(
      (slot) => !Number.isFinite(slot.start) || !Number.isFinite(slot.end) || slot.end <= slot.start
    );
    if (hasInvalidSlot) {
      errors.push("Every slot must have a valid start before its end");
    }

    for (let i = 1; i < parsed.length; i++) {
      if (parsed[i].start < parsed[i - 1].end) {
        errors.push("slots must not overlap");
        break;
      }
    }

    const maxSlots = Number(candidate.maxPeriodsPerDay) > 0
      ? Number(candidate.maxPeriodsPerDay)
      : MAX_SLOTS;

    if (slots.length > maxSlots) {
      errors.push(`At most ${maxSlots} slots are allowed`);
    }

    // A slot that straddles a break is accepted by the grid but
    // rejected entry by entry at generation time, so catch the
    // contradiction here where it can still be explained.
    for (const slot of slots) {
      const slotStart = timeToMinutes(slot.start);
      const slotEnd = timeToMinutes(slot.end);

      if (!Number.isFinite(slotStart) || !Number.isFinite(slotEnd)) {
        continue;
      }

      for (const brk of candidate.breaks || []) {
        const brkStart = timeToMinutes(brk.start);
        const brkEnd = timeToMinutes(brk.end);

        if (!Number.isFinite(brkStart) || !Number.isFinite(brkEnd) || brkEnd <= brkStart) {
          continue;
        }

        if (slotStart < brkEnd && slotEnd > brkStart) {
          errors.push(
            `Slot "${slot.start}-${slot.end}" overlaps break "${brk.name || ""}"`
          );
        }
      }
    }
  }

  return errors;
}


// =====================================================
// GET / — active config, or the schema defaults when the
// singleton has not been created yet. Read-only.
// =====================================================

configRouter.get("/", async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(config || new SystemConfig().toObject());
  } catch (error) {
    console.error("Error fetching system config:", error);
    res.status(500).json({ error: "Failed to fetch system config" });
  }
});


// =====================================================
// PUT / — admin-only update
// =====================================================

configRouter.put("/", adminOnly, async (req, res) => {
  try {
    const config = await loadOrCreateConfig();

    for (const field of EDITABLE_FIELDS) {
      if (req.body?.[field] !== undefined) {
        config[field] = req.body[field];
      }
    }

    const errors = validateConfigPayload(config.toObject());
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join("; ") });
    }

    config.updatedBy = req.user?.email || req.user?.userId;

    await config.save();

    const grid = getScheduleGrid(config);
    res.json({ config, grid });
  } catch (error) {
    console.error("Error updating system config:", error);
    res.status(500).json({ error: "Failed to update system config" });
  }
});


// =====================================================
// GET /grid — the derived scheduling grid
// =====================================================

configRouter.get("/grid", async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(getScheduleGrid(config));
  } catch (error) {
    console.error("Error fetching schedule grid:", error);
    res.status(500).json({ error: "Failed to fetch schedule grid" });
  }
});
