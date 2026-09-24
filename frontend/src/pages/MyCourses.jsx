import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, GraduationCap, Layers, SearchX } from "lucide-react";

import client from "@/lib/api";
import { navForRole } from "@/lib/nav";
import { useIdentity } from "@/hooks/useIdentity";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Callout } from "@/components/common/Callout";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// =====================================================
// /student-portal/courses — the student's own course list (U9 re-skin).
//
// The shell, the layout and the styling are new; the data path is not.
// Scoping rules carried over unchanged from the Phase 8 rescope:
//   * identity comes from `useIdentity()` (`GET /api/auth/me`), never from
//     an inline `localStorage.getItem("user")` parse;
//   * `linked === false` renders "Profile not linked — contact your
//     administrator" instead of data;
//   * the list is filtered to the student's own department + semester (+
//     year when both sides carry one);
//   * there is no fallback of any kind — no default department, no default
//     semester or academic year, and above all no "show the whole course
//     catalogue when the cohort filter matches nothing".
// =====================================================

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

const NOT_LINKED = "Profile not linked — contact your administrator";

// Case- and whitespace-insensitive text compare (departments are free text).
const sameText = (a, b) =>
  String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

// Numeric compare that refuses to match when either side is not a number,
// so a course with a missing/garbage semester is excluded rather than
// silently accepted.
const sameNumber = (a, b) => {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && left === right;
};

/** One course, as a card. Replaces the old row-list renderer. */
function CourseCard({ course }) {
  const title = course.name || course.title || course.courseName || "Course";
  const code = course.code || course.courseCode || null;
  const credits = course.credits;
  const type = course.type || course.courseType || null;

  return (
    <article className="flex animate-in flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm fade-in duration-150 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{code || "No course code"}</p>
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BookOpen className="size-4" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {credits === undefined || credits === null || credits === "" ? "—" : credits} credits
        </Badge>
        {course.semester !== undefined && course.semester !== null && (
          <Badge variant="outline">Semester {course.semester}</Badge>
        )}
        {type && <Badge variant="outline">{String(type)}</Badge>}
      </div>

      {course.description && (
        <p className="text-sm leading-relaxed text-muted-foreground">{course.description}</p>
      )}
    </article>
  );
}

function MyCourses() {
  const navigate = useNavigate();

  // Identity comes from the shared hook (`GET /api/auth/me`), never from a
  // hardcoded department or semester default: a student whose record carries
  // no cohort now sees an empty list instead of a stranger's courses.
  const { user, linked, loading: identityLoading, error: identityError } = useIdentity();

  const [courses, setCourses] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const dept = user?.department ?? null;
  const sem = user?.semester ?? null;
  const year = user?.year ?? null;
  const hasCohort = linked && dept !== null && sem !== null;
  // Depend on a stable boolean, not the identity object: the hook swaps the
  // cached copy for the /auth/me answer, which would otherwise refetch.
  const hasUser = Boolean(user);

  useEffect(() => {
    if (identityLoading) return;
    if (!hasUser) {
      navigate("/login");
      return;
    }
    // Nothing to scope by — do not fetch, and above all do not fall back to
    // the whole course catalogue.
    if (!hasCohort) {
      setCourses([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await api("/api/courses");
        if (!cancelled) setCourses(unwrap(data, ["courses", "data", "results"]));
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Unable to load courses.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identityLoading, hasUser, hasCohort, navigate]);

  // The student's own cohort only: department + semester always, plus year
  // when both the student record and the course carry one. There is no
  // "show everything when the filter matches nothing" fallback any more.
  const list = useMemo(() => {
    if (!hasCohort) return [];
    return courses.filter((c) => {
      if (!sameText(c.department, dept)) return false;
      if (!sameNumber(c.semester, sem)) return false;
      if (year !== null && c.year !== undefined && c.year !== null && !sameNumber(c.year, year))
        return false;
      return true;
    });
  }, [courses, dept, sem, year, hasCohort]);

  const credits = useMemo(
    () =>
      list.reduce((total, course) => {
        const value = Number(course.credits);
        return Number.isFinite(value) ? total + value : total;
      }, 0),
    [list]
  );

  const cohort = [
    dept,
    sem !== null ? `Semester ${sem}` : null,
    year !== null ? `Year ${year}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const { brand, nav, quickActions } = navForRole("student");
  const busy = identityLoading || loading;

  return (
    <AppShell
      brand={brand}
      nav={nav}
      quickActions={quickActions}
      chatbot={{ context: { page: "my-courses", courses: list.length } }}
    >
      <PageHeader
        title="My Courses"
        description={cohort || "Courses assigned to your current semester"}
      />

      <div className="space-y-6">
        {error && (
          <Callout tone="destructive" title="Could not load courses">
            {error}
          </Callout>
        )}

        {!error && identityError && (
          <Callout tone="warning" title="Profile could not be refreshed">
            {identityError}
          </Callout>
        )}

        {!busy && !linked ? (
          <SectionCard
            title="Course List"
            description="No student record is linked to this account."
            icon={BookOpen}
          >
            <EmptyState
              icon={SearchX}
              title={NOT_LINKED}
              description="Once your account is linked to a student record, the courses for your department and semester appear here."
            />
          </SectionCard>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label="Courses"
                value={busy ? 0 : list.length}
                icon={BookOpen}
                loading={busy}
              />
              <StatCard
                label="Total credits"
                value={busy ? 0 : credits}
                icon={Layers}
                loading={busy}
              />
              <StatCard
                label="Semester"
                value={sem !== null ? sem : "—"}
                icon={GraduationCap}
                loading={busy}
              />
            </div>

            <SectionCard
              title="Course List"
              description={
                busy
                  ? "Loading your courses…"
                  : `${list.length} course${list.length !== 1 ? "s" : ""} in your cohort`
              }
              icon={BookOpen}
            >
              {busy ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {[0, 1, 2].map((key) => (
                    <Skeleton key={key} className="h-40 w-full rounded-xl" />
                  ))}
                </div>
              ) : list.length ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((course, index) => (
                    <CourseCard key={getId(course._id || course.id) || index} course={course} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={SearchX}
                  title={hasCohort ? "No courses found" : "No cohort on your record"}
                  description={
                    hasCohort
                      ? `Nothing is scheduled for ${cohort} yet.`
                      : "Your record has no department or semester yet — contact your administrator."
                  }
                />
              )}
            </SectionCard>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default MyCourses;
