import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarPlus,
  GraduationCap,
  Home,
  LayoutDashboard,
  Sparkles,
  User,
  UserCog,
  Users,
} from "lucide-react";

// Single source of truth for portal navigation.
// Items: { id, label, path, icon, badgeKey? }. Consumed by AppShell callers
// via navForRole(role). Forward-looking admin paths (/create-timetable,
// /generate-timetable, /view-timetable, /infrastructure) are routed in U5–U7.

export const ADMIN_NAV = [
  { id: "dashboard", label: "Dashboard", path: "/", icon: LayoutDashboard },
  { id: "create-timetable", label: "Create Timetable", path: "/create-timetable", icon: CalendarPlus },
  { id: "generate", label: "Generate", path: "/generate-timetable", icon: Sparkles },
  { id: "timetables", label: "Timetables", path: "/view-timetable", icon: CalendarDays },
  { id: "courses", label: "Courses", path: "/courses", icon: BookOpen },
  { id: "faculty", label: "Faculty", path: "/faculty", icon: Users },
  { id: "rooms", label: "Rooms", path: "/rooms", icon: Home },
  { id: "students", label: "Students", path: "/students", icon: GraduationCap },
  { id: "users", label: "Users", path: "/users", icon: UserCog },
  { id: "infrastructure", label: "Infrastructure", path: "/infrastructure", icon: Building2 },
  { id: "notifications", label: "Notifications", path: "/notifications", icon: Bell, badgeKey: "unread" },
];

export const FACULTY_NAV = [
  { id: "dashboard", label: "Dashboard", path: "/faculty-portal", icon: LayoutDashboard },
  { id: "timetable", label: "My Timetable", path: "/faculty-portal/timetable", icon: CalendarDays },
  { id: "courses", label: "My Courses", path: "/faculty-portal/courses", icon: BookOpen },
  { id: "notifications", label: "Notifications", path: "/faculty-portal/notifications", icon: Bell, badgeKey: "unread" },
  { id: "profile", label: "Profile", path: "/faculty-portal/profile", icon: User },
];

export const STUDENT_NAV = [
  { id: "dashboard", label: "Dashboard", path: "/student-portal", icon: LayoutDashboard },
  { id: "timetable", label: "My Timetable", path: "/student-portal/timetable", icon: CalendarDays },
  { id: "courses", label: "My Courses", path: "/student-portal/courses", icon: BookOpen },
  { id: "notifications", label: "Notifications", path: "/student-portal/notifications", icon: Bell, badgeKey: "unread" },
  { id: "profile", label: "My Profile", path: "/student-portal/profile", icon: User },
];

export const ADMIN_QUICK_ACTIONS = [
  { id: "create-timetable", label: "Create Timetable", path: "/create-timetable", icon: CalendarPlus },
  { id: "manage-students", label: "Manage Students", path: "/students", icon: GraduationCap },
  { id: "manage-teachers", label: "Manage Teachers", path: "/faculty", icon: Users },
  { id: "manage-rooms", label: "Manage Rooms", path: "/rooms", icon: Home },
  { id: "manage-courses", label: "Manage Courses", path: "/courses", icon: BookOpen },
  { id: "infrastructure", label: "Infrastructure & Policy", path: "/infrastructure", icon: Building2 },
];

const BRAND_TITLE = "SmartSchedAI";

export function navForRole(role) {
  switch (role) {
    case "faculty":
      return {
        brand: { title: BRAND_TITLE, subtitle: "Faculty portal" },
        nav: FACULTY_NAV,
        quickActions: [],
      };
    case "student":
      return {
        brand: { title: BRAND_TITLE, subtitle: "Student portal" },
        nav: STUDENT_NAV,
        quickActions: [],
      };
    case "admin":
    default:
      return {
        brand: { title: BRAND_TITLE, subtitle: "Admin" },
        nav: ADMIN_NAV,
        quickActions: ADMIN_QUICK_ACTIONS,
      };
  }
}
