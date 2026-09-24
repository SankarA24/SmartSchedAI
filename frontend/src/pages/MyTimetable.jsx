import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  Clock,
  LayoutDashboard,
  LayoutGrid,
  List,
  UserX,
} from "lucide-react";

import { navForRole } from "@/lib/nav";
import { colorTokenFor, computeStats, groupByDay, resolveEntry } from "@/lib/schedule";
import useIdentity from "@/hooks/useIdentity";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { useTimetableData } from "@/hooks/useTimetableData";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Callout } from "@/components/common/Callout";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
import { TimetableListView } from "@/components/timetable/TimetableListView";
import { chartBgClass } from "@/components/timetable/TimetableLegend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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

   LAYOUT (bento, matching pages/Dashboard.jsx and the faculty
   counterpart pages/FacultyTimetable.jsx):
     Band 1 — the week itself in the dominant cell (xl:col-span-8)
              beside a rail (xl:col-span-4) carrying four KPI
              tiles, the per-day load and the courses behind the
              week. Every figure in the rail is derived from the
              same `entries` array the grid draws, so no cell on
              the page can disagree with another.

   Colour is semantic only: primary/success/warning/destructive
   washes for state, and the chart tokens ONLY as the fill of the
   class-type dots that key the grid's own stripes. Nothing on
   this page puts text on a chart token.
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
     THE SAME WEEK, COUNTED
     -------------------------------------------------------
     Everything below is derived from `entries` — the very array
     the grid renders. No extra request, no second source of
     truth, and nothing here widens what this student can see.
  ------------------------------------------------------- */

  const stats = useMemo(
    () => computeStats(entries, grid, maps),
    [entries, grid, maps]
  );

  const classDays = useMemo(() => {
    const days = new Set(
      entries
        .map((entry) => String(entry?.day || "").toLowerCase())
        .filter((day) => day !== "")
    );
    return days.size;
  }, [entries]);

  /**
   * Classes per working day, over the institution's own days (never a local
   * copy). Each bar is a share of the busiest day, so a light week does not
   * render as a row of full bars.
   */
  const dayLoad = useMemo(() => {
    const byDay = groupByDay(entries, grid);
    const rows = (grid?.days || []).map((day) => ({
      day,
      count: (byDay.get(day) || []).length,
    }));
    const max = rows.reduce((peak, row) => Math.max(peak, row.count), 0);
    return { rows, max };
  }, [entries, grid]);

  const busiestDay = useMemo(() => {
    if (dayLoad.max <= 0) return null;
    return dayLoad.rows.find((row) => row.count === dayLoad.max) || null;
  }, [dayLoad]);

  /**
   * The distinct courses behind this week. The dot is tinted with
   * `colorTokenFor(entry, "type", …)` — the same token the grid stripes the
   * matching cell with — so the two surfaces always agree. The token is a
   * FILL only: the label beside it is plain foreground text.
   */
  const coursesThisWeek = useMemo(() => {
    const seen = new Map();

    for (const entry of entries) {
      const resolved = resolveEntry(entry, maps);
      const key = resolved.code || resolved.label || String(entry?.courseId ?? "");
      if (!key) continue;

      const existing = seen.get(key);
      if (existing) {
        existing.sessions += 1;
        if (resolved.faculty?.name) existing.faculty.add(resolved.faculty.name);
        if (resolved.room?.name) existing.rooms.add(resolved.room.name);
        continue;
      }

      seen.set(key, {
        key,
        label: resolved.label || key,
        code: resolved.code,
        type: resolved.type || "lecture",
        token: colorTokenFor(entry, "type", maps),
        sessions: 1,
        faculty: new Set(resolved.faculty?.name ? [resolved.faculty.name] : []),
        rooms: new Set(resolved.room?.name ? [resolved.room.name] : []),
      });
    }

    return [...seen.values()].sort(
      (a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label)
    );
  }, [entries, maps]);

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

  const cohortLine = `${studentDepartment} · Semester ${studentSemester} · ${studentAcademicYear}`;

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

  // A failed fetch must never read as a zero: every derived figure falls back
  // to an em dash while the timetable request is in error.
  const figure = (value) => (timetablesError ? "—" : value);

  const shellProps = {
    brand,
    nav,
    chatbot: { context: { page: "my-timetable" } },
  };

  /* -------------------------------------------------------
     LOADING — the bento's own shape, not a stack of bars
  ------------------------------------------------------- */

  if (loading) {
    return (
      <AppShell {...shellProps}>
        <PageHeader
          title="My Timetable"
          description="Your generated weekly class schedule."
        />

        <div className="grid gap-5 xl:grid-cols-12">
          <Skeleton className="h-[28rem] w-full rounded-xl xl:col-span-8" />

          <div className="flex flex-col gap-5 xl:col-span-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[...Array(4)].map((_, index) => (
                <Skeleton key={index} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-52 w-full rounded-xl" />
            <Skeleton className="h-52 w-full rounded-xl" />
          </div>
        </div>
      </AppShell>
    );
  }

  /* -------------------------------------------------------
     UNLINKED PROFILE — no data is shown at all
  ------------------------------------------------------- */

  if (!linked) {
    return (
      <AppShell {...shellProps}>
        <PageHeader
          title="My Timetable"
          description="Your generated weekly class schedule."
        />

        <div className="space-y-5">
          {errorMessage ? (
            <Callout tone="destructive" title="Could not load your timetable">
              {errorMessage}
            </Callout>
          ) : null}

          <div className="flex min-h-[50vh] items-center justify-center">
            <EmptyState
              icon={UserX}
              title="Profile not linked — contact your administrator"
              description="Until your account is linked to a student record there is no cohort to show a timetable for."
            />
          </div>
        </div>
      </AppShell>
    );
  }

  /* -------------------------------------------------------
     PAGE
  ------------------------------------------------------- */

  return (
    <AppShell {...shellProps}>
      <PageHeader
        title="My Timetable"
        description={cohortLine}
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

      <div className="space-y-5">
        {errorMessage && (
          <Callout tone="destructive" title="Could not load your timetable">
            {errorMessage}
          </Callout>
        )}

        {/* ============ Band 1 — the week, and everything derived from it ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/* ---- The week itself: the page's dominant cell ---- */}
          <SectionCard
            title={selected?.name || "Weekly schedule"}
            description="Your cohort's published week, drawn on the institution's scheduling grid"
            icon={CalendarDays}
            padded={false}
            className="min-w-0 overflow-hidden xl:col-span-8"
            actions={
              selected ? (
                <Badge variant="secondary" className="capitalize">
                  {selected.status}
                </Badge>
              ) : null
            }
          >
            <div className="px-6 pb-6">
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
                      density="compact"
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
                          above cannot show them. They are listed below, and the
                          List view shows every class.
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
                  title={
                    timetablesError
                      ? "Timetable unavailable"
                      : "Nothing scheduled yet"
                  }
                  description={
                    timetablesError
                      ? "Your week could not be loaded. Refresh the page to try again."
                      : emptyReason
                  }
                />
              )}
            </div>
          </SectionCard>

          {/* ---- The rail: the same week, counted ---- */}
          <div className="flex min-w-0 flex-col gap-5 xl:col-span-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard
                label="Classes"
                value={figure(stats.totalClasses)}
                icon={CalendarDays}
              />

              <StatCard
                label="Class days"
                value={figure(classDays)}
                icon={CalendarRange}
              />

              <StatCard
                label="Weekly hours"
                value={figure(stats.hoursPerWeek)}
                icon={Clock}
              />

              <StatCard
                label="Courses"
                value={figure(coursesThisWeek.length)}
                icon={BookOpen}
              />
            </div>

            {/* ---- Per-day load ---- */}
            <SectionCard
              title="Load by day"
              description={
                busiestDay && !timetablesError
                  ? `Busiest on ${busiestDay.day} — ${busiestDay.count} ${
                      busiestDay.count === 1 ? "class" : "classes"
                    }`
                  : "Classes per working day"
              }
              icon={CalendarRange}
            >
              {timetablesError ? (
                <EmptyState
                  icon={CalendarRange}
                  title="Load unavailable"
                  description="The week could not be loaded, so it cannot be counted."
                />
              ) : dayLoad.rows.length === 0 ? (
                <EmptyState
                  icon={CalendarRange}
                  title="No working days configured"
                  description="The institution's scheduling grid has no days to chart yet."
                />
              ) : (
                <ul className="space-y-3">
                  {dayLoad.rows.map((row) => (
                    <li key={row.day} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 truncate text-xs text-muted-foreground">
                        {row.day}
                      </span>
                      <Progress
                        value={
                          dayLoad.max > 0
                            ? Math.round((row.count / dayLoad.max) * 100)
                            : 0
                        }
                        className="h-2 min-w-0 flex-1"
                        aria-label={`${row.day}: ${row.count} classes`}
                      />
                      <span className="w-4 shrink-0 text-right text-xs font-medium text-foreground tabular-nums">
                        {row.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {/* ---- The courses behind the week ---- */}
            <SectionCard
              title="Your courses"
              description={
                timetablesError || coursesThisWeek.length === 0
                  ? "Taken from your published week"
                  : `${coursesThisWeek.length} ${
                      coursesThisWeek.length === 1 ? "course" : "courses"
                    } this week`
              }
              icon={BookOpen}
            >
              {timetablesError ? (
                <EmptyState
                  icon={BookOpen}
                  title="Courses unavailable"
                  description="The week could not be loaded, so its courses cannot be listed."
                />
              ) : coursesThisWeek.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title="No courses yet"
                  description="Courses appear here once a timetable is published for your cohort."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {coursesThisWeek.map((course) => (
                    <li
                      key={course.key}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span
                        aria-hidden="true"
                        className={`size-2.5 shrink-0 rounded-full ${chartBgClass(
                          course.token
                        )}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {course.label}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[
                            course.code,
                            course.faculty.size > 0
                              ? [...course.faculty].join(", ")
                              : null,
                            course.rooms.size > 0
                              ? [...course.rooms].join(", ")
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No room recorded"}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {course.sessions}/wk
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {!timetablesError && coursesThisWeek.length > 0 ? (
                <>
                  <Separator className="my-4" />
                  <p className="text-xs text-muted-foreground">
                    Dot colours match the class-type stripes on the week beside
                    this card.
                  </p>
                </>
              ) : null}
            </SectionCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default MyTimetable;
