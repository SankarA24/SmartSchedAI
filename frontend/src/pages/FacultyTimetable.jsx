import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  Bell,
  User,
  LogOut,
  Clock,
  GraduationCap,
} from "lucide-react";

import api from "@/lib/api";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function FacultyTimetable() {
  const navigate = useNavigate();

const [user, setUser] = useState(null);
const [timetable, setTimetable] = useState([]);
const [courses, setCourses] = useState([]);
const [rooms, setRooms] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");

  useEffect(() => {
    const storedUser = localStorage.getItem("user");

    if (!storedUser) {
      navigate("/login");
      return;
    }

    try {
      const parsedUser = JSON.parse(storedUser);

      if (parsedUser.role !== "faculty") {
        navigate("/login");
        return;
      }

      setUser(parsedUser);
      fetchFacultyTimetable(parsedUser);
    } catch (err) {
      console.error("Invalid user data:", err);
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      navigate("/login");
    }
  }, [navigate]);

const fetchFacultyTimetable = async (loggedUser) => {
  try {
    setLoading(true);
    setError("");

    // Fetch timetables, courses and rooms together
    let timetableData, coursesData, roomsData;
    try {
      const [timetableResponse, coursesResponse, roomsResponse] =
        await Promise.all([
          api.get("/timetables"),
          api.get("/courses"),
          api.get("/rooms"),
        ]);
      timetableData = timetableResponse.data;
      coursesData = coursesResponse.data;
      roomsData = roomsResponse.data;
    } catch (requestError) {
      const data = requestError.response?.data;
      throw new Error(
        data?.error || data?.message || requestError.message || "Failed to fetch timetable"
      );
    }

    console.log("All timetables:", timetableData);
    console.log("All courses:", coursesData);
    console.log("All rooms:", roomsData);

    // Handle different possible API response formats
    const timetables = Array.isArray(timetableData)
      ? timetableData
      : timetableData.timetables || [];

    const courseList = Array.isArray(coursesData)
      ? coursesData
      : coursesData.courses || [];

    const roomList = Array.isArray(roomsData)
      ? roomsData
      : roomsData.rooms || [];

    setCourses(courseList);
    setRooms(roomList);

    const facultyId = String(loggedUser.facultyId || "");

    const entries = [];

    timetables.forEach((table) => {
      if (!Array.isArray(table.schedule)) return;

      table.schedule.forEach((entry) => {
        if (String(entry.facultyId || "") === facultyId) {
          entries.push({
            ...entry,
            timetableName: table.name,
            semester: table.semester,
            year: table.year,
            department: table.department,
          });
        }
      });
    });

    console.log("Faculty timetable entries:", entries);

    setTimetable(entries);
  } catch (err) {
    console.error("Timetable error:", err);
    setError(err.message || "Unable to load timetable.");
  } finally {
    setLoading(false);
  }
};

  const groupedTimetable = useMemo(() => {
    const result = {};

    DAYS.forEach((day) => {
      result[day] = [];
    });

    timetable.forEach((entry) => {
      if (result[entry.day]) {
        result[entry.day].push(entry);
      }
    });

    DAYS.forEach((day) => {
      result[day].sort((a, b) =>
        String(a.startTime).localeCompare(String(b.startTime))
      );
    });

    return result;
  }, [timetable]);

const getCourseName = (entry) => {
  if (entry.courseName) return entry.courseName;

  if (entry.course?.name) {
    return entry.course.name;
  }

  const courseId = String(entry.courseId || "");

  const course = courses.find(
    (course) =>
      String(course._id || course.id) === courseId
  );

  return course?.name || courseId || "Course";
};

const getRoomName = (entry) => {
  if (entry.roomName) return entry.roomName;

  if (entry.room?.name) {
    return entry.room.name;
  }

  const roomId = String(entry.roomId || "");

  const room = rooms.find(
    (room) =>
      String(room._id || room.id) === roomId
  );

  return room?.name || roomId || "Room";
};

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };
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

  const handleNavigation = (path) => {
    navigate(path);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-purple-600/5 to-cyan-600/5" />

        <div className="flex-1 flex items-center justify-center relative z-10">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-400/30 border-t-blue-400 rounded-full animate-spin mx-auto mb-5" />

            <h2 className="text-xl font-semibold text-white">
              Loading timetable...
            </h2>

            <p className="text-slate-400 mt-2">
              Fetching your assigned classes
            </p>
          </div>
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

              const isActive = item.id === "timetable";

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${
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
                    }`}
                  />

<span
  className={`font-medium ${
    isActive ? "text-white" : ""
  }`}
>
  {item.label}
</span>

{item.id === "notifications" && (
  <span className="ml-auto flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold">
    27
  </span>
)}

                </button>
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

        <div className="p-8 space-y-7">

          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">

            <div className="space-y-3">

              <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight bg-gradient-to-r from-white via-blue-100 to-cyan-100 bg-clip-text text-transparent">
                My Timetable
              </h1>

              <p className="text-lg text-slate-300">
                Your assigned classes for the current semester
              </p>

            </div>

            <div className="px-4 py-3 rounded-xl bg-slate-800/30 backdrop-blur-sm border border-slate-700/50">

              <p className="text-xs text-slate-400">
                Faculty
              </p>

              <p className="text-sm font-semibold text-white">
                {user?.name || "Faculty"}
              </p>

            </div>

          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">

              <p className="font-semibold text-red-400">
                Unable to load timetable
              </p>

              <p className="text-sm text-red-300 mt-1">
                {error}
              </p>

            </div>
          )}

          {/* ==================================================
              SUMMARY CARDS
          ================================================== */}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Total Classes */}
            <div className="bg-slate-800/30 backdrop-blur-xl border border-blue-500/20 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">

              <div className="p-5">

                <div className="flex items-center justify-between mb-4">

                  <div className="p-3 rounded-xl bg-blue-500/20 border border-white/10">
                    <Calendar className="h-6 w-6 text-blue-400" />
                  </div>

                  <div className="text-right">

                    <p className="text-sm text-slate-400">
                      Total Classes
                    </p>

                    <p className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                      {timetable.length}
                    </p>

                  </div>

                </div>

                <div className="h-2 rounded-full bg-gradient-to-r from-blue-500/10 to-cyan-500/10" />

              </div>

            </div>

            {/* Teaching Days */}
            <div className="bg-slate-800/30 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">

              <div className="p-6">

                <div className="flex items-center justify-between mb-4">

                  <div className="p-3 rounded-xl bg-emerald-500/20 border border-white/10">
                    <Calendar className="h-6 w-6 text-emerald-400" />
                  </div>

                  <div className="text-right">

                    <p className="text-sm text-slate-400">
                      Teaching Days
                    </p>

                    <p className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                      {
                        DAYS.filter(
                          (day) => groupedTimetable[day].length > 0
                        ).length
                      }
                    </p>

                  </div>

                </div>

                <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500/10 to-teal-500/10" />

              </div>

            </div>

            {/* Faculty */}
            <div className="bg-slate-800/30 backdrop-blur-xl border border-violet-500/20 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">

              <div className="p-5">

                <div className="flex items-center justify-between mb-4">

                  <div className="p-3 rounded-xl bg-violet-500/20 border border-white/10">
                    <User className="h-6 w-6 text-violet-400" />
                  </div>

                  <div className="text-right">

                    <p className="text-sm text-slate-400">
                      Faculty
                    </p>

                    <p className="text-xl font-bold text-white mt-1">
                      {user?.name || "Faculty"}
                    </p>

                  </div>

                </div>

                <div className="h-2 rounded-full bg-gradient-to-r from-violet-500/10 to-purple-500/10" />

              </div>

            </div>

          </div>

          {/* ==================================================
              WEEKLY SCHEDULE
          ================================================== */}

          <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-lg">

            {/* Section Header */}
            <div className="border-b border-slate-700/50 p-6">

              <h2 className="text-xl font-semibold text-white">
                Weekly Schedule
              </h2>

              <p className="text-slate-400 mt-1">
                Monday to Saturday
              </p>

            </div>

            {/* Schedule */}
            <div className="p-5">

              {timetable.length === 0 && !error ? (

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

                <div className="space-y-4">

                  {DAYS.map((day) => (

                    <div
                      key={day}
                      className="bg-slate-700/20 border border-slate-600/30 rounded-xl overflow-hidden"
                    >

                      {/* Day Header */}
                      <div className="px-5 py-4 bg-slate-700/20 border-b border-slate-600/30">

                        <div className="flex items-center justify-between">

                          <div>

                            <h3 className="text-lg font-semibold text-white">
                              {day}
                            </h3>

                            <p className="text-xs text-slate-400 mt-1">
                              {groupedTimetable[day].length} class
                              {groupedTimetable[day].length !== 1
                                ? "es"
                                : ""}
                            </p>

                          </div>

                          <Calendar className="w-5 h-5 text-blue-400" />

                        </div>

                      </div>

                      {/* Day Entries */}
                      {groupedTimetable[day].length === 0 ? (

                        <div className="px-5 py-5 text-slate-500 text-sm">
                          No classes scheduled
                        </div>

                      ) : (

                        <div className="divide-y divide-slate-600/20">

                          {groupedTimetable[day].map((entry, index) => (

                            <div
                              key={`${day}-${index}`}
                    
                              className="px-5 py-4 hover:bg-slate-600/20 transition-all duration-300"
                            >

                              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

                                {/* Time */}
                                <div className="flex items-start gap-3">

                                  <div className="p-2 rounded-lg bg-blue-500/10">
                                    <Clock className="w-4 h-4 text-blue-400" />
                                  </div>

                                  <div>

                                    <p className="text-xs text-slate-500">
                                      TIME
                                    </p>

                                    <p className="font-semibold text-white mt-1">
                                      {entry.startTime} - {entry.endTime}
                                    </p>

                                  </div>

                                </div>

                                {/* Course */}
                                <div>

                                  <p className="text-xs text-slate-500">
                                    COURSE
                                  </p>

                                  <p className="font-semibold text-white mt-1">
                                    {getCourseName(entry)}
                                  </p>

                                </div>

                                {/* Room */}
                                <div>

                                  <p className="text-xs text-slate-500">
                                    ROOM
                                  </p>

                                  <p className="font-semibold text-white mt-1">
                                    {getRoomName(entry)}
                                  </p>

                                </div>

                                {/* Day */}
                                <div>

                                  <p className="text-xs text-slate-500">
                                    DAY
                                  </p>

                                  <p className="font-semibold text-white mt-1">
                                    {entry.day}
                                  </p>

                                </div>

                              </div>

                            </div>

                          ))}

                        </div>

                      )}

                    </div>

                  ))}

                </div>

              )}

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}

export default FacultyTimetable;