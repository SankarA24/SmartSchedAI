import { useEffect, useState } from "react";
import axios from "axios";
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
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export default function FacultyPortal() {
  const navigate = useNavigate();

  const [faculty, setFaculty] = useState(null);
  const [timetables, setTimetables] = useState([]);
  const [courses, setCourses] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  // --------------------------------------------------
  // Get logged-in faculty information
  // --------------------------------------------------

  useEffect(() => {
    const loadFacultyDashboard = async () => {
      try {
        const storedUser = localStorage.getItem("user");

        if (!storedUser) {
          navigate("/login");
          return;
        }

        const user = JSON.parse(storedUser);

        console.log("Logged-in faculty user:", user);

        /*
         * We first try facultyId.
         * If your login currently doesn't return facultyId,
         * we fall back to searching by email.
         */

        let facultyData = null;

        if (user.facultyId) {
          const facultyResponse = await axios.get(
            `http://localhost:5000/api/faculty/${user.facultyId}`
          );

          facultyData = facultyResponse.data;
        } else if (user.email) {
          const facultyResponse = await axios.get(
            "http://localhost:5000/api/faculty"
          );

          facultyData = facultyResponse.data.find(
            (member) =>
              member.email?.toLowerCase() === user.email?.toLowerCase()
          );
        }

        if (!facultyData) {
          console.error("Faculty record not found.");
          setLoading(false);
          return;
        }

        setFaculty(facultyData);

        // --------------------------------------------------
        // Fetch timetable, courses and notifications
        // --------------------------------------------------

        const [
          timetablesResponse,
          coursesResponse,
          notificationsResponse,
        ] = await Promise.all([
          axios.get("http://localhost:5000/api/timetables"),
          axios.get("http://localhost:5000/api/courses"),
          axios.get("http://localhost:5000/api/notifications"),
        ]);

        setTimetables(timetablesResponse.data || []);
        setCourses(coursesResponse.data || []);
        setNotifications(notificationsResponse.data || []);

        setLoading(false);
      } catch (error) {
        console.error(
          "Failed to load faculty dashboard:",
          error
        );

        setLoading(false);
      }
    };

    loadFacultyDashboard();
  }, [navigate]);

  // --------------------------------------------------
  // Logout
  // --------------------------------------------------

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    navigate("/login");
  };

  // --------------------------------------------------
  // Find faculty timetable entries
  // --------------------------------------------------

  const facultySchedule = timetables.flatMap((timetable) =>
    (timetable.schedule || [])
      .filter(
        (entry) =>
          faculty &&
          String(entry.facultyId) === String(faculty._id)
      )
      .map((entry) => ({
        ...entry,
        timetableName: timetable.name,
        semester: timetable.semester,
        department: timetable.department,
      }))
  );

  // --------------------------------------------------
  // Faculty courses
  // --------------------------------------------------

  const facultyCourseIds = [
    ...new Set(
      facultySchedule.map((entry) =>
        String(entry.courseId)
      )
    ),
  ];

  const facultyCourses = courses.filter((course) =>
    facultyCourseIds.includes(String(course._id))
  );

  // --------------------------------------------------
  // Weekly classes
  // --------------------------------------------------

  const totalWeeklyClasses = facultySchedule.length;

  const unreadNotifications = notifications.filter(
    (notification) => !notification.isRead
  ).length;

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

  if (loading) {
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
  // No faculty found
  // --------------------------------------------------

  if (!faculty) {
    return (
      <AppShell brand={brand} nav={navigationItems} onLogout={handleLogout}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="max-w-md text-center">
            <User className="mx-auto mb-4 size-10 text-muted-foreground" />

            <h1 className="text-xl font-semibold text-foreground">
              Faculty Profile Not Found
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              We couldn't find a faculty record for the logged-in account.
            </p>

            <Button onClick={handleLogout} className="mt-6">
              Return to Login
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const stats = [
    { id: "courses", label: "My Courses", value: facultyCourses.length, icon: BookOpen },
    { id: "classes", label: "Weekly Classes", value: totalWeeklyClasses, icon: CalendarDays },
    { id: "hours", label: "Weekly Hours", value: totalWeeklyClasses, icon: Clock },
    { id: "alerts", label: "Notifications", value: unreadNotifications, icon: Bell },
  ];

  const facts = [
    { id: "name", label: "Name", value: faculty.name, icon: User },
    { id: "email", label: "Email", value: faculty.email, icon: Mail },
    { id: "department", label: "Department", value: faculty.department, icon: Building2 },
    {
      id: "specialization",
      label: "Specialization",
      value: faculty.specialization?.length
        ? faculty.specialization.join(", ")
        : "Not specified",
      icon: GraduationCap,
    },
  ];

  return (
    <AppShell brand={brand} nav={navigationItems} onLogout={handleLogout}>
      <PageHeader
        title="Faculty Dashboard"
        description={`Welcome back, ${faculty.name}`}
      />

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
                          {entry.roomId || "Not assigned"}
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
    </AppShell>
  );
}
