import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  Clock,
  GraduationCap,
  Layers,
  SearchX,
} from "lucide-react";

import client from "@/lib/api";
import { navForRole } from "@/lib/nav";
import { useIdentity } from "@/hooks/useIdentity";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Callout } from "@/components/common/Callout";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// =====================================================
// /student-portal/courses — the student's own course list (U9 re-skin,
// re-laid out as a bento to match the admin Dashboard and the faculty
// courses page).
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
//
// Layout:
//   Band 1 — course cards (8/12) | cohort stats + cohort card + mix (4/12)
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

/**
 * Eight fixed bar widths for the course-mix rows. Bucketed classes rather
 * than a computed width because the page carries no inline styles — the
 * same pattern the dashboard's occupancy heat row uses.
 */
const BAR_WIDTHS = [
  "w-[10%]",
  "w-1/5",
  "w-[30%]",
  "w-2/5",
  "w-1/2",
  "w-2/3",
  "w-4/5",
  "w-full",
];

function barWidth(value, max) {
  if (!value || max <= 0) return BAR_WIDTHS[0];
  const bucket = Math.ceil((value / max) * BAR_WIDTHS.length) - 1;
  return BAR_WIDTHS[Math.min(Math.max(bucket, 0), BAR_WIDTHS.length - 1)];
}

const numberOrDash = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "—";
};

/** One labelled tile inside a course card. Matches the faculty treatment. */
function Fact({ label, value, numeric = false }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={
          numeric
            ? "mt-1 text-sm text-foreground tabular-nums"
            : "mt-1 truncate text-sm text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}

/** One row of the cohort card. */
function CohortRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

/** One course, as a card — the faculty courses card, with student facts. */
function CourseCard({ course }) {
  const title = course.name || course.title || course.courseName || "Course";
  const code = course.code || course.courseCode || null;
  const type = course.type || course.courseType || null;
  const prerequisites = Array.isArray(course.prerequisites)
    ? course.prerequisites.filter(Boolean)
    : [];

  return (
    <SectionCard
      icon={BookOpen}
      title={title}
      description={code || "No course code"}
      className="transition-colors hover:border-primary/40"
      actions={
        type ? <StatusBadge className="capitalize">{String(type)}</StatusBadge> : null
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3">
          <Fact label="Credits" value={numberOrDash(course.credits)} numeric />
          <Fact label="Hours per week" value={numberOrDash(course.hoursPerWeek)} numeric />
          <Fact label="Semester" value={numberOrDash(course.semester)} numeric />
          <Fact
            label="Academic year"
            value={course.academicYear ?? course.year ?? "Not specified"}
          />
        </dl>

        {course.description && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {course.description}
          </p>
        )}

        {prerequisites.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">Prerequisites</span>
            {prerequisites.map((item) => (
              <StatusBadge key={String(item)}>{String(item)}</StatusBadge>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
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

  const weeklyHours = useMemo(
    () =>
      list.reduce((total, course) => {
        const value = Number(course.hoursPerWeek);
        return Number.isFinite(value) ? total + value : total;
      }, 0),
    [list]
  );

  /**
   * Courses by type, in a stable order so the rows never reshuffle between
   * renders. Only types the cohort actually contains are listed — an empty
   * category is not invented.
   */
  const mix = useMemo(() => {
    const counts = new Map();
    for (const course of list) {
      const key = String(course.type || course.courseType || "unspecified").toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const order = ["lecture", "lab", "seminar"];
    const rows = [...counts.entries()].sort((a, b) => {
      const left = order.indexOf(a[0]);
      const right = order.indexOf(b[0]);
      if (left !== right) return (left < 0 ? order.length : left) - (right < 0 ? order.length : right);
      return a[0].localeCompare(b[0]);
    });
    const max = rows.reduce((peak, [, value]) => Math.max(peak, value), 0);
    return { rows, max };
  }, [list]);

  const cohort = [
    dept,
    sem !== null ? `Semester ${sem}` : null,
    year !== null ? `Year ${year}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const { brand, nav, quickActions } = navForRole("student");
  const busy = identityLoading || loading;
  // A failed fetch must never read as a zero: the figures fall back to an
  // em dash and the list renders an empty state, with the Callout above.
  const failed = Boolean(error);
  const figure = (value) => (failed ? "—" : value);

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
        actions={
          <Button variant="outline" asChild>
            <Link to="/student-portal/timetable">
              <CalendarDays className="size-4" />
              View timetable
            </Link>
          </Button>
        }
      />

      <div className="space-y-5">
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
            title="Course list"
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
          <div className="grid gap-5 xl:grid-cols-12">
            {/* ---- The cohort's courses: the page's primary cell ---- */}
            <SectionCard
              title="Course list"
              description={
                busy
                  ? "Loading your courses…"
                  : failed
                    ? "The catalogue could not be reached"
                    : `${list.length} course${list.length !== 1 ? "s" : ""} in your cohort`
              }
              icon={BookOpen}
              className="xl:col-span-8"
              actions={
                busy || failed ? null : (
                  <StatusBadge className="tabular-nums">{list.length}</StatusBadge>
                )
              }
            >
              {busy ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {[0, 1, 2, 3].map((key) => (
                    <Skeleton key={key} className="h-56 w-full rounded-xl" />
                  ))}
                </div>
              ) : failed ? (
                <EmptyState
                  icon={SearchX}
                  title="Courses unavailable"
                  description="The course list could not be loaded. Reload the page to try again."
                />
              ) : list.length ? (
                <div className="grid gap-4 md:grid-cols-2">
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

            {/* ---- The smaller cells: the numbers behind that list ---- */}
            <div className="flex flex-col gap-5 xl:col-span-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <StatCard
                  label="Courses"
                  value={figure(list.length)}
                  icon={BookOpen}
                  loading={busy}
                />
                <StatCard
                  label="Total credits"
                  value={figure(credits)}
                  icon={Layers}
                  loading={busy}
                />
                <StatCard
                  label="Hours per week"
                  value={figure(weeklyHours)}
                  icon={Clock}
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
                title="Your cohort"
                description="Every course here is scoped to this record."
                icon={GraduationCap}
              >
                {busy ? (
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-4/5" />
                    <Skeleton className="h-5 w-2/3" />
                  </div>
                ) : (
                  <dl className="divide-y divide-border">
                    <CohortRow label="Department" value={dept || "Not on your record"} />
                    <CohortRow
                      label="Semester"
                      value={sem !== null ? String(sem) : "Not on your record"}
                    />
                    <CohortRow
                      label="Year"
                      value={year !== null ? String(year) : "Not on your record"}
                    />
                  </dl>
                )}
              </SectionCard>

              <SectionCard
                title="Course mix"
                description="How your courses split by type."
                icon={Layers}
              >
                {busy ? (
                  <div className="space-y-4">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : mix.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {failed
                      ? "No breakdown while the course list is unavailable."
                      : "Nothing to summarise yet."}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {mix.rows.map(([key, value]) => (
                      <div key={key} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm capitalize text-foreground">
                            {key}
                          </span>
                          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                            {value}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full bg-primary ${barWidth(value, mix.max)}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default MyCourses;
