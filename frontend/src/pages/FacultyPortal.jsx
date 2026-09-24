import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  Clock,
  DoorOpen,
  GraduationCap,
  Mail,
  MessageSquare,
  Send,
  ShieldAlert,
  User,
} from "lucide-react";

import api from "@/lib/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { navForRole } from "@/lib/nav";
import { weekStrip } from "@/lib/schedule";
import { useIdentity } from "@/hooks/useIdentity";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { WeekStrip } from "@/components/timetable/WeekStrip";
import { TimetableListView } from "@/components/timetable/TimetableListView";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import { EmptyState } from "@/components/common/EmptyState";
import { Callout } from "@/components/common/Callout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/*
  /faculty-portal — the faculty dashboard (UI_REPLICATION_PLAN U9).

  The shell, the navigation, the theme toggle and logout all come from
  `AppShell` + `navForRole("faculty")`; this file owns no chrome of its own.

  DATA SCOPING (unchanged by the re-skin, and the whole point of this page):
    - Identity comes from `useIdentity()` (GET /api/auth/me) — never from an
      inline localStorage read.
    - `linked === false` renders "Profile not linked — contact your
      administrator" instead of anybody's data.
    - Schedule entries are filtered client-side by this user's own
      `facultyId`, on top of the server's role scoping of GET /timetables.
    - There are deliberately NO fallbacks: no assumed department, no default
      semester/academic year, no invented email, no "render another cohort's
      timetable when ours is empty", and no "the whole course catalogue is
      my course list". Empty stays empty.
*/

const TAB_IDS = ["schedule", "courses", "queries", "analytics", "notifications"];

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "long" });

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

