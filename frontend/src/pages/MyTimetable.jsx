import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  CalendarOff,
  LayoutDashboard,
  LayoutGrid,
  List,
  UserX,
} from "lucide-react";

import { navForRole } from "@/lib/nav";
import useIdentity from "@/hooks/useIdentity";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { useTimetableData } from "@/hooks/useTimetableData";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Callout } from "@/components/common/Callout";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
import { TimetableListView } from "@/components/timetable/TimetableListView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ============================================================
   COHORT SCOPING
   ------------------------------------------------------------
   This block is deliberately IDENTICAL in pages/StudentPortal.jsx
   and pages/MyTimetable.jsx. The dashboard and the timetable page
   used to match timetables with two different sets of rules, so
   they could show the same student two different timetables with
   nothing on screen saying they disagreed. Both now read the
   same identity (useIdentity → GET /api/auth/me) and run the
   same selection over the same server-scoped GET /api/timetables.
   Change one copy, change the other.

   There are NO cohort defaults here on purpose: no default
   department, no default semester, no default academic year
   taken from the system clock. An unknown field means
   "unknown", and a student whose cohort cannot be resolved
   gets an empty state — never somebody else's timetable.
============================================================ */

const isBlank = (value) =>
  value === undefined || value === null || value === "";

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeSemester = (value) => {
  const match = String(value ?? "").match(/\d+/);
  return match ? match[0] : "";
};

const getId = (value) => {
  if (value === null || value === undefined) return null;

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (value.$oid) return String(value.$oid);
  if (value._id) return getId(value._id);
  if (value.id) return getId(value.id);

  if (typeof value.toString === "function") {
    const result = value.toString();
    if (result && result !== "[object Object]") {
      return String(result);
    }
  }

  return null;
};

const normalizeDay = (day) => {
  if (!day) return "";

  const value = String(day).trim().toLowerCase();

  const days = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
  };

  return days[value] || String(day);
};

const formatTime = (time) => {
  if (!time) return "";

  if (typeof time !== "string") {
    return String(time);
  }

  return time.length >= 5 ? time.substring(0, 5) : time;
};

/**
 * Does this user have enough profile to name a cohort at all?
 * `department` is the minimum; without it there is nothing to scope to.
 */
function hasCohort(identity) {
  return Boolean(identity && !isBlank(identity.department));
}

/**
 * Query params for GET /api/timetables, built only from what the profile
 * actually says. The server rebuilds the filter from the JWT for a student
 * and ignores these (see backend/routes/timetableRoute.js#buildStudentFilter),
 * so they are a statement of intent, never the thing that keeps other
 * cohorts out.
 */
function cohortFilters(identity) {
  if (!hasCohort(identity)) return undefined;

  const filters = { department: identity.department, status: "published" };

  if (!isBlank(identity.semester)) filters.semester = String(identity.semester);
  if (!isBlank(identity.year)) filters.year = identity.year;
  if (!isBlank(identity.academicYear)) filters.academicYear = identity.academicYear;

  return filters;
}

/**
 * Client-side second layer, mirroring the server's `matchesStudentGroup`.
 * Defence in depth: the server already returns only this student's cohort,
 * published; this re-checks every row before it is rendered.
 */
function matchesCohort(timetable, identity) {
  if (!timetable || !hasCohort(identity)) return false;

  if (normalizeText(timetable.department) !== normalizeText(identity.department)) {
    return false;
  }

  if (
    !isBlank(identity.semester) &&
    normalizeSemester(timetable.semester) !== normalizeSemester(identity.semester)
  ) {
    return false;
  }

  // Legacy docs (pre `academicYear`) keep the calendar year in `year`.
  const legacy = isBlank(timetable.academicYear);

  if (
    !legacy &&
    !isBlank(identity.year) &&
    Number(timetable.year) !== Number(identity.year)
  ) {
    return false;
  }

  if (
    !isBlank(identity.academicYear) &&
    Number(legacy ? timetable.year : timetable.academicYear) !==
      Number(identity.academicYear)
  ) {
    return false;
  }

  return true;
}

/**
 * The one timetable this student is shown, or null.
 *
 * Published first, then most recently updated. There is deliberately no
 * "any non-empty timetable" fallback: if nothing matches the student's own
 * cohort the answer is null and the page says so.
 */
function selectCohortTimetable(timetables, identity) {
  const candidates = (Array.isArray(timetables) ? timetables : []).filter(
    (timetable) =>
      Array.isArray(timetable?.schedule) && matchesCohort(timetable, identity)
  );

  if (candidates.length === 0) return null;

  const statusRank = (timetable) =>
    normalizeText(timetable?.status) === "published" ? 0 : 1;

  const ranked = [...candidates].sort((a, b) => {
    const byStatus = statusRank(a) - statusRank(b);
    if (byStatus !== 0) return byStatus;

    const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();

    return dateB - dateA;
  });

  return ranked[0] || null;
}

