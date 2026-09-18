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


// =====================================================
// PROTECTED ROUTE
// =====================================================

const ProtectedRoute = ({ children, role }) => {
  const token = localStorage.getItem("token");
  const user = getUser();

  // Not logged in
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  // Wrong role
  if (role && user.role !== role) {

    if (user.role === "admin") {
      return <Navigate to="/" replace />;
    }

    if (user.role === "faculty") {
      return <Navigate to="/faculty-portal" replace />;
    }

    if (user.role === "student") {
      return <Navigate to="/student-portal" replace />;
    }

    return <Navigate to="/login" replace />;
  }

  return children;
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
          element={<Login />}
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
            UNKNOWN URL
        ============================================ */}

        <Route
          path="*"
          element={<Navigate to="/login" replace />}
        />

      </Routes>

    </Router>
  );
}

export default App;