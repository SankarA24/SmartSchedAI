// backend/scripts/gaSmoke.js
//
// Run the genetic scheduler against seeded data without HTTP.
//
//   node scripts/gaSmoke.js [--department "Computer Science"]
//       [--semester 1] [--year 1] [--academicYear 2026]
//       [--seed 42] [--pop 60] [--gens 300] [--no-labs]
//
// Prints the run stats as JSON plus a sha1 of the schedule so
// two runs with the same seed can be compared by eye.
// --no-labs rewrites every lab room to a lecture hall in
// memory only (nothing is written back) to exercise the
// "No suitable room" failure path.

import "dotenv/config";

import { createHash } from "node:crypto";

import mongoose from "mongoose";

import dbConnect from "../utils/dbConnect.js";
import { loadSchedulingContext } from "../utils/schedulingContext.js";
import { generateGeneticTimetable } from "../utils/geneticScheduler.js";


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


function toNumberOr(value, fallback) {

    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
}


async function main() {

    const args = parseArgs(process.argv.slice(2));

    const query = {
        department: args.department || "Computer Science",
        semester: toNumberOr(args.semester, 1),
        year: toNumberOr(args.year, 1),
        academicYear: toNumberOr(args.academicYear, 2026),
    };

    const options = {};

    if (args.seed !== undefined) {
        options.seed = toNumberOr(args.seed, undefined);
    }

    if (args.pop !== undefined) {
        options.populationSize = toNumberOr(args.pop, undefined);
    }

    if (args.gens !== undefined) {
        options.maxGenerations = toNumberOr(args.gens, undefined);
    }

    await dbConnect();

    let exitCode = 0;

    try {

        const context = await loadSchedulingContext(query);

        console.log("Context:", JSON.stringify({ ...query, ...context.counts }));

        let rooms = context.rooms;

        if (args["no-labs"]) {

            rooms = rooms.map((room) => {

                const plain =
                    typeof room.toObject === "function"
                        ? room.toObject()
                        : { ...room };

                if (String(plain.type).toLowerCase() === "lab") {
                    plain.type = "lecture_hall";
                }

                return plain;
            });

            console.log("--no-labs: lab rooms rewritten to lecture_hall in memory.");
        }

        const { schedule, stats } = await generateGeneticTimetable({
            courses: context.courses,
            faculty: context.faculty,
            rooms,
            options,
        });

        const sha1 = createHash("sha1")
            .update(JSON.stringify(schedule))
            .digest("hex");

        console.log(JSON.stringify(stats, null, 2));
        console.log("schedule entries:", schedule.length);
        console.log("schedule sha1:", sha1);

    } catch (error) {

        console.error("GA smoke run failed:", error.message);
        exitCode = 1;

    } finally {

        await mongoose.disconnect();
    }

    process.exit(exitCode);
}


main();
