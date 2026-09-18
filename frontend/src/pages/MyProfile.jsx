const API_URL = "http://localhost:5000";

const getId = (value) => {
  if (!value) return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value.$oid) return String(value.$oid);
  if (value._id) return getId(value._id);
  if (value.id) return getId(value.id);
  const s = typeof value.toString === "function" ? value.toString() : "";
  return s && s !== "[object Object]" ? String(s) : null;
};

const api = async (path, options = {}) => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

const unwrap = (data, keys = []) => {
  if (Array.isArray(data)) return data;
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
  return [];
};

const styles = {
  app: { minHeight:"100vh", display:"flex", background:"linear-gradient(135deg,#151943 0%,#24165c 45%,#5a168d 100%)", color:"#fff", fontFamily:"Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" },
  sidebar:{width:255,minWidth:255,minHeight:"100vh",background:"rgba(12,17,54,.94)",borderRight:"1px solid rgba(255,255,255,.08)",padding:24,boxSizing:"border-box",display:"flex",flexDirection:"column",position:"sticky",top:0,height:"100vh"},
  brand:{display:"flex",alignItems:"center",gap:12,marginBottom:48},
  logo:{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,#0ea5e9,#2563eb)",display:"flex",alignItems:"center",justifyContent:"center"},
  brandName:{fontSize:18,fontWeight:800}, brandSub:{fontSize:12,color:"#9ca3c7",marginTop:3},
  nav:{display:"flex",flexDirection:"column",gap:8},
  navItem:{width:"100%",minHeight:48,display:"flex",alignItems:"center",gap:14,padding:"0 16px",border:0,borderRadius:12,background:"transparent",color:"#c7cbe3",fontSize:15,fontWeight:600,cursor:"pointer",textAlign:"left"},
  active:{background:"linear-gradient(90deg,rgba(37,99,235,.45),rgba(37,99,235,.25))",color:"#fff",boxShadow:"inset 0 0 0 1px rgba(96,165,250,.35)"},
  bottom:{marginTop:"auto"}, main:{flex:1,padding:"38px 32px 60px",minWidth:0,boxSizing:"border-box"},
  header:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:20,marginBottom:28},
  title:{margin:0,fontSize:42,fontWeight:800,letterSpacing:"-1px"}, subtitle:{margin:"10px 0 0",color:"#c7cbe3",fontSize:16},
  card:{borderRadius:18,background:"linear-gradient(145deg,rgba(62,37,123,.86),rgba(64,30,116,.86))",border:"1px solid rgba(139,92,246,.3)",overflow:"hidden",marginBottom:22},
  cardHead:{padding:"22px 24px",borderBottom:"1px solid rgba(255,255,255,.08)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:16},
  cardTitle:{margin:0,fontSize:21,fontWeight:750}, muted:{color:"#aaa4c9",fontSize:14},
  content:{padding:24}, grid:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:16},
  item:{padding:18,borderRadius:14,background:"rgba(91,61,155,.45)",border:"1px solid rgba(167,139,250,.15)"},
  label:{display:"block",fontSize:11,color:"#9189b6",fontWeight:700,marginBottom:7,textTransform:"uppercase"},
  value:{fontSize:15,fontWeight:700,color:"#fff"}, button:{border:"1px solid rgba(139,92,246,.45)",background:"rgba(91,61,155,.35)",color:"#ddd6fe",borderRadius:10,padding:"10px 15px",fontWeight:650,cursor:"pointer"},
  tableWrap:{overflowX:"auto"}, table:{width:"100%",borderCollapse:"collapse",minWidth:850}, th:{textAlign:"left",padding:"14px 16px",fontSize:11,color:"#aaa4c9",textTransform:"uppercase",borderBottom:"1px solid rgba(255,255,255,.1)"}, td:{padding:"16px",borderBottom:"1px solid rgba(255,255,255,.07)",fontSize:14,verticalAlign:"middle"},
  badge:{display:"inline-block",padding:"5px 9px",borderRadius:999,background:"rgba(37,99,235,.2)",color:"#93c5fd",fontSize:11,fontWeight:700},
  error:{padding:14,marginBottom:18,borderRadius:12,background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.4)",color:"#fecaca"},
  empty:{padding:45,textAlign:"center",color:"#aaa4c9"}, loading:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#151943",color:"#fff"},
  notification:{padding:18,borderRadius:14,background:"rgba(91,61,155,.45)",border:"1px solid rgba(167,139,250,.15)",marginBottom:12},
  unread:{border:"1px solid rgba(96,165,250,.45)",background:"rgba(37,99,235,.14)"},
  profileGrid:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:18},
  profileBox:{padding:18,borderRadius:14,background:"rgba(91,61,155,.45)"},
  input:{width:"100%",boxSizing:"border-box",padding:"12px 13px",borderRadius:10,border:"1px solid rgba(167,139,250,.3)",background:"rgba(20,15,60,.4)",color:"#fff",outline:"none"},
};

