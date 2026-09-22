// backend/utils/importNormalizers.js
//
// Pure, dependency-free helpers that turn arbitrary CSV column
// headers and cell values into the shapes the Course / Faculty /
// Room / Student models expect. Nothing here touches Mongoose, the
// network or the console, so every function is directly
// unit-testable and safe to reuse from a dry-run.


/**
 * Normalize a header (or any label) for synonym lookup: lowercase,
 * strip everything that isn't a letter or digit. "Course Code",
 * "course_code" and "CourseCode" all collapse to "coursecode".
 *
 * @param {*} value
 * @returns {string}
 */
export function headerKey(value) {

    if (value == null) {
        return "";
    }

    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}


/**
 * Maps a `headerKey()`-normalized CSV column header to the schema
 * field it should populate, per dataset type. Includes the
 * canonical field name itself (normalized) as well as its
 * synonyms, so a lookup only ever needs `HEADER_SYNONYMS[type][headerKey(header)]`.
 */
export const HEADER_SYNONYMS = {
    courses: {
        coursecode: "code",
        code: "code",
        coursename: "name",
        title: "name",
        name: "name",
        department: "department",
        dept: "department",
        school: "department",
        credits: "credits",
        hours: "hoursPerWeek",
        hoursperweek: "hoursPerWeek",
        coursetype: "type",
        type: "type",
        sem: "semester",
        semester: "semester",
        year: "year",
        studyyear: "year",
        academicyear: "academicYear",
        ay: "academicYear",
        session: "academicYear",
        description: "description",
        duration: "duration",
        prerequisites: "prerequisites",
    },
    faculty: {
        teachername: "name",
        teacher: "name",
        instructor: "name",
        facultyname: "name",
        name: "name",
        email: "email",
        dept: "department",
        department: "department",
        school: "department",
        expertise: "specialization",
        skills: "specialization",
        specialisation: "specialization",
        specialization: "specialization",
        subjects: "specialization",
        maxhours: "maxHoursPerWeek",
        maxhoursperweek: "maxHoursPerWeek",
        workload: "maxHoursPerWeek",
        availability: "availability",
    },
    rooms: {
        roomno: "name",
        room: "name",
        roomname: "name",
        name: "name",
        building: "building",
        floor: "floor",
        features: "equipment",
        equipment: "equipment",
        facilities: "equipment",
        seats: "capacity",
        capacity: "capacity",
        roomtype: "type",
        type: "type",
        availability: "availability",
    },
    students: {
        regno: "registerNumber",
        rollno: "registerNumber",
        registernumber: "registerNumber",
        studentname: "name",
        name: "name",
        email: "email",
        dept: "department",
        department: "department",
        sem: "semester",
        semester: "semester",
        section: "section",
        division: "section",
        year: "year",
        academicyear: "academicYear",
        phone: "phone",
    },
};


const ROOM_TYPE_SYNONYMS = {
    lecture: "lecture_hall",
    classroom: "lecture_hall",
    lh: "lecture_hall",
    lecturehall: "lecture_hall",
    lab: "lab",
    laboratory: "lab",
    computerlab: "lab",
    complab: "lab",
    seminar: "seminar_room",
    seminarroom: "seminar_room",
    auditorium: "auditorium",
    hall: "auditorium",
};


/**
 * Normalize a raw room-type value ("Lecture Hall", "computer lab", ...)
 * to the `Room.type` enum. Unrecognised or blank input defaults to
 * "lecture_hall".
 *
 * @param {*} value
 * @returns {"lecture_hall"|"lab"|"seminar_room"|"auditorium"}
 */
export function normalizeRoomType(value) {
    return ROOM_TYPE_SYNONYMS[headerKey(value)] || "lecture_hall";
}


const EQUIPMENT_SYNONYMS = {
    projector: "projector",
    lcd: "projector",
    smartboard: "smartboard",
    "smart board": "smartboard",
    "interactive board": "smartboard",
    ac: "ac",
    "air conditioning": "ac",
    computers: "computers",
    pcs: "computers",
};


/**
 * Split a delimited equipment value ("Projector; Smart Board, AC")
 * into a lowercase, synonym-collapsed array.
 *
 * @param {*} value
 * @returns {string[]}
 */
export function normalizeEquipment(value) {

    if (!value) {
        return [];
    }

    return String(value)
        .split(/[;,|]/)
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0)
        .map((item) => EQUIPMENT_SYNONYMS[item] || item);
}


/**
 * Split a delimited specialization value ("AI/ML; Databases, DBMS")
 * into a deduplicated array. Unlike `normalizeEquipment`, original
 * casing is preserved (specializations are matched fuzzily elsewhere,
 * and casing is useful for display).
 *
 * @param {*} value
 * @returns {string[]}
 */
export function normalizeSpecialization(value) {

    if (!value) {
        return [];
    }

    const items = String(value)
        .split(/[;,|/]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

    const seen = new Set();
    const result = [];

    for (const item of items) {

        const dedupeKey = item.toLowerCase();

        if (seen.has(dedupeKey)) {
            continue;
        }

        seen.add(dedupeKey);
        result.push(item);
    }

    return result;
}


/**
 * Normalize a raw course-type value to the `Course.type` enum.
 * Anything meaning "lab" or "seminar" wins; everything else
 * (including blank) defaults to "lecture".
 *
 * @param {*} value
 * @returns {"lecture"|"lab"|"seminar"}
 */
export function normalizeCourseType(value) {

    const key = headerKey(value);

    if (key === "lab" || key === "practical" || key === "laboratory") {
        return "lab";
    }

    if (key === "seminar") {
        return "seminar";
    }

    return "lecture";
}


const DAY_NAMES = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
];

