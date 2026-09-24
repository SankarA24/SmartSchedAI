import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  GraduationCap,
  Hash,
  IdCard,
  Layers,
  Mail,
  Plus,
  RefreshCw,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

// =====================================================
// /students — admin student management (U11)
//
// Re-skin only. The data flow is unchanged: students are read from
// `GET /api/students/` and written back with `POST /api/students/` /
// `PUT /api/students/:id` / `DELETE /api/students/:id`, with exactly the
// payload the inline form has always produced. Nothing new is fetched —
// every figure on this page is derived from that one response.
//
// What changed is the shape: a bento band (stats | students per department |
// cohort completeness) over the directory table, matching `Dashboard.jsx`
// and the other management pages. The table used to carry a hand-rolled
// Edit/Delete column and four separate one-value chips; those are now the
// shared row menu plus a compressed cohort cell, with the full record behind
// the row's "View" action so nothing is lost.
// =====================================================

const COHORT_FIELDS = ["department", "semester", "year", "academicYear"];

const emptyStudent = {
  name: "",
  registerNumber: "",
  email: "",
  department: "",
  semester: 1,
  year: 1,
  academicYear: new Date().getFullYear(),
  section: "A",
};

/**
 * A student is matched to a published timetable by department + semester +
 * year + academic year (see `matchesStudentGroup` on the backend). A record
 * missing one of those cannot be resolved to a single cohort, which is the
 * one thing on this page that genuinely needs attention.
 */
function hasCompleteCohort(student) {
  return COHORT_FIELDS.every((field) => {
    const value = student?.[field];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

/** "Computer Science · Sem 1 · Year 1 · 2026" */
function cohortKey(student) {
  return COHORT_FIELDS.map((field) => String(student?.[field] ?? "")).join("|");
}

function errorMessage(error, fallback) {
  const data = error?.response?.data;
  if (data && typeof data === "object" && typeof data.error === "string") return data.error;
  return error?.message || fallback;
}

// =====================================================
// STUDENT FORM (inline — same fields, same payload)
// =====================================================

function StudentForm({ initialData = null, onSubmit, onCancel, loading }) {
  const [formData, setFormData] = useState(emptyStudent);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || "",
        registerNumber: initialData.registerNumber || "",
        email: initialData.email || "",
        department: initialData.department || "",
        semester: initialData.semester ?? 1,
        year: initialData.year ?? 1,
        academicYear: initialData.academicYear ?? new Date().getFullYear(),
        section: initialData.section || "A",
      });
    } else {
      setFormData(emptyStudent);
    }
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "academicYear" ? Number(value) : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <p className="text-xs font-medium text-muted-foreground">Identity</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="student-name">Name *</Label>
            <Input
              id="student-name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., Priya Sharma"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="student-register">Register number *</Label>
            <Input
              id="student-register"
              name="registerNumber"
              value={formData.registerNumber}
              onChange={handleChange}
              placeholder="e.g., CS2026001"
              className="font-mono"
              required
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="student-email">Email *</Label>
            <Input
              id="student-email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="student@example.com"
              required
            />
            <p className="text-xs text-muted-foreground">
              Used to link this record to the student&rsquo;s login account.
            </p>
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <p className="text-xs font-medium text-muted-foreground">
          Cohort — decides which published timetable this student sees
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="student-department">Department *</Label>
            <Input
              id="student-department"
              name="department"
              value={formData.department}
              onChange={handleChange}
              placeholder="e.g., Computer Science"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="student-semester">Semester *</Label>
            <Select
              value={String(formData.semester)}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, semester: Number(value) }))
              }
            >
              <SelectTrigger id="student-semester" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 8 }, (_, i) => i + 1).map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    Semester {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="student-year">Year *</Label>
            <Select
              value={String(formData.year)}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, year: Number(value) }))
              }
            >
              <SelectTrigger id="student-year" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    Year {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="student-academic-year">Academic year *</Label>
            <Input
              id="student-academic-year"
              type="number"
              name="academicYear"
              value={formData.academicYear}
              onChange={handleChange}
              required
              min="2020"
              max="2035"
              className="tabular-nums"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="student-section">Section</Label>
            <Input
              id="student-section"
              name="section"
              value={formData.section}
              onChange={handleChange}
              placeholder="A"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : initialData ? "Update student" : "Add student"}
        </Button>
      </div>
    </form>
  );
}

