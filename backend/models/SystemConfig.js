import mongoose from "mongoose";

import { TIME_SLOTS } from "../utils/schedulingConstants.js";

const BreakSchema = new mongoose.Schema(
  {
    name: { type: String },
    start: { type: String },
    end: { type: String },
  },
  { _id: false }
);

const SlotSchema = new mongoose.Schema(
  {
    start: { type: String },
    end: { type: String },
  },
  { _id: false }
);

/**
 * The single "active" scheduling configuration document.
 *
 * Everything here is honored by some scheduler or validator:
 * nothing is decorative. `slots` is an explicit override that
 * wins over derivation from startTime / endTime /
 * periodDurationMin / breaks. It defaults to today's six
 * TIME_SLOTS, whose irregular inter-period gaps no
 * start/end/duration walk can reproduce: a config left at its
 * defaults must derive exactly today's grid, or every saved
 * timetable stops validating. Derivation is therefore reached
 * only by a config that explicitly clears slots[].
 */
const SystemConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: "active", unique: true, immutable: true },
    workingDays: {
      type: [String],
      default: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    },
    startTime: { type: String, default: "09:00" },
    endTime: { type: String, default: "17:30" },
    periodDurationMin: { type: Number, default: 60, min: 30, max: 120 },
    breakDurationMin: { type: Number, default: 15, min: 0, max: 30 },
    breaks: {
      type: [BreakSchema],
      default: () => [{ name: "Lunch", start: "12:15", end: "13:15" }],
    },
    slots: {
      type: [SlotSchema],
      default: () => TIME_SLOTS.map((slot) => ({ start: slot.start, end: slot.end })),
    },
    maxPeriodsPerDay: { type: Number, default: 6, min: 1, max: 12 },
    maxConsecutiveHours: { type: Number, default: 3, min: 1, max: 6 },
    maxDailyHoursPerFaculty: { type: Number, default: 6, min: 1, max: 10 },
    weeksPerSemester: { type: Number, default: 13, min: 8, max: 24 },
    avoidFirstLastPeriod: { type: Boolean, default: false },
    preferMorningLabs: { type: Boolean, default: true },
    balanceFacultyWorkload: { type: Boolean, default: true },
    prioritizeFacultyPreferences: { type: Boolean, default: true },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

const SystemConfig = mongoose.model("SystemConfig", SystemConfigSchema);

export default SystemConfig;
