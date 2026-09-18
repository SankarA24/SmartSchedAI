import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  Bell,
  User,
  LogOut,
  Clock3,
  Building2,
  GraduationCap,
  Mail,
  ChevronRight,
  DoorOpen,
} from "lucide-react";

const API_URL = "http://localhost:5000";

function StudentPortal() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [courses, setCourses] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selectedTimetable, setSelectedTimetable] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = localStorage.getItem("token");

  // ------------------------------------------------------------
  // ID / VALUE HELPERS
  // ------------------------------------------------------------

  const getId = (value) => {
    if (value === null || value === undefined) return null;

    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }

    if (value.$oid) return String(value.$oid);
    if (value._id) return getId(value._id);
    if (value.id) return getId(value.id);

    if (typeof value.toString === "function") {
      const result = value.toString();
      if (result && result !== "[object Object]") {
        return String(result);
      }
    }

    return null;
  };

  const normalizeText = (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase();

  const normalizeSemester = (value) => {
    const match = String(value ?? "").match(/\d+/);
    return match ? match[0] : "";
  };

  const normalizeDay = (day) => {
    if (!day) return "Monday";

    const value = String(day).trim().toLowerCase();

    const days = {
      monday: "Monday",
      tuesday: "Tuesday",
      wednesday: "Wednesday",
      thursday: "Thursday",
      friday: "Friday",
      saturday: "Saturday",
      sunday: "Sunday",
    };

    return days[value] || String(day);
  };

  const formatTime = (time) => {
    if (!time) return "";

    if (typeof time !== "string") {
      return String(time);
    }

    return time.length >= 5 ? time.substring(0, 5) : time;
  };

  // ------------------------------------------------------------
  // GET LOGGED-IN USER
  // ------------------------------------------------------------

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem("user");

      if (!storedUser) {
        navigate("/login");
        return;
      }

      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
    } catch (err) {
      console.error("Unable to read logged-in user:", err);
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      navigate("/login");
    }
  }, [navigate]);

  // ------------------------------------------------------------
  // FETCH
  // ------------------------------------------------------------

  const fetchData = async (url) => {
    const response = await fetch(`${API_URL}${url}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url} (${response.status})`);
    }

    return response.json();
  };

  // ------------------------------------------------------------
  // NORMALIZE API ARRAYS
  // ------------------------------------------------------------

  const toArray = (data, keys = []) => {
    if (Array.isArray(data)) return data;

    for (const key of keys) {
      if (Array.isArray(data?.[key])) return data[key];
    }

    return [];
  };

  // ------------------------------------------------------------
  // LOAD STUDENT DATA
  // ------------------------------------------------------------

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const loadStudentData = async () => {
      setLoading(true);
      setError("");

      try {
        const results = await Promise.allSettled([
          fetchData("/api/courses"),
          fetchData("/api/rooms"),
          fetchData("/api/timetables"),
          fetchData("/api/notifications"),
        ]);

        if (cancelled) return;

        // ---------------- COURSES ----------------

        if (results[0].status === "fulfilled") {
          setCourses(
            toArray(results[0].value, [
              "courses",
              "data",
              "results",
            ])
          );
        } else {
          console.error("Courses API error:", results[0].reason);
          setCourses([]);
        }

        // ---------------- ROOMS ----------------

        if (results[1].status === "fulfilled") {
          setRooms(
            toArray(results[1].value, [
              "rooms",
              "data",
              "results",
            ])
          );
        } else {
          console.error("Rooms API error:", results[1].reason);
          setRooms([]);
        }

        // ---------------- TIMETABLE ----------------
        //
        // IMPORTANT:
        // /api/timetables returns TIMETABLE DOCUMENTS.
        //
        // Each document has:
        // {
        //   name,
        //   semester,
        //   year,
        //   department,
        //   status,
        //   schedule: [...]
        // }
        //
        // The actual class entries are inside timetable.schedule.
        // The old code was displaying the timetable documents
        // themselves, which caused "Unknown Course", Monday
        // 09:00 - 10:00, and missing rooms.

        if (results[2].status === "fulfilled") {
          const timetableData = results[2].value;

          let timetables = toArray(timetableData, [
            "timetables",
            "data",
            "results",
          ]);

          // If the API itself returned one timetable object.
          if (
            timetables.length === 0 &&
            timetableData &&
            Array.isArray(timetableData.schedule)
          ) {
            timetables = [timetableData];
          }

          // If backend returns an array directly, toArray already handles it.
          // If it returns grouped day data, convert it into one timetable.
          if (
            timetables.length === 0 &&
            timetableData &&
            typeof timetableData === "object"
          ) {
            const days = [
              "monday",
              "tuesday",
              "wednesday",
              "thursday",
              "friday",
              "saturday",
              "sunday",
            ];

            const groupedSchedule = [];

            days.forEach((day) => {
              if (Array.isArray(timetableData[day])) {
                timetableData[day].forEach((entry) => {
                  groupedSchedule.push({
                    ...entry,
                    day: entry.day || normalizeDay(day),
                  });
                });
              }
            });

            if (groupedSchedule.length > 0) {
              timetables = [
                {
                  schedule: groupedSchedule,
                  department: user.department,
                  semester: user.semester,
                  year: user.year || new Date().getFullYear(),
                },
              ];
            }
          }

          // ---------------- SELECT CORRECT TIMETABLE ----------------

          const userDepartment =
            user.department ||
            user.departmentName ||
            "Computer Science";

          const userSemester =
            user.semester ||
            user.semesterNumber ||
            user.currentSemester ||
            "1";

          const userYear =
            Number(
              user.year ||
                user.academicYear ||
                user.currentYear ||
                new Date().getFullYear()
            ) || new Date().getFullYear();

          const matchingTimetables = timetables.filter((timetable) => {
            const departmentMatches =
              !timetable.department ||
              normalizeText(timetable.department) ===
                normalizeText(userDepartment);

            const semesterMatches =
              !timetable.semester ||
              normalizeSemester(timetable.semester) ===
                normalizeSemester(userSemester);

            const yearMatches =
              !timetable.year ||
              Number(timetable.year) === userYear;

            return (
              departmentMatches &&
              semesterMatches &&
              yearMatches &&
              Array.isArray(timetable.schedule)
            );
          });

          const candidates =
            matchingTimetables.length > 0
              ? matchingTimetables
              : timetables.filter(
                  (timetable) =>
                    Array.isArray(timetable.schedule) &&
                    timetable.schedule.length > 0
                );

          // Prefer published/active/finalized timetables over drafts.
          // If all are drafts, use the latest one.
          const statusRank = (status) => {
            const value = normalizeText(status);

            if (
              ["published", "active", "approved", "final", "finalized"].includes(
                value
              )
            ) {
              return 0;
            }

            if (value === "draft") return 2;

            return 1;
          };

          const sortedTimetables = [...candidates].sort((a, b) => {
            const statusDifference =
              statusRank(a.status) - statusRank(b.status);

            if (statusDifference !== 0) {
              return statusDifference;
            }

            const dateA = new Date(
              a.updatedAt || a.createdAt || 0
            ).getTime();

            const dateB = new Date(
              b.updatedAt || b.createdAt || 0
            ).getTime();

            return dateB - dateA;
          });

          const chosenTimetable = sortedTimetables[0] || null;

          setSelectedTimetable(chosenTimetable);

          if (chosenTimetable) {
            // THIS is the critical fix:
            // use timetable.schedule, not the timetable document itself.
            const entries = Array.isArray(chosenTimetable.schedule)
              ? chosenTimetable.schedule
              : [];

            // Remove exact duplicate schedule entries.
            const uniqueEntries = [];
            const seen = new Set();

            entries.forEach((entry) => {
              const courseId = getId(
                entry.courseId ||
                  entry.courseID ||
                  entry.course_id ||
                  entry.course
              );

              const roomId = getId(
                entry.roomId ||
                  entry.roomID ||
                  entry.room_id ||
                  entry.room
              );

              const key = [
                courseId || entry.courseName || "course",
                roomId || entry.roomName || "room",
                normalizeDay(entry.day || entry.weekday),
                formatTime(entry.startTime || entry.start),
                formatTime(entry.endTime || entry.end),
              ].join("|");

              if (!seen.has(key)) {
                seen.add(key);
                uniqueEntries.push(entry);
              }
            });

            setSchedule(uniqueEntries);
          } else {
            setSchedule([]);
          }
        } else {
          console.error("Timetable API error:", results[2].reason);
          setSchedule([]);
          setSelectedTimetable(null);
        }

        // ---------------- NOTIFICATIONS ----------------

        if (results[3].status === "fulfilled") {
          setNotifications(
            toArray(results[3].value, [
              "notifications",
              "data",
              "results",
            ])
          );
        } else {
          console.error(
            "Notifications API error:",
            results[3].reason
          );
          setNotifications([]);
        }

        // Only show a general error if the main timetable API failed.
        if (
          results[2].status === "rejected" &&
          results[0].status === "rejected" &&
          results[1].status === "rejected"
        ) {
          setError(
            "Unable to connect to the backend. Make sure the backend is running on port 5000."
          );
        }
      } catch (err) {
        console.error("Student portal loading error:", err);

        if (!cancelled) {
          setError(
            "Unable to load student portal data. Check that the backend is running."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadStudentData();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // ------------------------------------------------------------
  // COURSE LOOKUP
  // ------------------------------------------------------------

  const findCourse = (entry) => {
    if (!entry) return null;

    const reference =
      entry.courseId ||
      entry.courseID ||
      entry.course_id ||
      entry.course;

    // Already populated course object.
    if (
      reference &&
      typeof reference === "object" &&
      !Array.isArray(reference)
    ) {
      if (
        reference.name ||
        reference.title ||
        reference.courseName ||
        reference.code
      ) {
        return reference;
      }
    }

    const courseId = getId(reference);

    if (!courseId) return null;

    return (
      courses.find((course) => {
        const id = getId(course._id || course.id);
        return id === courseId;
      }) || null
    );
  };

  const getCourseName = (entry) => {
    const course = findCourse(entry);

    if (course) {
      return (
        course.name ||
        course.title ||
        course.courseName ||
        course.code ||
        "Course"
      );
    }

    return (
      entry?.courseName ||
      entry?.courseTitle ||
      entry?.course?.name ||
      entry?.course?.title ||
      entry?.course?.courseName ||
      "Course"
    );
  };

  // ------------------------------------------------------------
  // ROOM LOOKUP
  // ------------------------------------------------------------

  const findRoom = (entry) => {
    if (!entry) return null;

    const reference =
      entry.roomId ||
      entry.roomID ||
      entry.room_id ||
      entry.room ||
      entry.classroomId ||
      entry.classroom;

    // Already populated room object.
    if (
      reference &&
      typeof reference === "object" &&
      !Array.isArray(reference)
    ) {
      if (
        reference.name ||
        reference.roomNumber ||
        reference.number ||
        reference.roomName
      ) {
        return reference;
      }
    }

    const roomId = getId(reference);

    if (!roomId) return null;

    return (
      rooms.find((room) => {
        const id = getId(room._id || room.id);
        return id === roomId;
      }) || null
    );
  };

  const getRoomName = (entry) => {
    const room = findRoom(entry);

    if (room) {
      return (
        room.name ||
        room.roomNumber ||
        room.number ||
        room.roomName ||
        "—"
      );
    }

    if (typeof entry?.room === "string") {
      return entry.room;
    }

    if (entry?.room?.name) return entry.room.name;
    if (entry?.room?.roomNumber) return entry.room.roomNumber;
    if (entry?.room?.number) return entry.room.number;

    return (
      entry?.roomName ||
      entry?.roomNumber ||
      entry?.classroomName ||
      "—"
    );
  };

  // ------------------------------------------------------------
  // SCHEDULE HELPERS
  // ------------------------------------------------------------

  const getDay = (entry) =>
    normalizeDay(
      entry?.day ||
        entry?.weekday ||
        entry?.dayOfWeek ||
        entry?.weekDay
    );

  const getStartTime = (entry) =>
    formatTime(
      entry?.startTime ||
        entry?.start ||
        entry?.from ||
        entry?.time?.start
    );

  const getEndTime = (entry) =>
    formatTime(
      entry?.endTime ||
        entry?.end ||
        entry?.to ||
        entry?.time?.end
    );

  const dayOrder = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sunday: 7,
  };

  // ------------------------------------------------------------
  // PROCESSED SCHEDULE
  // ------------------------------------------------------------

  const processedSchedule = useMemo(() => {
    return schedule.map((entry, index) => ({
      ...entry,

      _displayId:
        getId(entry._id || entry.id) ||
        `${getId(
          entry.courseId || entry.courseID || entry.course
        ) || "course"}-${getDay(entry)}-${getStartTime(
          entry
        )}-${index}`,

      _day: getDay(entry),
      _startTime: getStartTime(entry),
      _endTime: getEndTime(entry),
      _courseName: getCourseName(entry),
      _roomName: getRoomName(entry),
    }));
  }, [schedule, courses, rooms]);

  const sortedSchedule = useMemo(() => {
    return [...processedSchedule].sort((a, b) => {
      const dayA = dayOrder[a._day] || 99;
      const dayB = dayOrder[b._day] || 99;

      if (dayA !== dayB) {
        return dayA - dayB;
      }

      return a._startTime.localeCompare(b._startTime);
    });
  }, [processedSchedule]);

  // ------------------------------------------------------------
  // MY COURSES
  // ------------------------------------------------------------
  //
  // Use courses referenced by the selected timetable.
  // This prevents unrelated courses from other semesters
  // appearing in the Student Portal.

  const myCourses = useMemo(() => {
    const result = [];
    const seen = new Set();

    schedule.forEach((entry) => {
      const course = findCourse(entry);

      if (!course) return;

      const id =
        getId(course._id || course.id) ||
        normalizeText(course.code || course.name);

      if (!id || seen.has(id)) return;

      seen.add(id);
      result.push(course);
    });

    // If schedule/course IDs cannot be resolved, fall back to API courses.
    if (result.length === 0) {
      return courses;
    }

    return result;
  }, [schedule, courses]);

  // ------------------------------------------------------------
  // WEEKLY STATISTICS
  // ------------------------------------------------------------

  const weeklyClasses = sortedSchedule.length;

  const weeklyHours = useMemo(() => {
    let totalMinutes = 0;

    sortedSchedule.forEach((entry) => {
      const start = entry._startTime;
      const end = entry._endTime;

      if (!start || !end) return;

      const [startHour, startMinute] = start
        .split(":")
        .map(Number);

      const [endHour, endMinute] = end
        .split(":")
        .map(Number);

      if (
        Number.isNaN(startHour) ||
        Number.isNaN(startMinute) ||
        Number.isNaN(endHour) ||
        Number.isNaN(endMinute)
      ) {
        return;
      }

      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = endHour * 60 + endMinute;

      if (endMinutes > startMinutes) {
        totalMinutes += endMinutes - startMinutes;
      }
    });

    const hours = totalMinutes / 60;

    return Number.isInteger(hours)
      ? hours
      : Number(hours.toFixed(1));
  }, [sortedSchedule]);

  // ------------------------------------------------------------
  // NOTIFICATIONS
  // ------------------------------------------------------------

  const unreadNotifications = notifications.filter(
    (notification) =>
      notification.read === false ||
      notification.isRead === false ||
      notification.status === "unread"
  ).length;

  const notificationCount =
    unreadNotifications > 0
      ? unreadNotifications
      : notifications.length;

  // ------------------------------------------------------------
  // USER DETAILS
  // ------------------------------------------------------------

  const studentName = user?.name || "Student";

  const studentEmail =
    user?.email || "student@smartscheduler.com";

  const studentDepartment =
    user?.department ||
    user?.departmentName ||
    selectedTimetable?.department ||
    "Computer Science";

  const studentSemester =
    user?.semester ||
    user?.semesterNumber ||
    user?.currentSemester ||
    selectedTimetable?.semester ||
    "1";

  // ------------------------------------------------------------
  // NAVIGATION / LOGOUT
  // ------------------------------------------------------------

  const goTo = (path) => navigate(path);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  // ------------------------------------------------------------
  // LOADING
  // ------------------------------------------------------------

  if (!user || loading) {
    return (
      <div style={styles.loadingPage}>
        <div style={styles.loadingBox}>
          <div style={styles.loadingIcon}>
            <GraduationCap size={30} />
          </div>
          <h2 style={styles.loadingTitle}>SmartSchedAI</h2>
          <p style={styles.loadingText}>
            Loading Student Portal...
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // UI
  // ------------------------------------------------------------

  return (
    <div style={styles.app}>
{/* SIDEBAR */}
<aside style={styles.sidebar}>
  <div style={styles.brand}>
    <div style={styles.logo}>🎓</div>

    <div>
      <div style={styles.brandName}>Smart Scheduler</div>
      <div style={styles.brandSubtitle}>Student Portal</div>
    </div>
  </div>

  <nav style={styles.navigation}>
    <button
      style={{
        ...styles.navItem,
        ...styles.navItemActive,
      }}
      onClick={() => goTo("/student-portal")}
    >
      <span style={styles.navIcon}>▦</span>
      <span>Dashboard</span>
    </button>

    <button
      style={styles.navItem}
      onClick={() => goTo("/student-portal/timetable")}
    >
      <span style={styles.navIcon}>▣</span>
      <span>My Timetable</span>
    </button>

    <button
      style={styles.navItem}
      onClick={() => goTo("/student-portal/courses")}
    >
      <span style={styles.navIcon}>▤</span>
      <span>My Courses</span>
    </button>

    <button
      style={styles.navItem}
      onClick={() => goTo("/student-portal/notifications")}
    >
      <span style={styles.navIcon}>♧</span>
      <span>Notifications</span>

      {notificationCount > 0 && (
        <span style={styles.notificationBadge}>
          {notificationCount}
        </span>
      )}
    </button>

    <button
      style={styles.navItem}
      onClick={() => goTo("/student-portal/profile")}
    >
      <span style={styles.navIcon}>♙</span>
      <span>My Profile</span>
    </button>
  </nav>

  <div style={styles.sidebarBottom}>
    <button
      style={styles.navItem}
      onClick={handleLogout}
    >
      <span style={styles.navIcon}>↪</span>
      <span>Logout</span>
    </button>
  </div>
</aside>

      {/* MAIN */}
      <main style={styles.main}>
        {/* HEADER */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.pageTitle}>
              Student Dashboard
            </h1>

            <p style={styles.welcome}>
              Welcome back, {studentName} 👋
            </p>
          </div>

          <div style={styles.userCard}>
            <span style={styles.userRole}>Student</span>
            <strong style={styles.userName}>
              {studentName}
            </strong>
          </div>
        </div>

        {error && (
          <div style={styles.errorBox}>{error}</div>
        )}

        {/* TIMETABLE STATUS */}
        {selectedTimetable && (
          <div style={styles.timetableInfo}>
            <div>
              <span style={styles.timetableInfoLabel}>
                CURRENT TIMETABLE
              </span>
              <strong style={styles.timetableInfoName}>
                {selectedTimetable.name ||
                  `${studentDepartment} - Semester ${studentSemester}`}
              </strong>
            </div>

            <span style={styles.statusBadge}>
              {selectedTimetable.status || "active"}
            </span>
          </div>
        )}

        {/* STATISTICS */}
        <section style={styles.statsGrid}>
          <StatCard
            icon={<BookOpen size={24} />}
            title="My Courses"
            value={myCourses.length}
            iconStyle="blue"
          />

          <StatCard
            icon={<CalendarDays size={24} />}
            title="Weekly Classes"
            value={weeklyClasses}
            iconStyle="green"
          />

          <StatCard
            icon={<Clock3 size={24} />}
            title="Weekly Hours"
            value={weeklyHours}
            iconStyle="purple"
          />

          <StatCard
            icon={<Bell size={24} />}
            title="Notifications"
            value={notificationCount}
            iconStyle="yellow"
          />
        </section>

        {/* CONTENT GRID */}
        <section style={styles.contentGrid}>
          {/* STUDENT INFORMATION */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>
                  Student Information
                </h2>

                <p style={styles.cardSubtitle}>
                  Your academic details
                </p>
              </div>
            </div>

            <div style={styles.infoGrid}>
              <InfoItem
                icon={<User size={20} />}
                label="Name"
                value={studentName}
              />

              <InfoItem
                icon={<Mail size={20} />}
                label="Email"
                value={studentEmail}
              />

              <InfoItem
                icon={<Building2 size={20} />}
                label="Department"
                value={studentDepartment}
              />

              <InfoItem
                icon={<GraduationCap size={20} />}
                label="Semester"
                value={studentSemester}
              />
            </div>
          </div>

          {/* MY COURSES */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>
                  My Courses
                </h2>

                <p style={styles.cardSubtitle}>
                  Courses for the current semester
                </p>
              </div>

              <button
                style={styles.viewButton}
                onClick={() =>
                  goTo("/student-portal/courses")
                }
              >
                View All
                <ChevronRight size={18} />
              </button>
            </div>

            <div style={styles.courseList}>
              {myCourses.length === 0 ? (
                <EmptyState text="No courses assigned." />
              ) : (
                myCourses.slice(0, 5).map((course, index) => (
                  <div
                    key={
                      getId(course._id || course.id) ||
                      index
                    }
                    style={styles.courseItem}
                  >
                    <div style={styles.courseIcon}>
                      <BookOpen size={20} />
                    </div>

                    <div style={styles.courseText}>
                      <strong style={styles.courseName}>
                        {course.name ||
                          course.title ||
                          course.courseName ||
                          "Course"}
                      </strong>

                      <span style={styles.courseCode}>
                        {course.code ||
                          course.courseCode ||
                          "—"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* MY SCHEDULE */}
        <section style={styles.scheduleCard}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>
                My Schedule
              </h2>

              <p style={styles.cardSubtitle}>
                Your assigned classes
              </p>
            </div>

            <button
              style={styles.viewButton}
              onClick={() =>
                goTo("/student-portal/timetable")
              }
            >
              View Timetable
              <ChevronRight size={18} />
            </button>
          </div>

          <div style={styles.scheduleList}>
            {sortedSchedule.length === 0 ? (
              <EmptyState text="No timetable entries found." />
            ) : (
              sortedSchedule.map((entry, index) => (
                <div
                  key={entry._displayId || index}
                  style={styles.scheduleRow}
                >
                  {/* DAY */}
                  <div style={styles.scheduleDay}>
                    <strong>{entry._day}</strong>
                  </div>

                  {/* TIME */}
                  <div style={styles.scheduleTime}>
                    <Clock3
                      size={19}
                      style={styles.timeIcon}
                    />

                    <strong>
                      {entry._startTime || "—"} -{" "}
                      {entry._endTime || "—"}
                    </strong>
                  </div>

                  {/* COURSE */}
                  <div style={styles.scheduleCourse}>
                    <span style={styles.smallLabel}>
                      COURSE
                    </span>

                    <strong>{entry._courseName}</strong>
                  </div>

                  {/* ROOM */}
                  <div style={styles.scheduleRoom}>
                    <span style={styles.smallLabel}>
                      ROOM
                    </span>

                    <div style={styles.roomValue}>
                      <DoorOpen size={18} />
                      <strong>
                        {entry._roomName}
                      </strong>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

// ============================================================
// STAT CARD
// ============================================================

function StatCard({ icon, title, value, iconStyle }) {
  const iconColors = {
    blue: {
      background: "rgba(37, 99, 235, 0.25)",
      color: "#60a5fa",
    },
    green: {
      background: "rgba(16, 185, 129, 0.22)",
      color: "#34d399",
    },
    purple: {
      background: "rgba(139, 92, 246, 0.22)",
      color: "#c084fc",
    },
    yellow: {
      background: "rgba(245, 158, 11, 0.22)",
      color: "#facc15",
    },
  };

  return (
    <div style={styles.statCard}>
      <div
        style={{
          ...styles.statIcon,
          ...(iconColors[iconStyle] || iconColors.blue),
        }}
      >
        {icon}
      </div>

      <div style={styles.statContent}>
        <span style={styles.statTitle}>{title}</span>
        <strong style={styles.statValue}>{value}</strong>
      </div>
    </div>
  );
}

// ============================================================
// INFO ITEM
// ============================================================

function InfoItem({ icon, label, value }) {
  return (
    <div style={styles.infoItem}>
      <div style={styles.infoIcon}>{icon}</div>

      <div style={{ minWidth: 0 }}>
        <span style={styles.infoLabel}>{label}</span>
        <strong style={styles.infoValue}>{value}</strong>
      </div>
    </div>
  );
}

// ============================================================
// EMPTY STATE
// ============================================================

function EmptyState({ text }) {
  return <div style={styles.emptyState}>{text}</div>;
}

// ============================================================
// INLINE STYLES
// ============================================================

const styles = {
  app: {
    minHeight: "100vh",
    display: "flex",
    background:
      "linear-gradient(135deg, #151943 0%, #24165c 45%, #5a168d 100%)",
    color: "#ffffff",
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },

  sidebar: {
    width: "255px",
    minWidth: "255px",
    minHeight: "100vh",
    background: "rgba(12, 17, 54, 0.92)",
    borderRight: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    flexDirection: "column",
    padding: "24px",
    boxSizing: "border-box",
    position: "sticky",
    top: 0,
    height: "100vh",
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "48px",
  },

  logo: {
    width: "44px",
    height: "44px",
    borderRadius: "12px",
    background:
      "linear-gradient(135deg, #0ea5e9, #2563eb)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 8px 25px rgba(14,165,233,0.3)",
  },

  brandName: {
    fontSize: "18px",
    fontWeight: 800,
    color: "#ffffff",
  },

  brandSubtitle: {
    fontSize: "12px",
    color: "#9ca3c7",
    marginTop: "3px",
  },

  navigation: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },

  navItem: {
    width: "100%",
    minHeight: "48px",
    display: "flex",
    alignItems: "center",
    gap: "14px",
    padding: "0 16px",
    border: "none",
    borderRadius: "12px",
    background: "transparent",
    color: "#c7cbe3",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  },
navIcon: {
  fontSize: "19px",
  width: "20px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
},
  navItemActive: {
    background:
      "linear-gradient(90deg, rgba(37,99,235,0.45), rgba(37,99,235,0.25))",
    color: "#ffffff",
    boxShadow:
      "inset 0 0 0 1px rgba(96,165,250,0.35)",
  },

  notificationBadge: {
    marginLeft: "auto",
    minWidth: "22px",
    height: "22px",
    padding: "0 6px",
    borderRadius: "999px",
    background: "#ff365f",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "11px",
    fontWeight: 800,
  },

  sidebarBottom: {
    marginTop: "auto",
  },

  main: {
    flex: 1,
    padding: "38px 32px 60px",
    minWidth: 0,
    boxSizing: "border-box",
    overflow: "hidden",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "20px",
    marginBottom: "28px",
  },

  pageTitle: {
    margin: 0,
    fontSize: "46px",
    lineHeight: 1.1,
    fontWeight: 800,
    letterSpacing: "-1.5px",
  },

  welcome: {
    margin: "12px 0 0",
    fontSize: "18px",
    color: "#c7cbe3",
  },

  userCard: {
    padding: "14px 20px",
    minWidth: "120px",
    borderRadius: "14px",
    background: "rgba(117, 55, 180, 0.35)",
    border: "1px solid rgba(168, 85, 247, 0.35)",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },

  userRole: {
    color: "#b6a7d8",
    fontSize: "12px",
  },

  userName: {
    fontSize: "14px",
    color: "#ffffff",
  },

  errorBox: {
    padding: "14px 18px",
    marginBottom: "20px",
    borderRadius: "12px",
    background: "rgba(239,68,68,0.15)",
    border: "1px solid rgba(239,68,68,0.4)",
    color: "#fecaca",
  },

  timetableInfo: {
    marginBottom: "24px",
    padding: "14px 18px",
    borderRadius: "14px",
    background: "rgba(91,61,155,0.4)",
    border: "1px solid rgba(139,92,246,0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "15px",
  },

  timetableInfoLabel: {
    display: "block",
    fontSize: "10px",
    color: "#9189b6",
    fontWeight: 700,
    marginBottom: "5px",
  },

  timetableInfoName: {
    display: "block",
    fontSize: "14px",
    color: "#ffffff",
  },

  statusBadge: {
    padding: "6px 10px",
    borderRadius: "999px",
    background: "rgba(52,211,153,0.15)",
    border: "1px solid rgba(52,211,153,0.3)",
    color: "#6ee7b7",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, minmax(0, 1fr))",
    gap: "20px",
    marginBottom: "28px",
  },

  statCard: {
    minHeight: "126px",
    borderRadius: "17px",
    padding: "24px",
    boxSizing: "border-box",
    background:
      "linear-gradient(145deg, rgba(63,39,126,0.8), rgba(53,31,111,0.8))",
    border: "1px solid rgba(139,92,246,0.35)",
    display: "flex",
    alignItems: "center",
    gap: "18px",
  },

  statIcon: {
    width: "50px",
    height: "50px",
    flexShrink: 0,
    borderRadius: "13px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  statContent: {
    marginLeft: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
  },

  statTitle: {
    color: "#b5acd5",
    fontSize: "14px",
    marginBottom: "4px",
  },

  statValue: {
    fontSize: "30px",
    color: "#ffffff",
  },

  contentGrid: {
    display: "grid",
    gridTemplateColumns:
      "minmax(0, 1.65fr) minmax(340px, 0.9fr)",
    gap: "24px",
    marginBottom: "28px",
  },

  card: {
    borderRadius: "18px",
    background:
      "linear-gradient(145deg, rgba(62,37,123,0.82), rgba(64,30,116,0.82))",
    border: "1px solid rgba(139,92,246,0.3)",
    overflow: "hidden",
  },

  cardHeader: {
    minHeight: "104px",
    padding: "26px 24px",
    boxSizing: "border-box",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "15px",
    borderBottom:
      "1px solid rgba(255,255,255,0.08)",
  },

  cardTitle: {
    margin: 0,
    fontSize: "21px",
    fontWeight: 750,
  },

  cardSubtitle: {
    margin: "7px 0 0",
    color: "#aaa4c9",
    fontSize: "14px",
  },

  infoGrid: {
    padding: "24px",
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap: "18px",
  },

  infoItem: {
    minHeight: "76px",
    padding: "15px",
    borderRadius: "13px",
    background: "rgba(91,61,155,0.48)",
    border: "1px solid rgba(167,139,250,0.15)",
    display: "flex",
    alignItems: "center",
    gap: "14px",
    boxSizing: "border-box",
  },

  infoIcon: {
    width: "42px",
    height: "42px",
    borderRadius: "11px",
    background: "rgba(59,130,246,0.2)",
    color: "#60a5fa",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  infoLabel: {
    display: "block",
    color: "#aaa4c9",
    fontSize: "12px",
    marginBottom: "5px",
  },

  infoValue: {
    display: "block",
    color: "#ffffff",
    fontSize: "14px",
    wordBreak: "break-word",
  },

  viewButton: {
    border: "1px solid rgba(139,92,246,0.45)",
    background: "rgba(91,61,155,0.35)",
    color: "#ddd6fe",
    borderRadius: "10px",
    padding: "10px 14px",
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  courseList: {
    padding: "18px 24px 24px",
    display: "flex",
    flexDirection: "column",
    gap: "9px",
  },

  courseItem: {
    minHeight: "66px",
    padding: "12px 14px",
    borderRadius: "12px",
    background: "rgba(91,61,155,0.45)",
    display: "flex",
    alignItems: "center",
    gap: "13px",
    boxSizing: "border-box",
  },

  courseIcon: {
    width: "42px",
    height: "42px",
    borderRadius: "10px",
    background: "rgba(59,130,246,0.2)",
    color: "#60a5fa",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  courseText: {
    minWidth: 0,
  },

  courseName: {
    display: "block",
    fontSize: "13px",
    color: "#ffffff",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "260px",
  },

  courseCode: {
    display: "block",
    marginTop: "5px",
    fontSize: "11px",
    color: "#9993bd",
  },

  scheduleCard: {
    borderRadius: "18px",
    background:
      "linear-gradient(145deg, rgba(62,37,123,0.82), rgba(64,30,116,0.82))",
    border: "1px solid rgba(139,92,246,0.3)",
    overflow: "hidden",
  },

  scheduleList: {
    padding: "20px 24px 24px",
    display: "flex",
    flexDirection: "column",
  },

  scheduleRow: {
    minHeight: "88px",
    display: "grid",
    gridTemplateColumns:
      "125px 180px minmax(220px, 1fr) minmax(160px, 0.7fr)",
    alignItems: "center",
    gap: "20px",
    padding: "15px 14px",
    boxSizing: "border-box",
    background: "rgba(91,61,155,0.45)",
    borderBottom:
      "1px solid rgba(255,255,255,0.07)",
  },

  scheduleDay: {
    fontSize: "14px",
    color: "#ffffff",
    fontWeight: 700,
  },

  scheduleTime: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "13px",
    color: "#ffffff",
  },

  timeIcon: {
    color: "#60a5fa",
    flexShrink: 0,
  },

  scheduleCourse: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: 0,
  },

  scheduleRoom: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: 0,
  },

  smallLabel: {
    color: "#9189b6",
    fontSize: "10px",
    fontWeight: 600,
  },

  roomValue: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    color: "#ffffff",
    fontSize: "13px",
  },

  emptyState: {
    padding: "35px 20px",
    textAlign: "center",
    color: "#aaa4c9",
    fontSize: "14px",
  },

  loadingPage: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background:
      "linear-gradient(135deg, #151943 0%, #24165c 45%, #5a168d 100%)",
    color: "#ffffff",
    fontFamily: "Inter, system-ui, sans-serif",
  },

  loadingBox: {
    textAlign: "center",
  },

  loadingIcon: {
    width: "64px",
    height: "64px",
    margin: "0 auto 15px",
    borderRadius: "16px",
    background:
      "linear-gradient(135deg, #0ea5e9, #2563eb)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  loadingTitle: {
    margin: 0,
    fontSize: "24px",
  },

  loadingText: {
    color: "#aaa4c9",
  },
};

export default StudentPortal;