// =====================================================
// STUDENTS PAGE
// =====================================================

export default function StudentsPage() {
  const { brand, nav, quickActions } = navForRole("admin");

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);

  const [viewingStudent, setViewingStudent] = useState(null);
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/students/");
      setStudents(Array.isArray(res.data) ? res.data : []);
      setError("");
    } catch (requestError) {
      console.error("Failed to fetch students:", requestError);
      setStudents([]);
      setError(errorMessage(requestError, "Unable to load students."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleCreateStudent = async (studentData) => {
    setFormLoading(true);
    try {
      await api.post("/students/", studentData);
      setShowForm(false);
      setEditingStudent(null);
      setError("");
      fetchStudents();
    } catch (requestError) {
      console.error("Failed to create student:", requestError);
      setError(errorMessage(requestError, "Unable to save that student."));
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateStudent = async (id, studentData) => {
    setFormLoading(true);
    try {
      await api.put(`/students/${id}`, studentData);
      setEditingStudent(null);
      setShowForm(false);
      setError("");
      fetchStudents();
    } catch (requestError) {
      console.error("Failed to update student:", requestError);
      setError(errorMessage(requestError, "Unable to save that student."));
    } finally {
      setFormLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!studentToDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/students/${studentToDelete._id}`);
      if (editingStudent && editingStudent._id === studentToDelete._id) {
        setEditingStudent(null);
        setShowForm(false);
      }
      if (viewingStudent && viewingStudent._id === studentToDelete._id) {
        setViewingStudent(null);
      }
      setError("");
      await fetchStudents();
      setStudentToDelete(null);
    } catch (requestError) {
      console.error("Failed to delete student:", requestError);
      setError(errorMessage(requestError, "Unable to delete that student."));
      setStudentToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  // ---------------------------------------------------
  // Derived figures — all of them off the one /students response
  // ---------------------------------------------------
  const stats = useMemo(() => {
    const departments = new Set(
      students.map((student) => student?.department).filter(Boolean)
    );
    const cohorts = new Set(students.filter(hasCompleteCohort).map(cohortKey));
    const sections = new Set(
      students.map((student) => student?.section).filter(Boolean)
    );
    return {
      departments: departments.size,
      cohorts: cohorts.size,
      sections: sections.size,
    };
  }, [students]);

  /** Head count per department — the biggest first. */
  const byDepartment = useMemo(() => {
    const totals = new Map();

    for (const student of students) {
      const name = String(student?.department || "Unassigned");
      const current = totals.get(name) || { name, people: 0, sections: new Set() };
      current.people += 1;
      if (student?.section) current.sections.add(student.section);
      totals.set(name, current);
    }

    const rows = [...totals.values()]
      .map((row) => ({ name: row.name, people: row.people, sections: row.sections.size }))
      .sort((a, b) => b.people - a.people);
    const max = Math.max(1, ...rows.map((row) => row.people));
    return rows.map((row) => ({ ...row, share: Math.round((row.people / max) * 100) }));
  }, [students]);

  const cohortHealth = useMemo(() => {
    const complete = students.filter(hasCompleteCohort).length;
    return {
      complete,
      missing: students.length - complete,
      percent: students.length ? Math.round((complete / students.length) * 100) : 0,
    };
  }, [students]);

  const hasData = students.length > 0;

  const columns = [
    {
      key: "name",
      label: "Student",
      sortable: true,
      render: (student) => (
        <div className="min-w-0 space-y-1">
          <div className="font-medium text-foreground">{student.name}</div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Mail className="size-3.5 shrink-0" />
            <span className="truncate">{student.email}</span>
          </div>
        </div>
      ),
    },
    {
      key: "registerNumber",
      label: "Register no.",
      sortable: true,
      render: (student) => (
        <div className="font-mono text-sm text-foreground">{student.registerNumber}</div>
      ),
    },
    {
      key: "department",
      label: "Department",
      sortable: true,
      render: (student) => (
        <div className="min-w-0 truncate text-foreground">{student.department}</div>
      ),
    },
    {
      key: "cohort",
      label: "Cohort",
      render: (student) =>
        hasCompleteCohort(student) ? (
          <div className="flex flex-wrap gap-1">
            <StatusBadge variant="neutral">Sem {student.semester}</StatusBadge>
            <StatusBadge variant="neutral">Year {student.year}</StatusBadge>
            <StatusBadge variant="neutral" className="tabular-nums">
              {student.academicYear}
            </StatusBadge>
          </div>
        ) : (
          <StatusBadge variant="warning">Incomplete</StatusBadge>
        ),
    },
    {
      key: "section",
      label: "Section",
      render: (student) => (
        <StatusBadge variant="neutral">{student.section || "A"}</StatusBadge>
      ),
    },
  ];

  return (
    <AppShell brand={brand} nav={nav} quickActions={quickActions}>
      <PageHeader
        title="Students"
        description="Manage student records and the cohort each one is scheduled with."
        actions={
          <>
            <Button variant="outline" onClick={fetchStudents} disabled={loading}>
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button
              onClick={() => {
                setEditingStudent(null);
                setShowForm((open) => !open);
              }}
            >
              <Plus className="size-4" />
              Add Student
            </Button>
          </>
        }
      />

      <div className="space-y-5">
        {error && (
          <Callout tone="destructive" title="Something went wrong">
            {error}
          </Callout>
        )}

        {/* ============ Band 1 — the bento ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/* ---- Headline figures ---- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-5">
            <StatCard
              label="Students"
              value={error ? "—" : students.length}
              icon={GraduationCap}
              loading={loading}
            />
            <StatCard
              label="Departments"
              value={error ? "—" : stats.departments}
              icon={Building2}
              loading={loading}
            />
            <StatCard
              label="Cohorts"
              value={error ? "—" : stats.cohorts}
              icon={Layers}
              loading={loading}
            />
            <StatCard
              label="Sections"
              value={error ? "—" : stats.sections}
              icon={Hash}
              loading={loading}
            />
          </div>

          {/* ---- Head count by department ---- */}
          <SectionCard
            title="By department"
            description="Registered students, largest first"
            icon={Building2}
            className="xl:col-span-4"
          >
            {loading && !hasData ? (
              <div className="space-y-4">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))}
              </div>
            ) : byDepartment.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {error
                  ? "Departments cannot be summarised while students are unavailable."
                  : "Add a student and their department appears here."}
              </p>
            ) : (
              <ul className="space-y-4">
                {byDepartment.slice(0, 5).map((row) => (
                  <li key={row.name} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm text-foreground">
                        {row.name}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {row.people} · {row.sections} sec
                      </span>
                    </div>
                    <Progress value={row.share} />
                  </li>
                ))}
                {byDepartment.length > 5 && (
                  <li className="text-xs text-muted-foreground tabular-nums">
                    +{byDepartment.length - 5} more in the table below
                  </li>
                )}
              </ul>
            )}
          </SectionCard>

          {/* ---- Cohort completeness ---- */}
          <SectionCard
            title="Cohort mapping"
            description="Students matched to one timetable"
            icon={Layers}
            className="xl:col-span-3"
          >
            {loading && !hasData ? (
              <div className="space-y-3">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : !hasData ? (
              <p className="text-sm text-muted-foreground">
                {error
                  ? "Cohorts cannot be checked right now."
                  : "No students registered yet."}
              </p>
            ) : (
              <div className="space-y-3">
                <p className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {cohortHealth.complete}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    of {students.length}
                  </span>
                </p>
                <Progress value={cohortHealth.percent} />
                {cohortHealth.missing > 0 ? (
                  <div className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                    {cohortHealth.missing} missing a department, semester, year or academic
                    year cannot be matched to a published timetable.
                  </div>
                ) : (
                  <div className="rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
                    Every student carries a complete cohort.
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ============ Band 2 — the form, when open ============ */}
        {showForm && (
          <SectionCard
            title={editingStudent ? "Edit student" : "Add a new student"}
            description="Department, semester, year and academic year decide which timetable this student is shown."
            icon={Plus}
            className="animate-in fade-in duration-200"
          >
            <StudentForm
              initialData={editingStudent}
              onSubmit={(data) => {
                if (editingStudent) {
                  handleUpdateStudent(editingStudent._id, data);
                } else {
                  handleCreateStudent(data);
                }
              }}
              onCancel={() => {
                setShowForm(false);
                setEditingStudent(null);
              }}
              loading={formLoading}
            />
          </SectionCard>
        )}

        {/* ============ Band 3 — the directory ============ */}
        <SectionCard
          title="All students"
          description={
            error
              ? "The directory could not be loaded."
              : `${students.length} student${students.length === 1 ? "" : "s"} registered.`
          }
          icon={GraduationCap}
        >
          <DataTable
            data={students}
            columns={columns}
            searchKey="name"
            loading={loading}
            entityName="students"
            onView={(student) => setViewingStudent(student)}
            onEdit={(student) => {
              setEditingStudent(student);
              setShowForm(true);
            }}
            onDelete={(student) => setStudentToDelete(student)}
            empty={
              error
                ? {
                    icon: GraduationCap,
                    title: "Students unavailable",
                    description: "The list could not be loaded. Refresh to try again.",
                    action: (
                      <Button variant="outline" onClick={fetchStudents}>
                        <RefreshCw className="size-4" />
                        Refresh
                      </Button>
                    ),
                  }
                : {
                    icon: GraduationCap,
                    title: "No students yet",
                    description:
                      "Add a student so their cohort's published timetable has somebody to reach.",
                  }
            }
          />
        </SectionCard>
      </div>

      {/* ====== Details — the full record the table compresses ====== */}
      <Dialog
        open={Boolean(viewingStudent)}
        onOpenChange={(open) => {
          if (!open) setViewingStudent(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewingStudent?.name}</DialogTitle>
            <DialogDescription>
              {[viewingStudent?.registerNumber, viewingStudent?.department]
                .filter(Boolean)
                .join(" · ")}
            </DialogDescription>
          </DialogHeader>

          {viewingStudent && (
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Contact</p>
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Mail className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{viewingStudent.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <IdCard className="size-4 shrink-0 text-muted-foreground" />
                  <span className="font-mono">{viewingStudent.registerNumber}</span>
                </div>
                {viewingStudent.phone && (
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {viewingStudent.phone}
                  </p>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Cohort</p>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Department</dt>
                    <dd className="text-foreground">{viewingStudent.department || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Section</dt>
                    <dd className="text-foreground">{viewingStudent.section || "A"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Semester</dt>
                    <dd className="text-foreground tabular-nums">
                      {viewingStudent.semester ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Year</dt>
                    <dd className="text-foreground tabular-nums">
                      {viewingStudent.year ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Academic year</dt>
                    <dd className="text-foreground tabular-nums">
                      {viewingStudent.academicYear ?? "—"}
                    </dd>
                  </div>
                </dl>
                {!hasCompleteCohort(viewingStudent) && (
                  <div className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                    Without a department, semester, year and academic year this student
                    cannot be matched to a published timetable.
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingStudent(viewingStudent);
                    setShowForm(true);
                    setViewingStudent(null);
                  }}
                >
                  Edit
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(studentToDelete)}
        onOpenChange={(open) => {
          if (!open) setStudentToDelete(null);
        }}
        title="Delete this student?"
        description={
          studentToDelete
            ? `"${studentToDelete.name}" (${studentToDelete.registerNumber}) will be removed permanently. Their login account is not deleted with this record.`
            : ""
        }
        confirmLabel="Delete student"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </AppShell>
  );
}