/** Schedule entries of the chosen timetable, exact duplicates removed. */
function uniqueEntries(schedule) {
  const entries = Array.isArray(schedule) ? schedule : [];

  const result = [];
  const seen = new Set();

  entries.forEach((entry) => {
    const courseId = getId(
      entry.courseId || entry.courseID || entry.course_id || entry.course
    );

    const roomId = getId(
      entry.roomId || entry.roomID || entry.room_id || entry.room
    );

    const key = [
      courseId || entry.courseName || "course",
      roomId || entry.roomName || "room",
      normalizeDay(entry.day || entry.weekday),
      formatTime(entry.startTime || entry.start),
      formatTime(entry.endTime || entry.end),
    ].join("|");

    if (!seen.has(key)) {
      seen.add(key);
      result.push(entry);
    }
  });

  return result;
}

/* ============================================================
   GRID RECONCILIATION
   ------------------------------------------------------------
   `<TimetableGrid>` can only draw an entry in a cell that exists:
   Matrix does `index.get(day)?.get(row.start)`, so an entry is
   rendered only when its `day` is one of `grid.days` AND its
   `startTime` is exactly the `start` of one of `grid.slots`.
   Everything else — an entry left over from a previous period
   layout after an admin edits /infrastructure, an entry on a day
   the institution no longer works, an entry that starts inside a
   break — is dropped by the grid with no message, which used to
   show this page a week of "Free" cells while `entries.length > 0`
   (so the EmptyState branch never fired either).

   So the entries are reconciled against the live grid BEFORE
   rendering: whatever the grid cannot place is named in a Callout
   and listed in a `<TimetableListView>` underneath it, and the
   Grid/List toggle (same as pages/FacultyTimetable.jsx) always
   offers a view that shows every entry regardless of alignment.

   The same helper exists in pages/FacultyTimetable.jsx, which has
   the identical grid behaviour. Change one copy, change the other.
   The predicate below must keep mirroring
   `lib/schedule.js#groupByDay` (case-insensitive day match) and
   `TimetableGrid#indexByDayAndSlot` (exact `startTime` string).
============================================================ */

function partitionAgainstGrid(entries, grid) {
  const list = Array.isArray(entries) ? entries : [];

  const days = (grid?.days || []).map((day) => String(day).toLowerCase());
  const starts = new Set((grid?.slots || []).map((slot) => String(slot.start)));

  // Without a usable grid there is nothing to reconcile against; treat
  // every entry as placeable rather than reporting the whole week as
  // off-grid while the config is still loading.
  if (days.length === 0 || starts.size === 0) {
    return { onGrid: list, offGrid: [] };
  }

  const onGrid = [];
  const offGrid = [];

  list.forEach((entry) => {
    const day = String(entry?.day || "").toLowerCase();
    const start = String(entry?.startTime || "");

    if (days.includes(day) && starts.has(start)) {
      onGrid.push(entry);
    } else {
      offGrid.push(entry);
    }
  });

  return { onGrid, offGrid };
}

/* ============================================================
   /student-portal/timetable
   ------------------------------------------------------------
   The old hand-rolled row list is gone: the week is rendered by
   the shared <TimetableGrid> in `byBatch` mode, over the grid
   `useSystemConfig()` derives from GET /api/config/grid, so days,
   periods and breaks follow the institution's configuration
   rather than a copy of DAYS/TIME_SLOTS in this file.

   No `groupValue` is passed on purpose. The selected timetable is
   already this student's own cohort; letting the grid label the
   batch it finds keeps every entry on screen, where a client-side
   batch filter could silently drop rows whose course reference
   failed to resolve.
============================================================ */

