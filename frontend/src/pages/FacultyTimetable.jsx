import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  Clock,
  DoorOpen,
  LayoutGrid,
  List,
  Printer,
  ShieldAlert,
} from "lucide-react";

import api from "@/lib/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { navForRole } from "@/lib/nav";
import { colorTokenFor, computeStats, groupByDay, resolveEntry } from "@/lib/schedule";
import { useIdentity } from "@/hooks/useIdentity";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
import { TimetableListView } from "@/components/timetable/TimetableListView";
import { chartBgClass } from "@/components/timetable/TimetableLegend";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import { EmptyState } from "@/components/common/EmptyState";
import { Callout } from "@/components/common/Callout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/*
  /faculty-portal/timetable — this faculty member's own week.

  The day-accordion renderer this page used to carry is gone: the week is
  drawn by the shared `TimetableGrid` in `viewMode="byFaculty"` with
  `groupValue` set to the signed-in member's own faculty id, over the
  server-owned grid from `useSystemConfig()` (GET /api/config/grid). Days and
  slots are never hardcoded here.

  LAYOUT (bento, matching pages/Dashboard.jsx):
    Band 1 — the week itself in the dominant cell (xl:col-span-8) with a
             right-hand rail (xl:col-span-4) carrying the four KPI tiles, the
             per-day load and the courses this member teaches. Every figure
             in the rail is derived from the same `timetable` array the grid
             draws, so nothing on the page can disagree with the week.

  DATA SCOPING (unchanged by the re-skin):
    - Identity comes from `useIdentity()` — no inline localStorage read.
    - `linked === false` renders "Profile not linked — contact your
      administrator" instead of anybody else's timetable.
    - Only PUBLISHED timetables are read, and within them only entries whose
      `facultyId` matches this user's own — a second layer on top of the
      server's role scoping of GET /timetables.
    - There is no "show the first timetable we can find" fallback: when none
      of them carry an entry of theirs, the page stays empty.
    - Room and course ids are resolved against the fetched collections, so
      the grid shows names rather than raw ObjectIds.
*/

