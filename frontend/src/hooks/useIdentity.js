import { useCallback, useEffect, useRef, useState } from "react";

import api, { getStoredUser } from "@/lib/api";

// The single source of truth for "who is logged in", shared by every portal
// page (admin, faculty and student).
//
// Before this hook each page re-derived the user itself — reading
// `localStorage.getItem("user")`, JSON-parsing it, then guessing at
// `department` / `semester` / `year` with hardcoded defaults — and the
// copies drifted, which is why the dashboard and the timetable pages could
// disagree about the same user. Everything below replaces those copies.
//
// Resolution order:
//   1. The cached `user` written by `pages/Login.jsx` at login. It paints
//      immediately (no request), so a page never flashes empty. Read through
//      `lib/api.js#getStoredUser`, which wraps the storage access in
//      try/catch — `localStorage` throws outright in some privacy modes.
//   2. `GET /api/auth/me` (`backend/routes/authRoute.js`), which is
//      authoritative: it re-reads the `User` doc and the linked `Faculty` /
//      `Student` doc server-side and answers
//      `{ user: {id, name, email, role, facultyId, studentId, department,
//      semester, year, academicYear, section}, profile }`. Its answer
//      replaces the cached copy, in state and in `localStorage`, so pages
//      still reading storage directly see the fresh values too.
//   3. Faculty only: if `/auth/me` still reports `facultyId: null`, the
//      legacy email fallback looks the record up in `GET /api/faculty` by
//      email (test users from `createTestUsers.js` leave the link null).
//      There is deliberately no student equivalent — an unlinked student is
//      reported as unlinked.
//
// `linked` is the flag pages gate on: false means "faculty/student user with
// no profile record behind it", and the page shows "Profile not linked —
// contact admin" instead of data. Admins are always `linked` (they have no
// profile doc by design).

const PROFILE_FIELDS = ["department", "semester", "year", "academicYear", "section"];

function isCanceled(error) {
  return error?.code === "ERR_CANCELED" || error?.name === "CanceledError";
}

function messageFor(error) {
  return error?.response?.data?.error || error?.message || "Failed to load your profile";
}

