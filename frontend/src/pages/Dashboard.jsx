import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Home,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { navForRole } from "@/lib/nav";
import { computeStats, filterEntries, groupByDay } from "@/lib/schedule";
import { useIdentity } from "@/hooks/useIdentity";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { useTimetableData } from "@/hooks/useTimetableData";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Callout } from "@/components/common/Callout";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import DepartmentPie from "@/components/charts/DepartmentPie";
import UtilizationBar from "@/components/charts/UtilizationBar";
import WeeklyActivityArea from "@/components/charts/WeeklyActivityArea";
import { QualityScore } from "@/components/timetable/QualityScore";
import { TimetableCard } from "@/components/timetable/TimetableCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

// =====================================================
// / — the admin dashboard (U8)
//
// One scrolling bento page, no tabs. Everything on it is read back from the
// API through the shared hooks: `useTimetableData` (timetables + courses +
// faculty + rooms and the `_id` lookup maps), `useSystemConfig` (the
// scheduling grid) and two small fetches of its own for `/notifications` and
// `/queries`. No number here is a placeholder — a figure that cannot be
// computed from a response is not rendered at all (see `countSince`, which
// returns null when a collection carries no usable timestamps, and the
// notification breakdown, which only lists audiences the response actually
// contains).
//
// Layout, top to bottom:
//   Band 1 — recent timetables (58%) | stat grid + notifications/queries (42%)
//   Band 2 — classes per weekday | room utilization | courses by department
//
// The page used to carry four tabs (overview / timetables / analytics /
// queries). Everything they exposed is still reachable:
//   Timetables → "View all" → /view-timetable (a superset: more filters plus
//                publish / export / delete)
//   Queries    → "Answer" → the queries dialog below, which is the only admin
//                surface for GET /api/queries + PUT /api/queries/:id/reply
//   Analytics  → "Workload & occupancy" on the weekday chart → the analytics
//                dialog below (faculty workload + slot occupancy have no other
//                home in the app)
//
// Actions map onto routes that already exist:
//   View timetable → /view-timetable/:id
//   Export         → GET /api/timetables/:id/export?format=csv
//   Reply to query → PUT /api/queries/:id/reply   (admin-only server-side)
// =====================================================

/** Window used by every "new in the last N days" delta on this page. */
const RECENT_WINDOW_DAYS = 30;

/** How many timetables the bento's "Recent timetables" cell shows. */
const RECENT_LIMIT = 2;

const DATETIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

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

function errorMessage(error, fallback) {
  const data = error?.response?.data;
  if (data && typeof data === "object" && typeof data.error === "string") return data.error;
  return error?.message || fallback;
}

/**
 * Filename for a download. The server sets it in `Content-Disposition`, but
 * that header is not exposed across the dev-server origin boundary, so this
 * mirrors the server's own sanitisation as a fallback. Only the *name* is
 * derived here — the bytes always come from the export route.
 */
function exportFilename(response, timetable, format) {
  const header =
    response?.headers?.["content-disposition"] || response?.headers?.get?.("content-disposition");
  const match = header ? /filename="?([^";]+)"?/i.exec(header) : null;
  if (match) return match[1];

  const base =
    String(timetable?.name || "timetable")
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "") || "timetable";
  return `${base}.${format}`;
}

/**
 * Audience labels for the notification breakdown. `recipientUserId` is
 * exclusive server-side — such a notification is addressed to this user and
 * its `audience` is ignored — so it is counted under its own key.
 */
const AUDIENCE_LABELS = {
  all: "All",
  faculty: "Faculty",
  student: "Student",
  admin: "Admin",
  direct: "You",
};

const AUDIENCE_ORDER = ["all", "faculty", "student", "admin", "direct"];

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

