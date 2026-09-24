import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Home,
  Inbox,
  MessageSquare,
  RefreshCw,
  SearchX,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { navForRole } from "@/lib/nav";
import { statusVariant } from "@/lib/status";
import { computeStats, filterEntries, groupByDay } from "@/lib/schedule";
import { useIdentity } from "@/hooks/useIdentity";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { useTimetableData } from "@/hooks/useTimetableData";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Callout } from "@/components/common/Callout";
import { EmptyState } from "@/components/common/EmptyState";
import { FilterBar } from "@/components/common/FilterBar";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import DepartmentPie from "@/components/charts/DepartmentPie";
import UtilizationBar from "@/components/charts/UtilizationBar";
import WeeklyActivityArea from "@/components/charts/WeeklyActivityArea";
import { QualityScore } from "@/components/timetable/QualityScore";
import { TimetableCard } from "@/components/timetable/TimetableCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

// =====================================================
// / — the admin dashboard (U8)
//
// Everything on this page is read back from the API through the shared
// hooks: `useTimetableData` (timetables + courses + faculty + rooms and the
// `_id` lookup maps), `useSystemConfig` (the scheduling grid) and two small
// fetches of its own for `/notifications` and `/queries`. No number here is
// a placeholder — a figure that cannot be computed from a response is not
// rendered at all (see `countSince`, which returns null when a collection
// carries no usable timestamps, and the stat cards which then omit the
// delta rather than invent one).
//
// The four tabs keep their position in the URL hash (`/#analytics`), so a
// refresh or a shared link lands on the same tab.
//
// Actions map onto routes that already exist:
//   View timetable → /view-timetable/:id
//   Reply to query → PUT /api/queries/:id/reply   (admin-only server-side)
// =====================================================

const TABS = ["overview", "timetables", "analytics", "queries"];

const ALL = "all";

/** Window used by every "new in the last N days" delta on this page. */
const RECENT_WINDOW_DAYS = 30;

const STATUS_OPTIONS = [
  { value: ALL, label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const EMPTY_FILTERS = { department: ALL, status: ALL, search: "" };

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const DATETIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : DATE_FORMAT.format(date);
}

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : DATETIME_FORMAT.format(date);
}

/**
 * How many documents in `list` carry a `field` date inside the last
 * `RECENT_WINDOW_DAYS`. Returns `null` when not a single document has a
 * usable date on that field — the collection simply cannot support the
 * comparison, and the caller omits the delta instead of showing a zero that
 * would read as "nothing new".
 */
function countSince(list, field) {
  const cutoff = Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  let usable = 0;
  let recent = 0;

  for (const item of list || []) {
    const time = new Date(item?.[field] ?? "").getTime();
    if (Number.isNaN(time)) continue;
    usable += 1;
    if (time >= cutoff) recent += 1;
  }

  return usable > 0 ? recent : null;
}

/** Unresolved conflicts — the count the list page and detail page agree on. */
function openConflictCount(timetable) {
  if (Array.isArray(timetable?.conflicts)) {
    return timetable.conflicts.filter((conflict) => !conflict?.resolved).length;
  }
  return timetable?.metadata?.conflictCount ?? 0;
}

/**
 * Distinct, sorted options for one filter, always prefixed with an "all"
 * entry and always containing `selected` so a live filter never loses its
 * own value. Same helper shape `ViewTimetable` uses.
 */
function buildOptions(values, allLabel, selected) {
  const seen = new Set();
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") seen.add(String(value));
  }
  if (selected && selected !== ALL) seen.add(selected);

  return [
    { value: ALL, label: allLabel },
    ...[...seen].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value })),
  ];
}

function errorMessage(error, fallback) {
  const data = error?.response?.data;
  if (data && typeof data === "object" && typeof data.error === "string") return data.error;
  return error?.message || fallback;
}

