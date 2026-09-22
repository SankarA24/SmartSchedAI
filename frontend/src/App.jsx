import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import CoursesPage from "./pages/Courses";
import FacultyPage from "./pages/Faculty";
import RoomPage from "./pages/Rooms";
import TimetablePage from "./pages/Timetable";
import NotificationsPage from "./pages/Notifications";

import Login from "./pages/Login";

import FacultyPortal from "./pages/FacultyPortal";
import FacultyTimetable from "./pages/FacultyTimetable";
import FacultyCourses from "./pages/FacultyCourses";
import FacultyNotifications from "./pages/FacultyNotifications";
import FacultyProfile from "./pages/FacultyProfile";

import StudentPortal from "./pages/StudentPortal";
import MyTimetable from "./pages/MyTimetable";
import MyCourses from "./pages/MyCourses";
import StudentNotifications from "./pages/StudentNotifications";
import MyProfile from "./pages/MyProfile";


// =====================================================
// CHECK LOGIN
// =====================================================

const getUser = () => {
  try {
    return JSON.parse(
      localStorage.getItem("user") || "null"
    );
  } catch {
    return null;
  }
};

// Decode a JWT payload (base64url, no library). Returns null on any failure.
const decodeJwtPayload = (token) => {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "="
    );
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
};

// Role → home route.
const getRoleHome = (user) => {
  if (user?.role === "admin") return "/";
  if (user?.role === "faculty") return "/faculty-portal";
  if (user?.role === "student") return "/student-portal";
  return "/login";
};

// Reads token + user from storage. An expired token counts as logged out
// and clears storage; anything else unreadable also counts as logged out.
const getActiveSession = () => {
  const token = localStorage.getItem("token");
  const user = getUser();

  if (!token || !user) {
    return null;
  }

  const payload = decodeJwtPayload(token);
  if (payload?.exp && payload.exp * 1000 < Date.now()) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    return null;
  }

  return user;
};


// =====================================================
// PROTECTED ROUTE
// =====================================================

const ProtectedRoute = ({ children, role }) => {
  const user = getActiveSession();

  // Not logged in (or token expired)
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Wrong role
  if (role && user.role !== role) {
    return <Navigate to={getRoleHome(user)} replace />;
  }

  return children;
};


// =====================================================
// LOGIN ROUTE (redirect to role home if already logged in)
// =====================================================

const LoginRoute = () => {
  const user = getActiveSession();

  if (user) {
    return <Navigate to={getRoleHome(user)} replace />;
  }

  return <Login />;
};


// =====================================================
// FALLBACK ROUTE (role home if logged in, else /login)
// =====================================================

const RoleHomeOrLogin = () => {
  const user = getActiveSession();
  return <Navigate to={getRoleHome(user)} replace />;
};


// =====================================================
// APP
// =====================================================

function App() {

  return (
    <Router>

      <Routes>

        {/* ============================================
            LOGIN
        ============================================ */}

        <Route
          path="/login"
          element={<LoginRoute />}
        />


        {/* ============================================
            ADMIN
        ============================================ */}

        <Route
          path="/"
          element={
            <ProtectedRoute role="admin">
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/courses"
          element={
            <ProtectedRoute role="admin">
              <CoursesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/faculty"
          element={
            <ProtectedRoute role="admin">
              <FacultyPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/rooms"
          element={
            <ProtectedRoute role="admin">
              <RoomPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/timetables"
          element={
            <ProtectedRoute role="admin">
              <TimetablePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/notifications"
          element={
            <ProtectedRoute role="admin">
              <NotificationsPage />
            </ProtectedRoute>
          }
        />


        {/* ============================================
            FACULTY PORTAL
        ============================================ */}

        <Route
          path="/faculty-portal"
          element={
            <ProtectedRoute role="faculty">
              <FacultyPortal />
            </ProtectedRoute>
          }
        />

        <Route
          path="/faculty-portal/timetable"
          element={
            <ProtectedRoute role="faculty">
              <FacultyTimetable />
            </ProtectedRoute>
          }
        />

        <Route
          path="/faculty-portal/courses"
          element={
            <ProtectedRoute role="faculty">
              <FacultyCourses />
            </ProtectedRoute>
          }
        />

        <Route
          path="/faculty-portal/notifications"
          element={
            <ProtectedRoute role="faculty">
              <FacultyNotifications />
            </ProtectedRoute>
          }
        />

        <Route
          path="/faculty-portal/profile"
          element={
            <ProtectedRoute role="faculty">
              <FacultyProfile />
            </ProtectedRoute>
          }
        />


        {/* ============================================
            STUDENT PORTAL
        ============================================ */}

        <Route
          path="/student-portal"
          element={
            <ProtectedRoute role="student">
              <StudentPortal />
            </ProtectedRoute>
          }
        />

        <Route
          path="/student-portal/timetable"
          element={
            <ProtectedRoute role="student">
              <MyTimetable />
            </ProtectedRoute>
          }
        />

        <Route
          path="/student-portal/courses"
          element={
            <ProtectedRoute role="student">
              <MyCourses />
            </ProtectedRoute>
          }
        />

        <Route
          path="/student-portal/notifications"
          element={
            <ProtectedRoute role="student">
              <StudentNotifications />
            </ProtectedRoute>
          }
        />

        <Route
          path="/student-portal/profile"
          element={
            <ProtectedRoute role="student">
              <MyProfile />
            </ProtectedRoute>
          }
        />


        {/* ============================================
            ALIAS REDIRECTS
        ============================================ */}

        <Route
          path="/admin-dashboard"
          element={<Navigate to="/" replace />}
        />

        <Route
          path="/teacher-dashboard"
          element={<Navigate to="/faculty-portal" replace />}
        />

        <Route
          path="/student-dashboard"
          element={<Navigate to="/student-portal" replace />}
        />


        {/* ============================================
            UNKNOWN URL
        ============================================ */}

        <Route
          path="*"
          element={<RoleHomeOrLogin />}
        />

      </Routes>

    </Router>
  );
}

export default App;