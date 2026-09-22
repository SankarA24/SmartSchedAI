// backend/scripts/importDataset.js
//
// Generic, mapping-driven CSV importer for Course / Faculty / Room /
// Student records. Reuses the schema-level field synonyms and value
// normalizers already shipped in utils/csv.js and
// utils/importNormalizers.js, so a plain "reasonable" CSV (headers
// like "Course Code", "Faculty Name", "Room Type", "Register Number", ...)
// imports with zero configuration. An explicit --map file lets a CSV
// with arbitrary headers be imported without renaming a single column.
//
//   node scripts/importDataset.js --type courses --file data/courses.csv
//       [--map import-mappings/courses.json]
//       [--dry-run]
//       [--department "Computer Science"] [--academicYear 2026]
//       [--year 1] [--semester 1]
//       [--create-users] [--default-password Welcome@123]
//
// --type is one of courses|faculty|rooms|students (required).
// --file is the CSV path (required).
// --dry-run validates every row and prints the per-row action table
// (insert/update/skip) without writing anything to MongoDB.
// --department/--academicYear/--year/--semester backfill those fields
// for rows whose CSV (and --map defaults) leave them blank; they only
// apply to schema fields the selected --type actually has.
// --create-users (faculty/students only) creates a matching User
// account for every row that doesn't already have one, hashed with
// bcryptjs, and prints the default password once.
//
// Upsert keys: courses -> code; faculty -> email, else name+department;
// rooms -> name+building; students -> registerNumber.
//
// Exit code is 1 when the file/flags are unusable, or when any row
// was skipped for a validation / duplicate-key error (so it can gate
// a CI step); a real run still applies every valid row before exiting.

import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import dbConnect from "../utils/dbConnect.js";
import { parseCsv } from "../utils/csv.js";
import {
    headerKey,
    HEADER_SYNONYMS,
    normalizeRoomType,
    normalizeEquipment,
    normalizeSpecialization,
    normalizeCourseType,
    parseAvailability,
    defaultAvailability,
    toInt,
} from "../utils/importNormalizers.js";

import Course from "../models/course.js";
import Faculty from "../models/Faculty.js";
import Room from "../models/Room.js";
import Student from "../models/Student.js";
import User from "../models/User.js";

const VALID_TYPES = ["courses", "faculty", "rooms", "students"];

const DEFAULT_USER_PASSWORD = "Welcome@123";


// ---------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------

/**
 * Hand-rolled argv parser: `--flag value` sets args.flag = "value";
 * a `--flag` with no following value (end of argv, or the next token
 * is itself a `--flag`) sets args.flag = true.
 *
 * @param {string[]} argv
 * @returns {Record<string, string|true>}
 */
function parseArgs(argv) {

    const args = {};

    for (let i = 0; i < argv.length; i++) {

        const token = argv[i];

        if (!token.startsWith("--")) {
            continue;
        }

        const key = token.slice(2);
        const next = argv[i + 1];

        if (next === undefined || next.startsWith("--")) {
            args[key] = true;
        } else {
            args[key] = next;
            i += 1;
        }
    }

    return args;
}


// Returns `value` only when it is a non-blank string (guards against
// a boolean-flag CLI arg such as `--department` with no value).
function strArg(value) {

    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();

    return trimmed === "" ? undefined : trimmed;
}


// ---------------------------------------------------------------------
// Header -> field resolution
// ---------------------------------------------------------------------

/**
 * Resolves one raw CSV header to the schema field it should populate.
 * An explicit mapping file's `columns` wins (matched exactly first,
 * then by normalized `headerKey` so casing/spacing in the CSV doesn't
 * have to match the mapping file byte-for-byte); otherwise falls back
 * to the built-in `HEADER_SYNONYMS[type]`.
 *
 * @param {string} header
 * @param {string} type
 * @param {{columns?: Record<string,string>}|null} mapping
 * @returns {string|null}
 */
function resolveField(header, type, mapping) {

    if (mapping && mapping.columns) {

        if (Object.prototype.hasOwnProperty.call(mapping.columns, header)) {
            return mapping.columns[header];
        }

        const key = headerKey(header);

        for (const csvHeader of Object.keys(mapping.columns)) {
            if (headerKey(csvHeader) === key) {
                return mapping.columns[csvHeader];
            }
        }
    }

    const synonyms = HEADER_SYNONYMS[type] || {};

    return synonyms[headerKey(header)] || null;
}


// Precomputes header -> field once per file (the mapping is the same
// for every row) instead of re-resolving it per row.
function buildFieldMap(headers, type, mapping) {

    const map = {};

    for (const header of headers) {
        map[header] = resolveField(header, type, mapping);
    }

    return map;
}


