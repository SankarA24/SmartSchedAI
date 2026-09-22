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
  CheckCircle,
  Clock,
  AlertCircle,
  Info,
} from "lucide-react";

import { Link, useNavigate } from "react-router-dom";

export default function FacultyNotifications() {
  const navigate = useNavigate();

  const [faculty, setFaculty] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadNotifications = async () => {
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

        const response = await api.get(
          `/notifications`
        );

        setNotifications(response.data || []);
      } catch (error) {
        console.error(
          "Failed to load notifications:",
          error
        );
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const markAsRead = async (notification) => {
    try {
      if (notification._id) {
        await api.put(`/notifications/${notification._id}/read`);
      }

      setNotifications((prev) =>
        prev.map((item) =>
          item._id === notification._id
            ? { ...item, isRead: true }
            : item
        )
      );
    } catch (error) {
      console.error(
        "Failed to mark notification as read:",
        error
      );
    }
  };

  const unreadCount = notifications.filter(
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
      <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">

        <div className="w-64 bg-slate-800/30 backdrop-blur-xl border-r border-slate-700/50 p-6">
          <div className="flex items-center gap-3 mb-8">
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
                className="h-10 bg-slate-700/30 rounded-lg animate-pulse"
              />
            ))}
          </div>
        </div>

        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">

            <div className="h-12 w-80 bg-slate-700/50 rounded-xl animate-pulse mb-8" />

            <div className="bg-slate-800/30 rounded-2xl h-96 animate-pulse" />

          </div>
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

              const Icon = item.icon;
              const isActive = item.id === "notifications";

              return (
                <Link
                  key={item.id}
                  to={item.path}
                >
                  <div
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                      isActive
                        ? "bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-white shadow-lg shadow-blue-500/10 border border-blue-500/30"
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
                      unreadCount > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                          {unreadCount}
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

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">

            <div>

              <h1 className="text-4xl lg:text-5xl font-bold text-white bg-gradient-to-r from-white via-blue-100 to-cyan-100 bg-clip-text text-transparent">
                Notifications
              </h1>

              <p className="text-lg text-slate-300 mt-3">
                Stay updated with your latest academic notifications
              </p>

            </div>

            <div className="px-4 py-3 rounded-xl bg-slate-800/30 backdrop-blur-sm border border-slate-700/50">

              <p className="text-xs text-slate-400">
                Faculty
              </p>

              <p className="text-sm font-semibold text-white">
                {faculty?.name || "Faculty"}
              </p>

            </div>

          </div>

          {/* Summary */}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <div className="bg-slate-800/30 backdrop-blur-xl border border-amber-500/20 rounded-2xl shadow-lg">

              <div className="p-6 flex items-center justify-between">

                <div className="p-3 rounded-xl bg-amber-500/20">
                  <Bell className="w-6 h-6 text-amber-400" />
                </div>

                <div className="text-right">

                  <p className="text-sm text-slate-400">
                    Total Notifications
                  </p>

                  <p className="text-3xl font-bold text-white">
                    {notifications.length}
                  </p>

                </div>

              </div>

            </div>

            <div className="bg-slate-800/30 backdrop-blur-xl border border-red-500/20 rounded-2xl shadow-lg">

              <div className="p-6 flex items-center justify-between">

                <div className="p-3 rounded-xl bg-red-500/20">
                  <AlertCircle className="w-6 h-6 text-red-400" />
                </div>

                <div className="text-right">

                  <p className="text-sm text-slate-400">
                    Unread
                  </p>

                  <p className="text-3xl font-bold text-red-400">
                    {unreadCount}
                  </p>

                </div>

              </div>

            </div>

            <div className="bg-slate-800/30 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-lg">

              <div className="p-6 flex items-center justify-between">

                <div className="p-3 rounded-xl bg-emerald-500/20">
                  <CheckCircle className="w-6 h-6 text-emerald-400" />
                </div>

                <div className="text-right">

                  <p className="text-sm text-slate-400">
                    Read
                  </p>

                  <p className="text-3xl font-bold text-emerald-400">
                    {notifications.length - unreadCount}
                  </p>

                </div>

              </div>

            </div>

          </div>

          {/* Notifications */}

          <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-lg">

            <div className="border-b border-slate-700/50 p-6">

              <h2 className="text-xl font-semibold text-white">
                Recent Notifications
              </h2>

              <p className="text-slate-400 mt-1">
                Your latest updates and announcements
              </p>

            </div>

            <div className="p-6">

              {notifications.length === 0 ? (

                <div className="text-center py-12">

                  <Bell className="w-12 h-12 text-slate-500 mx-auto mb-4" />

                  <h3 className="text-lg font-semibold text-white mb-2">
                    No Notifications
                  </h3>

                  <p className="text-slate-400">
                    You don't have any notifications at the moment.
                  </p>

                </div>

              ) : (

                <div className="space-y-4">

                  {notifications.map((notification) => (

                    <div
                      key={notification._id}
                      onClick={() =>
                        !notification.isRead &&
                        markAsRead(notification)
                      }
                      className={`p-5 rounded-xl border transition-all cursor-pointer ${
                        notification.isRead
                          ? "bg-slate-700/20 border-slate-600/30"
                          : "bg-blue-500/10 border-blue-500/30"
                      }`}
                    >

                      <div className="flex gap-4">

                        <div className="p-3 rounded-xl bg-blue-500/20 h-fit">

                          <Info className="w-5 h-5 text-blue-400" />

                        </div>

                        <div className="flex-1">

                          <div className="flex justify-between gap-4">

                            <h3 className="font-semibold text-white">
                              {notification.title ||
                                notification.subject ||
                                "Notification"}
                            </h3>

                            {!notification.isRead && (
                              <span className="text-xs text-blue-400 font-semibold">
                                NEW
                              </span>
                            )}

                          </div>

                          <p className="text-slate-300 mt-2">
                            {notification.message ||
                              notification.description ||
                              "No message available."}
                          </p>

                          <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">

                            <Clock className="w-4 h-4" />

                            {notification.createdAt
                              ? new Date(
                                  notification.createdAt
                                ).toLocaleString()
                              : "Recently"}

                          </div>

                        </div>

                      </div>

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