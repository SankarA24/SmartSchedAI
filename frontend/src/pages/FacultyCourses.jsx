import { useEffect, useState } from "react";
import axios from "axios";

import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  Bell,
  User,
  LogOut,
  GraduationCap,
  Building2,
  Clock,
} from "lucide-react";

import { Link, useNavigate } from "react-router-dom";

const API_URL = "http://localhost:5000";

export default function FacultyCourses() {
  const navigate = useNavigate();

  const [faculty, setFaculty] = useState(null);
  const [timetables, setTimetables] = useState([]);
  const [courses, setCourses] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFacultyCourses = async () => {
      try {
        const storedUser = localStorage.getItem("user");

        if (!storedUser) {
          navigate("/login");
          return;
        }

        const user = JSON.parse(storedUser);

        console.log("Logged-in faculty user:", user);

        // ---------------------------------------------
        // Get faculty information
        // ---------------------------------------------

        let facultyData = null;

        if (user.facultyId) {
          const facultyResponse = await axios.get(
            `${API_URL}/api/faculty/${user.facultyId}`
          );

          facultyData = facultyResponse.data;
        } else if (user.email) {
          const facultyResponse = await axios.get(
            `${API_URL}/api/faculty`
          );

          facultyData = facultyResponse.data.find(
            (member) =>
              member.email?.toLowerCase() ===
              user.email?.toLowerCase()
          );
        }

        if (!facultyData) {
          console.error("Faculty record not found.");
          setLoading(false);
          return;
        }

        setFaculty(facultyData);

        // ---------------------------------------------
        // Fetch timetable, courses and notifications
        // ---------------------------------------------

        const [
          timetablesResponse,
          coursesResponse,
          notificationsResponse,
        ] = await Promise.all([
          axios.get(`${API_URL}/api/timetables`),
          axios.get(`${API_URL}/api/courses`),
          axios.get(`${API_URL}/api/notifications`),
        ]);

        setTimetables(timetablesResponse.data || []);
        setCourses(coursesResponse.data || []);
        setNotifications(notificationsResponse.data || []);

        setLoading(false);
      } catch (error) {
        console.error(
          "Failed to load faculty courses:",
          error
        );

        setLoading(false);
      }
    };

    loadFacultyCourses();
  }, [navigate]);

  // ---------------------------------------------
  // Find timetable entries for this faculty
  // ---------------------------------------------

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

  // ---------------------------------------------
  // Find unique courses assigned to faculty
  // ---------------------------------------------

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

  // ---------------------------------------------
  // Notifications
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
  // Navigation
  // ---------------------------------------------

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

  // ---------------------------------------------
  // Loading
  // ---------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">

        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-purple-600/5 to-cyan-600/5" />

        {/* Sidebar */}
        <div className="w-64 bg-slate-800/30 backdrop-blur-xl border-r border-slate-700/50 shadow-2xl relative z-10">
          <div className="p-6 space-y-8">

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
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

            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((item) => (
                <div
                  key={item}
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-32 bg-slate-800/50 animate-pulse rounded-2xl"
                />
              ))}
            </div>

          </div>
        </div>

      </div>
    );
  }

  // ---------------------------------------------
  // Faculty not found
  // ---------------------------------------------

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

  // ---------------------------------------------
  // Main UI
  // ---------------------------------------------

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

          {/* Navigation */}

          <nav className="space-y-2">

            {navigationItems.map((item) => {

              const IconComponent = item.icon;

              const isActive = item.id === "courses";

              return (
                <Link
                  key={item.id}
                  to={item.path}
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
                My Courses
              </h1>

              <p className="text-lg text-slate-300">
                Courses currently assigned to you
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

            {/* Total Courses */}

            <div className="bg-slate-800/30 backdrop-blur-xl border border-blue-500/20 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">

              <div className="p-6">

                <div className="flex items-center justify-between mb-4">

                  <div className="p-3 rounded-xl bg-blue-500/20 border border-white/10">

                    <BookOpen className="h-6 w-6 text-blue-400" />

                  </div>

                  <div className="text-right">

                    <p className="text-sm text-slate-400">
                      Total Courses
                    </p>

                    <p className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                      {facultyCourses.length}
                    </p>

                  </div>

                </div>

                <div className="h-2 rounded-full bg-gradient-to-r from-blue-500/10 to-cyan-500/10" />

              </div>

            </div>

            {/* Department */}

            <div className="bg-slate-800/30 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">

              <div className="p-6">

                <div className="flex items-center justify-between mb-4">

                  <div className="p-3 rounded-xl bg-emerald-500/20 border border-white/10">

                    <Building2 className="h-6 w-6 text-emerald-400" />

                  </div>

                  <div className="text-right">

                    <p className="text-sm text-slate-400">
                      Department
                    </p>

                    <p className="text-xl font-bold text-white">
                      {faculty.department || "Computer Science"}
                    </p>

                  </div>

                </div>

                <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500/10 to-teal-500/10" />

              </div>

            </div>

            {/* Faculty */}

            <div className="bg-slate-800/30 backdrop-blur-xl border border-violet-500/20 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">

              <div className="p-6">

                <div className="flex items-center justify-between mb-4">

                  <div className="p-3 rounded-xl bg-violet-500/20 border border-white/10">

                    <User className="h-6 w-6 text-violet-400" />

                  </div>

                  <div className="text-right">

                    <p className="text-sm text-slate-400">
                      Faculty
                    </p>

                    <p className="text-xl font-bold text-white">
                      {faculty.name}
                    </p>

                  </div>

                </div>

                <div className="h-2 rounded-full bg-gradient-to-r from-violet-500/10 to-purple-500/10" />

              </div>

            </div>

          </div>

          {/* ==================================================
              ASSIGNED COURSES
          ================================================== */}

          <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-lg">

            {/* Section Header */}

            <div className="border-b border-slate-700/50 p-6">

              <h2 className="text-xl font-semibold text-white">
                Assigned Courses
              </h2>

              <p className="text-slate-400 mt-1">
                Your courses for the current semester
              </p>

            </div>

            {/* Course List */}

            <div className="p-6">

              {facultyCourses.length === 0 ? (

                <div className="text-center py-12">

                  <BookOpen className="w-12 h-12 text-slate-500 mx-auto mb-4" />

                  <h3 className="text-lg font-semibold text-white mb-2">
                    No Courses Assigned
                  </h3>

                  <p className="text-slate-400">
                    No courses are currently assigned to your faculty account.
                  </p>

                </div>

              ) : (

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                  {facultyCourses.map((course) => (

                    <div
                      key={course._id}
                      className="p-6 bg-slate-700/20 border border-slate-600/30 rounded-xl hover:bg-slate-600/30 hover:border-blue-500/30 transition-all duration-300"
                    >

                      {/* Course Header */}

                      <div className="flex items-start justify-between gap-4 mb-5">

                        <div className="flex items-center gap-4">

                          <div className="p-3 rounded-xl bg-blue-500/20 border border-blue-500/20">

                            <BookOpen className="w-6 h-6 text-blue-400" />

                          </div>

                          <div>

                            <h3 className="text-lg font-semibold text-white">
                              {course.name || "Unnamed Course"}
                            </h3>

                            <p className="text-sm text-blue-400 mt-1">
                              {course.code || "Course Code"}
                            </p>

                          </div>

                        </div>

                      </div>

                      {/* Course Details */}

                      <div className="grid grid-cols-2 gap-4">

                        <div className="p-3 bg-slate-800/30 rounded-lg">

                          <p className="text-xs text-slate-500">
                            Department
                          </p>

                          <p className="text-sm text-slate-200 mt-1">
                            {course.department ||
                              faculty.department ||
                              "Computer Science"}
                          </p>

                        </div>

                        <div className="p-3 bg-slate-800/30 rounded-lg">

                          <p className="text-xs text-slate-500">
                            Credits
                          </p>

                          <p className="text-sm text-slate-200 mt-1">
                            {course.credits ?? "—"}
                          </p>

                        </div>

                        <div className="p-3 bg-slate-800/30 rounded-lg">

                          <p className="text-xs text-slate-500">
                            Semester
                          </p>

                          <p className="text-sm text-slate-200 mt-1">
                            {course.semester ?? "—"}
                          </p>

                        </div>

                        <div className="p-3 bg-slate-800/30 rounded-lg">

                          <p className="text-xs text-slate-500">
                            Academic Year
                          </p>

                          <p className="text-sm text-slate-200 mt-1">
                            {course.year ?? new Date().getFullYear()}
                          </p>

                        </div>

                      </div>

                    </div>

                  ))}

                </div>

              )}

            </div>

          </div>

          {/* ==================================================
              COURSE SCHEDULE SUMMARY
          ================================================== */}

          <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-lg">

            <div className="border-b border-slate-700/50 p-6">

              <div className="flex items-center justify-between">

                <div>

                  <h2 className="text-xl font-semibold text-white">
                    Teaching Schedule
                  </h2>

                  <p className="text-slate-400 mt-1">
                    Classes associated with your assigned courses
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                {facultyCourses.map((course) => {

                  const classCount = facultySchedule.filter(
                    (entry) =>
                      String(entry.courseId) ===
                      String(course._id)
                  ).length;

                  return (

                    <div
                      key={course._id}
                      className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl"
                    >

                      <div className="flex items-center gap-3">

                        <div className="p-3 rounded-lg bg-violet-500/20">

                          <Clock className="w-5 h-5 text-violet-400" />

                        </div>

                        <div>

                          <p className="text-white font-semibold">
                            {course.name}
                          </p>

                          <p className="text-xs text-slate-400 mt-1">
                            {classCount} scheduled{" "}
                            {classCount === 1
                              ? "class"
                              : "classes"}
                          </p>

                        </div>

                      </div>

                    </div>

                  );
                })}

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}