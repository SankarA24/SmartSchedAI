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
  Mail,
  Building2,
  BriefcaseBusiness,
} from "lucide-react";

import { Link, useNavigate } from "react-router-dom";

export default function FacultyProfile() {
  const navigate = useNavigate();

  const [faculty, setFaculty] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const storedUser = localStorage.getItem("user");

        if (!storedUser) {
          navigate("/login");
          return;
        }

        const user = JSON.parse(storedUser);

        let facultyData = null;

        if (user.facultyId) {
          const response = await api.get(
            `/faculty/${user.facultyId}`
          );

          facultyData = response.data;
        } else if (user.email) {
          const response = await api.get(
            `/faculty`
          );

          facultyData = response.data.find(
            (member) =>
              member.email?.toLowerCase() ===
              user.email?.toLowerCase()
          );
        }

        setFaculty(facultyData);

        const notificationResponse = await api.get(
          `/notifications`
        );

        setNotifications(
          notificationResponse.data || []
        );
      } catch (error) {
        console.error(
          "Failed to load faculty profile:",
          error
        );
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const unreadNotifications = notifications.filter(
    (item) => !item.isRead
  ).length;

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">

        <div className="text-center">

          <div className="w-12 h-12 rounded-full border-4 border-blue-400 border-t-transparent animate-spin mx-auto mb-4" />

          <p className="text-slate-300">
            Loading profile...
          </p>

        </div>

      </div>
    );
  }

  if (!faculty) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">

        <div className="text-center">

          <User className="w-16 h-16 text-red-400 mx-auto mb-5" />

          <h1 className="text-2xl font-bold text-white mb-3">
            Faculty Profile Not Found
          </h1>

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

      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-purple-600/5 to-cyan-600/5" />

      {/* SIDEBAR */}

      <div className="w-64 bg-slate-800/30 backdrop-blur-xl border-r border-slate-700/50 shadow-2xl relative z-10">

        <div className="p-6 space-y-8">

          {/* Logo */}

          <div className="flex items-center gap-3">

            <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">

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

              const Icon = item.icon;

              const isActive = item.id === "profile";

              return (
                <Link
                  key={item.id}
                  to={item.path}
                >

                  <div
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      isActive
                        ? "bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-white border border-blue-500/30"
                        : "text-slate-300 hover:bg-slate-700/30 hover:text-white"
                    }`}
                  >

                    <Icon
                      className={`w-5 h-5 ${
                        isActive
                          ? "text-blue-400"
                          : "text-slate-400"
                      }`}
                    />

                    <span className="font-medium">
                      {item.label}
                    </span>

                    {item.id === "notifications" &&
                      unreadNotifications > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                          {unreadNotifications}
                        </span>
                      )}

                  </div>

                </Link>
              );
            })}

          </nav>

          {/* Logout */}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 hover:bg-red-500/10 hover:text-red-400 transition-all"
          >

            <LogOut className="w-5 h-5" />

            <span className="font-medium">
              Logout
            </span>

          </button>

        </div>

      </div>

      {/* MAIN */}

      <div className="flex-1 overflow-auto relative z-10">

        <div className="p-8 space-y-8 max-w-7xl mx-auto">

          {/* Header */}

          <div className="flex justify-between items-center">

            <div>

              <h1 className="text-4xl lg:text-5xl font-bold text-white bg-gradient-to-r from-white via-blue-100 to-cyan-100 bg-clip-text text-transparent">
                My Profile
              </h1>

              <p className="text-lg text-slate-300 mt-3">
                Your academic and professional information
              </p>

            </div>

            <div className="px-4 py-3 rounded-xl bg-slate-800/30 border border-slate-700/50">

              <p className="text-xs text-slate-400">
                Faculty
              </p>

              <p className="text-sm font-semibold text-white">
                {faculty.name}
              </p>

            </div>

          </div>

          {/* Profile Card */}

          <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-lg overflow-hidden">

            <div className="p-8 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-cyan-500/10 border-b border-slate-700/50">

              <div className="flex items-center gap-6">

                <div className="w-20 h-20 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">

                  <User className="w-10 h-10 text-white" />

                </div>

                <div>

                  <h2 className="text-2xl font-bold text-white">
                    {faculty.name}
                  </h2>

                  <p className="text-slate-400 mt-1">
                    Faculty Member
                  </p>

                </div>

              </div>

            </div>

            <div className="p-8">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Name */}

                <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                  <div className="flex items-center gap-4">

                    <div className="p-3 rounded-xl bg-blue-500/20">

                      <User className="w-5 h-5 text-blue-400" />

                    </div>

                    <div>

                      <p className="text-xs text-slate-400">
                        Full Name
                      </p>

                      <p className="text-white font-semibold mt-1">
                        {faculty.name}
                      </p>

                    </div>

                  </div>

                </div>

                {/* Email */}

                <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                  <div className="flex items-center gap-4">

                    <div className="p-3 rounded-xl bg-cyan-500/20">

                      <Mail className="w-5 h-5 text-cyan-400" />

                    </div>

                    <div className="min-w-0">

                      <p className="text-xs text-slate-400">
                        Email
                      </p>

                      <p className="text-white font-semibold mt-1 truncate">
                        {faculty.email || "Not specified"}
                      </p>

                    </div>

                  </div>

                </div>

                {/* Department */}

                <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                  <div className="flex items-center gap-4">

                    <div className="p-3 rounded-xl bg-emerald-500/20">

                      <Building2 className="w-5 h-5 text-emerald-400" />

                    </div>

                    <div>

                      <p className="text-xs text-slate-400">
                        Department
                      </p>

                      <p className="text-white font-semibold mt-1">
                        {faculty.department || "Not specified"}
                      </p>

                    </div>

                  </div>

                </div>

                {/* Specialization */}

                <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                  <div className="flex items-center gap-4">

                    <div className="p-3 rounded-xl bg-violet-500/20">

                      <GraduationCap className="w-5 h-5 text-violet-400" />

                    </div>

                    <div>

                      <p className="text-xs text-slate-400">
                        Specialization
                      </p>

                      <p className="text-white font-semibold mt-1">
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

          {/* Faculty Details */}

          <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-lg">

            <div className="border-b border-slate-700/50 p-6">

              <h2 className="text-xl font-semibold text-white">
                Professional Details
              </h2>

              <p className="text-slate-400 mt-1">
                Additional faculty information
              </p>

            </div>

            <div className="p-6">

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

                <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                  <BriefcaseBusiness className="w-6 h-6 text-blue-400 mb-3" />

                  <p className="text-xs text-slate-400">
                    Faculty ID
                  </p>

                  <p className="text-white font-semibold mt-1 break-all">
                    {faculty._id}
                  </p>

                </div>

                <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                  <Building2 className="w-6 h-6 text-emerald-400 mb-3" />

                  <p className="text-xs text-slate-400">
                    Department
                  </p>

                  <p className="text-white font-semibold mt-1">
                    {faculty.department || "Not specified"}
                  </p>

                </div>

                <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                  <GraduationCap className="w-6 h-6 text-violet-400 mb-3" />

                  <p className="text-xs text-slate-400">
                    Specialization
                  </p>

                  <p className="text-white font-semibold mt-1">
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
  );
}