/**
 * Five fixed tints for the occupancy heat row. Bucketed classes rather than
 * a computed opacity because the page carries no inline styles — the shade
 * still comes from the `--primary` token, so it follows light/dark.
 */
const HEAT_CLASSES = [
  "bg-muted text-muted-foreground",
  "bg-primary/15 text-foreground",
  "bg-primary/30 text-foreground",
  "bg-primary/50 text-primary-foreground",
  "bg-primary/75 text-primary-foreground",
];

function heatClass(value, max) {
  if (!value) return HEAT_CLASSES[0];
  if (max <= 0) return HEAT_CLASSES[0];
  const bucket = Math.ceil((value / max) * (HEAT_CLASSES.length - 1));
  return HEAT_CLASSES[Math.min(bucket, HEAT_CLASSES.length - 1)];
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useIdentity();
  const { grid } = useSystemConfig();
  const { timetables, courses, faculty, rooms, maps, loading, error, refresh } = useTimetableData();

  const [notifications, setNotifications] = useState([]);
  const [notificationsError, setNotificationsError] = useState(null);

  const [queries, setQueries] = useState([]);
  const [queriesLoading, setQueriesLoading] = useState(true);
  const [queriesError, setQueriesError] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyingId, setReplyingId] = useState(null);

  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const role = String(user?.role || "admin").toLowerCase();
  const { brand, nav, quickActions } = navForRole(role);

  // ---------------------------------------------------
  // Tab state lives in the URL hash so a refresh keeps position.
  // ---------------------------------------------------
  const activeTab = useMemo(() => {
    const hash = String(location.hash || "").replace(/^#/, "");
    return TABS.includes(hash) ? hash : TABS[0];
  }, [location.hash]);

  const handleTabChange = useCallback(
    (value) => {
      navigate({ pathname: location.pathname, hash: `#${value}` }, { replace: true });
    },
    [navigate, location.pathname]
  );

  // ---------------------------------------------------
  // Notifications + queries (everything else comes from useTimetableData)
  // ---------------------------------------------------
  const loadNotifications = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications");
      setNotifications(Array.isArray(data) ? data : []);
      setNotificationsError(null);
    } catch (requestError) {
      console.warn("Dashboard: failed to load /notifications", requestError);
      setNotificationsError(errorMessage(requestError, "Failed to load notifications"));
    }
  }, []);

  const loadQueries = useCallback(async () => {
    setQueriesLoading(true);
    try {
      const { data } = await api.get("/queries");
      setQueries(Array.isArray(data) ? data : []);
      setQueriesError(null);
    } catch (requestError) {
      console.warn("Dashboard: failed to load /queries", requestError);
      setQueriesError(errorMessage(requestError, "Failed to load queries"));
    } finally {
      setQueriesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    loadQueries();
  }, [loadNotifications, loadQueries]);

  const refreshAll = useCallback(() => {
    refresh();
    loadNotifications();
    loadQueries();
  }, [refresh, loadNotifications, loadQueries]);

  // ---------------------------------------------------
  // Derived figures — every one of them off an API response
  // ---------------------------------------------------
  const unreadCount = useMemo(
    () => notifications.filter((item) => !item?.isRead).length,
    [notifications]
  );

  const navWithBadges = useMemo(
    () => nav.map((item) => (item.badgeKey === "unread" ? { ...item, badge: unreadCount } : item)),
    [nav, unreadCount]
  );

  const publishedTimetables = useMemo(
    () => timetables.filter((item) => String(item?.status || "").toLowerCase() === "published"),
    [timetables]
  );

  /**
   * The timetable the Overview charts describe: the most recently published
   * one, or — when nothing is published yet — the most recent of any status.
   * `GET /api/timetables` already sorts newest first.
   */
  const activeTimetable = publishedTimetables[0] || timetables[0] || null;

  const activeSchedule = useMemo(() => activeTimetable?.schedule || [], [activeTimetable]);

  const activeStats = useMemo(
    () => computeStats(activeSchedule, grid, maps),
    [activeSchedule, grid, maps]
  );

  const departmentData = useMemo(() => {
    const counts = new Map();
    for (const course of courses) {
      const name = String(course?.department || "Unassigned");
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [courses]);

  const weeklyData = useMemo(() => {
    const byDay = groupByDay(activeSchedule, grid);
    return (grid?.days || []).map((day) => ({
      label: day.slice(0, 3),
      value: (byDay.get(day) || []).length,
    }));
  }, [activeSchedule, grid]);

  /**
   * Room utilization for the active timetable: classes placed in the room
   * against the grid's own capacity (days × periods), so the percentage
   * follows whatever week the admin configured in /infrastructure.
   */
  const roomUtilization = useMemo(() => {
    const capacity = (grid?.days?.length || 0) * (grid?.slots?.length || 0);
    if (!capacity) return [];

    const counts = new Map();
    for (const entry of activeSchedule) {
      const id = String(entry?.roomId ?? "");
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }

    return [...counts.entries()]
      .map(([id, count]) => ({
        name: maps.rooms?.get(id)?.name || id,
        value: Math.round((count / capacity) * 100),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [activeSchedule, grid, maps]);

  /**
   * Faculty workload: each member's own entries run back through
   * `computeStats`, so the hours here are produced by exactly the same
   * arithmetic as every other hours figure in the app.
   */
  const facultyWorkload = useMemo(() => {
    return faculty
      .map((member) => {
        const own = filterEntries(activeSchedule, { facultyId: member?._id }, maps);
        const stats = computeStats(own, grid, maps);
        return { name: member?.name || String(member?._id ?? ""), value: stats.hoursPerWeek };
      })
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [faculty, activeSchedule, grid, maps]);

  const workloadMax = useMemo(
    () => Math.max(1, ...facultyWorkload.map((row) => row.value)),
    [facultyWorkload]
  );

  /** Occupancy per (day, period) of the active timetable. */
  const occupancy = useMemo(() => {
    const days = grid?.days || [];
    const slots = grid?.slots || [];

    const counts = new Map();
    for (const entry of activeSchedule) {
      const day = days.find((d) => d.toLowerCase() === String(entry?.day || "").toLowerCase());
      if (!day) continue;
      const key = `${day}|${entry?.startTime}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    let max = 0;
    const rows = days.map((day) => ({
      day,
      cells: slots.map((slot) => {
        const value = counts.get(`${day}|${slot.start}`) || 0;
        if (value > max) max = value;
        return { label: slot.label, value };
      }),
    }));

    return { rows, slots, max };
  }, [activeSchedule, grid]);

  // Deltas: only rendered where the collection actually carries the
  // timestamps the comparison needs (see `countSince`).
  const newCourses = useMemo(() => countSince(courses, "createdAt"), [courses]);
  const newFaculty = useMemo(() => countSince(faculty, "createdAt"), [faculty]);
  const newlyPublished = useMemo(
    () => countSince(publishedTimetables, "publishedAt"),
    [publishedTimetables]
  );
  const deltaLabel = `new in ${RECENT_WINDOW_DAYS} days`;

  // ---------------------------------------------------
  // Timetables tab — same filtered card list as /view-timetable
  // ---------------------------------------------------
  const handleFilterChange = useCallback((id, value) => {
    setFilters((current) => ({ ...current, [id]: value }));
  }, []);

  const resetFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const filtersActive = useMemo(
    () =>
      Object.keys(EMPTY_FILTERS).some(
        (key) => String(filters[key] ?? "") !== String(EMPTY_FILTERS[key])
      ),
    [filters]
  );

  const filterDefs = useMemo(
    () => [
      {
        id: "department",
        label: "Department",
        type: "select",
        value: filters.department,
        options: buildOptions(
          timetables.map((item) => item.department),
          "All departments",
          filters.department
        ),
      },
      {
        id: "status",
        label: "Status",
        type: "select",
        value: filters.status,
        options: STATUS_OPTIONS,
      },
      {
        id: "search",
        label: "Search",
        type: "search",
        value: filters.search,
        placeholder: "Name or department",
      },
    ],
    [filters, timetables]
  );

  const rows = useMemo(() => {
    const query = filters.search.trim().toLowerCase();

    return timetables
      .filter((timetable) => {
        if (
          filters.department !== ALL &&
          String(timetable.department || "").toLowerCase() !== filters.department.toLowerCase()
        ) {
          return false;
        }
        if (filters.status !== ALL && String(timetable.status || "draft") !== filters.status) {
          return false;
        }
        if (query) {
          const haystack = [
            timetable.name,
            timetable.department,
            timetable.semester,
            timetable.year,
            timetable.status,
          ]
            .filter((part) => part !== undefined && part !== null)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      })
      .map((timetable) => {
        const stats = computeStats(timetable.schedule, grid, maps);
        return {
          timetable,
          counts: {
            classes: stats.totalClasses,
            hoursPerWeek: stats.hoursPerWeek,
            conflicts: openConflictCount(timetable),
          },
        };
      });
  }, [timetables, filters, grid, maps]);

  const recentTimetables = useMemo(() => rows.slice(0, 4), [rows]);

  // ---------------------------------------------------
  // Queries tab — GET /api/queries + PUT /api/queries/:id/reply
  // ---------------------------------------------------
  const handleReply = useCallback(
    async (query) => {
      const id = String(query._id);
      const reply = String(replyDrafts[id] || "").trim();
      if (!reply) return;

      setReplyingId(id);
      try {
        const { data } = await api.put(`/queries/${id}/reply`, { reply });
        setQueries((current) =>
          current.map((item) => (String(item._id) === id ? data ?? item : item))
        );
        setReplyDrafts((current) => ({ ...current, [id]: "" }));
        toast.success(`Replied to "${query.subject}".`);
      } catch (requestError) {
        toast.error(errorMessage(requestError, "Failed to send reply"));
      } finally {
        setReplyingId(null);
      }
    },
    [replyDrafts]
  );

  const openQueries = useMemo(
    () => queries.filter((item) => String(item?.status || "open") === "open").length,
    [queries]
  );

  const listError = error?.timetables || null;
  const skeletonKeys = ["a", "b", "c", "d"];

  return (
    <AppShell
      brand={brand}
      nav={navWithBadges}
      quickActions={quickActions}
      header={{
        notifications: unreadCount,
        onNotificationsClick: () => navigate("/notifications"),
      }}
      chatbot={{
        context: {
          page: "dashboard",
          totalCourses: courses.length,
          totalFaculty: faculty.length,
          totalRooms: rooms.length,
          publishedTimetables: publishedTimetables.length,
          activeTimetable: activeTimetable
            ? {
                name: activeTimetable.name,
                department: activeTimetable.department,
                semester: activeTimetable.semester,
                status: activeTimetable.status,
                classes: activeStats.totalClasses,
              }
            : null,
          openQueries,
        },
      }}
    >
      <PageHeader
        title="Dashboard"
        description="Institution-wide view of courses, staff, rooms and published schedules."
        actions={
          <>
            <Button variant="outline" onClick={refreshAll} disabled={loading}>
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
              Refresh
            </Button>
            <Button onClick={() => navigate("/generate-timetable")}>
              <Sparkles className="size-4" />
              Generate
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        {listError && (
          <Callout tone="destructive" title="Could not load timetables">
            {listError}
          </Callout>
        )}

        {/* ---------------- Stat row ---------------- */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Courses"
            value={courses.length}
            icon={BookOpen}
            loading={loading}
            href="/courses"
            delta={newCourses}
            deltaLabel={newCourses === null ? undefined : deltaLabel}
          />
          <StatCard
            label="Faculty"
            value={faculty.length}
            icon={Users}
            loading={loading}
            href="/faculty"
            delta={newFaculty}
            deltaLabel={newFaculty === null ? undefined : deltaLabel}
          />
          {/* Rooms carry no comparable prior figure, so no delta is shown. */}
          <StatCard label="Rooms" value={rooms.length} icon={Home} loading={loading} href="/rooms" />
          <StatCard
            label="Published timetables"
            value={publishedTimetables.length}
            icon={CheckCircle2}
            tone="success"
            loading={loading}
            href="/view-timetable"
            delta={newlyPublished}
            deltaLabel={newlyPublished === null ? undefined : deltaLabel}
          />
        </div>

        {/* ---------------- Tabs ---------------- */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-6">
          <TabsList variant="underline" className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="timetables">Timetables</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="queries">
              Queries
              {openQueries > 0 && (
                <StatusBadge variant="info" className="tabular-nums">
                  {openQueries}
                </StatusBadge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ============ Overview ============ */}
          <TabsContent value="overview" className="animate-in space-y-6 fade-in duration-150">
            <div className="grid gap-5 lg:grid-cols-2">
              <DepartmentPie
                data={departmentData}
                title="Courses by department"
                description={`${courses.length} courses across ${departmentData.length} departments`}
                loading={loading}
                valueFormatter={(value) => `${value} courses`}
              />
              <WeeklyActivityArea
                data={weeklyData}
                title="Classes per weekday"
                description={
                  activeTimetable
                    ? `${activeTimetable.name} · ${activeStats.totalClasses} classes`
                    : "No timetable to chart yet"
                }
                loading={loading}
                valueFormatter={(value) => `${value} classes`}
              />
            </div>

            <UtilizationBar
              data={roomUtilization}
              title="Room utilization"
              description="Share of the weekly grid each room is booked for in the active timetable"
              loading={loading}
            />

            <div className="grid gap-5 lg:grid-cols-3">
              <SectionCard
                title="Recent timetables"
                description="Newest schedules first"
                icon={CalendarDays}
                className="lg:col-span-2"
                actions={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/view-timetable">View all</Link>
                  </Button>
                }
              >
                {loading && timetables.length === 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {skeletonKeys.slice(0, 2).map((key) => (
                      <div key={key} className="h-44 animate-pulse rounded-xl bg-muted" />
                    ))}
                  </div>
                ) : recentTimetables.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="No timetables yet"
                    description="Generate a timetable and it will appear here."
                    action={
                      <Button onClick={() => navigate("/generate-timetable")}>
                        <Sparkles className="size-4" />
                        Generate timetable
                      </Button>
                    }
                  />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {recentTimetables.map(({ timetable, counts }) => (
                      <TimetableCard
                        key={String(timetable._id)}
                        timetable={timetable}
                        counts={counts}
                        onView={() => navigate(`/view-timetable/${timetable._id}`)}
                      />
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Notifications"
                description={
                  unreadCount > 0 ? `${unreadCount} unread` : "Everything has been read"
                }
                icon={Inbox}
                actions={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/notifications">View all</Link>
                  </Button>
                }
              >
                {notificationsError ? (
                  <Callout tone="destructive" title="Could not load notifications">
                    {notificationsError}
                  </Callout>
                ) : notifications.length === 0 ? (
                  <EmptyState
                    icon={Inbox}
                    title="No notifications"
                    description="System alerts about generation and publishing land here."
                  />
                ) : (
                  <ul className="flex flex-col gap-3">
                    {notifications.slice(0, 5).map((item) => (
                      <li
                        key={String(item._id)}
                        className="flex items-start gap-3 rounded-lg border border-border bg-background p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium text-foreground">
                              {item.title}
                            </p>
                            <StatusBadge variant={statusVariant(item.type)}>{item.type}</StatusBadge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{item.message}</p>
                          {formatDateTime(item.createdAt) && (
                            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                              {formatDateTime(item.createdAt)}
                            </p>
                          )}
                        </div>
                        {!item.isRead && (
                          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          </TabsContent>

          {/* ============ Timetables ============ */}
          <TabsContent value="timetables" className="animate-in space-y-6 fade-in duration-150">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <FilterBar
                filters={filterDefs}
                onChange={handleFilterChange}
                onReset={filtersActive ? resetFilters : undefined}
                right={
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {rows.length} of {timetables.length}
                  </span>
                }
              />
            </div>

            {loading && timetables.length === 0 ? (
              <div className="grid gap-5 lg:grid-cols-2">
                {skeletonKeys.map((key) => (
                  <div key={key} className="h-52 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={filtersActive ? SearchX : CalendarDays}
                title={filtersActive ? "No timetables match these filters" : "No timetables yet"}
                description={
                  filtersActive
                    ? "Nothing matches the current filters. Reset them to see every timetable."
                    : "Generate a timetable to see it listed here."
                }
                action={
                  filtersActive ? (
                    <Button variant="outline" onClick={resetFilters}>
                      Reset filters
                    </Button>
                  ) : (
                    <Button onClick={() => navigate("/generate-timetable")}>
                      <Sparkles className="size-4" />
                      Generate timetable
                    </Button>
                  )
                }
              />
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {rows.map(({ timetable, counts }) => {
                  const id = String(timetable._id);
                  const created = formatDate(timetable.createdAt);
                  const published = formatDate(timetable.publishedAt);

                  return (
                    <div key={id}>
                      <TimetableCard
                        timetable={timetable}
                        counts={counts}
                        onView={() => navigate(`/view-timetable/${id}`)}
                      />

                      {/*
                        Dates and the quality bar in a strip welded under the
                        card, exactly as /view-timetable renders them:
                        `TimetableCard` is shared and has no slot for them.
                      */}
                      <div className="-mt-4 flex flex-col gap-3 rounded-b-xl border border-t-0 border-border bg-card px-5 pt-5 pb-4 shadow-sm sm:flex-row sm:items-center sm:gap-6">
                        <dl className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">
                          <div className="flex gap-1.5">
                            <dt>Created</dt>
                            <dd className="font-medium text-foreground">{created || "—"}</dd>
                          </div>
                          <div className="flex gap-1.5">
                            <dt>Published</dt>
                            <dd className="font-medium text-foreground">
                              {published || "Not published"}
                            </dd>
                          </div>
                        </dl>
                        <div className="sm:w-56">
                          <QualityScore
                            score={timetable.metadata?.qualityScore}
                            breakdown={timetable.metadata?.qualityBreakdown}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ============ Analytics ============ */}
          <TabsContent value="analytics" className="animate-in space-y-6 fade-in duration-150">
            {!activeTimetable && !loading ? (
              <EmptyState
                icon={CalendarDays}
                title="Nothing to analyse yet"
                description="Analytics are derived from the active timetable. Generate one first."
                action={
                  <Button onClick={() => navigate("/generate-timetable")}>
                    <Sparkles className="size-4" />
                    Generate timetable
                  </Button>
                }
              />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                  <StatCard label="Classes scheduled" value={activeStats.totalClasses} loading={loading} />
                  <StatCard label="Hours per week" value={activeStats.hoursPerWeek} loading={loading} />
                  <StatCard label="Faculty engaged" value={activeStats.faculty} loading={loading} />
                  <StatCard label="Grid utilization" value={`${activeStats.utilization}%`} loading={loading} />
                </div>

                <UtilizationBar
                  data={facultyWorkload}
                  max={workloadMax}
                  title="Faculty workload distribution"
                  description={
                    activeTimetable
                      ? `Teaching hours per week in ${activeTimetable.name}`
                      : "Teaching hours per week"
                  }
                  loading={loading}
                  valueFormatter={(value) => `${value} hrs/wk`}
                />

                <SectionCard
                  title="Slot occupancy"
                  description="Classes placed in each period of the week, darker means busier"
                  icon={CalendarDays}
                >
                  {occupancy.rows.length === 0 || occupancy.slots.length === 0 ? (
                    <EmptyState
                      icon={CalendarDays}
                      title="No grid configured"
                      description="Set the working days and periods in Infrastructure to see occupancy."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <div className="min-w-[36rem] space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-24 shrink-0" />
                          {occupancy.slots.map((slot) => (
                            <span
                              key={slot.label}
                              className="flex-1 text-center text-[11px] text-muted-foreground tabular-nums"
                            >
                              {slot.start}
                            </span>
                          ))}
                        </div>

                        {occupancy.rows.map((row) => (
                          <div key={row.day} className="flex items-center gap-2">
                            <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">
                              {row.day}
                            </span>
                            {row.cells.map((cell) => (
                              <span
                                key={`${row.day}-${cell.label}`}
                                title={`${row.day} ${cell.label}: ${cell.value} classes`}
                                className={`flex h-9 flex-1 items-center justify-center rounded-md text-xs font-medium tabular-nums transition-colors ${heatClass(
                                  cell.value,
                                  occupancy.max
                                )}`}
                              >
                                {cell.value || ""}
                              </span>
                            ))}
                          </div>
                        ))}

                        <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                          <span>0</span>
                          {HEAT_CLASSES.map((tint) => (
                            <span key={tint} className={`size-4 rounded-sm ${tint}`} />
                          ))}
                          <span className="tabular-nums">{occupancy.max}</span>
                          <span>classes per period</span>
                        </div>
                      </div>
                    </div>
                  )}
                </SectionCard>
              </>
            )}
          </TabsContent>

          {/* ============ Queries ============ */}
          <TabsContent value="queries" className="animate-in space-y-6 fade-in duration-150">
            {queriesError ? (
              <Callout tone="destructive" title="Could not load queries">
                {queriesError}
              </Callout>
            ) : null}

            {queriesLoading && queries.length === 0 ? (
              <div className="space-y-4">
                {skeletonKeys.slice(0, 3).map((key) => (
                  <div key={key} className="h-36 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : queries.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No queries raised"
                description="Questions from faculty and students appear here for you to answer."
              />
            ) : (
              <div className="space-y-4">
                {queries.map((query) => {
                  const id = String(query._id);
                  const answered = String(query.status || "open") === "answered";
                  const draft = replyDrafts[id] || "";
                  const busy = replyingId === id;

                  return (
                    <SectionCard
                      key={id}
                      title={query.subject}
                      description={[
                        query.name,
                        query.role,
                        formatDateTime(query.createdAt),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      actions={
                        <StatusBadge variant={answered ? "success" : "warning"}>
                          {answered ? "Answered" : "Open"}
                        </StatusBadge>
                      }
                    >
                      <div className="space-y-4">
                        <p className="text-sm text-foreground">{query.message}</p>

                        {answered && query.reply ? (
                          <div className="rounded-lg border border-border bg-background p-3">
                            <p className="text-xs font-medium text-muted-foreground">Your reply</p>
                            <p className="mt-1 text-sm text-foreground">{query.reply}</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Textarea
                              id={`reply-${id}`}
                              value={draft}
                              rows={3}
                              placeholder="Write a reply — the author is notified as soon as you send it."
                              onChange={(event) =>
                                setReplyDrafts((current) => ({
                                  ...current,
                                  [id]: event.target.value,
                                }))
                              }
                            />
                            <div className="flex justify-end">
                              <Button
                                onClick={() => handleReply(query)}
                                disabled={busy || !draft.trim()}
                              >
                                <Send className="size-4" />
                                {busy ? "Sending…" : "Send reply"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </SectionCard>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

export { Dashboard };
