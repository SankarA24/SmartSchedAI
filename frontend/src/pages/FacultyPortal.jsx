import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import {
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  Bell,
  User,
  Clock,
  GraduationCap,
  Mail,
  Building2,
  DoorOpen,
  MessageSquare,
  Send,
  ShieldAlert,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import { EmptyState } from "@/components/common/EmptyState";
import { useIdentity } from "@/hooks/useIdentity";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** "09:00" -> 540. Returns null for anything unparseable. */
function toMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  return hours * 60 + minutes;
}

/** Duration of one schedule entry in hours; 0 when the times make no sense. */
function entryHours(entry) {
  const start = toMinutes(entry?.startTime);
  const end = toMinutes(entry?.endTime);
  if (start === null || end === null || end <= start) return 0;
  return (end - start) / 60;
}

function roundHours(hours) {
  return Math.round(hours * 10) / 10;
}

export default function FacultyPortal() {
  const navigate = useNavigate();

  // Identity resolves once, here, through the shared hook — no inline
  // localStorage read, no email guessing, no invented department/semester
  // defaults. `faculty` is the linked Faculty doc straight from
  // GET /api/auth/me, `linked` is false when User.facultyId is null.
  const {
    user,
    faculty,
    linked,
    loading: identityLoading,
    error: identityError,
  } = useIdentity();

  const [timetables, setTimetables] = useState([]);
  const [courses, setCourses] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [querySubject, setQuerySubject] = useState("");
  const [queryMessage, setQueryMessage] = useState("");
  const [querySubmitting, setQuerySubmitting] = useState(false);
  const [queryError, setQueryError] = useState("");
  const [queryNotice, setQueryNotice] = useState("");

  const facultyId = user?.facultyId ? String(user.facultyId) : "";

  // --------------------------------------------------
  // Dashboard data (only once we know who is signed in)
  // --------------------------------------------------

  useEffect(() => {
    if (identityLoading) return;

    // No identity at all, or no profile behind it (`linked` is false for
    // both): nothing to fetch. The render below shows the honest message
    // instead of data.
    if (!linked || !facultyId) {
      setTimetables([]);
      setCourses([]);
      setRooms([]);
      setNotifications([]);
      setQueries([]);
      setLoading(false);
      return;
    }

    let canceled = false;

    const loadFacultyDashboard = async () => {
      setLoading(true);
      setLoadError("");

      try {
        // GET /api/timetables is already scoped server-side for a faculty
        // caller: published only, and only tables whose schedule contains
        // one of this faculty's entries. The client-side facultyId filter
        // further down is a second layer, not the only one.
        const [
          timetablesResponse,
          coursesResponse,
          roomsResponse,
          notificationsResponse,
          queriesResponse,
        ] = await Promise.all([
          api.get("/timetables"),
          api.get("/courses"),
          api.get("/rooms"),
          api.get("/notifications"),
          api.get("/queries"),
        ]);

        if (canceled) return;

        setTimetables(
          Array.isArray(timetablesResponse.data) ? timetablesResponse.data : []
        );
        setCourses(
          Array.isArray(coursesResponse.data) ? coursesResponse.data : []
        );
        setRooms(Array.isArray(roomsResponse.data) ? roomsResponse.data : []);
        setNotifications(
          Array.isArray(notificationsResponse.data)
            ? notificationsResponse.data
            : []
        );
        setQueries(
          Array.isArray(queriesResponse.data) ? queriesResponse.data : []
        );
      } catch (error) {
        if (canceled) return;
        console.error("Failed to load faculty dashboard:", error);
        setLoadError(
          error?.response?.data?.error ||
            error?.message ||
            "Failed to load your dashboard"
        );
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    loadFacultyDashboard();

    return () => {
      canceled = true;
    };
    // Keyed on the resolved facultyId rather than the identity object, so
    // the cached-then-server refresh inside useIdentity does not refetch
    // when it resolves to the same person.
  }, [identityLoading, linked, facultyId]);

  // --------------------------------------------------
  // Logout
  // --------------------------------------------------

  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    navigate("/login");
  }, [navigate]);

  // --------------------------------------------------
  // This faculty member's own entries (second layer of scoping)
  // --------------------------------------------------

  const facultySchedule = useMemo(() => {
    if (!facultyId) return [];

    return timetables.flatMap((timetable) =>
      (timetable.schedule || [])
        .filter((entry) => String(entry.facultyId || "") === facultyId)
        .map((entry) => ({
          ...entry,
          timetableName: timetable.name,
          semester: timetable.semester,
          department: timetable.department,
        }))
    );
  }, [timetables, facultyId]);

  // --------------------------------------------------
  // Faculty courses — derived from the faculty's own entries
  // --------------------------------------------------

  const facultyCourses = useMemo(() => {
    const ids = new Set(
      facultySchedule.map((entry) => String(entry.courseId || ""))
    );

    return courses.filter((course) => ids.has(String(course._id)));
  }, [facultySchedule, courses]);

  // --------------------------------------------------
  // Analytics — all of it computed from the faculty's real entries
  // --------------------------------------------------

  const analytics = useMemo(() => {
    const weeklyHours = facultySchedule.reduce(
      (total, entry) => total + entryHours(entry),
      0
    );

    const perDay = DAYS.map((day) => ({
      day,
      sessions: facultySchedule.filter((entry) => entry.day === day).length,
    }));

    const teachingDays = perDay.filter((row) => row.sessions > 0).length;
    const busiestDay = perDay.reduce(
      (busiest, row) => (row.sessions > busiest.sessions ? row : busiest),
      { day: null, sessions: 0 }
    );

    const rooms = new Set(
      facultySchedule
        .map((entry) => String(entry.roomId || ""))
        .filter((roomId) => roomId !== "")
    );

    const maxHours = Number(faculty?.maxHoursPerWeek);
    const hasMaxHours = Number.isFinite(maxHours) && maxHours > 0;

    return {
      weeklyHours: roundHours(weeklyHours),
      maxHours: hasMaxHours ? maxHours : null,
      loadPercent: hasMaxHours
        ? Math.min(100, Math.round((weeklyHours / maxHours) * 100))
        : null,
      perDay,
      teachingDays,
      busiestDay: busiestDay.sessions > 0 ? busiestDay : null,
      sessionsPerDay: teachingDays
        ? roundHours(facultySchedule.length / teachingDays)
        : 0,
      roomsUsed: rooms.size,
      maxSessionsInADay: perDay.reduce(
        (max, row) => Math.max(max, row.sessions),
        0
      ),
    };
  }, [facultySchedule, faculty]);

  // Entries store roomId as a plain string; resolve it against the rooms
  // list rather than printing the raw ObjectId.
  const roomNameFor = (entry) => {
    const roomId = String(entry?.roomId || "");
    if (!roomId) return "Not assigned";

    const room = rooms.find((item) => String(item._id || item.id) === roomId);
    return room?.name || roomId;
  };

  const totalWeeklyClasses = facultySchedule.length;

  const unreadNotifications = notifications.filter(
    (notification) => !notification.isRead
  ).length;

  // --------------------------------------------------
  // Queries — the faculty member's own, from GET /api/queries
  // --------------------------------------------------

  const handleQuerySubmit = async (event) => {
    event.preventDefault();

    const subject = querySubject.trim();
    const message = queryMessage.trim();

    setQueryNotice("");

    if (!subject || !message) {
      setQueryError("Subject and message are both required.");
      return;
    }

    setQuerySubmitting(true);
    setQueryError("");

    try {
      // The server takes the author from the token, so nothing about the
      // signed-in user is sent in the body.
      const { data } = await api.post("/queries", { subject, message });

      setQueries((current) => [data, ...current]);
      setQuerySubject("");
      setQueryMessage("");
      setQueryNotice("Your query has been sent to the administrator.");
    } catch (error) {
      console.error("Failed to submit query:", error);
      setQueryError(
        error?.response?.data?.error ||
          error?.message ||
          "Failed to send your query"
      );
    } finally {
      setQuerySubmitting(false);
    }
  };

  // --------------------------------------------------
  // Navigation
  // --------------------------------------------------

  const navigationItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      path: "/faculty-portal",
    },
    {
      id: "timetable",
      label: "My Timetable",
      icon: CalendarDays,
      path: "/faculty-portal/timetable",
    },
    {
      id: "courses",
      label: "My Courses",
      icon: BookOpen,
      path: "/faculty-portal/courses",
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: Bell,
      path: "/faculty-portal/notifications",
      badge: unreadNotifications,
    },
    {
      id: "profile",
      label: "Profile",
      icon: User,
      path: "/faculty-portal/profile",
    },
  ];

  const brand = { title: "SmartSchedAI", subtitle: "Faculty portal" };

  // --------------------------------------------------
  // Loading screen
  // --------------------------------------------------

  if (identityLoading || loading) {
    return (
      <AppShell brand={brand} nav={navigationItems} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-md bg-muted"
              />
            ))}
          </div>

          <div className="h-64 animate-pulse rounded-md bg-muted" />
        </div>
      </AppShell>
    );
  }

  // --------------------------------------------------
  // Not signed in / identity could not be resolved
  // --------------------------------------------------

  if (!user) {
    return (
      <AppShell brand={brand} nav={navigationItems} onLogout={handleLogout}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="max-w-md text-center">
            <User className="mx-auto mb-4 size-10 text-muted-foreground" />

            <h1 className="text-xl font-semibold text-foreground">
              You are not signed in
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              {identityError || "Sign in again to open your faculty portal."}
            </p>

            <Button onClick={handleLogout} className="mt-6">
              Return to Login
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // --------------------------------------------------
  // Signed in, but the account points at no Faculty record
  // --------------------------------------------------

  if (!linked) {
    return (
      <AppShell brand={brand} nav={navigationItems} onLogout={handleLogout}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="max-w-md text-center">
            <ShieldAlert className="mx-auto mb-4 size-10 text-muted-foreground" />

            <h1 className="text-xl font-semibold text-foreground">
              Profile not linked — contact your administrator
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Your account ({user.email || "this user"}) is not linked to a
              faculty record, so there is no schedule to show.
            </p>

            <Button onClick={handleLogout} className="mt-6">
              Return to Login
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const displayName = faculty?.name || user.name || "Faculty";

  const stats = [
    {
      id: "courses",
      label: "My Courses",
      value: facultyCourses.length,
      icon: BookOpen,
    },
    {
      id: "classes",
      label: "Weekly Classes",
      value: totalWeeklyClasses,
      icon: CalendarDays,
    },
    {
      id: "hours",
      label: "Weekly Hours",
      value: analytics.weeklyHours,
      icon: Clock,
    },
    {
      id: "alerts",
      label: "Notifications",
      value: unreadNotifications,
      icon: Bell,
    },
  ];

  const facts = [
    { id: "name", label: "Name", value: displayName, icon: User },
    {
      id: "email",
      label: "Email",
      value: faculty?.email || user.email || "Not available",
      icon: Mail,
    },
    {
      id: "department",
      label: "Department",
      value: faculty?.department || user.department || "Not assigned",
      icon: Building2,
    },
    {
      id: "specialization",
      label: "Specialization",
      value: faculty?.specialization?.length
        ? faculty.specialization.join(", ")
        : "Not specified",
      icon: GraduationCap,
    },
  ];

  return (
    <AppShell brand={brand} nav={navigationItems} onLogout={handleLogout}>
      <PageHeader
        title="Faculty Dashboard"
        description={`Welcome back, ${displayName}`}
      />

      {loadError ? (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">
            Unable to load your dashboard
          </p>

          <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
        </div>
      ) : null}

      {/* ==================================================
          STAT CARDS
      ================================================== */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const IconComponent = stat.icon;

          return (
            <div
              key={stat.id}
              className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {stat.label}
                  </p>

                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                    {stat.value}
                  </p>
                </div>

                <IconComponent className="size-4 shrink-0 text-muted-foreground" />
              </div>
            </div>
          );
        })}
      </div>

      {/* ==================================================
          TEACHING ANALYTICS (real entries only)
      ================================================== */}

      <div className="mt-6">
        <SectionCard
          title="Teaching Analytics"
          description="Computed from your own published timetable entries"
          icon={Clock}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Weekly Teaching Hours"
              value={
                analytics.maxHours
                  ? `${analytics.weeklyHours} / ${analytics.maxHours}`
                  : analytics.weeklyHours
              }
              icon={Clock}
              tone={
                analytics.loadPercent !== null && analytics.loadPercent > 100
                  ? "destructive"
                  : "default"
              }
              delta={
                analytics.loadPercent !== null
                  ? `${analytics.loadPercent}%`
                  : undefined
              }
              deltaLabel={
                analytics.loadPercent !== null ? "of max hours/week" : undefined
              }
            />

            <StatCard
              label="Sessions per Teaching Day"
              value={analytics.sessionsPerDay}
              icon={CalendarDays}
              delta={
                analytics.busiestDay
                  ? `${analytics.busiestDay.sessions}`
                  : undefined
              }
              deltaLabel={
                analytics.busiestDay
                  ? `peak on ${analytics.busiestDay.day}`
                  : undefined
              }
            />

            <StatCard
              label="Rooms Used"
              value={analytics.roomsUsed}
              icon={DoorOpen}
            />
          </div>

          {facultySchedule.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No published classes are assigned to you yet, so there is nothing
              to measure.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {analytics.perDay.map((row) => (
                <div key={row.day} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">
                    {row.day}
                  </span>

                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${
                          analytics.maxSessionsInADay
                            ? (row.sessions / analytics.maxSessionsInADay) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {row.sessions} {row.sessions === 1 ? "class" : "classes"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ==================================================
          FACULTY INFORMATION
      ================================================== */}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <section className="rounded-lg border border-border bg-card text-card-foreground shadow-sm">
            <div className="border-b border-border p-4">
              <h2>Faculty Information</h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Your academic and professional details
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
              {facts.map((fact) => {
                const IconComponent = fact.icon;

                return (
                  <div
                    key={fact.id}
                    className="flex items-center gap-3 rounded-md border border-border p-4"
                  >
                    <IconComponent className="size-4 shrink-0 text-muted-foreground" />

                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {fact.label}
                      </p>

                      <p className="truncate text-sm font-medium text-foreground">
                        {fact.value}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* ==================================================
            QUICK SUMMARY
        ================================================== */}

        <section className="rounded-lg border border-border bg-card text-card-foreground shadow-sm">
          <div className="border-b border-border p-4">
            <h2>My Courses</h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Courses currently assigned to you
            </p>
          </div>

          <div className="p-4">
            {facultyCourses.length === 0 ? (
              <div className="py-8 text-center">
                <BookOpen className="mx-auto mb-3 size-8 text-muted-foreground" />

                <p className="text-sm text-muted-foreground">
                  No courses assigned yet.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {facultyCourses.slice(0, 5).map((course) => (
                  <div
                    key={course._id}
                    className="rounded-md border border-border p-3 transition-colors duration-150 hover:bg-accent"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {course.name}
                    </p>

                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {course.code || "Course"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ==================================================
          TODAY'S / UPCOMING SCHEDULE
      ================================================== */}

      <section className="mt-6 rounded-lg border border-border bg-card text-card-foreground shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-border p-4">
          <div>
            <h2>My Schedule</h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Your assigned classes
            </p>
          </div>

          <Button asChild variant="outline" size="sm">
            <Link to="/faculty-portal/timetable">View Timetable</Link>
          </Button>
        </div>

        <div className="p-4">
          {facultySchedule.length === 0 ? (
            <div className="py-12 text-center">
              <CalendarDays className="mx-auto mb-4 size-10 text-muted-foreground" />

              <h3 className="text-foreground">No Classes Scheduled</h3>

              <p className="mt-1 text-sm text-muted-foreground">
                Your timetable doesn't contain any assigned classes yet.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {facultySchedule.slice(0, 6).map((entry, index) => {
                const course = courses.find(
                  (item) =>
                    String(item._id) ===
                    String(entry.courseId)
                );

                return (
                  <div
                    key={`${entry.courseId}-${entry.day}-${entry.startTime}-${index}`}
                    className="flex flex-col gap-3 rounded-md border border-border p-4 transition-colors duration-150 hover:bg-accent md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <CalendarDays className="size-4 shrink-0 text-muted-foreground" />

                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {course?.name || "Course"}
                        </p>

                        <p className="text-xs text-muted-foreground">
                          {entry.day}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Time
                        </p>

                        <p className="font-mono text-xs tabular-nums text-foreground">
                          {entry.startTime} - {entry.endTime}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">
                          Room
                        </p>

                        <p className="text-sm text-foreground">
                          {roomNameFor(entry)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ==================================================
          ASK A QUERY  (own queries only — the server scopes
          GET /api/queries to the caller)
      ================================================== */}

      <div className="mt-6">
        <SectionCard
          title="Ask a Query"
          description="Send a question to the administrator and track their replies"
          icon={MessageSquare}
        >
          <form onSubmit={handleQuerySubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="query-subject">Subject</Label>

              <Input
                id="query-subject"
                value={querySubject}
                onChange={(event) => setQuerySubject(event.target.value)}
                placeholder="e.g. Clash on Tuesday 11:00"
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="query-message">Message</Label>

              <Textarea
                id="query-message"
                value={queryMessage}
                onChange={(event) => setQueryMessage(event.target.value)}
                placeholder="Describe your question in a sentence or two."
                rows={3}
              />
            </div>

            {queryError ? (
              <p className="text-sm text-destructive">{queryError}</p>
            ) : null}

            {queryNotice ? (
              <p className="text-sm text-muted-foreground">{queryNotice}</p>
            ) : null}

            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={querySubmitting}>
                <Send className="size-4" />
                {querySubmitting ? "Sending..." : "Send Query"}
              </Button>
            </div>
          </form>

          <div className="mt-6 border-t border-border pt-4">
            <p className="mb-3 text-sm font-medium text-foreground">
              My Queries
            </p>

            {queries.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No queries yet"
                description="Questions you raise appear here with the administrator's reply."
              />
            ) : (
              <div className="space-y-2">
                {queries.map((query) => (
                  <div
                    key={query._id}
                    className="rounded-md border border-border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        {query.subject}
                      </p>

                      <span
                        className={
                          query.status === "answered"
                            ? "shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                            : "shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {query.status === "answered" ? "Answered" : "Open"}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {query.message}
                    </p>

                    {query.reply ? (
                      <p className="mt-2 rounded-md bg-muted p-2 text-sm text-foreground">
                        <span className="font-medium">Admin: </span>
                        {query.reply}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
