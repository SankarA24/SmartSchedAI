import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Building2, CalendarDays, Clock, ShieldAlert } from "lucide-react";

import api from "@/lib/api";
import { navForRole } from "@/lib/nav";
import useIdentity from "@/hooks/useIdentity";
import { AppShell, PageHeader } from "@/components/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// =====================================================
// /faculty-portal/courses — the courses this faculty member teaches.
//
// Scoping (unchanged by the U9 re-skin, and the whole point of this page):
// the list is the DISTINCT courses appearing in this user's OWN timetable
// entries, never the course catalogue. `GET /api/courses` is fetched only to
// resolve those ids to names; a scheduled id with no catalogue row is shown
// as the bare id rather than padded with invented values.
// =====================================================

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

  const facultySchedule = ownFacultyId
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
    : [];

  // ---------------------------------------------
  // Courses assigned to this faculty member
  //
  // The distinct courseIds appearing in their OWN entries — never the whole
  // catalogue. `/courses` is fetched only to resolve those ids to names.
  // ---------------------------------------------

  const facultyCourseIds = [
    ...new Set(
      facultySchedule.map((entry) =>
        String(entry.courseId)
      )
    ),
  ];

  const courseById = new Map(
    courses.map((course) => [String(course._id), course])
  );

  const facultyCourses = facultyCourseIds.map(
    (courseId) =>
      courseById.get(courseId) || {
        // An id that is scheduled but missing from the catalogue: shown as
        // the bare id rather than dropped or padded with invented values.
        _id: courseId,
        name: null,
        code: null,
      }
  );

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
  // Loading
  // ---------------------------------------------

  if (loading) {
    return (
      <AppShell {...shellProps}>
        <div className="animate-in space-y-6 fade-in duration-150">
          <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>

          <div className="h-72 animate-pulse rounded-xl bg-muted" />
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
          <div className="max-w-md text-center">
            <ShieldAlert className="mx-auto mb-4 size-10 text-muted-foreground" />

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

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Assigned courses"
            value={facultyCourses.length}
            icon={BookOpen}
          />

          <StatCard
            label="Scheduled classes"
            value={facultySchedule.length}
            icon={Clock}
          />

          <StatCard
            label="Department"
            value={faculty?.department || user?.department || "Not specified"}
            icon={Building2}
          />
        </div>

        <SectionCard
          title="Assigned courses"
          description="Every distinct course that appears in your own timetable entries."
          icon={BookOpen}
          actions={
            <Badge variant="secondary" className="tabular-nums">
              {facultyCourses.length}
            </Badge>
          }
        >
          {facultyCourses.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No courses assigned"
              description="No published timetable schedules a class for your faculty account yet."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {facultyCourses.map((course) => (
                <SectionCard
                  key={course._id}
                  icon={BookOpen}
                  title={course.name || "Unnamed course"}
                  description={course.code || course._id}
                  className="transition-colors hover:border-primary/40"
                >
                  <dl className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border bg-muted/40 p-3">
                      <dt className="text-xs text-muted-foreground">Department</dt>
                      <dd className="mt-1 text-sm text-foreground">
                        {course.department || "Not specified"}
                      </dd>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/40 p-3">
                      <dt className="text-xs text-muted-foreground">Credits</dt>
                      <dd className="mt-1 text-sm text-foreground tabular-nums">
                        {course.credits ?? "—"}
                      </dd>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/40 p-3">
                      <dt className="text-xs text-muted-foreground">Semester</dt>
                      <dd className="mt-1 text-sm text-foreground tabular-nums">
                        {course.semester ?? "—"}
                      </dd>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/40 p-3">
                      <dt className="text-xs text-muted-foreground">Academic year</dt>
                      <dd className="mt-1 text-sm text-foreground">
                        {course.academicYear ?? course.year ?? "Not specified"}
                      </dd>
                    </div>
                  </dl>
                </SectionCard>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Teaching schedule"
          description="How many of your own classes each assigned course accounts for."
          icon={Clock}
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link to="/faculty-portal/timetable">View timetable</Link>
            </Button>
          }
        >
          {facultyCourses.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Nothing scheduled"
              description="Your teaching schedule appears here once a timetable containing your classes is published."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {facultyCourses.map((course) => {
                const classCount = facultySchedule.filter(
                  (entry) =>
                    String(entry.courseId) ===
                    String(course._id)
                ).length;

                return (
                  <div
                    key={course._id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Clock className="size-4" />
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {course.name || "Unnamed course"}
                      </p>

                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {classCount} scheduled{" "}
                        {classCount === 1 ? "class" : "classes"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