function MyTimetable() {
  const navigate = useNavigate();

  // Identity comes from the shared hook only — never from an inline
  // localStorage read.
  const {
    user,
    linked,
    loading: identityLoading,
    error: identityError,
  } = useIdentity();

  const filters = useMemo(() => cohortFilters(user), [user]);

  // Same server-scoped GET /api/timetables the dashboard uses, through the
  // same hook, so the two pages cannot disagree about this student.
  const {
    timetables,
    maps,
    loading: dataLoading,
    error: dataError,
  } = useTimetableData(filters);

  const { grid } = useSystemConfig();

  const { brand, nav } = navForRole(user?.role || "student");

  /* -------------------------------------------------------
     NO SESSION → LOGIN
  ------------------------------------------------------- */

  useEffect(() => {
    if (!identityLoading && !user) {
      navigate("/login");
    }
  }, [identityLoading, user, navigate]);

  /* -------------------------------------------------------
     THE STUDENT'S OWN TIMETABLE
  ------------------------------------------------------- */

  const selected = useMemo(
    () => selectCohortTimetable(timetables, user),
    [timetables, user]
  );

  const entries = useMemo(() => uniqueEntries(selected?.schedule), [selected]);

  // Grid ↔ List. Purely a display choice; it changes nothing about which
  // entries this student is allowed to see.
  const [display, setDisplay] = useState("grid");

  // What the grid can actually draw, and what it would silently swallow.
  const { offGrid } = useMemo(
    () => partitionAgainstGrid(entries, grid),
    [entries, grid]
  );

  /* -------------------------------------------------------
     PROFILE VALUES — no invented defaults
  ------------------------------------------------------- */

  const studentDepartment = user?.department || "—";

  const studentSemester = isBlank(user?.semester)
    ? "—"
    : String(user.semester);

  const studentAcademicYear = isBlank(user?.academicYear)
    ? "—"
    : String(user.academicYear);

  const timetablesError = dataError?.timetables || null;

  const errorMessage = timetablesError
    ? `Unable to load your timetable: ${timetablesError}`
    : identityError || "";

  // Why there is nothing to show, when there is nothing to show.
  const emptyReason = !linked
    ? "Profile not linked — contact your administrator"
    : !hasCohort(user)
      ? "Your student profile has no department set — contact your administrator"
      : "No published timetable for your department and semester yet.";

  const loading = identityLoading || dataLoading;

  /* -------------------------------------------------------
     PAGE
  ------------------------------------------------------- */

  return (
    <AppShell brand={brand} nav={nav} chatbot={{ context: { page: "my-timetable" } }}>
      <PageHeader
        title="My Timetable"
        description="Your generated weekly class schedule."
        actions={
          <>
            {/* Same Grid/List toggle as pages/FacultyTimetable.jsx: the list
                renders every entry, aligned with the grid or not. */}
            <Tabs value={display} onValueChange={setDisplay}>
              <TabsList variant="pill">
                <TabsTrigger value="grid">
                  <LayoutGrid /> Grid
                </TabsTrigger>
                <TabsTrigger value="list">
                  <List /> List
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button variant="outline" onClick={() => navigate("/student-portal")}>
              <LayoutDashboard className="size-4" />
              Dashboard
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        {errorMessage && (
          <Callout tone="destructive" title="Could not load your timetable">
            {errorMessage}
          </Callout>
        )}

        {loading ? (
          <SectionCard title="My Timetable" description="Loading your schedule…">
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          </SectionCard>
        ) : !linked ? (
          /* UNLINKED PROFILE — no data is shown at all */
          <SectionCard
            title="Profile not linked"
            description="Your account is not connected to a student record."
            icon={UserX}
          >
            <EmptyState
              icon={UserX}
              title="Profile not linked — contact your administrator"
              description="Until your account is linked to a student record there is no cohort to show a timetable for."
            />
          </SectionCard>
        ) : (
          <SectionCard
            title={selected?.name || "My Timetable"}
            description={`${studentDepartment} · Semester ${studentSemester} · ${studentAcademicYear}`}
            icon={CalendarDays}
            actions={
              selected ? (
                <Badge variant="secondary" className="capitalize">
                  {selected.status}
                </Badge>
              ) : null
            }
          >
            {entries.length > 0 ? (
              display === "list" ? (
                <TimetableListView
                  schedule={entries}
                  grid={grid}
                  maps={maps}
                  groupBy="day"
                  colorMode="type"
                />
              ) : (
                <div className="space-y-4">
                  <TimetableGrid
                    schedule={entries}
                    grid={grid}
                    maps={maps}
                    viewMode="byBatch"
                    colorMode="type"
                    title={selected?.name || "My Timetable"}
                    subtitle={`${studentDepartment} · Semester ${studentSemester} · ${studentAcademicYear}`}
                  />

                  {/* Nothing disappears silently: whatever the grid could not
                      place is named and then listed underneath it. */}
                  {offGrid.length > 0 && (
                    <div className="space-y-3">
                      <Callout
                        tone="warning"
                        title={`${offGrid.length} ${
                          offGrid.length === 1 ? "class falls" : "classes fall"
                        } outside the current timetable grid`}
                        icon={CalendarOff}
                      >
                        Their day or start time no longer matches a period in
                        the institution&apos;s scheduling grid, so the week
                        above cannot show them. They are listed below.
                      </Callout>

                      <TimetableListView
                        schedule={offGrid}
                        grid={grid}
                        maps={maps}
                        groupBy="day"
                        colorMode="type"
                      />
                    </div>
                  )}
                </div>
              )
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="Nothing scheduled yet"
                description={emptyReason}
              />
            )}
          </SectionCard>
        )}
      </div>
    </AppShell>
  );
}

export default MyTimetable;