// Applies the header map to one raw CSV row, then layers the mapping
// file's `defaults` on top of any field the row left blank.
function mapRow(row, fieldByHeader, mapping) {

    const raw = {};

    for (const [header, value] of Object.entries(row)) {

        const field = fieldByHeader[header];

        if (!field) {
            continue;
        }

        // A later column mapping to the same field only overwrites an
        // earlier one if it actually carries a value.
        if (value !== "" || raw[field] === undefined) {
            raw[field] = value;
        }
    }

    if (mapping && mapping.defaults) {

        for (const [field, value] of Object.entries(mapping.defaults)) {

            if (raw[field] === undefined || raw[field] === "") {
                raw[field] = value;
            }
        }
    }

    return raw;
}


// ---------------------------------------------------------------------
// Value normalization: raw mapped strings -> schema-shaped doc
// ---------------------------------------------------------------------

// Trims a raw cell to a non-blank string, or `fallback` (default
// undefined) when it's missing/blank. Mirrors importNormalizers.js's
// `toInt`/`toNumber` fallback contract for string fields.
function toStr(value, fallback) {

    if (value == null) {
        return fallback;
    }

    const str = String(value).trim();

    return str === "" ? fallback : str;
}


function toEmail(value) {

    const str = toStr(value);

    return str ? str.toLowerCase() : undefined;
}


// Applies `normalize` only when the raw cell is present and non-blank;
// returns undefined otherwise so stripUndefined can drop the key and an
// update row never clobbers an existing value with a normalizer default.
// Insert-only defaults live in the schema (setDefaultsOnInsert) or in
// INSERT_DEFAULTS below.
function whenPresent(value, normalize) {

    return toStr(value) === undefined ? undefined : normalize(value);
}


function buildCourseDoc(raw, cli) {

    return {
        code: toStr(raw.code),
        name: toStr(raw.name),
        department: toStr(raw.department, cli.department),
        credits: toInt(raw.credits),
        semester: toInt(raw.semester, cli.semester),
        year: toInt(raw.year, cli.year),
        academicYear: toInt(raw.academicYear, cli.academicYear),
        description: toStr(raw.description),
        duration: toInt(raw.duration),
        // Same split/trim/dedupe shape as a specialization list.
        prerequisites: whenPresent(raw.prerequisites, normalizeSpecialization),
        type: whenPresent(raw.type, normalizeCourseType),
        hoursPerWeek: toInt(raw.hoursPerWeek),
    };
}


function buildFacultyDoc(raw, cli) {

    return {
        name: toStr(raw.name),
        email: toEmail(raw.email),
        department: toStr(raw.department, cli.department),
        specialization: whenPresent(raw.specialization, normalizeSpecialization),
        availability: whenPresent(raw.availability, parseAvailability),
        maxHoursPerWeek: toInt(raw.maxHoursPerWeek),
    };
}


function buildRoomDoc(raw) {

    // Rooms have no department/year/semester/academicYear field, so
    // none of the CLI defaults apply here.
    return {
        name: toStr(raw.name),
        building: toStr(raw.building),
        floor: toInt(raw.floor),
        capacity: toInt(raw.capacity),
        type: whenPresent(raw.type, normalizeRoomType),
        equipment: whenPresent(raw.equipment, normalizeEquipment),
        availability: whenPresent(raw.availability, parseAvailability),
    };
}


function buildStudentDoc(raw, cli) {

    return {
        name: toStr(raw.name),
        registerNumber: toStr(raw.registerNumber),
        email: toEmail(raw.email),
        department: toStr(raw.department, cli.department),
        semester: toInt(raw.semester, cli.semester),
        academicYear: toInt(raw.academicYear, cli.academicYear),
        section: toStr(raw.section),
        year: toInt(raw.year, cli.year),
        phone: toStr(raw.phone),
    };
}


// Importer-level defaults that only apply when a row INSERTS a new
// document (schema-level defaults such as course type "lecture",
// duration 13, hoursPerWeek 3 and student section "A" are already
// covered by setDefaultsOnInsert). Updates never receive these, so a
// CSV without an Availability/Type column leaves the stored value alone.
const INSERT_DEFAULTS = {
    courses: () => ({}),
    faculty: () => ({ availability: defaultAvailability() }),
    rooms: () => ({ type: "lecture_hall", availability: defaultAvailability() }),
    students: () => ({}),
};


const DOC_BUILDERS = {
    courses: buildCourseDoc,
    faculty: buildFacultyDoc,
    rooms: buildRoomDoc,
    students: buildStudentDoc,
};

const MODELS = {
    courses: Course,
    faculty: Faculty,
    rooms: Room,
    students: Student,
};