/** First value that is neither undefined, null nor "", else null. */
function pick(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function asId(value) {
  return value === undefined || value === null || value === "" ? null : String(value);
}

/**
 * Normalises a `/auth/me`-shaped payload (or the cached login copy) plus the
 * linked profile doc into one identity object. Every consumer-visible field
 * is always present — `null` when unknown — so no page needs a default of
 * its own.
 *
 * @param {object|null} payload
 * @param {object|null} [profile] linked Faculty/Student doc, when known
 * @returns {object|null}
 */
function buildIdentity(payload, profile) {
  if (!payload) return null;

  const role = String(payload.role || "").toLowerCase();
  const identity = {
    ...payload,
    id: asId(pick(payload.id, payload._id)),
    name: pick(payload.name, profile?.name),
    email: pick(payload.email, profile?.email),
    role,
    facultyId: asId(pick(payload.facultyId, role === "faculty" ? profile?._id : null)),
    studentId: asId(pick(payload.studentId, role === "student" ? profile?._id : null)),
  };

  // The profile doc wins only where the payload has nothing: `/auth/me`
  // already copies these down off the same doc, and the cached copy may be
  // older than it.
  for (const field of PROFILE_FIELDS) {
    identity[field] = pick(payload[field], profile?.[field]);
  }

  return identity;
}

/**
 * A faculty/student user is "linked" when it actually points at a profile
 * record. Admins have no profile doc, so they are always linked.
 *
 * @param {object|null} identity
 * @returns {boolean}
 */
function resolveLinked(identity) {
  if (!identity) return false;
  if (identity.role === "faculty") return Boolean(identity.facultyId);
  if (identity.role === "student") return Boolean(identity.studentId);
  return true;
}

function readStoredToken() {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

function writeStoredUser(identity) {
  try {
    localStorage.setItem("user", JSON.stringify(identity));
  } catch {
    // Private browsing / storage disabled — state is still correct, the
    // cache just does not survive a reload.
  }
}

/**
 * Shared identity hook. Mount it in any portal page instead of re-deriving
 * the user from `localStorage`.
 *
 * @returns {{
 *   user: object|null,
 *   faculty: object|null,
 *   student: object|null,
 *   linked: boolean,
 *   loading: boolean,
 *   error: string|null,
 *   refresh: () => Promise<void>,
 * }}
 *   `user` carries `{id, name, email, role, facultyId, studentId,
 *   department, semester, year, academicYear, section}` — every key always
 *   present, `null` when unknown. `faculty` is the linked `Faculty` doc (only
 *   for faculty users), `student` the linked `Student` doc (only for student
 *   users); both are `null` otherwise. `linked` is false for a faculty user
 *   with no `facultyId` or a student user with no `studentId` — render
 *   "Profile not linked — contact admin" rather than data. `loading` is
 *   false once the `/auth/me` round trip settles, success or failure;
 *   `error` holds the message when it failed (cached `user`, if any, is kept
 *   so the page can still paint). `refresh()` re-runs the whole resolution.
 */
export function useIdentity() {
  const [user, setUser] = useState(() => buildIdentity(getStoredUser(), null));
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    // Cancel whatever this hook already has in flight before starting
    // another (covers refresh() being called twice in quick succession).
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setLoading(true);

    // No token means no session: `/auth/me` would 401 and the response
    // interceptor in `lib/api.js` would bounce to /login. Fail here instead
    // of firing a request that can only be rejected.
    if (!readStoredToken()) {
      if (!signal.aborted && mountedRef.current) {
        setUser(null);
        setProfile(null);
        setError("Not signed in");
        setLoading(false);
      }
      return;
    }

    try {
      const { data } = await api.get("/auth/me", { signal });
      if (signal.aborted || !mountedRef.current) return;

      const payload = data?.user || null;
      let linkedProfile = data?.profile || null;
      let identity = buildIdentity(payload, linkedProfile);

      // Legacy email fallback — faculty only, and only when the server
      // could not resolve the link itself. Students are intentionally left
      // out: an unlinked student is reported as unlinked.
      if (identity && identity.role === "faculty" && !identity.facultyId && identity.email) {
        try {
          const { data: facultyList } = await api.get("/faculty", { signal });
          if (signal.aborted || !mountedRef.current) return;

          const email = identity.email.toLowerCase();
          const match = (Array.isArray(facultyList) ? facultyList : []).find(
            (member) => String(member?.email || "").toLowerCase() === email
          );
          if (match) {
            linkedProfile = match;
            identity = buildIdentity({ ...payload, facultyId: match._id }, match);
          }
        } catch (fallbackError) {
          if (isCanceled(fallbackError)) return;
          // The fallback is best-effort: the identity from /auth/me still
          // stands, just unlinked.
          console.warn("useIdentity: faculty email fallback failed", fallbackError);
        }
      }

      if (signal.aborted || !mountedRef.current) return;

      setUser(identity);
      setProfile(linkedProfile);
      setError(null);
      setLoading(false);
      // The server answer is authoritative — replace the cached copy so
      // pages still reading `localStorage` directly do not drift.
      if (identity) writeStoredUser(identity);
    } catch (requestError) {
      if (isCanceled(requestError)) return;
      if (!mountedRef.current) return;
      console.warn("useIdentity: failed to load /auth/me", requestError);
      // Keep whatever was cached so the page can still paint, but report
      // the failure and never stay in a loading state.
      setError(messageFor(requestError));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [load]);

  const role = user?.role;

  return {
    user,
    faculty: role === "faculty" ? profile : null,
    student: role === "student" ? profile : null,
    linked: resolveLinked(user),
    loading,
    error,
    refresh: load,
  };
}

export default useIdentity;