/** `Map<id, doc>` keyed the way `lib/schedule.js#resolveEntry` reads it. */
function toIdMap(list) {
  const map = new Map();
  for (const item of list || []) {
    const id = item?._id ?? item?.id;
    if (id != null) map.set(String(id), item);
  }
  return map;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readTabFromHash() {
  try {
    const hash = String(window.location.hash || "").replace("#", "");
    return TAB_IDS.includes(hash) ? hash : TAB_IDS[0];
  } catch {
    return TAB_IDS[0];
  }
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

  // The scheduling grid is server-owned (GET /api/config/grid); days and
  // slots are never hardcoded here.
  const { grid } = useSystemConfig();

  const [timetables, setTimetables] = useState([]);
  const [courses, setCourses] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [tab, setTab] = useState(readTabFromHash);
  const [weekOffset, setWeekOffset] = useState(0);

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
  // Faculty courses — derived from the faculty's own entries.
  // Never the full /courses list: that list is fetched only to resolve
  // the course ids that appear in this faculty member's own entries.
  // --------------------------------------------------

  const facultyCourses = useMemo(() => {
    const ids = new Set(
      facultySchedule.map((entry) => String(entry.courseId || ""))
    );

    return courses.filter((course) => ids.has(String(course._id)));
  }, [facultySchedule, courses]);

  // Lookup maps for the shared timetable components. `faculty` holds only
  // the signed-in member's own record — every entry on this page is theirs.
  const maps = useMemo(
    () => ({
      courses: toIdMap(courses),
      rooms: toIdMap(rooms),
      faculty: toIdMap(faculty ? [faculty] : []),
    }),
    [courses, rooms, faculty]
  );

  const strip = useMemo(
    () => weekStrip(facultySchedule, { weekOffset, grid }),
    [facultySchedule, weekOffset, grid]
  );

  // --------------------------------------------------
  // Analytics — all of it computed from the faculty's real entries
  // --------------------------------------------------

  const analytics = useMemo(() => {
    const weeklyHours = facultySchedule.reduce(
      (total, entry) => total + entryHours(entry),
      0
    );

    // Days come from the server grid; any day that shows up in the user's
    // own entries but not in the grid is appended so nothing is hidden.
    const dayNames = [...(grid?.days || [])];
    for (const entry of facultySchedule) {
      const day = String(entry.day || "").trim();
      if (day && !dayNames.some((name) => name.toLowerCase() === day.toLowerCase())) {
        dayNames.push(day);
      }
    }

    const perDay = dayNames.map((day) => ({
      day,
      sessions: facultySchedule.filter(
        (entry) => String(entry.day || "").toLowerCase() === day.toLowerCase()
      ).length,
    }));

    const teachingDays = perDay.filter((row) => row.sessions > 0).length;
    const busiestDay = perDay.reduce(
      (busiest, row) => (row.sessions > busiest.sessions ? row : busiest),
      { day: null, sessions: 0 }
    );

    const usedRooms = new Set(
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
      roomsUsed: usedRooms.size,
      maxSessionsInADay: perDay.reduce(
        (max, row) => Math.max(max, row.sessions),
        0
      ),
    };
  }, [facultySchedule, faculty, grid]);

  // Entries store roomId as a plain string; resolve it against the rooms
  // list rather than printing the raw ObjectId.
  const roomNameFor = (entry) => {
    const roomId = String(entry?.roomId || "");
    if (!roomId) return "Not assigned";

    const room = rooms.find((item) => String(item._id || item.id) === roomId);
    return room?.name || roomId;
  };

  const courseNameFor = (entry) => {
    const courseId = String(entry?.courseId || "");
    const course = courses.find(
      (item) => String(item._id || item.id) === courseId
    );
    return course?.name || courseId || "Course";
  };

  const todayName = WEEKDAY_FORMAT.format(new Date());

  const todayClasses = useMemo(
    () =>
      facultySchedule
        .filter(
          (entry) =>
            String(entry.day || "").toLowerCase() === todayName.toLowerCase()
        )
        .sort((a, b) =>
          String(a.startTime).localeCompare(String(b.startTime))
        ),
    [facultySchedule, todayName]
  );

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

  const handleTabChange = (value) => {
    setTab(value);
    try {
      window.history.replaceState(null, "", `#${value}`);
    } catch {
      /* history unavailable */
    }
  };

  // --------------------------------------------------
  // Shell (navigation is shared — see lib/nav.js)
  // --------------------------------------------------

  const { brand, nav, quickActions } = navForRole("faculty");

  const shellNav = useMemo(
    () =>
      nav.map((item) =>
        item.badgeKey === "unread"
          ? { ...item, badge: unreadNotifications }
          : item
      ),
    [nav, unreadNotifications]
  );

  const shellProps = {
    brand,
    nav: shellNav,
    quickActions,
    header: {
      notifications: unreadNotifications,
      onNotificationsClick: () => navigate("/faculty-portal/notifications"),
    },
    onLogout: handleLogout,
  };

  // --------------------------------------------------
  // Loading screen
  // --------------------------------------------------

  if (identityLoading || loading) {
    return (
      <AppShell {...shellProps}>
        <div className="space-y-6">
          <Skeleton className="h-9 w-64" />

          <Skeleton className="h-32 w-full" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>

          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  // --------------------------------------------------
  // Not signed in / identity could not be resolved
  // --------------------------------------------------

  if (!user) {
    return (
      <AppShell {...shellProps}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <EmptyState
            icon={User}
            title="You are not signed in"
            description={
              identityError || "Sign in again to open your faculty portal."
            }
            action={<Button onClick={handleLogout}>Return to Login</Button>}
          />
        </div>
      </AppShell>
    );
  }

  // --------------------------------------------------
  // Signed in, but the account points at no Faculty record.
  // Say so — never fall back to somebody else's data.
  // --------------------------------------------------

  if (!linked) {
    return (
      <AppShell {...shellProps}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <EmptyState
            icon={ShieldAlert}
            title="Profile not linked — contact your administrator"
            description={`Your account (${
              user.email || "this user"
            }) is not linked to a faculty record, so there is no schedule to show.`}
            action={<Button onClick={handleLogout}>Return to Login</Button>}
          />
        </div>
      </AppShell>
    );
  }

  const displayName = faculty?.name || user.name || "Faculty";

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
    <AppShell {...shellProps}>
      <PageHeader
        title="Faculty Dashboard"
        description={`Welcome back, ${displayName}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/faculty-portal/timetable">Open my timetable</Link>
          </Button>
        }
      />

      {loadError ? (
        <div className="mb-6">
          <Callout
            tone="destructive"
            title="Unable to load your dashboard"
            icon={ShieldAlert}
          >
            {loadError}
          </Callout>
        </div>
      ) : null}

      {/* ==================================================
          WEEK AT A GLANCE — this faculty member's own entries
      ================================================== */}

      <WeekStrip
        days={strip}
        weekOffset={weekOffset}
        onPrev={() => setWeekOffset((current) => current - 1)}
        onNext={() => setWeekOffset((current) => current + 1)}
        onToday={() => setWeekOffset(0)}
        maps={maps}
      />

      {/* ==================================================
          STAT CARDS
      ================================================== */}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My Courses" value={facultyCourses.length} icon={BookOpen} />

        <StatCard
          label="Weekly Classes"
          value={totalWeeklyClasses}
          icon={CalendarDays}
          delta={todayClasses.length ? `${todayClasses.length}` : undefined}
          deltaLabel={todayClasses.length ? `today (${todayName})` : undefined}
        />

        <StatCard
          label="Weekly Hours"
          value={
            analytics.maxHours
              ? `${analytics.weeklyHours} / ${analytics.maxHours}`
              : analytics.weeklyHours
          }
          icon={Clock}
          tone={
            analytics.loadPercent !== null && analytics.loadPercent >= 100
              ? "warning"
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
          label="Notifications"
          value={unreadNotifications}
          icon={Bell}
          href="/faculty-portal/notifications"
        />
      </div>

      {/* ==================================================
          TABS
      ================================================== */}

      <Tabs value={tab} onValueChange={handleTabChange} className="mt-6 gap-4">
        <TabsList variant="underline" className="w-full overflow-x-auto">
          <TabsTrigger value="schedule">My Schedule</TabsTrigger>
          <TabsTrigger value="courses">My Courses</TabsTrigger>
          <TabsTrigger value="queries">Queries</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        {/* ---------------- My Schedule ---------------- */}

        <TabsContent value="schedule" className="animate-in fade-in duration-150">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="xl:col-span-1">
              <SectionCard
                title={`Today — ${todayName}`}
                description="Your classes for today"
                icon={CalendarDays}
              >
                {todayClasses.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="Nothing scheduled today"
                    description="You have no classes assigned for today."
                  />
                ) : (
                  <div className="space-y-2">
                    {todayClasses.map((entry, index) => (
                      <div
                        key={`${entry.courseId}-${entry.startTime}-${index}`}
                        className="rounded-md border border-border p-3 transition-colors duration-150 hover:bg-accent"
                      >
                        <p className="text-sm font-medium text-foreground">
                          {courseNameFor(entry)}
                        </p>

                        <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                          {entry.startTime} - {entry.endTime}
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {roomNameFor(entry)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            <div className="xl:col-span-2">
              <SectionCard
                title="My Schedule"
                description="Every class assigned to you across your published timetables"
                icon={Clock}
                actions={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/faculty-portal/timetable">Grid view</Link>
                  </Button>
                }
              >
                {facultySchedule.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="No classes scheduled"
                    description="Your timetable doesn't contain any assigned classes yet."
                  />
                ) : (
                  <TimetableListView
                    schedule={facultySchedule}
                    grid={grid}
                    maps={maps}
                    groupBy="day"
                  />
                )}
              </SectionCard>
            </div>
          </div>
        </TabsContent>

        {/* ---------------- My Courses ---------------- */}

        <TabsContent value="courses" className="animate-in fade-in duration-150">
          <SectionCard
            title="My Courses"
            description="Derived from your own timetable entries — not the course catalogue"
            icon={BookOpen}
          >
            {facultyCourses.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No courses assigned"
                description="Courses appear here once a published timetable assigns one of them to you."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {facultyCourses.map((course) => {
                  const sessions = facultySchedule.filter(
                    (entry) =>
                      String(entry.courseId || "") === String(course._id)
                  ).length;

                  return (
                    <div
                      key={course._id}
                      className="rounded-lg border border-border bg-card p-4 transition-colors duration-150 hover:bg-accent"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">
                          {course.name}
                        </p>

                        {course.type ? (
                          <Badge variant="outline" className="capitalize">
                            {course.type}
                          </Badge>
                        ) : null}
                      </div>

                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {course.code || "—"}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {course.department ? (
                          <span>{course.department}</span>
                        ) : null}
                        {course.semester ? (
                          <span>Semester {course.semester}</span>
                        ) : null}
                        <span>
                          {sessions} {sessions === 1 ? "session" : "sessions"} /
                          week
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ---------------- Queries ----------------
            Own queries only — the server scopes GET /api/queries to the
            caller, and POST /api/queries takes the author from the token.
        ------------------------------------------- */}

        <TabsContent value="queries" className="animate-in fade-in duration-150">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="xl:col-span-1">
              <SectionCard
                title="Ask a Query"
                description="Send a question to the administrator"
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
                      rows={4}
                    />
                  </div>

                  {queryError ? (
                    <p className="text-sm text-destructive">{queryError}</p>
                  ) : null}

                  {queryNotice ? (
                    <p className="text-sm text-muted-foreground">
                      {queryNotice}
                    </p>
                  ) : null}

                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={querySubmitting}>
                      <Send className="size-4" />
                      {querySubmitting ? "Sending..." : "Send Query"}
                    </Button>
                  </div>
                </form>
              </SectionCard>
            </div>

            <div className="xl:col-span-2">
              <SectionCard
                title="My Queries"
                description="Questions you raised and the administrator's replies"
                icon={MessageSquare}
              >
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

                          <Badge
                            variant={
                              query.status === "answered"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {query.status === "answered" ? "Answered" : "Open"}
                          </Badge>
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

                        {query.createdAt ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {formatDateTime(query.createdAt)}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          </div>
        </TabsContent>

        {/* ---------------- Analytics ---------------- */}

        <TabsContent
          value="analytics"
          className="animate-in fade-in space-y-6 duration-150"
        >
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
                  analytics.loadPercent !== null && analytics.loadPercent >= 100
                    ? "destructive"
                    : "default"
                }
                delta={
                  analytics.loadPercent !== null
                    ? `${analytics.loadPercent}%`
                    : undefined
                }
                deltaLabel={
                  analytics.loadPercent !== null
                    ? "of max hours/week"
                    : undefined
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
                No published classes are assigned to you yet, so there is
                nothing to measure.
              </p>
            ) : (
              <div className="mt-6 space-y-3">
                {analytics.perDay.map((row) => (
                  <div key={row.day} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">
                      {row.day}
                    </span>

                    <Progress
                      className="flex-1"
                      value={
                        analytics.maxSessionsInADay
                          ? Math.round(
                              (row.sessions / analytics.maxSessionsInADay) * 100
                            )
                          : 0
                      }
                    />

                    <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {row.sessions} {row.sessions === 1 ? "class" : "classes"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Faculty Information"
            description="Your academic and professional details"
            icon={User}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
          </SectionCard>
        </TabsContent>

        {/* ---------------- Notifications ----------------
            GET /api/notifications is audience-scoped server-side; this tab
            only renders what came back for this user.
        ------------------------------------------------ */}

        <TabsContent
          value="notifications"
          className="animate-in fade-in duration-150"
        >
          <SectionCard
            title="Notifications"
            description="Announcements addressed to you"
            icon={Bell}
            actions={
              <Button asChild variant="outline" size="sm">
                <Link to="/faculty-portal/notifications">Open all</Link>
              </Button>
            }
          >
            {notifications.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="No notifications"
                description="Announcements addressed to faculty will appear here."
              />
            ) : (
              <div className="space-y-2">
                {notifications.slice(0, 10).map((notification) => (
                  <div
                    key={notification._id}
                    className="rounded-md border border-border p-3 transition-colors duration-150 hover:bg-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        {notification.title}
                      </p>

                      {notification.isRead ? null : (
                        <Badge variant="secondary">New</Badge>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {notification.message}
                    </p>

                    {notification.createdAt ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatDateTime(notification.createdAt)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