const Nav = ({active, navigate, count}) => (
  <aside style={styles.sidebar}>
    <div style={styles.brand}>
      <div style={styles.logo}>🎓</div>
      <div><div style={styles.brandName}>Smart Scheduler</div><div style={styles.brandSub}>Student Portal</div></div>
    </div>
    <nav style={styles.nav}>
      {[
        ["Dashboard","/student-portal","▦"],
        ["My Timetable","/student-portal/timetable","▣"],
        ["My Courses","/student-portal/courses","▤"],
        ["Notifications","/student-portal/notifications","♧"],
        ["My Profile","/student-portal/profile","♙"],
      ].map(([label,path,icon]) => (
        <button key={path} style={{...styles.navItem,...(active===path?styles.active:{})}} onClick={()=>navigate(path)}>
          <span style={{fontSize:19,width:20}}>{icon}</span><span>{label}</span>
          {label==="Notifications" && count>0 && <span style={{marginLeft:"auto",background:"#ff365f",borderRadius:999,padding:"3px 8px",fontSize:11}}>{count}</span>}
        </button>
      ))}
    </nav>
    <div style={styles.bottom}>
      <button style={styles.navItem} onClick={()=>{localStorage.removeItem("token");localStorage.removeItem("user");navigate("/login")}}>↪ <span>Logout</span></button>
    </div>
  </aside>
);

const Page = ({active, navigate, children, count=0}) => <div style={styles.app}><Nav active={active} navigate={navigate} count={count}/><main style={styles.main}>{children}</main></div>;

const userFromStorage = () => {
  try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
};

import React,{useEffect,useState} from "react";
import {useNavigate} from "react-router-dom";