const DAY_ALIASES = {
    mon: "monday",
    monday: "monday",
    tue: "tuesday",
    tues: "tuesday",
    tuesday: "tuesday",
    wed: "wednesday",
    weds: "wednesday",
    wednesday: "wednesday",
    thu: "thursday",
    thur: "thursday",
    thurs: "thursday",
    thursday: "thursday",
    fri: "friday",
    friday: "friday",
    sat: "saturday",
    saturday: "saturday",
    sun: "sunday",
    sunday: "sunday",
};


/**
 * Default weekly availability used whenever a CSV's availability
 * cell is blank: Mon-Fri 09:00-17:30, weekends empty.
 *
 * @returns {Record<string, {start:string, end:string}[]>}
 */
export function defaultAvailability() {

    const weekday = [{ start: "09:00", end: "17:30" }];

    return {
        monday: [...weekday],
        tuesday: [...weekday],
        wednesday: [...weekday],
        thursday: [...weekday],
        friday: [...weekday],
        saturday: [],
        sunday: [],
    };
}


function resolveDay(token) {
    return DAY_ALIASES[String(token).trim().toLowerCase()] || null;
}


function expandDayRange(startDay, endDay) {

    const startIdx = DAY_NAMES.indexOf(startDay);
    const endIdx = DAY_NAMES.indexOf(endDay);

    if (startIdx === -1 || endIdx === -1) {
        return [];
    }

    const days = [];

    if (startIdx <= endIdx) {

        for (let i = startIdx; i <= endIdx; i++) {
            days.push(DAY_NAMES[i]);
        }

    } else {

        for (let i = startIdx; i < DAY_NAMES.length + endIdx + 1; i++) {
            days.push(DAY_NAMES[i % DAY_NAMES.length]);
        }
    }

    return days;
}


// Resolves one comma-separated day spec ("Mon-Fri" or "Mon,Wed,Fri")
// into a flat list of full lowercase day names.
function resolveDayTokens(dayToken) {

    const days = [];
    const parts = dayToken
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);

    for (const part of parts) {

        if (part.includes("-")) {

            const [startRaw, endRaw] = part.split("-").map((p) => p.trim());
            const start = resolveDay(startRaw);
            const end = resolveDay(endRaw);

            if (start && end) {
                days.push(...expandDayRange(start, end));
                continue;
            }
        }

        const single = resolveDay(part);

        if (single) {
            days.push(single);
        }
    }

    return days;
}


const TIME_RANGE_RE = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/;


/**
 * Parse a free-text weekly availability string, e.g.
 *   "Mon 09:00-12:00; Tue 14:00-17:00"
 *   "Mon-Fri 09:00-17:30"
 * into the {monday:[{start,end}], ...} shape stored on Faculty/Room.
 * Blank input, or input nothing here can parse, falls back to
 * `defaultAvailability()`.
 *
 * @param {*} value
 * @returns {Record<string, {start:string, end:string}[]>}
 */
export function parseAvailability(value) {

    const str = value == null ? "" : String(value).trim();

    if (str === "") {
        return defaultAvailability();
    }

    const result = {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
    };

    let matchedAny = false;

    const segments = str
        .split(";")
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);

    for (const segment of segments) {

        const parts = segment.split(/\s+/).filter(Boolean);

        if (parts.length < 2) {
            continue;
        }

        const timeMatch = parts[parts.length - 1].match(TIME_RANGE_RE);

        if (!timeMatch) {
            continue;
        }

        const dayToken = parts.slice(0, -1).join(" ");
        const days = resolveDayTokens(dayToken);

        if (days.length === 0) {
            continue;
        }

        for (const day of days) {
            result[day].push({ start: timeMatch[1], end: timeMatch[2] });
            matchedAny = true;
        }
    }

    return matchedAny ? result : defaultAvailability();
}


/**
 * Parse an integer, tolerant of blank/missing input. Returns
 * `fallback` (default `undefined`) instead of NaN when the value is
 * empty or unparseable.
 *
 * @param {*} value
 * @param {number} [fallback]
 * @returns {number|undefined}
 */
export function toInt(value, fallback) {

    if (value == null) {
        return fallback;
    }

    const str = String(value).trim();

    if (str === "") {
        return fallback;
    }

    const parsed = parseInt(str, 10);

    return Number.isNaN(parsed) ? fallback : parsed;
}


/**
 * Parse a number, tolerant of blank/missing input. Returns
 * `fallback` (default `undefined`) instead of NaN when the value is
 * empty or unparseable.
 *
 * @param {*} value
 * @param {number} [fallback]
 * @returns {number|undefined}
 */
export function toNumber(value, fallback) {

    if (value == null) {
        return fallback;
    }

    const str = String(value).trim();

    if (str === "") {
        return fallback;
    }

    const parsed = Number(str);

    return Number.isNaN(parsed) ? fallback : parsed;
}