// Drops undefined-valued keys so an update's $set never unsets an
// existing field just because this row's CSV left it blank.
function stripUndefined(doc) {

    const result = {};

    for (const [key, value] of Object.entries(doc)) {
        if (value !== undefined) {
            result[key] = value;
        }
    }

    return result;
}


// Upsert key per type, or null when the row doesn't have enough
// identifying fields to build one (treated as a validation failure).
function buildUpsertKey(type, doc) {

    switch (type) {

        case "courses":
            return doc.code ? { code: doc.code } : null;

        case "faculty":
            if (doc.email) {
                return { email: doc.email };
            }
            return doc.name && doc.department
                ? { name: doc.name, department: doc.department }
                : null;

        case "rooms":
            return doc.name && doc.building
                ? { name: doc.name, building: doc.building }
                : null;

        case "students":
            return doc.registerNumber ? { registerNumber: doc.registerNumber } : null;

        default:
            return null;
    }
}


// Fields carrying a unique index besides the upsert key itself.
const UNIQUE_FIELDS = {
    courses: [],
    faculty: [],
    rooms: [],
    students: ["email"],
};

// Returns messages for every unique-indexed field whose value is
// already taken by a DIFFERENT document than the one being upserted.
async function findUniqueCollisions(type, doc, existing) {

    const messages = [];

    for (const field of UNIQUE_FIELDS[type] || []) {

        if (doc[field] === undefined || doc[field] === null || doc[field] === "") {
            continue;
        }

        const Model = MODELS[type];
        const other = await Model.findOne({ [field]: doc[field] }).lean();

        if (other && (!existing || String(other._id) !== String(existing._id))) {
            messages.push(
                `${field} "${doc[field]}" already belongs to another ${type} record ` +
                `(${JSON.stringify(buildUpsertKey(type, other))})`
            );
        }
    }

    return messages;
}


// Runs Mongoose's own schema validation (no DB round trip) and
// returns a flat list of human-readable messages, empty when valid.
async function validateDoc(Model, doc) {

    try {
        await new Model(doc).validate();
        return [];
    } catch (error) {

        if (error && error.errors) {
            return Object.values(error.errors).map((e) => e.message);
        }

        return [error && error.message ? error.message : String(error)];
    }
}


// ---------------------------------------------------------------------
// User creation (--create-users)
// ---------------------------------------------------------------------

async function maybeCreateUser(type, doc, savedDoc, passwordHash) {

    if (!doc.email) {
        return { created: false, reason: "no email on row" };
    }

    const existingUser = await User.findOne({ email: doc.email });

    if (existingUser) {
        return { created: false, reason: "user already exists" };
    }

    const userDoc = {
        name: doc.name,
        email: doc.email,
        password: passwordHash,
        role: type === "faculty" ? "faculty" : "student",
    };

    if (type === "faculty") {
        userDoc.facultyId = savedDoc._id.toString();
    } else {
        userDoc.studentId = savedDoc._id.toString();
    }

    await new User(userDoc).save();

    return { created: true };
}


// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

