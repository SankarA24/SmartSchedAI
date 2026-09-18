import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_URL = "http://localhost:5000";

/* =========================================================
   HELPERS
========================================================= */

const getId = (value) => {
  if (!value) return null;

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (value.$oid) return String(value.$oid);

  if (value._id) return getId(value._id);

  if (value.id) return getId(value.id);

  const s =
    typeof value.toString === "function"
      ? value.toString()
      : "";

  return s && s !== "[object Object]"
    ? String(s)
    : null;
};

const api = async (path, options = {}) => {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",

      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),

      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
};

const unwrap = (data, keys = []) => {
  if (Array.isArray(data)) {
    return data;
  }

  for (const key of keys) {
    if (Array.isArray(data?.[key])) {
      return data[key];
    }
  }

  return [];
};

const getStoredUser = () => {
  try {
    return JSON.parse(
      localStorage.getItem("user") || "null"
    );
  } catch {
    return null;
  }
};

/* =========================================================
   STYLES
========================================================= */

const styles = {
  app: {
    minHeight: "100vh",
    display: "flex",
    background:
      "linear-gradient(135deg,#151943 0%,#24165c 45%,#5a168d 100%)",
    color: "#fff",
    fontFamily:
      "Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  },

  sidebar: {
    width: 255,
    minWidth: 255,
    minHeight: "100vh",
    background: "rgba(12,17,54,.94)",
    borderRight:
      "1px solid rgba(255,255,255,.08)",
    padding: 24,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    position: "sticky",
    top: 0,
    height: "100vh",
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 48,
  },

  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background:
      "linear-gradient(135deg,#0ea5e9,#2563eb)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
  },

  brandName: {
    fontSize: 18,
    fontWeight: 800,
  },

  brandSub: {
    fontSize: 12,
    color: "#9ca3c7",
    marginTop: 3,
  },

  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },

  navItem: {
    width: "100%",
    minHeight: 48,
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "0 16px",
    border: 0,
    borderRadius: 12,
    background: "transparent",
    color: "#c7cbe3",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  },

  active: {
    background:
      "linear-gradient(90deg,rgba(37,99,235,.45),rgba(37,99,235,.25))",
    color: "#fff",
    boxShadow:
      "inset 0 0 0 1px rgba(96,165,250,.35)",
  },

  bottom: {
    marginTop: "auto",
  },

  main: {
    flex: 1,
    padding: "38px 32px 60px",
    minWidth: 0,
    boxSizing: "border-box",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 28,
  },

  title: {
    margin: 0,
    fontSize: 42,
    fontWeight: 800,
    letterSpacing: "-1px",
  },

  subtitle: {
    margin: "10px 0 0",
    color: "#c7cbe3",
    fontSize: 16,
  },

  button: {
    border:
      "1px solid rgba(139,92,246,.45)",
    background:
      "rgba(91,61,155,.35)",
    color: "#ddd6fe",
    borderRadius: 10,
    padding: "10px 15px",
    fontWeight: 650,
    cursor: "pointer",
  },

  card: {
    borderRadius: 18,
    background:
      "linear-gradient(145deg,rgba(62,37,123,.86),rgba(64,30,116,.86))",
    border:
      "1px solid rgba(139,92,246,.3)",
    overflow: "hidden",
    marginBottom: 22,
  },

  cardHead: {
    padding: "22px 24px",
    borderBottom:
      "1px solid rgba(255,255,255,.08)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },

  cardTitle: {
    margin: 0,
    fontSize: 21,
    fontWeight: 750,
  },

  muted: {
    color: "#aaa4c9",
    fontSize: 14,
  },

  badge: {
    display: "inline-block",
    padding: "5px 10px",
    borderRadius: 999,
    background:
      "rgba(37,99,235,.2)",
    color: "#93c5fd",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
  },

  timetableContainer: {
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },

  timetableRow: {
    display: "grid",
    gridTemplateColumns:
      "150px 180px minmax(250px,1fr) minmax(220px,1fr) 150px",
    alignItems: "stretch",
    background:
      "linear-gradient(135deg,rgba(91,61,155,.58),rgba(72,43,140,.58))",
    border:
      "1px solid rgba(167,139,250,.20)",
    borderRadius: 14,
    overflow: "hidden",
    minHeight: 92,
    boxShadow:
      "0 5px 18px rgba(0,0,0,.12)",
    transition:
      "transform .15s ease, border-color .15s ease",
  },

  dayBox: {
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    borderRight:
      "1px solid rgba(255,255,255,.08)",
  },

  dayLabel: {
    color: "#a99bd4",
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: 700,
    marginBottom: 6,
  },

  dayValue: {
    fontSize: 16,
    fontWeight: 800,
  },

  timeBox: {
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    borderRight:
      "1px solid rgba(255,255,255,.08)",
  },

  timeLabel: {
    color: "#a99bd4",
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: 700,
    marginBottom: 6,
  },

  timeValue: {
    fontSize: 15,
    fontWeight: 750,
    color: "#fff",
  },

  courseBox: {
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    borderRight:
      "1px solid rgba(255,255,255,.08)",
  },

  courseLabel: {
    color: "#a99bd4",
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: 700,
    marginBottom: 6,
  },

  courseName: {
    fontSize: 15,
    fontWeight: 800,
    color: "#fff",
  },

  courseCode: {
    fontSize: 12,
    color: "#b7a9dc",
    marginTop: 4,
  },

  facultyBox: {
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    borderRight:
      "1px solid rgba(255,255,255,.08)",
  },

  facultyLabel: {
    color: "#a99bd4",
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: 700,
    marginBottom: 6,
  },

  facultyName: {
    fontSize: 14,
    fontWeight: 750,
    color: "#fff",
  },

  roomBox: {
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },

  roomLabel: {
    color: "#a99bd4",
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: 700,
    marginBottom: 6,
  },

  roomName: {
    fontSize: 15,
    fontWeight: 800,
    color: "#fff",
  },

  empty: {
    padding: 50,
    textAlign: "center",
    color: "#aaa4c9",
  },

  error: {
    padding: 14,
    marginBottom: 18,
    borderRadius: 12,
    background:
      "rgba(239,68,68,.15)",
    border:
      "1px solid rgba(239,68,68,.4)",
    color: "#fecaca",
  },

  loading: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#151943",
    color: "#fff",
    fontSize: 18,
  },
};