/*
  GRID RECONCILIATION — identical helper to the one in pages/MyTimetable.jsx;
  change one copy, change the other.

  `<TimetableGrid>` only draws an entry whose `day` is one of `grid.days` and
  whose `startTime` is exactly the `start` of one of `grid.slots` (Matrix does
  `index.get(day)?.get(row.start)`). An entry stored against an older period
  layout, a working day the institution has since dropped, or a start time
  that now falls inside a break is swallowed without a message. The List view
  below shows every entry regardless, but nothing told the user to switch, so
  the entries the grid cannot place are counted here and named in a Callout.

  The predicate mirrors `lib/schedule.js#groupByDay` (case-insensitive day
  match) and `TimetableGrid#indexByDayAndSlot` (exact `startTime` string).
*/
function partitionAgainstGrid(entries, grid) {
  const list = Array.isArray(entries) ? entries : [];

  const days = (grid?.days || []).map((day) => String(day).toLowerCase());
  const starts = new Set((grid?.slots || []).map((slot) => String(slot.start)));

  // No usable grid yet (config still loading): nothing to reconcile against.
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

/** `Map<id, doc>` keyed the way `lib/schedule.js#resolveEntry` reads it. */
function toIdMap(list) {
  const map = new Map();
  for (const item of list || []) {
    const id = item?._id ?? item?.id;
    if (id != null) map.set(String(id), item);
  }
  return map;
}

export default function FacultyTimetable() {
  const navigate = useNavigate();

  // Who is signed in — resolved once by the shared hook (GET /api/auth/me),
  // not by parsing localStorage here. `linked` is false when the account
  // has no Faculty record behind it.
  const {
    user,
    faculty,
    linked,
    loading: identityLoading,
    error: identityError,
  } = useIdentity();

  const { grid } = useSystemConfig();

  const [timetable, setTimetable] = useState([]);
  const [courses, setCourses] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [display, setDisplay] = useState("grid");

  const facultyId = user?.facultyId ? String(user.facultyId) : "";
  const role = user?.role || "";

  // Anyone who is not a signed-in faculty member has no business here.
  // ProtectedRoute already guards the route; this is the second layer.
  useEffect(() => {
    if (identityLoading) return;
    if (!user || (role && role !== "faculty")) {
      navigate("/login");
    }
  }, [identityLoading, user, role, navigate]);

  useEffect(() => {
    if (identityLoading) return;

    // Unlinked (or not signed in): there is nothing of this user's to show,
    // and the render below says so instead of showing someone else's data.
    if (!linked || !facultyId) {
      setTimetable([]);
      setCourses([]);
      setRooms([]);
      setLoading(false);
      return;
    }

    let canceled = false;

    const fetchFacultyTimetable = async () => {
      setLoading(true);
      setError("");

      try {
        // GET /api/timetables is scoped server-side for a faculty caller:
        // published timetables that already contain one of this faculty's
        // entries. The facultyId filter below is a second layer on top.
        let timetableData, coursesData, roomsData;

        try {
          const [timetableResponse, coursesResponse, roomsResponse] =
            await Promise.all([
              api.get("/timetables"),
              api.get("/courses"),
              api.get("/rooms"),
            ]);

          timetableData = timetableResponse.data;
          coursesData = coursesResponse.data;
          roomsData = roomsResponse.data;
        } catch (requestError) {
          const data = requestError.response?.data;
          throw new Error(
            data?.error ||
              data?.message ||
              requestError.message ||
              "Failed to fetch timetable"
          );
        }

        if (canceled) return;

        // Handle different possible API response formats
        const timetables = Array.isArray(timetableData)
          ? timetableData
          : timetableData?.timetables || [];

        const courseList = Array.isArray(coursesData)
          ? coursesData
          : coursesData?.courses || [];

        const roomList = Array.isArray(roomsData)
          ? roomsData
          : roomsData?.rooms || [];

        setCourses(courseList);
        setRooms(roomList);

        const entries = [];

        timetables.forEach((table) => {
          if (!Array.isArray(table.schedule)) return;

          // Published only, and only this faculty member's own entries.
          // No "first timetable we can find" fallback: if none of them
          // carry an entry of theirs, the page stays empty.
          if (String(table.status || "") !== "published") return;

          table.schedule.forEach((entry) => {
            if (String(entry.facultyId || "") === facultyId) {
              entries.push({
                ...entry,
                timetableName: table.name,
                semester: table.semester,
                year: table.year,
                department: table.department,
              });
            }
          });
        });

        setTimetable(entries);
      } catch (err) {
        if (canceled) return;
        console.error("Timetable error:", err);
        setError(err.message || "Unable to load timetable.");
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    fetchFacultyTimetable();

    return () => {
      canceled = true;
    };
  }, [identityLoading, linked, facultyId]);

  // Course and room ids in `Timetable.schedule[]` are plain strings; these
  // lookups are what turns them into names in the grid instead of raw
  // ObjectIds. `faculty` holds only the signed-in member's own record —
  // every entry on this page is theirs.
  const maps = useMemo(
    () => ({
      courses: toIdMap(courses),
      rooms: toIdMap(rooms),
      faculty: toIdMap(faculty ? [faculty] : []),
    }),
    [courses, rooms, faculty]
  );

  const stats = useMemo(
    () => computeStats(timetable, grid, maps),
    [timetable, grid, maps]
  );

  // Entries the grid cannot place — surfaced rather than swallowed.
  const { offGrid } = useMemo(
    () => partitionAgainstGrid(timetable, grid),
    [timetable, grid]
  );

  const teachingDays = useMemo(() => {
    const days = new Set(
      timetable
        .map((entry) => String(entry.day || "").toLowerCase())
        .filter((day) => day !== "")
    );
    return days.size;
  }, [timetable]);

  /**
   * Classes per working day, over the institution's own days (never a local
   * copy). The bar is a share of the busiest day, so a light week does not
   * render as a row of full bars.
   */
  const dayLoad = useMemo(() => {
    const byDay = groupByDay(timetable, grid);
    const rows = (grid?.days || []).map((day) => ({
      day,
      count: (byDay.get(day) || []).length,
    }));
    const max = rows.reduce((peak, row) => Math.max(peak, row.count), 0);
    return { rows, max };
  }, [timetable, grid]);

  const busiestDay = useMemo(() => {
    if (dayLoad.max <= 0) return null;
    return dayLoad.rows.find((row) => row.count === dayLoad.max) || null;
  }, [dayLoad]);

  /**
   * The distinct courses behind this member's week, tinted with the same
   * `colorTokenFor(entry, "course", …)` token the grid uses, so the dot in
   * this card and the stripe in the grid are always the same colour.
   */
  const coursesTaught = useMemo(() => {
    const seen = new Map();

    for (const entry of timetable) {
      const resolved = resolveEntry(entry, maps);
      const key = resolved.code || resolved.label || String(entry?.courseId ?? "");
      if (!key) continue;

      const existing = seen.get(key);
      if (existing) {
        existing.sessions += 1;
        if (resolved.room?.name) existing.rooms.add(resolved.room.name);
        continue;
      }

      seen.set(key, {
        key,
        label: resolved.label || key,
        code: resolved.code,
        token: colorTokenFor(entry, "course", maps),
        sessions: 1,
        rooms: new Set(resolved.room?.name ? [resolved.room.name] : []),
      });
    }

    return [...seen.values()].sort(
      (a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label)
    );
  }, [timetable, maps]);

  // --------------------------------------------------
  // Shell (navigation is shared — see lib/nav.js)
  // --------------------------------------------------

  const { brand, nav, quickActions } = navForRole("faculty");

  const shellProps = { brand, nav, quickActions };

  if (identityLoading || loading) {
    return (
      <AppShell {...shellProps}>
        <div className="space-y-5">
          <Skeleton className="h-9 w-64" />

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
        </div>
      </AppShell>
    );
  }

  // --------------------------------------------------
  // Signed in, but the account is not linked to a Faculty record.
  // Say so — never fall back to somebody else's timetable.
  // --------------------------------------------------

  if (!linked) {
    return (
      <AppShell {...shellProps}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <EmptyState
            icon={ShieldAlert}
            title="Profile not linked — contact your administrator"
            description={
              identityError ||
              `Your account${
                user?.email ? ` (${user.email})` : ""
              } is not linked to a faculty record, so there is no timetable to show.`
            }
          />
        </div>
      </AppShell>
    );
  }

  const facultyName = faculty?.name || user?.name || "Faculty";

  // A failed fetch must never read as a zero: every derived figure below
  // falls back to an em dash while `error` is set.
  const figure = (value) => (error ? "—" : value);

  return (
    <AppShell {...shellProps}>
      <PageHeader
        title="My Timetable"
        description={`Your assigned classes — ${facultyName}`}
        actions={
          <>
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

            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" />
              Print
            </Button>
          </>
        }
      />

      <div className="space-y-5">
        {error ? (
          <Callout
            tone="destructive"
            title="Unable to load timetable"
            icon={ShieldAlert}
          >
            {error}
          </Callout>
        ) : null}

        {/* ============ Band 1 — the week, and everything derived from it ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/* ---- The week itself: the page's dominant cell ---- */}
          <SectionCard
            title="Weekly schedule"
            description="Only your own classes, drawn on the institution's scheduling grid"
            icon={CalendarDays}
            padded={false}
            className="min-w-0 overflow-hidden xl:col-span-8"
          >
            <div className="px-6 pb-6">
              {timetable.length === 0 && !error ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No classes scheduled"
                  description="Your timetable doesn't contain any assigned classes yet."
                />
              ) : display === "list" ? (
                <TimetableListView
                  schedule={timetable}
                  grid={grid}
                  maps={maps}
                  groupBy="day"
                />
              ) : (
                <div className="space-y-4">
                  <TimetableGrid
                    className="print:hidden"
                    schedule={timetable}
                    grid={grid}
                    maps={maps}
                    viewMode="byFaculty"
                    groupValue={facultyId}
                    colorMode="course"
                    density="compact"
                  />

                  {/* Nothing disappears silently: whatever the grid could not
                      place is named and then listed underneath it. */}
                  {offGrid.length > 0 ? (
                    <div className="space-y-3 print:hidden">
                      <Callout
                        tone="warning"
                        title={`${offGrid.length} ${
                          offGrid.length === 1 ? "class falls" : "classes fall"
                        } outside the current timetable grid`}
                        icon={CalendarOff}
                      >
                        Their day or start time no longer matches a period in the
                        institution&apos;s scheduling grid, so the week above
                        cannot show them. They are listed below, and the List
                        view shows every class.
                      </Callout>

                      <TimetableListView
                        schedule={offGrid}
                        grid={grid}
                        maps={maps}
                        groupBy="day"
                      />
                    </div>
                  ) : null}
                </div>
              )}

              {/* Institutional A4 table — screen-hidden, used by Print. */}
              {timetable.length > 0 ? (
                <TimetableGrid
                  className="hidden print:block"
                  schedule={timetable}
                  grid={grid}
                  maps={maps}
                  viewMode="byFaculty"
                  groupValue={facultyId}
                  printable
                  showLegend={false}
                  title={`Timetable — ${facultyName}`}
                  subtitle={
                    timetable[0]?.department
                      ? `${timetable[0].department}${
                          timetable[0].semester
                            ? ` · Semester ${timetable[0].semester}`
                            : ""
                        }`
                      : undefined
                  }
                />
              ) : null}
            </div>
          </SectionCard>

          {/* ---- The rail: the same week, counted ---- */}
          <div className="flex min-w-0 flex-col gap-5 print:hidden xl:col-span-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard
                label="Total classes"
                value={figure(stats.totalClasses)}
                icon={CalendarDays}
              />

              <StatCard
                label="Teaching days"
                value={figure(teachingDays)}
                icon={CalendarRange}
              />

              <StatCard
                label="Weekly hours"
                value={figure(stats.hoursPerWeek)}
                icon={Clock}
              />

              <StatCard
                label="Rooms used"
                value={figure(timetable.length ? stats.rooms : 0)}
                icon={DoorOpen}
              />
            </div>

            {/* ---- Per-day load ---- */}
            <SectionCard
              title="Load by day"
              description={
                busiestDay && !error
                  ? `Busiest on ${busiestDay.day} — ${busiestDay.count} ${
                      busiestDay.count === 1 ? "class" : "classes"
                    }`
                  : "Classes per working day"
              }
              icon={CalendarRange}
            >
              {error ? (
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
              title="Courses you teach"
              description={
                error || coursesTaught.length === 0
                  ? "Taken from your published classes"
                  : `${coursesTaught.length} ${
                      coursesTaught.length === 1 ? "course" : "courses"
                    } this week`
              }
              icon={BookOpen}
            >
              {error ? (
                <EmptyState
                  icon={BookOpen}
                  title="Courses unavailable"
                  description="The week could not be loaded, so its courses cannot be listed."
                />
              ) : coursesTaught.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title="No courses assigned"
                  description="Courses appear here once a published timetable includes your classes."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {coursesTaught.map((course) => (
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

              {!error && coursesTaught.length > 0 ? (
                <>
                  <Separator className="my-4" />
                  <p className="text-xs text-muted-foreground">
                    Dot colours match the stripes on the week beside this card.
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
