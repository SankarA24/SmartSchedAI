import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
  Clock3,
  GraduationCap,
  Mail,
  User,
  UserX,
} from "lucide-react";

import api from "@/lib/api";
import { navForRole } from "@/lib/nav";
import { weekStrip } from "@/lib/schedule";
import useIdentity from "@/hooks/useIdentity";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { useTimetableData } from "@/hooks/useTimetableData";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Callout } from "@/components/common/Callout";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import { TimetableListView } from "@/components/timetable/TimetableListView";
import { WeekStrip } from "@/components/timetable/WeekStrip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
   STUDENT DASHBOARD
============================================================ */

function StudentPortal() {
  const navigate = useNavigate();

  // Identity comes from the shared hook only — never from an inline
  // localStorage read, and never with a guessed department/semester/year.
  const {
    user,
    linked,
    loading: identityLoading,
    error: identityError,
  } = useIdentity();

  const filters = useMemo(() => cohortFilters(user), [user]);

  const {
    timetables,
    courses,
    rooms,
    maps,
    loading: dataLoading,
    error: dataError,
  } = useTimetableData(filters);

  const { grid } = useSystemConfig();

  const [notifications, setNotifications] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);

  // ------------------------------------------------------------
  // NO SESSION → LOGIN
  // ------------------------------------------------------------

  useEffect(() => {
    if (!identityLoading && !user) {
      navigate("/login");
    }
  }, [identityLoading, user, navigate]);

  // ------------------------------------------------------------
  // NOTIFICATIONS (scoped server-side by audience/role)
  // ------------------------------------------------------------

  useEffect(() => {
    if (!user) return undefined;

    let cancelled = false;

    api
      .get("/notifications")
      .then(({ data }) => {
        if (cancelled) return;
        setNotifications(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.warn("StudentPortal: failed to load notifications", err);
        if (!cancelled) setNotifications([]);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // ------------------------------------------------------------
  // THE STUDENT'S OWN TIMETABLE
  // ------------------------------------------------------------

  const selectedTimetable = useMemo(
    () => selectCohortTimetable(timetables, user),
    [timetables, user]
  );

  const schedule = useMemo(
    () => uniqueEntries(selectedTimetable?.schedule),
    [selectedTimetable]
  );

  // ------------------------------------------------------------
  // COURSE LOOKUP
  // ------------------------------------------------------------

  const findCourse = (entry) => {
    if (!entry) return null;

    const reference =
      entry.courseId ||
      entry.courseID ||
      entry.course_id ||
      entry.course;

    // Already populated course object.
    if (
      reference &&
      typeof reference === "object" &&
      !Array.isArray(reference)
    ) {
      if (
        reference.name ||
        reference.title ||
        reference.courseName ||
        reference.code
      ) {
        return reference;
      }
    }

    const courseId = getId(reference);

    if (!courseId) return null;

    return (
      courses.find((course) => {
        const id = getId(course._id || course.id);
        return id === courseId;
      }) || null
    );
  };

  const getCourseName = (entry) => {
    const course = findCourse(entry);

    if (course) {
      return (
        course.name ||
        course.title ||
        course.courseName ||
        course.code ||
        "Course"
      );
    }

    return (
      entry?.courseName ||
      entry?.courseTitle ||
      entry?.course?.name ||
      entry?.course?.title ||
      entry?.course?.courseName ||
      "Course"
    );
  };

  // ------------------------------------------------------------
  // ROOM LOOKUP
  // ------------------------------------------------------------

  const findRoom = (entry) => {
    if (!entry) return null;

    const reference =
      entry.roomId ||
      entry.roomID ||
      entry.room_id ||
      entry.room ||
      entry.classroomId ||
      entry.classroom;

    // Already populated room object.
    if (
      reference &&
      typeof reference === "object" &&
      !Array.isArray(reference)
    ) {
      if (
        reference.name ||
        reference.roomNumber ||
        reference.number ||
        reference.roomName
      ) {
        return reference;
      }
    }

    const roomId = getId(reference);

    if (!roomId) return null;

    return (
      rooms.find((room) => {
        const id = getId(room._id || room.id);
        return id === roomId;
      }) || null
    );
  };

  const getRoomName = (entry) => {
    const room = findRoom(entry);

    if (room) {
      return (
        room.name ||
        room.roomNumber ||
        room.number ||
        room.roomName ||
        "—"
      );
    }

    if (typeof entry?.room === "string") {
      return entry.room;
    }

    if (entry?.room?.name) return entry.room.name;
    if (entry?.room?.roomNumber) return entry.room.roomNumber;
    if (entry?.room?.number) return entry.room.number;

    return (
      entry?.roomName ||
      entry?.roomNumber ||
      entry?.classroomName ||
      "—"
    );
  };

  // ------------------------------------------------------------
  // SCHEDULE HELPERS
  // ------------------------------------------------------------

  const getDay = (entry) =>
    normalizeDay(
      entry?.day ||
        entry?.weekday ||
        entry?.dayOfWeek ||
        entry?.weekDay
    );

  const getStartTime = (entry) =>
    formatTime(
      entry?.startTime ||
        entry?.start ||
        entry?.from ||
        entry?.time?.start
    );

  const getEndTime = (entry) =>
    formatTime(
      entry?.endTime ||
        entry?.end ||
        entry?.to ||
        entry?.time?.end
    );

  const dayOrder = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sunday: 7,
  };

  // ------------------------------------------------------------
  // PROCESSED SCHEDULE
  // ------------------------------------------------------------

  const processedSchedule = useMemo(() => {
    return schedule.map((entry, index) => ({
      ...entry,

      _displayId:
        getId(entry._id || entry.id) ||
        `${getId(
          entry.courseId || entry.courseID || entry.course
        ) || "course"}-${getDay(entry)}-${getStartTime(
          entry
        )}-${index}`,

      _day: getDay(entry),
      _startTime: getStartTime(entry),
      _endTime: getEndTime(entry),
      _courseName: getCourseName(entry),
      _roomName: getRoomName(entry),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, courses, rooms]);

  const sortedSchedule = useMemo(() => {
    return [...processedSchedule].sort((a, b) => {
      const dayA = dayOrder[a._day] || 99;
      const dayB = dayOrder[b._day] || 99;

      if (dayA !== dayB) {
        return dayA - dayB;
      }

      return a._startTime.localeCompare(b._startTime);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedSchedule]);

  // ------------------------------------------------------------
  // MY COURSES
  // ------------------------------------------------------------
  //
  // Strictly the courses referenced by the student's own timetable.
  // There is NO fallback to the full course catalogue: an unresolved
  // reference means one fewer course on screen, not the whole database
  // presented as this student's enrolment.

  const myCourses = useMemo(() => {
    const result = [];
    const seen = new Set();

    schedule.forEach((entry) => {
      const course = findCourse(entry);

      if (!course) return;

      const id =
        getId(course._id || course.id) ||
        normalizeText(course.code || course.name);

      if (!id || seen.has(id)) return;

      seen.add(id);
      result.push(course);
    });

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, courses]);

  // ------------------------------------------------------------
  // WEEK STRIP — this student's own entries only
  // ------------------------------------------------------------

  const weekDays = useMemo(
    () => weekStrip(schedule, { weekOffset, grid }),
    [schedule, weekOffset, grid]
  );

  // ------------------------------------------------------------
  // WEEKLY STATISTICS
  // ------------------------------------------------------------

  const weeklyClasses = sortedSchedule.length;

  const weeklyHours = useMemo(() => {
    let totalMinutes = 0;

    sortedSchedule.forEach((entry) => {
      const start = entry._startTime;
      const end = entry._endTime;

      if (!start || !end) return;

      const [startHour, startMinute] = start
        .split(":")
        .map(Number);

      const [endHour, endMinute] = end
        .split(":")
        .map(Number);

      if (
        Number.isNaN(startHour) ||
        Number.isNaN(startMinute) ||
        Number.isNaN(endHour) ||
        Number.isNaN(endMinute)
      ) {
        return;
      }

      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = endHour * 60 + endMinute;

      if (endMinutes > startMinutes) {
        totalMinutes += endMinutes - startMinutes;
      }
    });

    const hours = totalMinutes / 60;

    return Number.isInteger(hours)
      ? hours
      : Number(hours.toFixed(1));
  }, [sortedSchedule]);

  // ------------------------------------------------------------
  // NOTIFICATIONS
  // ------------------------------------------------------------
  //
  // Unread only. The old badge fell back to the total count whenever the
  // unread count was zero, so it could never reach zero.

  const unreadNotifications = notifications.filter((notification) => {
    if (notification?.isRead === true || notification?.read === true) {
      return false;
    }

    return normalizeText(notification?.status) !== "read";
  }).length;

  // ------------------------------------------------------------
  // USER DETAILS — profile values only, no invented defaults
  // ------------------------------------------------------------

  const studentName = user?.name || "Student";
  const studentEmail = user?.email || "—";
  const studentDepartment = user?.department || "—";
  const studentSemester = isBlank(user?.semester) ? "—" : String(user.semester);

  const loading = identityLoading || dataLoading;

  const timetablesError = dataError?.timetables || null;

  const errorMessage = timetablesError
    ? `Unable to load your timetable: ${timetablesError}`
    : identityError || "";

  // Why there is nothing to show, when there is nothing to show.
  const emptyReason = !linked
    ? "Profile not linked — contact your administrator"
    : !hasCohort(user)
      ? "Your student profile has no department set — contact your administrator"
      : !selectedTimetable
        ? "No published timetable for your department and semester yet."
        : "";

  // ------------------------------------------------------------
  // SHELL
  // ------------------------------------------------------------

  const { brand, nav } = navForRole(user?.role || "student");

  const shellNav = useMemo(
    () =>
      nav.map((item) =>
        item.badgeKey === "unread" ? { ...item, badge: unreadNotifications } : item
      ),
    [nav, unreadNotifications]
  );

  return (
    <AppShell
      brand={brand}
      nav={shellNav}
      header={{
        notifications: unreadNotifications,
        onNotificationsClick: () => navigate("/student-portal/notifications"),
      }}
      chatbot={{ context: { page: "student-portal", classes: weeklyClasses } }}
    >
      <PageHeader
        title="Student Dashboard"
        description={`Welcome back, ${studentName}.`}
        actions={
          <Button variant="outline" onClick={() => navigate("/student-portal/timetable")}>
            <CalendarDays className="size-4" />
            My Timetable
          </Button>
        }
      />

      <div className="space-y-6">
        {errorMessage && (
          <Callout tone="destructive" title="Could not load your timetable">
            {errorMessage}
          </Callout>
        )}

        {loading ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-28 w-full rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
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
              description="Until your account is linked to a student record there is no cohort to show courses or a timetable for."
            />
          </SectionCard>
        ) : (
          <>
            {selectedTimetable && (
              <div className="flex animate-in flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4 fade-in duration-150">
                <div className="min-w-0">
                  <div className="text-xs tracking-wide text-muted-foreground uppercase">
                    Current timetable
                  </div>
                  <div className="truncate text-sm font-medium text-foreground">
                    {selectedTimetable.name ||
                      `${studentDepartment} — Semester ${studentSemester}`}
                  </div>
                </div>

                <Badge variant="secondary" className="capitalize">
                  {selectedTimetable.status}
                </Badge>
              </div>
            )}

            {/* WEEK AT A GLANCE — this student's own entries only */}
            <WeekStrip
              days={weekDays}
              weekOffset={weekOffset}
              maps={maps}
              onPrev={() => setWeekOffset((value) => value - 1)}
              onNext={() => setWeekOffset((value) => value + 1)}
              onToday={() => setWeekOffset(0)}
            />

            {/* STAT TILES */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="My Courses"
                value={myCourses.length}
                icon={BookOpen}
                href="/student-portal/courses"
              />
              <StatCard
                label="Weekly Classes"
                value={weeklyClasses}
                icon={CalendarDays}
                tone="success"
                href="/student-portal/timetable"
              />
              <StatCard label="Weekly Hours" value={weeklyHours} icon={Clock3} />
              <StatCard
                label="Unread Notifications"
                value={unreadNotifications}
                icon={Bell}
                tone="warning"
                href="/student-portal/notifications"
              />
            </div>

            <Tabs defaultValue="overview" className="gap-4">
              <TabsList variant="underline">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="schedule">My Schedule</TabsTrigger>
                <TabsTrigger value="courses">My Courses</TabsTrigger>
                <TabsTrigger value="notifications">Notifications</TabsTrigger>
              </TabsList>

              {/* OVERVIEW */}
              <TabsContent value="overview" className="space-y-6">
                {/* WEEKLY ANALYTICS — shared StatCard, real data only */}
                <SectionCard
                  title="Weekly Analytics"
                  description="Derived from your own published timetable."
                  icon={CalendarDays}
                >
                  <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard
                      label="Classes per week"
                      value={weeklyClasses}
                      icon={CalendarDays}
                    />
                    <StatCard label="Hours per week" value={weeklyHours} icon={Clock3} />
                    <StatCard label="Courses" value={myCourses.length} icon={BookOpen} />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Student Information"
                  description="Your academic details."
                  icon={User}
                  actions={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate("/student-portal/profile")}
                    >
                      Profile
                      <ChevronRight className="size-4" />
                    </Button>
                  }
                >
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <InfoItem icon={User} label="Name" value={studentName} />
                    <InfoItem icon={Mail} label="Email" value={studentEmail} />
                    <InfoItem
                      icon={Building2}
                      label="Department"
                      value={studentDepartment}
                    />
                    <InfoItem
                      icon={GraduationCap}
                      label="Semester"
                      value={studentSemester}
                    />
                  </dl>
                </SectionCard>
              </TabsContent>

              {/* MY SCHEDULE */}
              <TabsContent value="schedule">
                <SectionCard
                  title="My Schedule"
                  description="Your assigned classes."
                  icon={CalendarDays}
                  actions={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate("/student-portal/timetable")}
                    >
                      View timetable
                      <ChevronRight className="size-4" />
                    </Button>
                  }
                >
                  {sortedSchedule.length === 0 ? (
                    <EmptyState
                      icon={CalendarDays}
                      title="Nothing scheduled yet"
                      description={emptyReason || "No timetable entries found."}
                    />
                  ) : (
                    <TimetableListView
                      schedule={schedule}
                      grid={grid}
                      maps={maps}
                      groupBy="day"
                      colorMode="type"
                    />
                  )}
                </SectionCard>
              </TabsContent>

              {/* MY COURSES */}
              <TabsContent value="courses">
                <SectionCard
                  title="My Courses"
                  description="Courses referenced by your own timetable."
                  icon={BookOpen}
                  actions={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate("/student-portal/courses")}
                    >
                      View all
                      <ChevronRight className="size-4" />
                    </Button>
                  }
                >
                  {myCourses.length === 0 ? (
                    <EmptyState
                      icon={BookOpen}
                      title="No courses assigned"
                      description={emptyReason || "No courses assigned."}
                    />
                  ) : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {myCourses.map((course, index) => (
                        <li
                          key={getId(course._id || course.id) || index}
                          className="flex animate-in items-start gap-3 rounded-lg border border-border bg-card p-4 fade-in duration-150"
                        >
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <BookOpen className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-foreground">
                              {course.name ||
                                course.title ||
                                course.courseName ||
                                "Course"}
                            </div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {course.code || course.courseCode || "—"}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              </TabsContent>

              {/* NOTIFICATIONS */}
              <TabsContent value="notifications">
                <SectionCard
                  title="Notifications"
                  description="Announcements addressed to students."
                  icon={Bell}
                  actions={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate("/student-portal/notifications")}
                    >
                      View all
                      <ChevronRight className="size-4" />
                    </Button>
                  }
                >
                  {notifications.length === 0 ? (
                    <EmptyState
                      icon={Bell}
                      title="No notifications"
                      description="Nothing has been sent to you yet."
                    />
                  ) : (
                    <ul className="divide-y divide-border">
                      {notifications.slice(0, 8).map((notification, index) => (
                        <li
                          key={getId(notification._id || notification.id) || index}
                          className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground">
                              {notification.title || notification.type || "Notification"}
                            </div>
                            {notification.message && (
                              <p className="text-sm text-muted-foreground">
                                {notification.message}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </AppShell>
  );
}

/* ============================================================
   INFO ITEM
============================================================ */

function InfoItem({ icon, label, value }) {
  const Icon = icon;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="truncate text-sm font-medium text-foreground">{value}</dd>
      </div>
    </div>
  );
}

export default StudentPortal;