function MyProfile() {
  const navigate = useNavigate();

  const [user, setUser] = useState(userFromStorage());
  const [timetable, setTimetable] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Load timetable information for department / semester / year
  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const loadProfileData = async () => {
      try {
        setLoading(true);
        setError("");

        const timetableData = await api("/api/timetables");

        const timetables = unwrap(timetableData, [
          "timetables",
          "data",
          "results",
        ]);

        // Select the first available timetable
        if (timetables.length > 0) {
          setTimetable(timetables[0]);
        }
      } catch (err) {
        console.error("Profile data error:", err);
        setError("Unable to load academic information.");
      } finally {
        setLoading(false);
      }
    };

    loadProfileData();
  }, [user, navigate]);

  if (!user) {
    return <div style={styles.loading}>Loading profile...</div>;
  }

  if (loading) {
    return (
      <Page
        active="/student-portal/profile"
        navigate={navigate}
      >
        <div style={styles.loading}>
          Loading profile...
        </div>
      </Page>
    );
  }

  /*
   * Get academic information.
   *
   * Priority:
   * 1. User object
   * 2. Timetable metadata
   */
  const department =
    user.department ||
    user.departmentName ||
    timetable?.department ||
    timetable?.metadata?.department ||
    "Computer Science";

  const semester =
    user.semester ||
    user.semesterNumber ||
    user.currentSemester ||
    timetable?.semester ||
    timetable?.metadata?.semester ||
    "1";

  const year =
    user.year ||
    timetable?.year ||
    timetable?.metadata?.year ||
    "2026";

  const studentId =
    user.studentId ||
    user.registrationNumber ||
    user.regNo ||
    user.rollNumber ||
    "—";

  const phone =
    user.phone ||
    user.mobile ||
    user.phoneNumber ||
    "—";

  const role =
    user.role ||
    "student";

  const name =
    user.name ||
    user.fullName ||
    "Student";

  const email =
    user.email ||
    "—";

  // Save profile locally
  const save = () => {
    const updatedUser = {
      ...user,
      name,
      email,
      department,
      semester,
      phone,
      studentId,
      year,
      role,
    };

    localStorage.setItem(
      "user",
      JSON.stringify(updatedUser)
    );

    setUser(updatedUser);
    setSaved(true);
    setEditing(false);

    setTimeout(() => {
      setSaved(false);
    }, 2200);
  };

  const cancelEdit = () => {
    setUser(userFromStorage());
    setEditing(false);
  };

  const renderField = (
    label,
    key,
    value,
    editable = false
  ) => {
    return (
      <div style={styles.profileBox}>
        <span style={styles.label}>
          {label}
        </span>

        {editing && editable ? (
          <input
            style={styles.input}
            value={value ?? ""}
            onChange={(e) =>
              setUser({
                ...user,
                [key]: e.target.value,
              })
            }
          />
        ) : (
          <div style={styles.value}>
            {value !== undefined &&
            value !== null &&
            value !== ""
              ? value
              : "—"}
          </div>
        )}
      </div>
    );
  };

  return (
    <Page
      active="/student-portal/profile"
      navigate={navigate}
      count={0}
    >
      {/* HEADER */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            My Profile
          </h1>

          <p style={styles.subtitle}>
            View and manage your student information
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
          }}
        >
          {!editing ? (
            <button
              style={styles.button}
              onClick={() => setEditing(true)}
            >
              Edit Profile
            </button>
          ) : (
            <>
              <button
                style={styles.button}
                onClick={cancelEdit}
              >
                Cancel
              </button>

              <button
                style={{
                  ...styles.button,
                  background:
                    "rgba(37,99,235,.35)",
                }}
                onClick={save}
              >
                Save Changes
              </button>
            </>
          )}
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div style={styles.error}>
          {error}
        </div>
      )}

      {/* SUCCESS */}
      {saved && (
        <div
          style={{
            ...styles.notification,
            ...styles.unread,
          }}
        >
          Profile saved successfully.
        </div>
      )}

      {/* PROFILE CARD */}
      <div style={styles.card}>
        <div style={styles.cardHead}>
          <div>
            <h2 style={styles.cardTitle}>
              Personal & Academic Details
            </h2>

            <p style={styles.muted}>
              Information from your student account
            </p>
          </div>
        </div>

        <div style={styles.content}>
          <div style={styles.profileGrid}>

            {/* NAME */}
            {renderField(
              "Name",
              "name",
              user.name ||
                user.fullName ||
                "Student",
              true
            )}

            {/* EMAIL */}
            {renderField(
              "Email",
              "email",
              user.email ||
                "—",
              true
            )}

            {/* DEPARTMENT */}
            {renderField(
              "Department",
              "department",
              department,
              false
            )}

            {/* SEMESTER */}
            {renderField(
              "Semester",
              "semester",
              semester,
              false
            )}

            {/* PHONE */}
            {renderField(
              "Phone",
              "phone",
              phone,
              true
            )}

            {/* ROLE */}
            {renderField(
              "Role",
              "role",
              role,
              false
            )}

            {/* STUDENT ID */}
            {renderField(
              "Student ID",
              "studentId",
              studentId,
              true
            )}

            {/* YEAR */}
            {renderField(
              "Year",
              "year",
              year,
              false
            )}

          </div>
        </div>
      </div>
    </Page>
  );
}
export default MyProfile;