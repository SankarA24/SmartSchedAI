import { useEffect, useState } from "react";
import api from "@/lib/api";

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

import useIdentity from "@/hooks/useIdentity";

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
  // Unlinked account
  //
  // `User.facultyId` is null: there is no Faculty record behind this login,
  // so there is no "my courses" to show and nothing is invented.
  // ---------------------------------------------

  if (!linked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">

        <div className="text-center max-w-md">

          <User className="w-16 h-16 text-amber-400 mx-auto mb-5" />

          <h1 className="text-2xl font-bold text-white mb-3">
            Profile not linked — contact your administrator
          </h1>

          <p className="text-slate-400 mb-6">
            This account is not linked to a faculty record, so no courses can
            be shown for it.
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
                  {faculty?.name || user?.name || "—"}
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
                      {faculty?.department || user?.department || "Not specified"}
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
                      {faculty?.name || user?.name || "—"}
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
                              {course.code || "—"}
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
                            {course.department || "Not specified"}
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
                            {course.academicYear ?? course.year ?? "Not specified"}
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
                            {course.name || "Unnamed Course"}
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