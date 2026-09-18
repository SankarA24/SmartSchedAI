import { useEffect, useState } from "react";
import axios from "axios";
import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  Bell,
  User,
  LogOut,
  Users,
  Clock,
  GraduationCap,
  Mail,
  Building2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export default function FacultyPortal() {
  const navigate = useNavigate();

  const [faculty, setFaculty] = useState(null);
  const [timetables, setTimetables] = useState([]);
  const [courses, setCourses] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeNavItem, setActiveNavItem] = useState("dashboard");

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
      icon: Calendar,
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
    },
    {
      id: "profile",
      label: "My Profile",
      icon: User,
      path: "/faculty-portal/profile",
    },
  ];

  // --------------------------------------------------
  // Loading screen
  // --------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-cyan-600/10 animate-pulse" />

        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse" />
        </div>

        {/* Sidebar */}
        <div className="w-64 bg-slate-800/50 backdrop-blur-xl border-r border-slate-700/50 shadow-2xl relative z-10">
          <div className="p-6 space-y-6">
            <div className="h-8 bg-slate-700/50 animate-pulse rounded-xl w-40" />

            <div className="space-y-3">
              {[...Array(5)].map((_, index) => (
                <div
                  key={index}
                  className="h-10 bg-slate-700/30 animate-pulse rounded-lg"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 p-8 relative z-10">
          <div className="max-w-7xl mx-auto space-y-8">
            <div className="h-12 bg-slate-700/50 animate-pulse rounded-xl w-80" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, index) => (
                <div
                  key={index}
                  className="h-40 bg-slate-800/50 animate-pulse rounded-2xl"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // No faculty found
  // --------------------------------------------------

  if (!faculty) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-center">
          <User className="w-16 h-16 text-red-400 mx-auto mb-5" />

          <h1 className="text-2xl font-bold text-white mb-3">
            Faculty Profile Not Found
          </h1>

          <p className="text-slate-400 mb-6">
            We couldn't find a faculty record for the logged-in account.
          </p>

          <button
            onClick={handleLogout}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
      {/* Background effects */}

      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-purple-600/5 to-cyan-600/5" />

      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />

        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />

        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" />
      </div>

      {/* ==================================================
          SIDEBAR
      ================================================== */}

      <div className="w-64 bg-slate-800/30 backdrop-blur-xl border-r border-slate-700/50 shadow-2xl relative z-10">
        <div className="p-6 space-y-8">

          {/* Logo */}

          <div className="space-y-3">
            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-white">
                  Smart Scheduler
                </h2>

                <p className="text-xs text-slate-400">
                  Faculty Portal
                </p>
              </div>

            </div>
          </div>

          {/* Navigation */}

          <nav className="space-y-2">

            {navigationItems.map((item) => {
              const IconComponent = item.icon;

              const isActive =
                activeNavItem === item.id;

              return (
                <Link
                  key={item.id}
                  to={item.path}
                  onClick={() =>
                    setActiveNavItem(item.id)
                  }
                >
                  <div
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group cursor-pointer ${
                      isActive
                        ? "bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-white shadow-lg shadow-blue-500/10 border border-blue-500/30"
                        : "text-slate-300 hover:bg-slate-700/30 hover:text-white"
                    }`}
                  >

                    <IconComponent
                      className={`w-5 h-5 transition-transform duration-300 ${
                        isActive
                          ? "text-blue-400"
                          : "text-slate-400 group-hover:text-slate-200"
                      } group-hover:scale-110`}
                    />

                    <span
                      className={`font-medium ${
                        isActive ? "text-white" : ""
                      }`}
                    >
                      {item.label}
                    </span>

                    {item.id === "notifications" &&
                      unreadNotifications > 0 && (
                        <div className="ml-auto">

                          <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                            {unreadNotifications}
                          </span>

                        </div>
                      )}

                  </div>
                </Link>
              );
            })}

          </nav>

          {/* Logout */}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/20 transition-all duration-300"
          >
            <LogOut className="w-5 h-5" />

            <span className="font-medium">
              Logout
            </span>
          </button>

        </div>
      </div>

      {/* ==================================================
          MAIN CONTENT
      ================================================== */}

      <div className="flex-1 overflow-auto relative z-10">

        <div className="p-8 space-y-8 max-w-7xl mx-auto">

          {/* Header */}

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">

            <div className="space-y-3">

              <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight bg-gradient-to-r from-white via-blue-100 to-cyan-100 bg-clip-text text-transparent">
                Faculty Dashboard
              </h1>

              <p className="text-lg text-slate-300">
                Welcome back, {faculty.name} 👋
              </p>

            </div>

            <div className="flex items-center gap-3">

              <div className="px-4 py-3 rounded-xl bg-slate-800/30 backdrop-blur-sm border border-slate-700/50">

                <p className="text-xs text-slate-400">
                  Faculty
                </p>

                <p className="text-sm font-semibold text-white">
                  {faculty.name}
                </p>

              </div>

            </div>

          </div>

          {/* ==================================================
              STAT CARDS
          ================================================== */}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

            {/* Courses */}

            <div className="bg-slate-800/30 backdrop-blur-xl border border-blue-500/20 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">

              <div className="p-6">

                <div className="flex items-center justify-between mb-4">

                  <div className="p-3 rounded-xl bg-blue-500/20 border border-white/10">
                    <BookOpen className="h-6 w-6 text-blue-400" />
                  </div>

                  <div className="text-right">

                    <p className="text-sm text-slate-400">
                      My Courses
                    </p>

                    <p className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                      {facultyCourses.length}
                    </p>

                  </div>

                </div>

                <div className="h-2 rounded-full bg-gradient-to-r from-blue-500/10 to-cyan-500/10" />

              </div>

            </div>

            {/* Weekly Classes */}

            <div className="bg-slate-800/30 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">

              <div className="p-6">

                <div className="flex items-center justify-between mb-4">

                  <div className="p-3 rounded-xl bg-emerald-500/20 border border-white/10">
                    <Calendar className="h-6 w-6 text-emerald-400" />
                  </div>

                  <div className="text-right">

                    <p className="text-sm text-slate-400">
                      Weekly Classes
                    </p>

                    <p className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                      {totalWeeklyClasses}
                    </p>

                  </div>

                </div>

                <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500/10 to-teal-500/10" />

              </div>

            </div>

            {/* Weekly Hours */}

            <div className="bg-slate-800/30 backdrop-blur-xl border border-violet-500/20 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">

              <div className="p-6">

                <div className="flex items-center justify-between mb-4">

                  <div className="p-3 rounded-xl bg-violet-500/20 border border-white/10">
                    <Clock className="h-6 w-6 text-violet-400" />
                  </div>

                  <div className="text-right">

                    <p className="text-sm text-slate-400">
                      Weekly Hours
                    </p>

                    <p className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                      {totalWeeklyClasses}
                    </p>

                  </div>

                </div>

                <div className="h-2 rounded-full bg-gradient-to-r from-violet-500/10 to-purple-500/10" />

              </div>

            </div>

            {/* Notifications */}

            <div className="bg-slate-800/30 backdrop-blur-xl border border-amber-500/20 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">

              <div className="p-6">

                <div className="flex items-center justify-between mb-4">

                  <div className="p-3 rounded-xl bg-amber-500/20 border border-white/10">
                    <Bell className="h-6 w-6 text-amber-400" />
                  </div>

                  <div className="text-right">

                    <p className="text-sm text-slate-400">
                      Notifications
                    </p>

                    <p className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                      {unreadNotifications}
                    </p>

                  </div>

                </div>

                <div className="h-2 rounded-full bg-gradient-to-r from-amber-500/10 to-orange-500/10" />

              </div>

            </div>

          </div>

          {/* ==================================================
              FACULTY INFORMATION
          ================================================== */}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

            <div className="xl:col-span-2">

              <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-lg">

                <div className="border-b border-slate-700/50 p-6">

                  <h2 className="text-xl font-semibold text-white">
                    Faculty Information
                  </h2>

                  <p className="text-slate-400 mt-1">
                    Your academic and professional details
                  </p>

                </div>

                <div className="p-6">

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                    {/* Name */}

                    <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                      <div className="flex items-center gap-3">

                        <div className="p-3 rounded-lg bg-blue-500/20">
                          <User className="w-5 h-5 text-blue-400" />
                        </div>

                        <div>
                          <p className="text-xs text-slate-400">
                            Name
                          </p>

                          <p className="text-white font-semibold">
                            {faculty.name}
                          </p>
                        </div>

                      </div>

                    </div>

                    {/* Email */}

                    <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                      <div className="flex items-center gap-3">

                        <div className="p-3 rounded-lg bg-cyan-500/20">
                          <Mail className="w-5 h-5 text-cyan-400" />
                        </div>

                        <div className="min-w-0">

                          <p className="text-xs text-slate-400">
                            Email
                          </p>

                          <p className="text-white font-semibold truncate">
                            {faculty.email}
                          </p>

                        </div>

                      </div>

                    </div>

                    {/* Department */}

                    <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                      <div className="flex items-center gap-3">

                        <div className="p-3 rounded-lg bg-emerald-500/20">
                          <Building2 className="w-5 h-5 text-emerald-400" />
                        </div>

                        <div>

                          <p className="text-xs text-slate-400">
                            Department
                          </p>

                          <p className="text-white font-semibold">
                            {faculty.department}
                          </p>

                        </div>

                      </div>

                    </div>

                    {/* Specialization */}

                    <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                      <div className="flex items-center gap-3">

                        <div className="p-3 rounded-lg bg-violet-500/20">
                          <GraduationCap className="w-5 h-5 text-violet-400" />
                        </div>

                        <div>

                          <p className="text-xs text-slate-400">
                            Specialization
                          </p>

                          <p className="text-white font-semibold">
                            {faculty.specialization?.length
                              ? faculty.specialization.join(", ")
                              : "Not specified"}
                          </p>

                        </div>

                      </div>

                    </div>

                  </div>

                </div>

              </div>

            </div>

            {/* ==================================================
                QUICK SUMMARY
            ================================================== */}

            <div>

              <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-lg">

                <div className="border-b border-slate-700/50 p-6">

                  <h2 className="text-xl font-semibold text-white">
                    My Courses
                  </h2>

                  <p className="text-slate-400 mt-1">
                    Courses currently assigned to you
                  </p>

                </div>

                <div className="p-6">

                  {facultyCourses.length === 0 ? (

                    <div className="text-center py-8">

                      <BookOpen className="w-10 h-10 text-slate-500 mx-auto mb-3" />

                      <p className="text-slate-400">
                        No courses assigned yet.
                      </p>

                    </div>

                  ) : (

                    <div className="space-y-3">

                      {facultyCourses.slice(0, 5).map((course) => (

                        <div
                          key={course._id}
                          className="p-4 bg-slate-700/20 border border-slate-600/30 rounded-xl hover:bg-slate-600/30 transition-all duration-300"
                        >

                          <p className="font-semibold text-white">
                            {course.name}
                          </p>

                          <p className="text-xs text-slate-400 mt-1">
                            {course.code || "Course"}
                          </p>

                        </div>

                      ))}

                    </div>

                  )}

                </div>

              </div>

            </div>

          </div>

          {/* ==================================================
              TODAY'S / UPCOMING SCHEDULE
          ================================================== */}

          <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-lg">

            <div className="border-b border-slate-700/50 p-6">

              <div className="flex items-center justify-between">

                <div>

                  <h2 className="text-xl font-semibold text-white">
                    My Schedule
                  </h2>

                  <p className="text-slate-400 mt-1">
                    Your assigned classes
                  </p>

                </div>

                <Link
                  to="/faculty-portal/timetable"
                  className="px-4 py-2 rounded-lg border border-slate-600/50 bg-slate-700/30 text-slate-200 hover:bg-slate-600/40 transition-all"
                >
                  View Timetable
                </Link>

              </div>

            </div>

            <div className="p-6">

              {facultySchedule.length === 0 ? (

                <div className="text-center py-12">

                  <Calendar className="w-12 h-12 text-slate-500 mx-auto mb-4" />

                  <h3 className="text-lg font-semibold text-white mb-2">
                    No Classes Scheduled
                  </h3>

                  <p className="text-slate-400">
                    Your timetable doesn't contain any assigned classes yet.
                  </p>

                </div>

              ) : (

                <div className="space-y-3">

                  {facultySchedule.slice(0, 6).map((entry, index) => {

                    const course = courses.find(
                      (item) =>
                        String(item._id) ===
                        String(entry.courseId)
                    );

                    return (
                      <div
                        key={`${entry.courseId}-${entry.day}-${entry.startTime}-${index}`}
                        className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl hover:bg-slate-600/30 transition-all duration-300"
                      >

                        <div className="flex items-center gap-4">

                          <div className="p-3 rounded-xl bg-blue-500/20 border border-blue-500/20">
                            <Calendar className="w-5 h-5 text-blue-400" />
                          </div>

                          <div>

                            <p className="text-white font-semibold">
                              {course?.name || "Course"}
                            </p>

                            <p className="text-sm text-slate-400">
                              {entry.day}
                            </p>

                          </div>

                        </div>

                        <div className="flex items-center gap-6">

                          <div>

                            <p className="text-xs text-slate-500">
                              Time
                            </p>

                            <p className="text-sm text-slate-200">
                              {entry.startTime} - {entry.endTime}
                            </p>

                          </div>

                          <div>

                            <p className="text-xs text-slate-500">
                              Room
                            </p>

                            <p className="text-sm text-slate-200">
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

          </div>

        </div>

      </div>
    </div>
  );
}