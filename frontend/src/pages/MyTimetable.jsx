import React, { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import useIdentity from "@/hooks/useIdentity";
import { useTimetableData } from "@/hooks/useTimetableData";

/* ============================================================
   COHORT SCOPING
   ------------------------------------------------------------
   This block is deliberately IDENTICAL in pages/StudentPortal.jsx
   and pages/MyTimetable.jsx. The dashboard and the timetable page
   used to match timetables with two different sets of rules, so
   they could show the same student two different timetables with
   nothing on screen saying they disagreed. Both now read the
   same identity (useIdentity → GET /api/auth/me) and run the
   same selection over the same server-scoped GET /api/timetables.
   Change one copy, change the other.

   There are NO cohort defaults here on purpose: no default
   department, no default semester, no default academic year
   taken from the system clock. An unknown field means
   "unknown", and a student whose cohort cannot be resolved
   gets an empty state — never somebody else's timetable.
============================================================ */

const isBlank = (value) =>
  value === undefined || value === null || value === "";

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeSemester = (value) => {
  const match = String(value ?? "").match(/\d+/);
  return match ? match[0] : "";
};

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

const normalizeDay = (day) => {
  if (!day) return "";

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

/**
 * Does this user have enough profile to name a cohort at all?
 * `department` is the minimum; without it there is nothing to scope to.
 */
function hasCohort(identity) {
  return Boolean(identity && !isBlank(identity.department));
}

/**
 * Query params for GET /api/timetables, built only from what the profile
 * actually says. The server rebuilds the filter from the JWT for a student
 * and ignores these (see backend/routes/timetableRoute.js#buildStudentFilter),
 * so they are a statement of intent, never the thing that keeps other
 * cohorts out.
 */
function cohortFilters(identity) {
  if (!hasCohort(identity)) return undefined;

  const filters = { department: identity.department, status: "published" };

  if (!isBlank(identity.semester)) filters.semester = String(identity.semester);
  if (!isBlank(identity.year)) filters.year = identity.year;
  if (!isBlank(identity.academicYear)) filters.academicYear = identity.academicYear;

  return filters;
}

/**
 * Client-side second layer, mirroring the server's `matchesStudentGroup`.
 * Defence in depth: the server already returns only this student's cohort,
 * published; this re-checks every row before it is rendered.
 */
function matchesCohort(timetable, identity) {
  if (!timetable || !hasCohort(identity)) return false;

  if (normalizeText(timetable.department) !== normalizeText(identity.department)) {
    return false;
  }

  if (
    !isBlank(identity.semester) &&
    normalizeSemester(timetable.semester) !== normalizeSemester(identity.semester)
  ) {
    return false;
  }

  // Legacy docs (pre `academicYear`) keep the calendar year in `year`.
  const legacy = isBlank(timetable.academicYear);

  if (
    !legacy &&
    !isBlank(identity.year) &&
    Number(timetable.year) !== Number(identity.year)
  ) {
    return false;
  }

  if (
    !isBlank(identity.academicYear) &&
    Number(legacy ? timetable.year : timetable.academicYear) !==
      Number(identity.academicYear)
  ) {
    return false;
  }

  return true;
}

/**
 * The one timetable this student is shown, or null.
 *
 * Published first, then most recently updated. There is deliberately no
 * "any non-empty timetable" fallback: if nothing matches the student's own
 * cohort the answer is null and the page says so.
 */
function selectCohortTimetable(timetables, identity) {
  const candidates = (Array.isArray(timetables) ? timetables : []).filter(
    (timetable) =>
      Array.isArray(timetable?.schedule) && matchesCohort(timetable, identity)
  );

  if (candidates.length === 0) return null;

  const statusRank = (timetable) =>
    normalizeText(timetable?.status) === "published" ? 0 : 1;

  const ranked = [...candidates].sort((a, b) => {
    const byStatus = statusRank(a) - statusRank(b);
    if (byStatus !== 0) return byStatus;

    const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();

    return dateB - dateA;
  });

  return ranked[0] || null;
}

/** Schedule entries of the chosen timetable, exact duplicates removed. */
function uniqueEntries(schedule) {
  const entries = Array.isArray(schedule) ? schedule : [];

  const result = [];
  const seen = new Set();

  entries.forEach((entry) => {
    const courseId = getId(
      entry.courseId || entry.courseID || entry.course_id || entry.course
    );

    const roomId = getId(
      entry.roomId || entry.roomID || entry.room_id || entry.room
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
      result.push(entry);
    }
  });

  return result;
}

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

  // Identity comes from the shared hook only — never from an inline
  // localStorage read.
  const {
    user,
    linked,
    loading: identityLoading,
    error: identityError,
  } = useIdentity();

  const filters = useMemo(() => cohortFilters(user), [user]);

  // Same server-scoped GET /api/timetables the dashboard uses, through the
  // same hook, so the two pages cannot disagree about this student.
  const {
    timetables,
    courses,
    faculty,
    rooms,
    loading: dataLoading,
    error: dataError,
  } = useTimetableData(filters);

  /* -------------------------------------------------------
     NO SESSION → LOGIN
  ------------------------------------------------------- */

  useEffect(() => {
    if (!identityLoading && !user) {
      navigate("/login");
    }
  }, [identityLoading, user, navigate]);

  /* -------------------------------------------------------
     THE STUDENT'S OWN TIMETABLE
  ------------------------------------------------------- */

  const selected = useMemo(
    () => selectCohortTimetable(timetables, user),
    [timetables, user]
  );

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
    return faculty.find(
      (member) =>
        getId(
          member._id || member.id
        ) === getId(id)
    );
  };

  /* -------------------------------------------------------
     SORT SCHEDULE
  ------------------------------------------------------- */

  const entries = useMemo(() => {
    const dayOrder = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
      Sunday: 7,
    };

    return uniqueEntries(selected?.schedule)
      .map((entry, index) => ({
        ...entry,
        _index: index,
      }))
      .sort((a, b) => {
        const dayDifference =
          (dayOrder[normalizeDay(a.day)] || 99) -
          (dayOrder[normalizeDay(b.day)] || 99);

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
     PROFILE VALUES — no invented defaults
  ------------------------------------------------------- */

  const studentDepartment = user?.department || "—";

  const studentSemester = isBlank(user?.semester)
    ? "—"
    : String(user.semester);

  const studentAcademicYear = isBlank(user?.academicYear)
    ? "—"
    : String(user.academicYear);

  const timetablesError = dataError?.timetables || null;

  const errorMessage = timetablesError
    ? `Unable to load your timetable: ${timetablesError}`
    : identityError || "";

  // Why there is nothing to show, when there is nothing to show.
  const emptyReason = !linked
    ? "Profile not linked — contact your administrator"
    : !hasCohort(user)
      ? "Your student profile has no department set — contact your administrator"
      : "No published timetable for your department and semester yet.";

  /* -------------------------------------------------------
     LOADING
  ------------------------------------------------------- */

  if (identityLoading || dataLoading) {
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

      {errorMessage && (
        <div style={styles.error}>
          {errorMessage}
        </div>
      )}

      {/* UNLINKED PROFILE — no data is shown at all */}

      {!linked ? (
        <div style={styles.card}>
          <div style={styles.cardHead}>
            <div>
              <h2 style={styles.cardTitle}>
                Profile not linked
              </h2>

              <p style={styles.muted}>
                Your account is not connected to a student record
              </p>
            </div>
          </div>

          <div style={styles.empty}>
            Profile not linked — contact your administrator
          </div>
        </div>
      ) : (
        /* TIMETABLE CARD */

        <div style={styles.card}>
          {/* CARD HEADER */}

          <div style={styles.cardHead}>
            <div>
              <h2 style={styles.cardTitle}>
                {selected?.name ||
                  "My Timetable"}
              </h2>

              <p style={styles.muted}>
                {studentDepartment} · Semester{" "}
                {studentSemester} ·{" "}
                {studentAcademicYear}
              </p>
            </div>

            {selected && (
              <span style={styles.badge}>
                {selected.status}
              </span>
            )}
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

                  const member =
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
                    member?.name ||
                    member?.fullName ||
                    member?.facultyName ||
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
              {emptyReason}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

export default MyTimetable;
