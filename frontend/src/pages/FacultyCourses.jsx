import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  Clock,
  FlaskConical,
  Presentation,
  ShieldAlert,
} from "lucide-react";

import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { navForRole } from "@/lib/nav";
import useIdentity from "@/hooks/useIdentity";
import { AppShell, PageHeader } from "@/components/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import { EmptyState } from "@/components/common/EmptyState";
import { Callout } from "@/components/common/Callout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

// =====================================================
// /faculty-portal/courses — the courses this faculty member teaches.
//
// Scoping (unchanged by the re-skin, and the whole point of this page):
// the list is the DISTINCT courses appearing in this user's OWN timetable
// entries, never the course catalogue. `GET /api/courses` is fetched only to
// resolve those ids to names; a scheduled id with no catalogue row is shown
// as the bare id rather than padded with invented values.
//
// Layout (bento, matching pages/Dashboard.jsx):
//   Band 1 — assigned course cards (8/12) | stats + weekly pattern +
//            teaching load (4/12)
// Every figure on the page is computed from the two responses above; when a
// fetch fails the counts render an em dash under a destructive Callout
// rather than a zero that would read as "nothing assigned".
// =====================================================

/** Course type → icon + label. Purely presentational; no colour meaning. */
const TYPE_ICONS = {
  lab: FlaskConical,
  seminar: Presentation,
  lecture: BookOpen,
};

function typeIcon(type) {
  return TYPE_ICONS[String(type || "").toLowerCase()] || BookOpen;
}

function typeLabel(type) {
  const value = String(type || "").toLowerCase();
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Presentational weekday order for the "Weekly pattern" tiles, mirroring the
 * working week in `backend/utils/schedulingConstants.js#DAYS`. Any other day
 * that actually appears in this user's own entries is appended below, so
 * nothing scheduled is ever hidden by this list.
 */
const WORKING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** "Monday" → "Mon". Day names come from the entries / this list. */
function shortDay(day) {
  return String(day || "").slice(0, 3);
}

/** One label/value pair inside a course card. */
function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-foreground">{value}</dd>
    </div>
  );
}

