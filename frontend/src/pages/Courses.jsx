import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  BookOpen,
  Clock,
  FlaskConical,
  Layers,
  Plus,
  X,
} from "lucide-react";

import api from "@/lib/api";
import { navForRole } from "@/lib/nav";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatCard } from "@/components/common/StatCard";
import { SectionCard } from "@/components/common/SectionCard";
import { Callout } from "@/components/common/Callout";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { DataTable } from "@/components/Data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

// =====================================================
// /courses — admin course management (sibling of /rooms)
//
// Re-skin only: the data flow is unchanged. Courses are read from
// `GET /api/courses/` and written back with `POST /api/courses/`,
// `PUT /api/courses/:id` and `DELETE /api/courses/:id`, with the same payload
// shape the page always sent (the numeric fields coerced with Number(),
// prerequisites as an array of strings — see `backend/models/Course.js`).
//
// What changed is the chrome. The page now follows the Dashboard's bento
// rhythm: a stat row and a department breakdown share one band, then the
// table gets the full-width cell it needs. The add/edit form is inline here
// (the same pattern `Students.jsx` already uses) instead of the glass-effect
// `components/CourseForm.jsx`, which is a shared component this
// page is not allowed to edit and whose white-on-glass fields are illegible
// in the light theme. Every colour on this page is a design token.
// =====================================================

/** Matches the `type` enum on the Course model. */
const COURSE_TYPES = [
  { value: "lecture", label: "Lecture" },
  { value: "lab", label: "Laboratory" },
  { value: "seminar", label: "Seminar" },
];

/**
 * chart-1..8 are FILL colours for data series only — a dot or a bar, never a
 * text background. Assigned in order so a department keeps its colour.
 */
const SERIES_FILL = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-chart-6",
  "bg-chart-7",
  "bg-chart-8",
];

/**
 * Bucketed bar widths. The page carries no inline styles, so a proportional
 * bar is rounded to twelfths and picked from these fixed classes.
 */
const BAR_WIDTHS = [
  "w-0",
  "w-1/12",
  "w-2/12",
  "w-3/12",
  "w-4/12",
  "w-5/12",
  "w-6/12",
  "w-7/12",
  "w-8/12",
  "w-9/12",
  "w-10/12",
  "w-11/12",
  "w-full",
];

function barWidth(value, max) {
  if (!value || max <= 0) return BAR_WIDTHS[0];
  const twelfths = Math.round((value / max) * 12);
  return BAR_WIDTHS[Math.min(Math.max(twelfths, 1), 12)];
}

