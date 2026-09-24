import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  CalendarOff,
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
import { computeStats } from "@/lib/schedule";
import { useIdentity } from "@/hooks/useIdentity";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
import { TimetableListView } from "@/components/timetable/TimetableListView";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import { EmptyState } from "@/components/common/EmptyState";
import { Callout } from "@/components/common/Callout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/*
  /faculty-portal/timetable — this faculty member's own week.

  The day-accordion renderer this page used to carry is gone: the week is
  drawn by the shared `TimetableGrid` in `viewMode="byFaculty"` with
  `groupValue` set to the signed-in member's own faculty id, over the
  server-owned grid from `useSystemConfig()` (GET /api/config/grid). Days and
  slots are never hardcoded here.

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

  // --------------------------------------------------
  // Shell (navigation is shared — see lib/nav.js)
  // --------------------------------------------------

  const { brand, nav, quickActions } = navForRole("faculty");

  const shellProps = { brand, nav, quickActions };

  if (identityLoading || loading) {
    return (
      <AppShell {...shellProps}>
        <div className="space-y-6">
          <Skeleton className="h-9 w-64" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>

          <Skeleton className="h-96 w-full" />
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

      {error ? (
        <div className="mb-6">
          <Callout
            tone="destructive"
            title="Unable to load timetable"
            icon={ShieldAlert}
          >
            {error}
          </Callout>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Classes"
          value={stats.totalClasses}
          icon={CalendarDays}
        />

        <StatCard label="Teaching Days" value={teachingDays} icon={CalendarDays} />

        <StatCard label="Weekly Hours" value={stats.hoursPerWeek} icon={Clock} />

        <StatCard
          label="Rooms Used"
          value={timetable.length ? stats.rooms : 0}
          icon={DoorOpen}
        />
      </div>

      <div className="mt-6">
        <SectionCard
          title="Weekly Schedule"
          description="Only your own classes, drawn on the institution's scheduling grid"
          icon={CalendarDays}
          padded={false}
          className="overflow-hidden"
        >
          <div className="px-6 pb-2">
            {timetable.length === 0 && !error ? (
              <EmptyState
                icon={CalendarDays}
                title="No Classes Scheduled"
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
      </div>
    </AppShell>
  );
}
