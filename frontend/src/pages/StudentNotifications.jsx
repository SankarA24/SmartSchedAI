import client from "@/lib/api";

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

const userFromStorage = () => {
  try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
};

import React,{useEffect,useState} from "react";
import {useNavigate} from "react-router-dom";

function Notifications(){
 const navigate=useNavigate(),[user]=useState(userFromStorage),[items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{if(!user){navigate("/login");return;}(async()=>{try{const d=await api("/api/notifications");setItems(unwrap(d,["notifications","data","results"]));}catch(e){console.error(e);setError("Unable to load notifications.");}finally{setLoading(false);}})();},[user,navigate]);
 // No "mark as read" action here: Notification.isRead is a single global flag
 // (no recipient/readBy field) and PUT /api/notifications/:id/read has no owner
 // check, so a student marking one read would hide it for every user.
 const unread=items.filter(n=>!n.isRead).length;
 if(loading)return <div style={styles.loading}>Loading notifications...</div>;
 return <Page active="/student-portal/notifications" navigate={navigate} count={unread||items.length}>
  <div style={styles.header}><div><h1 style={styles.title}>Notifications</h1><p style={styles.subtitle}>Important updates and announcements</p></div><button style={styles.button} onClick={()=>navigate("/student-portal")}>Dashboard →</button></div>
  {error&&<div style={styles.error}>{error}</div>}
  <div style={styles.card}><div style={styles.cardHead}><div><h2 style={styles.cardTitle}>All Notifications</h2><p style={styles.muted}>{unread} unread</p></div></div><div style={styles.content}>
   {items.length?items.map((n,i)=>{const isUnread=!n.isRead;return <div key={getId(n._id||n.id)||i} style={{...styles.notification,...(isUnread?styles.unread:{})}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12}}><strong>{n.title||n.subject||n.type||"Notification"}</strong>{isUnread&&<span style={styles.badge}>NEW</span>}</div>
    <p style={{color:"#c7cbe3",lineHeight:1.6,margin:"9px 0 5px"}}>{n.message||n.content||n.description||"No message available."}</p>
    {(n.createdAt||n.date)&&<small style={styles.muted}>{new Date(n.createdAt||n.date).toLocaleString()}</small>}
   </div>}) : <div style={styles.empty}>No notifications found.</div>}
  </div></div>
 </Page>
}
export default Notifications;