async function main() {

    const args = parseArgs(process.argv.slice(2));

    const type = strArg(args.type);
    const filePath = strArg(args.file);

    if (!type || !VALID_TYPES.includes(type)) {
        console.error(
            `Usage: node scripts/importDataset.js --type ${VALID_TYPES.join("|")} --file <path> ` +
            "[--map mapping.json] [--dry-run] [--department X] [--academicYear N] [--year N] " +
            "[--semester N] [--create-users] [--default-password pw]"
        );
        process.exit(1);
        return;
    }

    if (!filePath) {
        console.error("Missing required --file <path.csv>");
        process.exit(1);
        return;
    }

    const dryRun = args["dry-run"] === true || args["dry-run"] === "true";
    const createUsers = args["create-users"] === true || args["create-users"] === "true";

    const cliDefaults = {
        department: strArg(args.department),
        academicYear: toInt(args.academicYear),
        year: toInt(args.year),
        semester: toInt(args.semester),
    };

    let mapping = null;
    const mapPath = strArg(args.map);

    if (mapPath) {

        try {
            const mapText = await fs.readFile(path.resolve(process.cwd(), mapPath), "utf8");
            mapping = JSON.parse(mapText);
        } catch (error) {
            console.error(`Could not read/parse --map file "${mapPath}": ${error.message}`);
            process.exit(1);
            return;
        }
    }

    let csvText;

    try {
        csvText = await fs.readFile(path.resolve(process.cwd(), filePath), "utf8");
    } catch (error) {
        console.error(`Could not read --file "${filePath}": ${error.message}`);
        process.exit(1);
        return;
    }

    const { headers, rows } = parseCsv(csvText);

    if (headers.length === 0) {
        console.error(`No headers found in "${filePath}" — is the file empty?`);
        process.exit(1);
        return;
    }

    const fieldByHeader = buildFieldMap(headers, type, mapping);
    const buildDoc = DOC_BUILDERS[type];
    const Model = MODELS[type];

    await dbConnect();

    let exitCode = 0;

    try {

        // Pass 1: normalize + validate every row, and (read-only)
        // classify it as insert/update/skip. Runs identically in
        // dry-run and real mode so the printed table always matches
        // what a real run would do.
        const results = [];

        for (let i = 0; i < rows.length; i++) {

            const rowNumber = i + 2; // header is row 1
            const raw = mapRow(rows[i], fieldByHeader, mapping);
            const rowDoc = stripUndefined(buildDoc(raw, cliDefaults));
            const key = buildUpsertKey(type, rowDoc);
            const existing = key ? await Model.findOne(key).lean() : null;

            // Inserts get the importer-level defaults; updates only
            // carry what the CSV actually provided, and are validated
            // as the merged result so a partial-update CSV that omits
            // a required column still passes.
            const doc = existing
                ? rowDoc
                : { ...INSERT_DEFAULTS[type](), ...rowDoc };
            const errors = await validateDoc(Model, existing ? { ...existing, ...doc } : doc);

            if (errors.length > 0) {
                results.push({ row: rowNumber, action: "skip", key: null, doc, errors });
                continue;
            }

            if (!key) {
                results.push({
                    row: rowNumber,
                    action: "skip",
                    key: null,
                    doc,
                    errors: ["Could not build an upsert key from this row"],
                });
                continue;
            }

            // Unique-index collisions on a NON-key field (e.g. a student
            // row whose email already belongs to a different register
            // number) would abort a real run with E11000, so predict
            // them here so --dry-run and the real run agree.
            const collisions = await findUniqueCollisions(type, doc, existing);

            if (collisions.length > 0) {
                results.push({ row: rowNumber, action: "skip", key, doc, errors: collisions });
                continue;
            }

            results.push({
                row: rowNumber,
                action: existing ? "update" : "insert",
                key,
                doc,
                errors: [],
            });
        }

        // Pass 2 (real run only): apply the writes, then optionally
        // create matching User accounts.
        const usersCreated = [];
        let passwordHash = null;
        let defaultPassword = null;

        if (!dryRun) {

            if (createUsers && (type === "faculty" || type === "students")) {
                defaultPassword = strArg(args["default-password"]) || DEFAULT_USER_PASSWORD;
                passwordHash = await bcrypt.hash(defaultPassword, 10);
            }

            for (const result of results) {

                if (result.action === "skip") {
                    continue;
                }

                let saved;

                try {
                    saved = await Model.findOneAndUpdate(
                        result.key,
                        { $set: result.doc },
                        { upsert: true, new: true, setDefaultsOnInsert: true }
                    );
                } catch (error) {
                    // One bad row must not abort the whole import:
                    // record it and carry on with the remaining rows.
                    result.action = "skip";
                    result.errors.push(
                        error && error.code === 11000
                            ? `Duplicate key: ${JSON.stringify(error.keyValue || {})}`
                            : (error && error.message) || String(error)
                    );
                    continue;
                }

                if (passwordHash) {
                    const outcome = await maybeCreateUser(type, result.doc, saved, passwordHash);
                    if (outcome.created) {
                        usersCreated.push(saved.email);
                    }
                }
            }
        }

        // Report.
        console.table(
            results.map((r) => ({
                row: r.row,
                action: r.action,
                key: r.key ? JSON.stringify(r.key) : "",
                errors: r.errors.join("; "),
            }))
        );

        const summary = {
            inserted: results.filter((r) => r.action === "insert").length,
            updated: results.filter((r) => r.action === "update").length,
            skipped: results.filter((r) => r.action === "skip").length,
            errors: results.reduce((sum, r) => sum + r.errors.length, 0),
        };

        console.log(dryRun ? "DRY RUN — no changes written." : "Import complete.");
        console.log(JSON.stringify(summary, null, 2));

        if (usersCreated.length > 0) {
            console.log(
                `Created ${usersCreated.length} user account(s) (${usersCreated.join(", ")}) ` +
                `with default password: ${defaultPassword} — share this once and have them change it on first login.`
            );
        }

        if (summary.errors > 0) {
            exitCode = 1;
        }

    } catch (error) {

        console.error("Import failed:", error.message);
        exitCode = 1;

    } finally {
        await mongoose.disconnect();
    }

    process.exit(exitCode);
}


main();
