// backend/utils/csv.js
//
// Hand-rolled CSV parser (RFC-4180-ish, no dependencies).
//
// Handles:
//   - quoted fields, including embedded commas
//   - doubled quotes ("") inside a quoted field, unescaped to one quote
//   - embedded newlines inside quoted fields
//   - CRLF and LF line endings
//   - a leading UTF-8 BOM
//   - a trailing newline
//   - fully blank lines (skipped, not turned into a row)
//
// Deliberately dumb about everything else: no type coercion, no
// trimming of unquoted values beyond stripping a trailing \r, no
// header validation. That belongs to the caller (importNormalizers.js).

const BOM = "﻿";


/**
 * Parse raw CSV text into a header list and an array of row objects
 * keyed by the raw header strings (not normalized).
 *
 * @param {string} text
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseCsv(text) {

    if (
        text == null ||
        typeof text !== "string"
    ) {
        return { headers: [], rows: [] };
    }

    let input = text;

    if (input.charCodeAt(0) === 0xfeff || input.startsWith(BOM)) {
        input = input.slice(1);
    }

    const records = tokenizeRecords(input);

    if (records.length === 0) {
        return { headers: [], rows: [] };
    }

    const headers = records[0];
    const rows = [];

    for (let i = 1; i < records.length; i++) {

        const record = records[i];

        const isBlank =
            record.length === 0 ||
            (record.length === 1 && record[0] === "");

        if (isBlank) {
            continue;
        }

        const row = {};

        for (let col = 0; col < headers.length; col++) {
            row[headers[col]] = record[col] !== undefined ? record[col] : "";
        }

        rows.push(row);
    }

    return { headers, rows };
}


/**
 * Walk the raw text once, character by character, splitting it into
 * records (rows) of fields, honouring quoting rules along the way.
 *
 * @param {string} input
 * @returns {string[][]}
 */
function tokenizeRecords(input) {

    const records = [];
    let record = [];
    let field = "";
    let inQuotes = false;
    let sawAnyField = false;

    const length = input.length;
    let i = 0;

    while (i < length) {

        const char = input[i];

        if (inQuotes) {

            if (char === '"') {

                if (input[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }

                inQuotes = false;
                i += 1;
                continue;
            }

            field += char;
            i += 1;
            continue;
        }

        if (char === '"') {
            inQuotes = true;
            sawAnyField = true;
            i += 1;
            continue;
        }

        if (char === ",") {
            record.push(field);
            field = "";
            sawAnyField = true;
            i += 1;
            continue;
        }

        if (char === "\r") {

            if (input[i + 1] === "\n") {
                i += 1;
            }

            record.push(field);
            records.push(record);
            record = [];
            field = "";
            sawAnyField = false;
            i += 1;
            continue;
        }

        if (char === "\n") {
            record.push(field);
            records.push(record);
            record = [];
            field = "";
            sawAnyField = false;
            i += 1;
            continue;
        }

        field += char;
        sawAnyField = true;
        i += 1;
    }

    // Flush a trailing field/record that wasn't terminated by a newline
    // (covers both "no trailing newline" and an empty trailing line
    // that parseCsv's blank-line skip will drop anyway).
    if (field !== "" || sawAnyField || record.length > 0) {
        record.push(field);
        records.push(record);
    }

    return records;
}