export default function FacultyCourses() {
  const navigate = useNavigate();

  // Identity comes from the shared hook (GET /api/auth/me), which also
  // resolves the linked Faculty doc — this page no longer re-reads
  // `localStorage` nor looks the record up by email itself.
  const {
    user,
    faculty,
    linked,
    loading: identityLoading,
  } = useIdentity();

  const [timetables, setTimetables] = useState([]);
  const [courses, setCourses] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const signedIn = Boolean(user);

  // The one id every view on this page is scoped to.
  const ownFacultyId = user?.facultyId ? String(user.facultyId) : null;

  useEffect(() => {
    if (identityLoading) return undefined;

    if (!signedIn) {
      navigate("/login");
      return undefined;
    }

    // Unlinked account: no Faculty record, so nothing to scope to and
    // nothing to fetch.
    if (!linked) {
      setTimetables([]);
      setCourses([]);
      setNotifications([]);
      setDataLoading(false);
      return undefined;
    }

    let cancelled = false;

    const loadFacultyCourses = async () => {
      try {
        // GET /api/timetables is already role-scoped server-side: a faculty
        // caller receives only published timetables that contain at least
        // one entry of their own. The per-entry filter below is the second
        // layer, not the only one.
        const [
          timetablesResponse,
          coursesResponse,
          notificationsResponse,
        ] = await Promise.all([
          api.get(`/timetables`),
          api.get(`/courses`),
          api.get(`/notifications`),
        ]);

        if (cancelled) return;

        setLoadError(null);
        setTimetables(
          Array.isArray(timetablesResponse.data) ? timetablesResponse.data : []
        );
        setCourses(
          Array.isArray(coursesResponse.data) ? coursesResponse.data : []
        );
        setNotifications(
          Array.isArray(notificationsResponse.data)
            ? notificationsResponse.data
            : []
        );
      } catch (error) {
        console.error(
          "Failed to load faculty courses:",
          error
        );

        if (!cancelled) {
          setLoadError(
            error?.response?.data?.error ||
              error?.message ||
              "Your courses could not be loaded."
          );
          setTimetables([]);
          setCourses([]);
          setNotifications([]);
        }
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    };

    loadFacultyCourses();

    return () => {
      cancelled = true;
    };
  }, [identityLoading, signedIn, linked, navigate]);

  const loading = identityLoading || dataLoading;

  // ---------------------------------------------
  // Find timetable entries for this faculty
  //
  // Defence in depth: the server already filtered the timetables, this
  // keeps only the entries whose facultyId is this user's own.
  // ---------------------------------------------

  const facultySchedule = useMemo(
    () =>
      ownFacultyId
        ? timetables.flatMap((timetable) =>
            (timetable.schedule || [])
              .filter(
                (entry) => String(entry.facultyId) === ownFacultyId
              )
              .map((entry) => ({
                ...entry,
                timetableName: timetable.name,
                semester: timetable.semester,
                department: timetable.department,
              }))
          )
        : [],
    [timetables, ownFacultyId]
  );

  // ---------------------------------------------
  // Courses assigned to this faculty member
  //
  // The distinct courseIds appearing in their OWN entries — never the whole
  // catalogue. `/courses` is fetched only to resolve those ids to names.
  // ---------------------------------------------

  const facultyCourses = useMemo(() => {
    const facultyCourseIds = [
      ...new Set(
        facultySchedule.map((entry) => String(entry.courseId))
      ),
    ];

    const courseById = new Map(
      courses.map((course) => [String(course._id), course])
    );

    return facultyCourseIds.map(
      (courseId) =>
        courseById.get(courseId) || {
          // An id that is scheduled but missing from the catalogue: shown as
          // the bare id rather than dropped or padded with invented values.
          _id: courseId,
          name: null,
          code: null,
        }
    );
  }, [facultySchedule, courses]);

  /** Weekday order: the working week, extra days appended as seen. */
  const dayOrder = useMemo(() => {
    const days = [...WORKING_DAYS];
    for (const entry of facultySchedule) {
      const day = String(entry.day || "");
      if (day && !days.some((known) => known.toLowerCase() === day.toLowerCase())) {
        days.push(day);
      }
    }
    return days;
  }, [facultySchedule]);

  const dayIndex = useMemo(() => {
    const index = new Map();
    dayOrder.forEach((day, position) => index.set(day.toLowerCase(), position));
    return index;
  }, [dayOrder]);

  /** Per-course sessions and class counts — one pass over the own entries. */
  const courseRows = useMemo(() => {
    return facultyCourses.map((course) => {
      const entries = facultySchedule.filter(
        (entry) => String(entry.courseId) === String(course._id)
      );

      const seen = new Set();
      const sessions = [];

      for (const entry of entries) {
        const key = `${entry.day}|${entry.startTime}`;
        if (seen.has(key)) continue;
        seen.add(key);
        sessions.push({ key, day: entry.day, startTime: entry.startTime });
      }

      sessions.sort((a, b) => {
        const dayDelta =
          (dayIndex.get(String(a.day).toLowerCase()) ?? 99) -
          (dayIndex.get(String(b.day).toLowerCase()) ?? 99);
        if (dayDelta !== 0) return dayDelta;
        return String(a.startTime).localeCompare(String(b.startTime));
      });

      return { course, classCount: entries.length, sessions };
    });
  }, [facultyCourses, facultySchedule, dayIndex]);

  const busiestCourse = useMemo(
    () => courseRows.reduce((max, row) => Math.max(max, row.classCount), 0),
    [courseRows]
  );

  const loadRows = useMemo(
    () => [...courseRows].sort((a, b) => b.classCount - a.classCount),
    [courseRows]
  );

  /** Classes per weekday across this faculty member's own entries. */
  const weekdayLoad = useMemo(() => {
    const counts = new Map(dayOrder.map((day) => [day.toLowerCase(), 0]));
    for (const entry of facultySchedule) {
      const key = String(entry.day || "").toLowerCase();
      if (counts.has(key)) counts.set(key, counts.get(key) + 1);
    }
    return dayOrder.map((day) => ({
      day,
      count: counts.get(day.toLowerCase()) || 0,
    }));
  }, [dayOrder, facultySchedule]);

  const department = faculty?.department || user?.department || null;

  // ---------------------------------------------
  // Notifications (badge only)
  // ---------------------------------------------

  const unreadNotifications = notifications.filter(
    (notification) => !notification.isRead
  ).length;

  // ---------------------------------------------
  // Logout
  // ---------------------------------------------

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    navigate("/login");
  };

  // ---------------------------------------------
  // Shell — one shared sidebar/header for every portal, fed by lib/nav.js.
  // ---------------------------------------------

  const { brand, nav } = navForRole("faculty");

  const navItems = useMemo(
    () =>
      nav.map((item) =>
        item.badgeKey === "unread" ? { ...item, badge: unreadNotifications } : item
      ),
    [nav, unreadNotifications]
  );

  const shellProps = {
    brand,
    nav: navItems,
    onLogout: handleLogout,
    header: {
      notifications: unreadNotifications,
      onNotificationsClick: () => navigate("/faculty-portal/notifications"),
    },
  };

  // ---------------------------------------------
  // Loading — the skeleton mirrors the bento below.
  // ---------------------------------------------

  if (loading) {
    return (
      <AppShell {...shellProps}>
        <div className="animate-in space-y-5 fade-in duration-200">
          <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />

          <div className="grid gap-5 xl:grid-cols-12">
            <div className="h-96 animate-pulse rounded-xl bg-muted xl:col-span-8" />

            <div className="flex flex-col gap-5 xl:col-span-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[0, 1].map((key) => (
                  <div key={key} className="h-24 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
              <div className="h-48 animate-pulse rounded-xl bg-muted" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ---------------------------------------------
  // Unlinked account
  //
  // `User.facultyId` is null: there is no Faculty record behind this login,
  // so there is no "my courses" to show and nothing is invented.
  // ---------------------------------------------

  if (!linked) {
    return (
      <AppShell {...shellProps}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="max-w-md animate-in rounded-xl border border-border bg-card p-8 text-center fade-in duration-200">
            <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <ShieldAlert className="size-5" />
            </div>

            <h1 className="text-xl font-semibold text-foreground">
              Profile not linked — contact your administrator
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              This account is not linked to a faculty record, so no courses can
              be shown for it.
            </p>

            <Button onClick={handleLogout} className="mt-6">
              Return to Login
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // ---------------------------------------------
  // Main UI
  // ---------------------------------------------

  return (
    <AppShell
      {...shellProps}
      chatbot={{
        context: { page: "faculty-courses", courses: facultyCourses.length },
      }}
    >
      <PageHeader
        title="My Courses"
        description="Courses currently assigned to you, derived from your own timetable entries."
        actions={
          <Button variant="outline" asChild>
            <Link to="/faculty-portal/timetable">
              <CalendarDays className="size-4" />
              View timetable
            </Link>
          </Button>
        }
      />

      <div className="space-y-5">
        {loadError && (
          <Callout tone="destructive" title="Your courses could not be loaded">
            {loadError}
          </Callout>
        )}

        {/* ============ Band 1 ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/* ---- Assigned courses — the page's primary cell ---- */}
          <SectionCard
            title="Assigned courses"
            description={
              department
                ? `${department} · every distinct course in your own timetable entries`
                : "Every distinct course that appears in your own timetable entries"
            }
            icon={BookOpen}
            className="xl:col-span-8"
            actions={
              <StatusBadge className="tabular-nums">
                {loadError ? "—" : facultyCourses.length}
              </StatusBadge>
            }
          >
            {courseRows.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title={loadError ? "Courses unavailable" : "No courses assigned"}
                description={
                  loadError
                    ? "Your assigned courses could not be read. Reload the page to try again."
                    : "No published timetable schedules a class for your faculty account yet."
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {courseRows.map(({ course, classCount, sessions }) => {
                  const Icon = typeIcon(course.type);
                  const type = typeLabel(course.type);

                  return (
                    <article
                      key={course._id}
                      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="size-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-2 text-sm leading-snug font-medium text-foreground">
                            {course.name || "Unnamed course"}
                          </h3>

                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {course.code || course._id}
                          </p>
                        </div>
                      </div>

                      {(type || course.credits != null || course.hoursPerWeek != null) && (
                        <div className="flex flex-wrap gap-1.5">
                          {type && <StatusBadge>{type}</StatusBadge>}

                          {course.credits != null && (
                            <StatusBadge className="tabular-nums">
                              {course.credits} credits
                            </StatusBadge>
                          )}

                          {course.hoursPerWeek != null && (
                            <StatusBadge className="tabular-nums">
                              {course.hoursPerWeek} h/week
                            </StatusBadge>
                          )}
                        </div>
                      )}

                      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <Field
                          label="Department"
                          value={course.department || "Not specified"}
                        />
                        <Field
                          label="Semester"
                          value={
                            <span className="tabular-nums">
                              {course.semester ?? "—"}
                            </span>
                          }
                        />
                        <Field
                          label="Year"
                          value={
                            <span className="tabular-nums">{course.year ?? "—"}</span>
                          }
                        />
                        <Field
                          label="Academic year"
                          value={
                            <span className="tabular-nums">
                              {course.academicYear ?? "—"}
                            </span>
                          }
                        />
                      </dl>

                      <div className="mt-auto border-t border-border pt-3">
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {classCount} scheduled{" "}
                          {classCount === 1 ? "class" : "classes"} a week
                        </p>

                        {sessions.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {sessions.slice(0, 4).map((session) => (
                              <StatusBadge
                                key={session.key}
                                className="tabular-nums"
                              >
                                {shortDay(session.day)} {session.startTime}
                              </StatusBadge>
                            ))}

                            {sessions.length > 4 && (
                              <span className="self-center text-xs text-muted-foreground tabular-nums">
                                +{sessions.length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* ---- Secondary column ---- */}
          <div className="flex flex-col gap-5 xl:col-span-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard
                label="Assigned courses"
                value={loadError ? "—" : facultyCourses.length}
                icon={BookOpen}
              />

              <StatCard
                label="Scheduled classes"
                value={loadError ? "—" : facultySchedule.length}
                icon={Clock}
              />
            </div>

            {/* ---- Weekly pattern ---- */}
            <SectionCard
              title="Weekly pattern"
              description="Your own classes on each working day."
              icon={CalendarDays}
            >
              {facultySchedule.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {loadError
                    ? "Unavailable while your timetable cannot be read."
                    : "Nothing scheduled for you this week."}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-3">
                  {weekdayLoad.map(({ day, count }) => (
                    <div
                      key={day}
                      className="rounded-lg bg-muted/50 px-2 py-3 text-center"
                    >
                      <p className="truncate text-xs text-muted-foreground">
                        {shortDay(day)}
                      </p>

                      <p
                        className={cn(
                          "mt-1 text-lg font-semibold tabular-nums",
                          count > 0 ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {count}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* ---- Teaching load ---- */}
            <SectionCard
              title="Teaching load"
              description="How many of your own classes each course accounts for."
              icon={Clock}
              footer={
                <Button variant="outline" size="sm" asChild>
                  <Link to="/faculty-portal/timetable">View timetable</Link>
                </Button>
              }
            >
              {loadRows.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title={loadError ? "Load unavailable" : "Nothing scheduled"}
                  description={
                    loadError
                      ? "Your teaching load could not be read."
                      : "Your teaching load appears here once a timetable containing your classes is published."
                  }
                />
              ) : (
                <div className="space-y-3.5">
                  {loadRows.map(({ course, classCount }) => (
                    <div key={course._id}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm text-foreground">
                          {course.name || course.code || course._id}
                        </span>

                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {classCount}
                        </span>
                      </div>

                      <Progress
                        className="mt-1.5 h-1.5"
                        value={
                          busiestCourse > 0
                            ? Math.round((classCount / busiestCourse) * 100)
                            : 0
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
