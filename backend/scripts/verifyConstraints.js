// backend/scripts/verifyConstraints.js
//
// Load a saved timetable, run it through validateSchedule, and
// print a PASS/FAIL table grouped by rule.
//
//   node scripts/verifyConstraints.js --id 651f...
//   node scripts/verifyConstraints.js --latest
//       [--department "Computer Science"] [--academicYear 2026]
//
// Exits 1 if any rule FAILs (or the timetable / schedule cannot
// be loaded), 0 if every rule PASSes.

import "dotenv/config";

import mongoose from "mongoose";

import dbConnect from "../utils/dbConnect.js";
import Timetable from "../models/Timetable.js";
import { loadSchedulingContext } from "../utils/schedulingContext.js";
import { validateSchedule } from "../utils/scheduleValidator.js";


function parseArgs(argv) {

    const args = {};

    for (let i = 0; i < argv.length; i++) {

        const token = argv[i];

        if (!token.startsWith("--")) {
            continue;
        }

        const key = token.slice(2);

        const next = argv[i + 1];

        if (
            next === undefined ||
            next.startsWith("--")
        ) {
            args[key] = true;
        } else {
            args[key] = next;
            i += 1;
        }
    }

    return args;
}


function escapeRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


// =========================================================
// RULES
// Each rule is matched against the validator's error strings
// by a regex. A rule with zero matching errors PASSes.
// =========================================================

const RULES = [
    { label: "Teacher conflict", pattern: /^Faculty conflict:/ },
    { label: "Room conflict", pattern: /^Room conflict:/ },
    { label: "Student-group conflict", pattern: /^Student group conflict:/ },
    { label: "Room capacity", pattern: /is too small for course/ },
    { label: "Faculty availability", pattern: /^Faculty ".*" is not available on/ },
    { label: "Room availability", pattern: /^Room ".*" is not available on/ },
    { label: "Faculty workload", pattern: /hours but maximum allowed is/ },
    { label: "Lab-room rule", pattern: /is not suitable for course/ },
    { label: "Break slot", pattern: /overlaps the protected break/ },
    { label: "Working days", pattern: /^Invalid day/ },
    { label: "Session duration", pattern: /^Invalid time slot/ },
    { label: "Session count", pattern: /requires \d+ sessions but received/ },
];


function groupErrorsByRule(errors) {

    const remaining = [...errors];

    const rows = RULES.map((rule) => {

        const matches = remaining.filter((error) => rule.pattern.test(error));

        for (const match of matches) {
            const index = remaining.indexOf(match);
            if (index !== -1) {
                remaining.splice(index, 1);
            }
        }

        return {
            label: rule.label,
            errors: matches,
        };
    });

    if (remaining.length > 0) {
        rows.push({
            label: "Other",
            errors: remaining,
        });
    }

    return rows;
}


function printTable(rows) {

    const labelWidth = Math.max(
        ...rows.map((row) => row.label.length),
        "RULE".length
    );

    console.log(
        "RULE".padEnd(labelWidth) + "  STATUS  COUNT"
    );
    console.log(
        "-".repeat(labelWidth) + "  ------  -----"
    );

    for (const row of rows) {

        const status = row.errors.length === 0 ? "PASS" : "FAIL";

        console.log(
            row.label.padEnd(labelWidth) +
            "  " +
            status.padEnd(6) +
            "  " +
            String(row.errors.length)
        );
    }

    console.log("");

    for (const row of rows) {

        if (row.errors.length === 0) {
            continue;
        }

        console.log(`${row.label}:`);

        for (const error of row.errors) {
            console.log(`  - ${error}`);
        }
    }
}


async function loadTimetable(args) {

    if (args.id && args.id !== true) {
        return Timetable.findById(args.id);
    }

    if (args.latest) {

        const query = {};

        if (args.department && args.department !== true) {
            query.department = new RegExp(
                `^${escapeRegex(args.department)}$`,
                "i"
            );
        }

        if (args.academicYear && args.academicYear !== true) {
            query.academicYear = Number(args.academicYear);
        }

        return Timetable.findOne(query).sort({ createdAt: -1 });
    }

    return null;
}


async function main() {

    const args = parseArgs(process.argv.slice(2));

    if (!args.id && !args.latest) {

        console.error(
            "Usage: node scripts/verifyConstraints.js --id <timetableId> | --latest [--department <dept>] [--academicYear <year>]"
        );

        process.exit(1);
    }

    await dbConnect();

    let exitCode = 0;

    try {

        const timetable = await loadTimetable(args);

        if (!timetable) {

            console.error("No matching timetable found.");
            exitCode = 1;

        } else {

            console.log(
                "Timetable:",
                JSON.stringify({
                    id: String(timetable._id),
                    name: timetable.name,
                    department: timetable.department,
                    semester: timetable.semester,
                    year: timetable.year,
                    academicYear: timetable.academicYear,
                    status: timetable.status,
                })
            );

            const context = await loadSchedulingContext({
                department: timetable.department,
                semester: timetable.semester,
                year: timetable.year,
                academicYear: timetable.academicYear,
            });

            console.log("Context:", JSON.stringify(context.counts));

            const result = validateSchedule(
                timetable.schedule,
                context.courses,
                context.faculty,
                context.rooms,
                context.grid
            );

            const rows = groupErrorsByRule(result.errors);

            printTable(rows);

            if (result.warnings.length > 0) {

                console.log(
                    `\n${result.warnings.length} warning(s):`
                );

                for (const warning of result.warnings) {
                    console.log(`  - ${warning}`);
                }
            }

            exitCode = result.valid ? 0 : 1;
        }

    } catch (error) {

        console.error("Verification failed:", error.message);
        exitCode = 1;

    } finally {

        await mongoose.disconnect();
    }

    process.exit(exitCode);
}


main();