/* =========================================================
   SIDEBAR
========================================================= */

const Nav = ({ active, navigate }) => {
  const items = [
    ["Dashboard", "/student-portal", "▦"],
    ["My Timetable", "/student-portal/timetable", "▣"],
    ["My Courses", "/student-portal/courses", "▤"],
    ["Notifications", "/student-portal/notifications", "♧"],
    ["My Profile", "/student-portal/profile", "♙"],
  ];

  return (
    <aside style={styles.sidebar}>
      <div style={styles.brand}>
        <div style={styles.logo}>🎓</div>

        <div>
          <div style={styles.brandName}>
            Smart Scheduler
          </div>

          <div style={styles.brandSub}>
            Student Portal
          </div>
        </div>
      </div>

      <nav style={styles.nav}>
        {items.map(([label, path, icon]) => (
          <button
            key={path}
            style={{
              ...styles.navItem,
              ...(active === path
                ? styles.active
                : {}),
            }}
            onClick={() => navigate(path)}
          >
            <span
              style={{
                fontSize: 19,
                width: 20,
              }}
            >
              {icon}
            </span>

            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div style={styles.bottom}>
        <button
          style={styles.navItem}
          onClick={() => {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            navigate("/login");
          }}
        >
          ↪
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

/* =========================================================
   PAGE LAYOUT
========================================================= */

const Page = ({
  active,
  navigate,
  children,
}) => {
  return (
    <div style={styles.app}>
      <Nav
        active={active}
        navigate={navigate}
      />

      <main style={styles.main}>
        {children}
      </main>
    </div>
  );
};

/* =========================================================
   MY TIMETABLE
========================================================= */

function MyTimetable() {
  const navigate = useNavigate();

  const [user] = useState(getStoredUser);

  const [courses, setCourses] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [timetables, setTimetables] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* -------------------------------------------------------
     LOAD DATA
  ------------------------------------------------------- */

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        setError("");

        const [
          coursesData,
          roomsData,
          facultiesData,
          timetablesData,
        ] = await Promise.all([
          api("/api/courses"),

          api("/api/rooms"),

          // IMPORTANT:
          // Backend uses /api/faculty
          // NOT /api/faculties
          api("/api/faculty"),

          api("/api/timetables"),
        ]);

        setCourses(
          unwrap(coursesData, [
            "courses",
            "data",
            "results",
          ])
        );

        setRooms(
          unwrap(roomsData, [
            "rooms",
            "data",
            "results",
          ])
        );

        setFaculties(
          unwrap(facultiesData, [
            "faculties",
            "faculty",
            "data",
            "results",
          ])
        );

        setTimetables(
          unwrap(timetablesData, [
            "timetables",
            "data",
            "results",
          ])
        );
      } catch (err) {
        console.error(
          "Timetable loading error:",
          err
        );

        setError(
          "Unable to load timetable data. Please make sure the backend server is running."
        );
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, navigate]);

  /* -------------------------------------------------------
     SELECT CORRECT TIMETABLE
  ------------------------------------------------------- */

  const selected = useMemo(() => {
    const department =
      user?.department ||
      user?.departmentName ||
      "Computer Science";

    const semester = String(
      user?.semester ||
        user?.semesterNumber ||
        user?.currentSemester ||
        "1"
    );

    const year = String(
      user?.year ||
        new Date().getFullYear()
    );

    const matches = timetables.filter(
      (timetable) =>
        String(
          timetable.department || ""
        ).toLowerCase() ===
          department.toLowerCase() &&
        String(
          timetable.semester || ""
        ) === semester &&
        String(
          timetable.year || ""
        ) === year
    );

    return (
      matches.find((timetable) =>
        [
          "published",
          "approved",
          "active",
        ].includes(
          String(
            timetable.status || ""
          ).toLowerCase()
        )
      ) ||
      matches[0] ||
      timetables.find(
        (timetable) =>
          Array.isArray(
            timetable.schedule
          )
      ) ||
      null
    );
  }, [timetables, user]);

  /* -------------------------------------------------------
     LOOKUP FUNCTIONS
  ------------------------------------------------------- */

  const courseById = (id) => {
    return courses.find(
      (course) =>
        getId(
          course._id || course.id
        ) === getId(id)
    );
  };

  const roomById = (id) => {
    return rooms.find(
      (room) =>
        getId(
          room._id || room.id
        ) === getId(id)
    );
  };

  const facultyById = (id) => {
    return faculties.find(
      (faculty) =>
        getId(
          faculty._id || faculty.id
        ) === getId(id)
    );
  };

  /* -------------------------------------------------------
     SORT SCHEDULE
  ------------------------------------------------------- */

  const entries = useMemo(() => {
    if (
      !Array.isArray(
        selected?.schedule
      )
    ) {
      return [];
    }

    const dayOrder = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
      Sunday: 7,
    };

    return selected.schedule
      .map((entry, index) => ({
        ...entry,
        _index: index,
      }))
      .sort((a, b) => {
        const dayDifference =
          (dayOrder[a.day] || 99) -
          (dayOrder[b.day] || 99);

        if (dayDifference !== 0) {
          return dayDifference;
        }

        return String(
          a.startTime || ""
        ).localeCompare(
          String(
            b.startTime || ""
          )
        );
      });
  }, [selected]);

  /* -------------------------------------------------------
     LOADING
  ------------------------------------------------------- */

  if (loading) {
    return (
      <div style={styles.loading}>
        Loading timetable...
      </div>
    );
  }

  /* -------------------------------------------------------
     PAGE
  ------------------------------------------------------- */

  return (
    <Page
      active="/student-portal/timetable"
      navigate={navigate}
    >
      {/* HEADER */}

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            My Timetable
          </h1>

          <p style={styles.subtitle}>
            Your generated weekly class schedule
          </p>
        </div>

        <button
          style={styles.button}
          onClick={() =>
            navigate(
              "/student-portal"
            )
          }
        >
          Dashboard →
        </button>
      </div>

      {/* ERROR */}

      {error && (
        <div style={styles.error}>
          {error}
        </div>
      )}

      {/* TIMETABLE CARD */}

      <div style={styles.card}>
        {/* CARD HEADER */}

        <div style={styles.cardHead}>
          <div>
            <h2 style={styles.cardTitle}>
              {selected?.name ||
                "Current Timetable"}
            </h2>

            <p style={styles.muted}>
              {selected?.department ||
                user?.department ||
                "Computer Science"}{" "}
              · Semester{" "}
              {selected?.semester ||
                user?.semester ||
                "1"}{" "}
              ·{" "}
              {selected?.year ||
                new Date().getFullYear()}
            </p>
          </div>

          <span style={styles.badge}>
            {selected?.status ||
              "active"}
          </span>
        </div>

        {/* RECTANGULAR TIMETABLE */}

        {entries.length > 0 ? (
          <div
            style={
              styles.timetableContainer
            }
          >
            {entries.map(
              (entry, index) => {
                const course =
                  courseById(
                    entry.courseId ||
                      entry.course
                  );

                const room =
                  roomById(
                    entry.roomId ||
                      entry.room
                  );

                const faculty =
                  facultyById(
                    entry.facultyId ||
                      entry.faculty
                  );

                const courseName =
                  course?.name ||
                  course?.title ||
                  entry.courseName ||
                  "Course";

                const courseCode =
                  course?.code ||
                  entry.courseCode ||
                  "—";

                const facultyName =
                  faculty?.name ||
                  faculty?.fullName ||
                  faculty?.facultyName ||
                  entry.facultyName ||
                  entry.faculty?.name ||
                  "—";

                const roomName =
                  room?.name ||
                  room?.roomNumber ||
                  room?.number ||
                  entry.roomName ||
                  "—";

                return (
                  <div
                    key={
                      entry._id ||
                      entry.id ||
                      index
                    }
                    style={
                      styles.timetableRow
                    }
                  >
                    {/* DAY */}

                    <div
                      style={
                        styles.dayBox
                      }
                    >
                      <span
                        style={
                          styles.dayLabel
                        }
                      >
                        DAY
                      </span>

                      <span
                        style={
                          styles.dayValue
                        }
                      >
                        {entry.day ||
                          "—"}
                      </span>
                    </div>

                    {/* TIME */}

                    <div
                      style={
                        styles.timeBox
                      }
                    >
                      <span
                        style={
                          styles.timeLabel
                        }
                      >
                        TIME
                      </span>

                      <span
                        style={
                          styles.timeValue
                        }
                      >
                        {entry.startTime ||
                          "—"}{" "}
                        -{" "}
                        {entry.endTime ||
                          "—"}
                      </span>
                    </div>

                    {/* COURSE */}

                    <div
                      style={
                        styles.courseBox
                      }
                    >
                      <span
                        style={
                          styles.courseLabel
                        }
                      >
                        COURSE
                      </span>

                      <span
                        style={
                          styles.courseName
                        }
                      >
                        {courseName}
                      </span>

                      <span
                        style={
                          styles.courseCode
                        }
                      >
                        {courseCode}
                      </span>
                    </div>

                    {/* FACULTY */}

                    <div
                      style={
                        styles.facultyBox
                      }
                    >
                      <span
                        style={
                          styles.facultyLabel
                        }
                      >
                        FACULTY
                      </span>

                      <span
                        style={
                          styles.facultyName
                        }
                      >
                        {facultyName}
                      </span>
                    </div>

                    {/* ROOM */}

                    <div
                      style={
                        styles.roomBox
                      }
                    >
                      <span
                        style={
                          styles.roomLabel
                        }
                      >
                        ROOM
                      </span>

                      <span
                        style={
                          styles.roomName
                        }
                      >
                        {roomName}
                      </span>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        ) : (
          <div style={styles.empty}>
            No timetable entries found.
          </div>
        )}
      </div>
    </Page>
  );
}

export default MyTimetable;