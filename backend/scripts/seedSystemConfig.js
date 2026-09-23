// backend/scripts/seedSystemConfig.js
//
// Upserts the active SystemConfig document with an explicit
// slots[] override equal to today's six TIME_SLOTS
// (09:00-10:00, 10:00-11:00, 11:15-12:15, 14:15-15:15,
// 15:15-16:15, 16:30-17:30) and the lunch break. The current
// slots have irregular inter-period gaps (0, 15, lunch, 0, 15)
// that cannot be regenerated from a start/end/duration formula,
// so without this explicit override every saved timetable
// stops validating against the derived grid.
//
//   node scripts/seedSystemConfig.js

import "dotenv/config";

import mongoose from "mongoose";

import dbConnect from "../utils/dbConnect.js";
import SystemConfig from "../models/SystemConfig.js";


const SLOTS = [
    { start: "09:00", end: "10:00" },
    { start: "10:00", end: "11:00" },
    { start: "11:15", end: "12:15" },
    { start: "14:15", end: "15:15" },
    { start: "15:15", end: "16:15" },
    { start: "16:30", end: "17:30" },
];

const BREAKS = [
    { name: "Lunch", start: "12:15", end: "13:15" },
];


async function main() {

    await dbConnect();

    let exitCode = 0;

    try {

        const config = await SystemConfig.findOneAndUpdate(
            { key: "active" },
            {
                $set: {
                    slots: SLOTS,
                    breaks: BREAKS,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        console.log("System config seeded:", JSON.stringify(config, null, 2));

    } catch (error) {

        console.error("Seeding system config failed:", error.message);
        exitCode = 1;

    } finally {

        await mongoose.disconnect();
    }

    process.exit(exitCode);
}


main();
