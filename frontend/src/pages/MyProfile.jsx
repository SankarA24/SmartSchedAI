import client from "@/lib/api";

const api = async (path, options = {}) => {
  const res = await client.request({
    url: path.replace(/^\/api/, ""),
    method: options.method || "GET",
    data: options.body,
    headers: options.headers,
  });
  return res.data;
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

import React,{useEffect,useState} from "react";
import {useNavigate} from "react-router-dom";

import useIdentity from "@/hooks/useIdentity";

const NOT_LINKED = "Profile not linked — contact your administrator";

// Rendered for anything the record genuinely does not carry. There are no
// invented values on this page any more: no default department, no default
// semester, no current-year guess, and no reading of some other cohort's
// timetable to fill the blanks.
const UNKNOWN = "—";

const show = (value) =>
  value === undefined || value === null || value === "" ? UNKNOWN : String(value);

function MyProfile() {
  const navigate = useNavigate();

  // The single source of truth for who is signed in: `GET /api/auth/me`,
  // which re-reads the linked Student doc server-side.
  const {
    user,
    student,
    linked,
    loading: identityLoading,
    error: identityError,
    refresh,
  } = useIdentity();

  // Only the two fields `PUT /api/students/me` accepts are editable; the
  // academic fields are read-only because only an admin may move a student
  // between cohorts.
  const [form, setForm] = useState({ phone: "", section: "" });
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Queries raised by this student (`GET /api/queries` returns own only).
  const [queries, setQueries] = useState([]);
  const [queryForm, setQueryForm] = useState({ subject: "", message: "" });
  const [queryBusy, setQueryBusy] = useState(false);
  const [queryNotice, setQueryNotice] = useState("");
  const [queryError, setQueryError] = useState("");

  useEffect(() => {
    if (!identityLoading && !user) {
      navigate("/login");
    }
  }, [identityLoading, user, navigate]);

  // Seed the editable fields from the linked Student doc whenever identity
  // resolves or is refreshed.
  useEffect(() => {
    if (!student) return;
    setProfile(student);
    setForm({
      phone: student.phone ?? "",
      section: student.section ?? "",
    });
  }, [student]);

  // Stable boolean so the query list is not refetched when the hook swaps
  // the cached identity for the /auth/me answer.
  const hasUser = Boolean(user);

  useEffect(() => {
    if (identityLoading || !hasUser) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await api("/api/queries");
        if (!cancelled) setQueries(unwrap(data, ["queries", "data", "results"]));
      } catch (err) {
        console.error("Queries error:", err);
        if (!cancelled) setQueryError("Unable to load your queries.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [identityLoading, hasUser]);

  if (identityLoading) {
    return <div style={styles.loading}>Loading profile...</div>;
  }

  if (!user) {
    return <div style={styles.loading}>Loading profile...</div>;
  }

  // Academic fields: straight from the resolved identity / linked Student
  // doc, never defaulted.
  const department = user.department ?? profile?.department ?? null;
  const semester = user.semester ?? profile?.semester ?? null;
  const year = user.year ?? profile?.year ?? null;
  const academicYear = user.academicYear ?? profile?.academicYear ?? null;
  const registerNumber = profile?.registerNumber ?? null;
  const name = user.name ?? profile?.name ?? null;
  const email = user.email ?? profile?.email ?? null;
  const role = user.role ?? "student";

  // Persist through the backend — this used to write to localStorage only,
  // so every edit was wiped by the next logout.
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const updated = await api("/api/students/me", {
        method: "PUT",
        body: { phone: form.phone, section: form.section },
      });

      setProfile(updated);
      setForm({
        phone: updated?.phone ?? "",
        section: updated?.section ?? "",
      });
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);

      // Pull the authoritative copy back so the cached identity and any
      // other page agree with what was just written.
      refresh();
    } catch (err) {
      console.error("Profile save error:", err);
      setError(
        err?.response?.data?.error || "Unable to save your profile. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setForm({
      phone: profile?.phone ?? "",
      section: profile?.section ?? "",
    });
    setEditing(false);
    setError("");
  };

  const submitQuery = async (event) => {
    event.preventDefault();
    const subject = queryForm.subject.trim();
    const message = queryForm.message.trim();

    setQueryNotice("");
    setQueryError("");

    if (!subject || !message) {
      setQueryError("A subject and a message are both required.");
      return;
    }

    setQueryBusy(true);
    try {
      const created = await api("/api/queries", {
        method: "POST",
        body: { subject, message },
      });

      setQueries((list) => [created, ...list]);
      setQueryForm({ subject: "", message: "" });
      setQueryNotice("Your query has been sent to the administrator.");
      setTimeout(() => setQueryNotice(""), 2600);
    } catch (err) {
      console.error("Query submit error:", err);
      setQueryError(
        err?.response?.data?.error || "Unable to send your query. Please try again."
      );
    } finally {
      setQueryBusy(false);
    }
  };

  // Read-only field.
  const renderField = (label, value) => (
    <div style={styles.profileBox}>
      <span style={styles.label}>{label}</span>
      <div style={styles.value}>{show(value)}</div>
    </div>
  );

  // Editable field — persisted by `save()` through PUT /api/students/me.
  const renderEditableField = (label, key) => (
    <div style={styles.profileBox}>
      <span style={styles.label}>{label}</span>
      {editing ? (
        <input
          style={styles.input}
          value={form[key] ?? ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      ) : (
        <div style={styles.value}>{show(form[key])}</div>
      )}
    </div>
  );

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
          {linked && (!editing ? (
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
                disabled={saving}
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
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </>
          ))}
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div style={styles.error}>
          {error}
        </div>
      )}

      {!error && identityError && (
        <div style={styles.error}>
          {identityError}
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
              {linked
                ? "Academic details come from your student record; only phone and section are editable."
                : "No student record is linked to this account."}
            </p>
          </div>
        </div>

        <div style={styles.content}>
          {!linked ? (
            <div style={styles.empty}>{NOT_LINKED}</div>
          ) : (
            <div style={styles.profileGrid}>

              {/* NAME */}
              {renderField("Name", name)}

              {/* EMAIL */}
              {renderField("Email", email)}

              {/* REGISTER NUMBER */}
              {renderField("Register Number", registerNumber)}

              {/* DEPARTMENT */}
              {renderField("Department", department)}

              {/* SEMESTER */}
              {renderField("Semester", semester)}

              {/* YEAR */}
              {renderField("Year", year)}

              {/* ACADEMIC YEAR */}
              {renderField("Academic Year", academicYear)}

              {/* ROLE */}
              {renderField("Role", role)}

              {/* SECTION (editable) */}
              {renderEditableField("Section", "section")}

              {/* PHONE (editable) */}
              {renderEditableField("Phone", "phone")}

            </div>
          )}
        </div>
      </div>

      {/* QUERIES CARD */}
      <div style={styles.card}>
        <div style={styles.cardHead}>
          <div>
            <h2 style={styles.cardTitle}>
              Ask a Query
            </h2>

            <p style={styles.muted}>
              Send a question to the administrator and read their replies
            </p>
          </div>
        </div>

        <div style={styles.content}>
          {queryError && (
            <div style={styles.error}>
              {queryError}
            </div>
          )}

          {queryNotice && (
            <div
              style={{
                ...styles.notification,
                ...styles.unread,
              }}
            >
              {queryNotice}
            </div>
          )}

          <form onSubmit={submitQuery}>
            <div style={{ marginBottom: 12 }}>
              <span style={styles.label}>Subject</span>
              <input
                style={styles.input}
                value={queryForm.subject}
                placeholder="What is your query about?"
                onChange={(e) =>
                  setQueryForm({ ...queryForm, subject: e.target.value })
                }
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <span style={styles.label}>Message</span>
              <textarea
                style={{ ...styles.input, minHeight: 96, resize: "vertical" }}
                value={queryForm.message}
                placeholder="Describe your query"
                onChange={(e) =>
                  setQueryForm({ ...queryForm, message: e.target.value })
                }
              />
            </div>

            <button
              type="submit"
              style={{
                ...styles.button,
                background: "rgba(37,99,235,.35)",
              }}
              disabled={queryBusy}
            >
              {queryBusy ? "Sending..." : "Send Query"}
            </button>
          </form>

          <div style={{ marginTop: 22 }}>
            <span style={styles.label}>Your Queries</span>

            {queries.length ? (
              queries.map((q, i) => (
                <div
                  key={q?._id || q?.id || i}
                  style={styles.notification}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <strong>{q?.subject || "Query"}</strong>
                    <span style={styles.badge}>
                      {String(q?.status || "open").toUpperCase()}
                    </span>
                  </div>

                  <p
                    style={{
                      color: "#c7cbe3",
                      lineHeight: 1.6,
                      margin: "9px 0 5px",
                    }}
                  >
                    {q?.message}
                  </p>

                  {q?.reply && (
                    <p style={{ color: "#ddd6fe", lineHeight: 1.6, margin: "0 0 5px" }}>
                      <strong>Reply:</strong> {q.reply}
                    </p>
                  )}

                  {q?.createdAt && (
                    <small style={styles.muted}>
                      {new Date(q.createdAt).toLocaleString()}
                    </small>
                  )}
                </div>
              ))
            ) : (
              <div style={styles.empty}>You have not raised any queries yet.</div>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}
export default MyProfile;