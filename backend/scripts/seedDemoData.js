// backend/scripts/seedDemoData.js
//
// Populates a running instance with enough synthetic activity that every
// screen has something real to show: students in both cohorts, extra faculty
// and student logins, generated and published timetables, notifications across
// all three audiences, and a mix of open and answered queries.
//
// This talks to the HTTP API rather than the database directly, so everything
// it creates goes through the same validation, scoping and socket emission as
// a real user's actions. It therefore needs a running backend.
//
//   BASE_URL=http://localhost:8081 node scripts/seedDemoData.js
//
// It is idempotent in the sense that re-running it skips records that already
// exist by their unique key (email, register number). It does NOT delete
// anything; use --reset-generated to drop timetables it previously produced.

import "dotenv/config";

const BASE = (process.env.BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const API = `${BASE}/api`;
const PASSWORD = "123456";
const RESET = process.argv.includes("--reset-generated");

let adminToken = null;

// ---------------------------------------------------------------- utilities

async function call(method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    return { status: 0, data: null, error: error.message };
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const list = (v) =>
  Array.isArray(v) ? v : Array.isArray(v?.timetables) ? v.timetables : [];

function log(step, detail = "") {
  console.log(`  ${step}${detail ? " — " + detail : ""}`);
}

async function login(email, role) {
  const { data } = await call("POST", "/auth/login", {
    body: { email, password: PASSWORD, role },
  });
  return data?.token || null;
}

// ------------------------------------------------------------------- people

// Two cohorts, matching what seedRealisticData.js creates.
const COHORTS = [
  { department: "Computer Science", semester: 1, year: 1, academicYear: 2026, prefix: "CS" },
  { department: "Electronics", semester: 2, year: 2, academicYear: 2027, prefix: "EC" },
];

const FIRST = ["Aarav", "Diya", "Rohan", "Meera", "Karthik", "Ananya", "Vikram", "Priya",
  "Arjun", "Sneha", "Nikhil", "Kavya", "Rahul", "Ishita", "Aditya", "Nandini",
  "Siddharth", "Tara", "Varun", "Lakshmi", "Manoj", "Pooja", "Harish", "Divya"];
const LAST = ["Sharma", "Iyer", "Nair", "Reddy", "Menon", "Gupta", "Rao", "Pillai"];

async function seedStudents() {
  console.log("\nStudents");
  const existing = list((await call("GET", "/students", { token: adminToken })).data);
  const seen = new Set(existing.map((s) => String(s.email || "").toLowerCase()));
  let made = 0;

  for (const cohort of COHORTS) {
    for (let i = 0; i < 12; i++) {
      const idx = COHORTS.indexOf(cohort) * 12 + i;
      const name = `${FIRST[idx % FIRST.length]} ${LAST[idx % LAST.length]}`;
      const roll = String(i + 1).padStart(3, "0");
      const email = `${cohort.prefix.toLowerCase()}${cohort.academicYear}${roll}@college.edu`;
      if (seen.has(email)) continue;

      const { status } = await call("POST", "/students", {
        token: adminToken,
        body: {
          name,
          registerNumber: `${cohort.prefix}${cohort.academicYear}${roll}`,
          email,
          department: cohort.department,
          semester: cohort.semester,
          year: cohort.year,
          academicYear: cohort.academicYear,
          section: i < 6 ? "A" : "B",
        },
      });
      if (status === 201) made++;
    }
  }
  log(`${made} created`, `${existing.length} already present`);
}

// A second faculty login and a second student login, so the portals can be
// viewed as more than one person.
async function seedLogins() {
  console.log("\nExtra logins");
  const faculty = list((await call("GET", "/faculty", { token: adminToken })).data);
  const students = list((await call("GET", "/students", { token: adminToken })).data);
  const users = list((await call("GET", "/users", { token: adminToken })).data);
  const have = new Set(users.map((u) => String(u.email || "").toLowerCase()));

  const wanted = [];
  const f = faculty.find((x) => !have.has(String(x.email || "").toLowerCase()));
  if (f) wanted.push({ name: f.name, email: f.email, role: "faculty" });
  const s = students.find((x) => !have.has(String(x.email || "").toLowerCase()));
  if (s) wanted.push({ name: s.name, email: s.email, role: "student" });

  let made = 0;
  for (const w of wanted) {
    const { status } = await call("POST", "/users", {
      token: adminToken,
      body: { ...w, password: PASSWORD },
    });
    if (status === 201 || status === 200) {
      made++;
      log(`${w.role} login`, `${w.email} / ${PASSWORD}`);
    }
  }
  if (!made) log("none needed", "logins already exist");
}

// --------------------------------------------------------------- timetables

async function generate(cohort) {
  const { status, data } = await call("POST", "/timetables/generate", {
    token: adminToken,
    body: {
      department: cohort.department,
      semester: cohort.semester,
      year: cohort.year,
      academicYear: cohort.academicYear,
      gaOptions: { seed: 42 },
    },
  });

  if (status === 409) return { skipped: "another generation is already running" };
  if (status !== 202 || !data?.jobId) return { error: `expected 202, got ${status}` };

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    const { data: job } = await call("GET", `/timetables/generate/${data.jobId}/progress`, {
      token: adminToken,
    });
    if (job?.status === "completed") return { id: job.timetableId };
    if (job?.status === "failed") return { error: job.error || "generation failed" };
  }
  return { error: "timed out after 90s" };
}

async function seedTimetables() {
  console.log("\nTimetables");

  if (RESET) {
    const all = list((await call("GET", "/timetables", { token: adminToken })).data);
    for (const t of all) {
      await call("DELETE", `/timetables/${t._id}`, { token: adminToken });
    }
    log(`${all.length} deleted`, "--reset-generated");
  }

  const made = [];
  for (const cohort of COHORTS) {
    const label = `${cohort.department} Y${cohort.year} S${cohort.semester} ${cohort.academicYear}`;
    const r = await generate(cohort);
    if (r.id) {
      made.push({ id: r.id, cohort });
      log(`generated ${label}`);
    } else {
      log(`SKIPPED ${label}`, r.error || r.skipped);
    }
  }

  // Publish them: faculty and students only ever see published timetables,
  // so without this every portal stays empty.
  for (const m of made) {
    const { status } = await call("PATCH", `/timetables/${m.id}/publish`, {
      token: adminToken,
    });
    log(status < 300 ? "published" : `publish failed (${status})`, m.cohort.department);
  }

  return made;
}

// ------------------------------------------------------ notifications, talk

async function seedNotifications() {
  console.log("\nNotifications");
  const items = [
    ["all", "info", "Semester begins Monday", "Teaching for the new semester starts on Monday. Please check your timetable for room changes."],
    ["all", "warning", "Library closed Saturday", "The central library is closed this Saturday for stock-taking."],
    ["faculty", "info", "Submit internal marks", "Internal assessment marks are due by the end of this week."],
    ["faculty", "success", "Workload approved", "Your teaching workload for this semester has been approved."],
    ["student", "info", "Fee payment window open", "The fee payment window is open until the end of the month."],
    ["student", "warning", "Attendance below threshold", "Some students are below the 75% attendance requirement. Check with your advisor."],
    ["admin", "error", "Two rooms lack capacity data", "Two rooms have no capacity recorded, which weakens room-fit checking during generation."],
  ];

  let made = 0;
  for (const [audience, type, title, message] of items) {
    const { status } = await call("POST", "/notifications", {
      token: adminToken,
      body: { title, message, type, audience },
    });
    if (status === 201) made++;
  }
  log(`${made} created`, "across all, faculty, student and admin audiences");
}

async function seedQueries() {
  console.log("\nQueries");
  const facultyToken = await login("faculty@smartscheduler.com", "faculty");
  const studentToken = await login("student@smartscheduler.com", "student");

  const raised = [];
  const asks = [
    [facultyToken, "faculty", "Clash on Wednesday afternoon", "I have two sessions that feel back-to-back across buildings. Can the later one move?"],
    [facultyToken, "faculty", "Lab room request", "Could the practical sessions be allocated a lab with projectors?"],
    [studentToken, "student", "Timetable not showing", "My timetable looked empty yesterday. Is the schedule published for my section?"],
    [studentToken, "student", "Elective change", "I would like to switch one elective. Who should I speak to?"],
  ];

  for (const [token, role, subject, message] of asks) {
    if (!token) continue;
    const { status, data } = await call("POST", "/queries", {
      token,
      body: { subject, message },
    });
    if (status === 201 || status === 200) raised.push({ id: data?._id, role, subject });
  }

  // Answer half of them so the admin view shows both states.
  let answered = 0;
  for (const q of raised.slice(0, 2)) {
    if (!q.id) continue;
    const { status } = await call("PUT", `/queries/${q.id}/reply`, {
      token: adminToken,
      body: { reply: "Thanks for raising this. We have looked at it and will confirm by Friday." },
    });
    if (status < 300) answered++;
  }
  log(`${raised.length} raised`, `${answered} answered, the rest left open`);
}

async function seedComments(made) {
  if (!made.length) return;
  console.log("\nComments");
  const facultyToken = await login("faculty@smartscheduler.com", "faculty");
  const target = made[0].id;
  const texts = [
    "The Monday morning block looks heavy. Could one session move later in the week?",
    "Room allocation looks sensible from my side.",
  ];
  let made2 = 0;
  for (const text of texts) {
    const { status } = await call("POST", `/timetables/${target}/comments`, {
      token: facultyToken || adminToken,
      body: { text },
    });
    if (status < 300) made2++;
  }
  log(`${made2} added`, "on the first published timetable");
}

// --------------------------------------------------------------------- main

async function main() {
  console.log(`\nSeeding demo data against ${BASE}`);

  adminToken = await login("admin@smartscheduler.com", "admin");
  if (!adminToken) {
    console.error(`\nCould not log in as admin at ${API}.`);
    console.error("Is the backend running, and has createTestUsers.js been seeded?");
    process.exit(1);
  }

  await seedStudents();
  await seedLogins();
  const made = await seedTimetables();
  await seedNotifications();
  await seedQueries();
  await seedComments(made);

  // Final tally, read back from the API so the numbers are what the UI sees.
  console.log("\nFinal counts");
  for (const ep of ["courses", "faculty", "rooms", "students", "users", "timetables", "notifications", "queries"]) {
    const { data } = await call("GET", `/${ep}`, { token: adminToken });
    console.log(`  ${ep.padEnd(15)}${list(data).length}`);
  }

  const published = list((await call("GET", "/timetables", { token: adminToken })).data)
    .filter((t) => t.status === "published").length;
  console.log(`  ${"published".padEnd(15)}${published}`);
  console.log("\nDone.\n");
  process.exit(0);
}

main().catch((error) => {
  console.error("\nSeeding failed:", error);
  process.exit(1);
});