/** "lab" -> "Laboratory", anything unexpected -> title case. */
function prettyType(type) {
  const known = COURSE_TYPES.find((item) => item.value === type);
  if (known) return known.label;
  return String(type || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function emptyForm() {
  return {
    code: "",
    name: "",
    department: "",
    credits: 3,
    semester: 1,
    year: 1,
    academicYear: new Date().getFullYear(),
    description: "",
    prerequisites: [],
    type: "lecture",
    hoursPerWeek: 3,
  };
}

const NUMERIC_FIELDS = ["credits", "semester", "year", "academicYear", "hoursPerWeek"];

export default function CoursesPage() {
  const { brand, nav, quickActions } = navForRole("admin");

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [prerequisiteInput, setPrerequisiteInput] = useState("");

  const [courseToDelete, setCourseToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const resetForm = () => {
    setFormData(emptyForm());
    setPrerequisiteInput("");
    setEditingCourse(null);
  };

  // Fetch courses from backend
  const fetchCourses = async () => {
    try {
      setLoading(true);
      const res = await api.get("/courses/");
      setCourses(Array.isArray(res.data) ? res.data : []);
      setError("");
    } catch (err) {
      console.error("Failed to fetch courses:", err);
      setCourses([]);
      setError("Unable to load courses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const handleEditCourse = (course) => {
    setFormData({
      code: course.code || "",
      name: course.name || "",
      department: course.department || "",
      credits: course.credits ?? 3,
      semester: course.semester ?? 1,
      year: course.year ?? 1,
      academicYear: course.academicYear ?? new Date().getFullYear(),
      description: course.description || "",
      prerequisites: course.prerequisites || [],
      type: course.type || "lecture",
      hoursPerWeek: course.hoursPerWeek ?? 3,
    });
    setPrerequisiteInput("");
    setEditingCourse(course);
    setShowForm(true);
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: NUMERIC_FIELDS.includes(name) ? Number(value) : value,
    }));
  };

  const addPrerequisite = () => {
    const next = prerequisiteInput.trim();
    if (!next || formData.prerequisites.includes(next)) return;
    setFormData((prev) => ({ ...prev, prerequisites: [...prev.prerequisites, next] }));
    setPrerequisiteInput("");
  };

  const removePrerequisite = (prerequisite) => {
    setFormData((prev) => ({
      ...prev,
      prerequisites: prev.prerequisites.filter((item) => item !== prerequisite),
    }));
  };

  // Create or update — same endpoints and same payload as before.
  const handleSubmitCourse = async (event) => {
    event.preventDefault();
    setFormLoading(true);

    try {
      if (editingCourse) {
        await api.put(`/courses/${editingCourse._id}`, formData);
      } else {
        await api.post("/courses/", formData);
      }

      resetForm();
      setShowForm(false);
      setError("");
      fetchCourses();
    } catch (requestError) {
      console.error("Failed to save course:", requestError);
      setError(requestError?.response?.data?.error || "Unable to save that course.");
    } finally {
      setFormLoading(false);
    }
  };

  const confirmDeleteCourse = async () => {
    if (!courseToDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/courses/${courseToDelete._id}`);
      // if deleting the currently editing course, clear form
      if (editingCourse && editingCourse._id === courseToDelete._id) {
        resetForm();
        setShowForm(false);
      }
      setError("");
      await fetchCourses();
      setCourseToDelete(null);
    } catch (requestError) {
      console.error("Failed to delete course:", requestError);
      setError(requestError?.response?.data?.error || "Unable to delete that course.");
      setCourseToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  // ---------------------------------------------------
  // Derived figures — all of them off the same response
  // ---------------------------------------------------
  const stats = useMemo(() => {
    const credits = courses.reduce((total, course) => total + (Number(course.credits) || 0), 0);
    const hours = courses.reduce(
      (total, course) => total + (Number(course.hoursPerWeek) || 0),
      0
    );
    const labs = courses.filter(
      (course) => String(course.type || "").toLowerCase() === "lab"
    ).length;
    const departments = new Set(
      courses.map((course) => course.department).filter(Boolean)
    ).size;
    return { credits, hours, labs, departments };
  }, [courses]);

  const byDepartment = useMemo(() => {
    const counts = new Map();
    for (const course of courses) {
      const key = String(course?.department || "").trim() || "Unassigned";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
      .slice(0, SERIES_FILL.length);
  }, [courses]);

  const departmentMax = byDepartment[0]?.value || 0;

  const columns = [
    {
      key: "code",
      label: "Code",
      sortable: true,
      render: (course) => (
        <div className="font-mono text-sm whitespace-nowrap text-foreground">{course.code}</div>
      ),
    },
    {
      key: "name",
      label: "Course",
      sortable: true,
      render: (course) => (
        <div className="min-w-0 max-w-xs space-y-0.5">
          <div className="truncate text-sm font-medium text-foreground">{course.name}</div>
          {course.description ? (
            <div className="truncate text-xs text-muted-foreground">{course.description}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "department",
      label: "Department",
      sortable: true,
      render: (course) => (
        <div className="text-sm text-muted-foreground">{course.department}</div>
      ),
    },
    {
      key: "type",
      label: "Type",
      sortable: true,
      render: (course) => <StatusBadge variant="neutral">{prettyType(course.type)}</StatusBadge>,
    },
    {
      key: "credits",
      label: "Load",
      sortable: true,
      render: (course) => (
        <div className="whitespace-nowrap text-sm text-foreground tabular-nums">
          {course.credits} cr
          <span className="text-muted-foreground"> · {course.hoursPerWeek} h/wk</span>
        </div>
      ),
    },
    {
      key: "cohort",
      label: "Cohort",
      render: (course) => (
        <div className="space-y-0.5 whitespace-nowrap">
          <div className="text-sm text-foreground tabular-nums">
            Sem {course.semester} · Year {course.year}
          </div>
          {course.academicYear ? (
            <div className="text-xs text-muted-foreground tabular-nums">
              AY {course.academicYear}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "prerequisites",
      label: "Prerequisites",
      render: (course) => {
        const prerequisites = course.prerequisites || [];
        if (prerequisites.length === 0) {
          return <span className="text-sm text-muted-foreground">None</span>;
        }
        return (
          <div className="flex max-w-40 flex-wrap gap-1">
            {prerequisites.slice(0, 2).map((prerequisite, index) => (
              <StatusBadge key={index} variant="neutral">
                {prerequisite}
              </StatusBadge>
            ))}
            {prerequisites.length > 2 && (
              <StatusBadge variant="neutral">+{prerequisites.length - 2}</StatusBadge>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <AppShell
      brand={brand}
      nav={nav}
      quickActions={quickActions}
      header={{ settingsPath: "/infrastructure" }}
    >
      <PageHeader
        title="Courses"
        description="The catalogue the scheduler builds from — credits, contact hours and the cohort each course belongs to."
        actions={
          <Button
            onClick={() => {
              resetForm();
              setShowForm((open) => !open);
            }}
          >
            <Plus className="size-4" />
            Add Course
          </Button>
        }
      />

      <div className="space-y-5">
        {error && (
          <Callout tone="destructive" title="Something went wrong">
            {error}
          </Callout>
        )}

        {/* ============ Band 1 — stats (8) + department mix (4) ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-8">
            <StatCard label="Courses" value={courses.length} icon={BookOpen} loading={loading} />
            <StatCard
              label="Departments"
              value={stats.departments}
              icon={Building2}
              loading={loading}
            />
            <StatCard
              label="Contact hours / week"
              value={stats.hours}
              icon={Clock}
              tone="success"
              loading={loading}
            />
            <StatCard
              label="Lab courses"
              value={stats.labs}
              icon={FlaskConical}
              tone="warning"
              loading={loading}
            />
          </div>

          <SectionCard
            title="By department"
            description={
              loading
                ? "Reading the catalogue…"
                : `${stats.credits} credit${stats.credits === 1 ? "" : "s"} across ${courses.length} course${courses.length === 1 ? "" : "s"}`
            }
            icon={Layers}
            className="xl:col-span-4"
          >
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-4/5" />
                <Skeleton className="h-5 w-3/5" />
              </div>
            ) : byDepartment.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {error
                  ? "The catalogue could not be read, so there is nothing to break down."
                  : "Add a course and its department appears here."}
              </p>
            ) : (
              <ul className="space-y-3">
                {byDepartment.map((row, index) => (
                  <li key={row.name} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`size-2 shrink-0 rounded-full ${SERIES_FILL[index % SERIES_FILL.length]}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {row.name}
                      </span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {row.value}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${SERIES_FILL[index % SERIES_FILL.length]} ${barWidth(
                          row.value,
                          departmentMax
                        )}`}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        {/* ============ Add / edit form ============ */}
        {showForm && (
          <SectionCard
            title={editingCourse ? "Edit course" : "Add a new course"}
            description="Credits, contact hours and the cohort decide how the scheduler places this course."
            icon={BookOpen}
            className="animate-in fade-in duration-200"
          >
            <form onSubmit={handleSubmitCourse} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="course-code">Course code *</Label>
                  <Input
                    id="course-code"
                    name="code"
                    placeholder="e.g. CS101"
                    value={formData.code}
                    onChange={handleFieldChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="course-department">Department *</Label>
                  <Input
                    id="course-department"
                    name="department"
                    placeholder="e.g. Computer Science"
                    value={formData.department}
                    onChange={handleFieldChange}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="course-name">Course name *</Label>
                <Input
                  id="course-name"
                  name="name"
                  placeholder="e.g. Introduction to Programming"
                  value={formData.name}
                  onChange={handleFieldChange}
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="course-credits">Credits *</Label>
                  <Input
                    id="course-credits"
                    type="number"
                    name="credits"
                    min="1"
                    max="10"
                    value={formData.credits}
                    onChange={handleFieldChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="course-hours">Hours per week *</Label>
                  <Input
                    id="course-hours"
                    type="number"
                    name="hoursPerWeek"
                    min="1"
                    max="40"
                    value={formData.hoursPerWeek}
                    onChange={handleFieldChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="course-type">Type *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, type: value }))
                    }
                  >
                    <SelectTrigger id="course-type" className="w-full">
                      <SelectValue placeholder="Select a type" />
                    </SelectTrigger>
                    <SelectContent>
                      {COURSE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="course-semester">Semester *</Label>
                  <Select
                    value={String(formData.semester)}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, semester: Number(value) }))
                    }
                  >
                    <SelectTrigger id="course-semester" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 8 }, (_, index) => index + 1).map((semester) => (
                        <SelectItem key={semester} value={String(semester)}>
                          Semester {semester}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="course-year">Year *</Label>
                  <Select
                    value={String(formData.year)}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, year: Number(value) }))
                    }
                  >
                    <SelectTrigger id="course-year" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map((year) => (
                        <SelectItem key={year} value={String(year)}>
                          Year {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="course-academic-year">Academic year *</Label>
                  <Input
                    id="course-academic-year"
                    type="number"
                    name="academicYear"
                    min="2020"
                    max="2030"
                    value={formData.academicYear}
                    onChange={handleFieldChange}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="course-description">Description</Label>
                <Textarea
                  id="course-description"
                  name="description"
                  rows={3}
                  placeholder="What this course covers."
                  value={formData.description}
                  onChange={handleFieldChange}
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="course-prerequisite">Prerequisites</Label>

                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Input
                      id="course-prerequisite"
                      placeholder="Enter a course code, then add it"
                      value={prerequisiteInput}
                      onChange={(event) => setPrerequisiteInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addPrerequisite();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={addPrerequisite}
                    >
                      <Plus className="size-4" />
                      Add
                    </Button>
                  </div>

                  {formData.prerequisites.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {formData.prerequisites.map((prerequisite) => (
                        <span
                          key={prerequisite}
                          className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground"
                        >
                          {prerequisite}
                          <button
                            type="button"
                            onClick={() => removePrerequisite(prerequisite)}
                            aria-label={`Remove prerequisite ${prerequisite}`}
                            className="text-muted-foreground transition-colors hover:text-destructive"
                          >
                            <X className="size-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button type="submit" disabled={formLoading}>
                  {formLoading ? "Saving..." : editingCourse ? "Update course" : "Save course"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    setShowForm(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </SectionCard>
        )}

        {/* ============ Band 2 — the catalogue ============ */}
        <SectionCard
          title="All courses"
          description={`${courses.length} course${courses.length === 1 ? "" : "s"} registered in the system.`}
          icon={BookOpen}
        >
          <DataTable
            data={courses}
            columns={columns}
            searchKey="name"
            loading={loading}
            entityName="courses"
            onEdit={handleEditCourse}
            onDelete={(course) => setCourseToDelete(course)}
            empty={{
              icon: BookOpen,
              title: error ? "Courses unavailable" : "No courses yet",
              description: error
                ? "The catalogue could not be loaded. Reload the page to try again."
                : "Add a course so the scheduler has something to place on the grid.",
            }}
          />
        </SectionCard>
      </div>

      <ConfirmDialog
        open={Boolean(courseToDelete)}
        onOpenChange={(open) => {
          if (!open) setCourseToDelete(null);
        }}
        title="Delete this course?"
        description={
          courseToDelete
            ? `"${courseToDelete.name}" will be removed permanently. Timetables that already schedule it will need regenerating.`
            : ""
        }
        confirmLabel="Delete course"
        destructive
        loading={deleting}
        onConfirm={confirmDeleteCourse}
      />
    </AppShell>
  );
}