/** Big figure + unit, the shape both the notifications and queries cells use. */
function BigFigure({ value, unit, tone = "default" }) {
  return (
    <p className="flex items-baseline gap-2">
      <span
        className={
          tone === "warning"
            ? "text-3xl font-semibold tracking-tight text-warning tabular-nums"
            : "text-3xl font-semibold tracking-tight text-foreground tabular-nums"
        }
      >
        {value}
      </span>
      <span className="text-sm text-muted-foreground">{unit}</span>
    </p>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useIdentity();
  const { grid } = useSystemConfig();
  const { timetables, courses, faculty, rooms, maps, loading, error, refresh } = useTimetableData();

  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState(null);

  const [queries, setQueries] = useState([]);
  const [queriesLoading, setQueriesLoading] = useState(true);
  const [queriesError, setQueriesError] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyingId, setReplyingId] = useState(null);

  const [queriesOpen, setQueriesOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [exportingId, setExportingId] = useState(null);

  const role = String(user?.role || "admin").toLowerCase();
  const { brand, nav, quickActions } = navForRole(role);

  // ---------------------------------------------------
  // Notifications + queries (everything else comes from useTimetableData)
  // ---------------------------------------------------
  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const { data } = await api.get("/notifications");
      setNotifications(Array.isArray(data) ? data : []);
      setNotificationsError(null);
    } catch (requestError) {
      console.warn("Dashboard: failed to load /notifications", requestError);
      setNotificationsError(errorMessage(requestError, "Failed to load notifications"));
    } finally {
      setNotificationsLoading(false);
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

  /**
   * Unread notifications per audience. Only audiences that actually appear
   * in the response are listed — `GET /notifications` is scoped server-side,
   * so an admin never sees faculty-only or student-only rows and no chip is
   * invented for them.
   */
  const unreadByAudience = useMemo(() => {
    const counts = new Map();

    for (const item of notifications) {
      if (item?.isRead) continue;
      const key = item?.recipientUserId ? "direct" : String(item?.audience || "all").toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const rank = (key) => {
      const index = AUDIENCE_ORDER.indexOf(key);
      return index === -1 ? AUDIENCE_ORDER.length : index;
    };

    return [...counts.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([key, value]) => ({ key, label: AUDIENCE_LABELS[key] || key, value }));
  }, [notifications]);

  const navWithBadges = useMemo(
    () => nav.map((item) => (item.badgeKey === "unread" ? { ...item, badge: unreadCount } : item)),
    [nav, unreadCount]
  );

  const publishedTimetables = useMemo(
    () => timetables.filter((item) => String(item?.status || "").toLowerCase() === "published"),
    [timetables]
  );

  /**
   * The timetable the charts describe: the most recently published one, or —
   * when nothing is published yet — the most recent of any status.
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

  /**
   * Classes per weekday. The tick label carries the count alongside the day
   * so the chart reads without a gridline lookup.
   */
  const weeklyData = useMemo(() => {
    const byDay = groupByDay(activeSchedule, grid);
    return (grid?.days || []).map((day) => {
      const value = (byDay.get(day) || []).length;
      return { label: `${day.slice(0, 3)} ${value}`, value };
    });
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
  // Recent timetables — the two newest, with the same counts the list page
  // shows. The fuller, filterable list lives behind "View all".
  // ---------------------------------------------------
  const recentTimetables = useMemo(
    () =>
      timetables.slice(0, RECENT_LIMIT).map((timetable) => {
        const stats = computeStats(timetable.schedule, grid, maps);
        return {
          timetable,
          counts: {
            classes: stats.totalClasses,
            hoursPerWeek: stats.hoursPerWeek,
            conflicts: openConflictCount(timetable),
          },
        };
      }),
    [timetables, grid, maps]
  );

  const handleExport = useCallback(async (timetable) => {
    const id = String(timetable._id);
    setExportingId(id);
    try {
      const response = await api.get(`/timetables/${id}/export`, {
        params: { format: "csv" },
        responseType: "blob",
      });

      const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = exportFilename(response, timetable, "csv");
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);

      toast.success(`"${timetable.name}" exported as CSV.`);
    } catch {
      // A failed export answers JSON, but `responseType: "blob"` wraps it,
      // so there is no readable server message here.
      toast.error("Failed to export timetable");
    } finally {
      setExportingId(null);
    }
  }, []);

  // ---------------------------------------------------
  // Queries — GET /api/queries + PUT /api/queries/:id/reply
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

  const answeredQueries = useMemo(
    () => queries.filter((item) => String(item?.status || "open") === "answered").length,
    [queries]
  );

  const listError = error?.timetables || null;
  const timetablesLoading = loading && timetables.length === 0;

  /**
   * Every source `useTimetableData` could not load. A failed source renders
   * an em dash rather than a zero — an empty collection and an unreachable
   * one must not look the same.
   */
  const dataErrors = useMemo(() => {
    if (!error) return [];
    return ["timetables", "courses", "faculty", "rooms"]
      .filter((key) => error[key])
      .map((key) => ({ key, message: error[key] }));
  }, [error]);

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

      <div className="space-y-5">
        {dataErrors.length > 0 && (
          <Callout tone="destructive" title="Some data could not be loaded">
            <ul className="list-disc space-y-0.5 pl-4">
              {dataErrors.map(({ key, message }) => (
                <li key={key}>
                  <span className="capitalize">{key}</span>: {message}
                </li>
              ))}
            </ul>
          </Callout>
        )}

        {/* ============ Band 1 ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/* ---- Recent timetables ---- */}
          <SectionCard
            title="Recent timetables"
            description={
              listError
                ? "Newest first"
                : `${publishedTimetables.length} published · newest first`
            }
            icon={CalendarDays}
            className="xl:col-span-7"
            actions={
              <Button asChild variant="outline" size="sm">
                <Link to="/view-timetable">View all</Link>
              </Button>
            }
          >
            {timetablesLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-64 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
              </div>
            ) : listError ? (
              <EmptyState
                icon={CalendarDays}
                title="Timetables unavailable"
                description="The list could not be loaded. Refresh to try again."
                action={
                  <Button variant="outline" onClick={refreshAll}>
                    <RefreshCw className="size-4" />
                    Refresh
                  </Button>
                }
              />
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
              <div className="grid gap-4 md:grid-cols-2">
                {recentTimetables.map(({ timetable, counts }) => {
                  const id = String(timetable._id);
                  return (
                    <div key={id} className="min-w-0">
                      <TimetableCard
                        timetable={timetable}
                        counts={counts}
                        busy={exportingId === id}
                        onView={() => navigate(`/view-timetable/${id}`)}
                        onExport={() => handleExport(timetable)}
                      />

                      {/*
                        The quality bar in a strip welded under the card,
                        exactly as /view-timetable renders it: `TimetableCard`
                        is shared and has no slot for it.
                      */}
                      <div className="-mt-4 rounded-b-xl border border-t-0 border-border bg-card px-5 pt-5 pb-4 shadow-sm">
                        <QualityScore
                          score={timetable.metadata?.qualityScore}
                          breakdown={timetable.metadata?.qualityBreakdown}
                          size="lg"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* ---- Stats + notifications + queries ---- */}
          <div className="flex flex-col gap-5 xl:col-span-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard
                label="Courses"
                value={error?.courses ? "—" : courses.length}
                icon={BookOpen}
                loading={loading}
                href="/courses"
                delta={error?.courses ? null : newCourses}
                deltaLabel={newCourses === null ? undefined : deltaLabel}
              />
              <StatCard
                label="Faculty"
                value={error?.faculty ? "—" : faculty.length}
                icon={Users}
                loading={loading}
                href="/faculty"
                delta={error?.faculty ? null : newFaculty}
                deltaLabel={newFaculty === null ? undefined : deltaLabel}
              />
              {/* Rooms carry no comparable prior figure, so no delta is shown. */}
              <StatCard
                label="Rooms"
                value={error?.rooms ? "—" : rooms.length}
                icon={Home}
                loading={loading}
                href="/rooms"
              />
              <StatCard
                label="Published timetables"
                value={listError ? "—" : publishedTimetables.length}
                icon={CheckCircle2}
                tone="success"
                loading={loading}
                href="/view-timetable"
                delta={listError ? null : newlyPublished}
                deltaLabel={newlyPublished === null ? undefined : deltaLabel}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* ---- Notifications ---- */}
              <SectionCard
                title="Notifications"
                actions={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/notifications">View all</Link>
                  </Button>
                }
              >
                {notificationsError ? (
                  <div className="space-y-3">
                    <Callout tone="destructive" title="Could not load notifications">
                      {notificationsError}
                    </Callout>
                    <Button variant="outline" size="sm" onClick={loadNotifications}>
                      <RefreshCw className="size-4" />
                      Retry
                    </Button>
                  </div>
                ) : notificationsLoading && notifications.length === 0 ? (
                  <div className="space-y-3">
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-5 w-full" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <BigFigure value={unreadCount} unit="unread" />
                    {unreadByAudience.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {unreadByAudience.map((row) => (
                          <StatusBadge key={row.key} className="tabular-nums">
                            {row.label} {row.value}
                          </StatusBadge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {notifications.length === 0
                          ? "System alerts about generation and publishing land here."
                          : "Everything has been read."}
                      </p>
                    )}
                  </div>
                )}
              </SectionCard>

              {/* ---- Queries ---- */}
              <SectionCard title="Queries">
                {queriesError ? (
                  <div className="space-y-3">
                    <Callout tone="destructive" title="Could not load queries">
                      {queriesError}
                    </Callout>
                    <Button variant="outline" size="sm" onClick={loadQueries}>
                      <RefreshCw className="size-4" />
                      Retry
                    </Button>
                  </div>
                ) : queriesLoading && queries.length === 0 ? (
                  <div className="space-y-3">
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <BigFigure
                      value={openQueries}
                      unit="open"
                      tone={openQueries > 0 ? "warning" : "default"}
                    />
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {answeredQueries} answered
                    </p>
                    <Button
                      className="w-full"
                      onClick={() => setQueriesOpen(true)}
                      disabled={queries.length === 0}
                    >
                      <Send className="size-4" />
                      Answer
                    </Button>
                    {queries.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Questions from faculty and students appear here.
                      </p>
                    )}
                  </div>
                )}
              </SectionCard>
            </div>
          </div>
        </div>

        {/* ============ Band 2 ============ */}
        <div className="grid gap-5 lg:grid-cols-3">
          <WeeklyActivityArea
            data={weeklyData}
            title="Classes per weekday"
            description={
              activeTimetable
                ? `${activeTimetable.name} · ${activeStats.totalClasses} classes`
                : "No timetable to chart yet"
            }
            loading={timetablesLoading}
            valueFormatter={(value) => `${value} classes`}
            actions={
              <Button variant="ghost" size="sm" onClick={() => setAnalyticsOpen(true)}>
                Analytics
              </Button>
            }
          />
          <UtilizationBar
            data={roomUtilization}
            title="Room utilization"
            description="Share of weekly grid"
            loading={timetablesLoading}
          />
          <DepartmentPie
            data={departmentData}
            title="By department"
            description={error?.courses ? "Courses unavailable" : `${courses.length} courses`}
            loading={loading && courses.length === 0}
            valueFormatter={(value) => `${value} courses`}
          />
        </div>
      </div>

      {/* ============ Queries dialog — the admin query list ============ */}
      <Dialog open={queriesOpen} onOpenChange={setQueriesOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Queries</DialogTitle>
            <DialogDescription>
              Questions raised by faculty and students. A reply notifies the author.
            </DialogDescription>
          </DialogHeader>

          {queriesError ? (
            <Callout tone="destructive" title="Could not load queries">
              {queriesError}
            </Callout>
          ) : queriesLoading && queries.length === 0 ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
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
                    description={[query.name, query.role, formatDateTime(query.createdAt)]
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
                            <Button onClick={() => handleReply(query)} disabled={busy || !draft.trim()}>
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
        </DialogContent>
      </Dialog>

      {/* ====== Analytics dialog — faculty workload + slot occupancy ====== */}
      <Dialog open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Workload &amp; occupancy</DialogTitle>
            <DialogDescription>
              {activeTimetable
                ? `Derived from ${activeTimetable.name}.`
                : "Derived from the active timetable."}
            </DialogDescription>
          </DialogHeader>

          {!activeTimetable ? (
            <EmptyState
              icon={CalendarDays}
              title="Nothing to analyse yet"
              description="These figures are derived from the active timetable. Generate one first."
              action={
                <Button onClick={() => navigate("/generate-timetable")}>
                  <Sparkles className="size-4" />
                  Generate timetable
                </Button>
              }
            />
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Classes scheduled" value={activeStats.totalClasses} loading={loading} />
                <StatCard label="Hours per week" value={activeStats.hoursPerWeek} loading={loading} />
                <StatCard label="Faculty engaged" value={activeStats.faculty} loading={loading} />
                <StatCard label="Grid utilization" value={`${activeStats.utilization}%`} loading={loading} />
              </div>

              <UtilizationBar
                data={facultyWorkload}
                max={workloadMax}
                title="Faculty workload distribution"
                description="Teaching hours per week"
                loading={timetablesLoading}
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
                    <div className="min-w-[32rem] space-y-2">
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export { Dashboard };
