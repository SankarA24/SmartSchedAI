import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import api from "@/lib/api";

// Builds a `Map<id, doc>` keyed by string `_id` from a list response — the
// shape `lib/schedule.js#resolveEntry` (via its internal `toLookup`) reads
// directly with `source.get(String(id))`.
function toMap(list) {
  const map = new Map();
  for (const item of list || []) {
    if (item && item._id != null) map.set(String(item._id), item);
  }
  return map;
}

const EMPTY_MAPS = { courses: new Map(), faculty: new Map(), rooms: new Map() };

function isCanceled(error) {
  return error?.code === "ERR_CANCELED" || error?.name === "CanceledError";
}

function messageFor(error) {
  return error?.response?.data?.error || error?.message || "Request failed";
}

/**
 * Fetches the four collections a timetable view needs — timetables (scoped
 * by the filters below), courses, faculty, rooms — through the shared
 * `lib/api.js` client, and derives the `_id` lookup Maps
 * `lib/schedule.js#resolveEntry` expects as its `maps` argument.
 *
 * Each of the four requests is independent: one failing keeps the other
 * three (and, for that one, whatever was last successfully loaded — `[]`
 * on the very first load) rather than blanking the whole result, and is
 * reported per-source on `error`.
 *
 * @param {{department?:string, semester?:string, year?:string|number, academicYear?:string|number, status?:string}} [filters]
 *   Forwarded as query params to `GET /timetables` (see
 *   `backend/routes/timetableRoute.js#buildListFilter` — every field is
 *   optional and omitted params are unfiltered). `/courses`, `/faculty`,
 *   `/rooms` take no query params and are always fetched in full.
 * @returns {{
 *   timetables: object[], courses: object[], faculty: object[], rooms: object[],
 *   maps: {courses: Map<string,object>, faculty: Map<string,object>, rooms: Map<string,object>},
 *   loading: boolean,
 *   error: null | {timetables: string|null, courses: string|null, faculty: string|null, rooms: string|null},
 *   refresh: () => Promise<void>,
 * }}
 */
export function useTimetableData(filters) {
  const { department, semester, year, academicYear, status } = filters || {};

  const [timetables, setTimetables] = useState([]);
  const [courses, setCourses] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const abortRef = useRef(null);
  // Mirrors last-known-good state so a failed request can keep it instead
  // of a stale closure capturing the pre-fetch value.
  const lastGood = useRef({ timetables: [], courses: [], faculty: [], rooms: [] });

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setLoading(true);

    const params = {};
    if (department) params.department = department;
    if (semester) params.semester = semester;
    if (year !== undefined && year !== null && year !== "") params.year = year;
    if (academicYear !== undefined && academicYear !== null && academicYear !== "") {
      params.academicYear = academicYear;
    }
    if (status) params.status = status;

    const [timetablesResult, coursesResult, facultyResult, roomsResult] = await Promise.allSettled([
      api.get("/timetables", { params, signal }),
      api.get("/courses", { signal }),
      api.get("/faculty", { signal }),
      api.get("/rooms", { signal }),
    ]);

    if (signal.aborted) return;

    const nextErrors = { timetables: null, courses: null, faculty: null, rooms: null };
    const setters = { timetables: setTimetables, courses: setCourses, faculty: setFaculty, rooms: setRooms };
    const results = { timetables: timetablesResult, courses: coursesResult, faculty: facultyResult, rooms: roomsResult };

    for (const key of Object.keys(results)) {
      const result = results[key];
      if (result.status === "fulfilled") {
        const value = Array.isArray(result.value.data) ? result.value.data : [];
        lastGood.current[key] = value;
        setters[key](value);
      } else if (!isCanceled(result.reason)) {
        console.warn(`useTimetableData: failed to load /${key}`, result.reason);
        nextErrors[key] = messageFor(result.reason);
        // Keep whatever this source last successfully returned instead of
        // blanking it.
        setters[key](lastGood.current[key]);
      }
    }

    const hasError = Object.values(nextErrors).some(Boolean);
    setError(hasError ? nextErrors : null);
    setLoading(false);
  }, [department, semester, year, academicYear, status]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const maps = useMemo(() => {
    if (!courses.length && !faculty.length && !rooms.length) return EMPTY_MAPS;
    return { courses: toMap(courses), faculty: toMap(faculty), rooms: toMap(rooms) };
  }, [courses, faculty, rooms]);

  return { timetables, courses, faculty, rooms, maps, loading, error, refresh: load };
}
