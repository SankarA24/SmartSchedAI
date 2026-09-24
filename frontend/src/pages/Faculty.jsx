import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookMarked,
  CalendarCheck,
  Clock,
  GraduationCap,
  Mail,
  Plus,
  RefreshCw,
  Users,
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
import { FacultyForm } from "@/components/Faculty-Form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

// =====================================================
// /faculty — admin faculty management (U10)
//
// Re-skin only. The data flow is unchanged: faculty are read from
// `GET /api/faculty` and written back with `POST /api/faculty` /
// `PUT /api/faculty/:id` / `DELETE /api/faculty/:id`, with the same payload
// `FacultyForm` has always produced. Nothing new is fetched — every figure on
// this page is derived from that one response.
//
// What changed is the shape: a bento band (stats | capacity by department |
// availability health) over the directory table, matching `Dashboard.jsx`.
// The table used to spill raw availability windows and preference lists into
// two multi-line columns; those are now compressed into chips, with the full
// detail behind the row's "View" action so nothing is lost.
// =====================================================

const WEEK_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** "monday" -> "Mon" */
function shortDay(day) {
  return String(day).slice(0, 3).replace(/^\w/, (letter) => letter.toUpperCase());
}

/** "monday" -> "Monday" */
function prettyDay(day) {
  return String(day).replace(/^\w/, (letter) => letter.toUpperCase());
}

/** Days this member has at least one availability window on, in week order. */
function availableDays(member) {
  const availability = member?.availability || {};
  return WEEK_DAYS.filter((day) => (availability[day] || []).length > 0);
}

function errorMessage(error, fallback) {
  const data = error?.response?.data;
  if (data && typeof data === "object" && typeof data.error === "string") return data.error;
  return error?.message || fallback;
}

export default function FacultyPage() {
  const { brand, nav, quickActions } = navForRole("admin");

  const [faculty, setFaculty] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [editingFaculty, setEditingFaculty] = useState(null);

  const [viewingFaculty, setViewingFaculty] = useState(null);
  const [facultyToDelete, setFacultyToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchFaculty = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/faculty");
      setFaculty(Array.isArray(res.data) ? res.data : []);
      setError("");
    } catch (requestError) {
      console.error(requestError);
      setFaculty([]);
      setError(errorMessage(requestError, "Unable to load faculty."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFaculty();
  }, [fetchFaculty]);

  const handleCreateFaculty = async (data) => {
    setFormLoading(true);
    try {
      if (editingFaculty) {
        await api.put(`/faculty/${editingFaculty._id}`, data);
      } else {
        await api.post("/faculty", data);
      }
      setShowForm(false);
      setEditingFaculty(null);
      setError("");
      fetchFaculty();
    } catch (requestError) {
      console.error(requestError);
      setError(errorMessage(requestError, "Unable to save that faculty member."));
    } finally {
      setFormLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!facultyToDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/faculty/${facultyToDelete._id}`);
      if (editingFaculty && editingFaculty._id === facultyToDelete._id) {
        setEditingFaculty(null);
        setShowForm(false);
      }
      if (viewingFaculty && viewingFaculty._id === facultyToDelete._id) {
        setViewingFaculty(null);
      }
      setError("");
      await fetchFaculty();
      setFacultyToDelete(null);
    } catch (requestError) {
      console.error(requestError);
      setError(errorMessage(requestError, "Unable to delete that faculty member."));
      setFacultyToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  // ---------------------------------------------------
  // Derived figures — all of them off the one /faculty response
  // ---------------------------------------------------
  const stats = useMemo(() => {
    const departments = new Set(
      faculty.map((member) => member?.department).filter(Boolean)
    );
    const specializations = new Set(
      faculty.flatMap((member) => member?.specialization || []).filter(Boolean)
    );
    const capacity = faculty.reduce(
      (total, member) => total + (Number(member?.maxHoursPerWeek) || 0),
      0
    );
    return {
      departments: departments.size,
      specializations: specializations.size,
      capacity,
    };
  }, [faculty]);

  /** Teaching capacity per department — the biggest share first. */
  const byDepartment = useMemo(() => {
    const totals = new Map();

    for (const member of faculty) {
      const name = String(member?.department || "Unassigned");
      const current = totals.get(name) || { name, hours: 0, people: 0 };
      current.hours += Number(member?.maxHoursPerWeek) || 0;
      current.people += 1;
      totals.set(name, current);
    }

    const rows = [...totals.values()].sort((a, b) => b.hours - a.hours);
    const max = Math.max(1, ...rows.map((row) => row.hours));
    return rows.map((row) => ({ ...row, share: Math.round((row.hours / max) * 100) }));
  }, [faculty]);

  /**
   * Availability is what the scheduler books against, so a member with no
   * window configured can never be placed. That count is the one thing on
   * this page that genuinely needs attention, hence the warning tone.
   */
  const availability = useMemo(() => {
    const configured = faculty.filter((member) => availableDays(member).length > 0).length;
    return {
      configured,
      missing: faculty.length - configured,
      percent: faculty.length ? Math.round((configured / faculty.length) * 100) : 0,
    };
  }, [faculty]);

  const hasData = faculty.length > 0;

  const columns = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (member) => (
        <div className="min-w-0 space-y-1">
          <div className="font-medium text-foreground">{member.name}</div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Mail className="size-3.5 shrink-0" />
            <span className="truncate">{member.email}</span>
          </div>
        </div>
      ),
    },
    {
      key: "department",
      label: "Department",
      sortable: true,
      render: (member) => (
        <div className="space-y-1">
          <div className="text-foreground">{member.department}</div>
          <div className="text-sm text-muted-foreground">
            {member.designation || "No designation"}
          </div>
        </div>
      ),
    },
    {
      key: "specialization",
      label: "Specialization",
      render: (member) => {
        const list = member.specialization || [];
        if (list.length === 0) {
          return <span className="text-sm text-muted-foreground">None</span>;
        }
        return (
          <div className="flex max-w-48 flex-wrap gap-1">
            {list.slice(0, 2).map((item) => (
              <StatusBadge key={item} variant="info">
                {item}
              </StatusBadge>
            ))}
            {list.length > 2 && (
              <StatusBadge variant="neutral">+{list.length - 2}</StatusBadge>
            )}
          </div>
        );
      },
    },
    {
      key: "maxHoursPerWeek",
      label: "Max hours",
      // Deliberately not sortable: `DataTable` sorts with `localeCompare` on
      // the stringified value, which orders 9 after 20. Name and department
      // are text and sort correctly.
      render: (member) => (
        <div className="flex items-center gap-2 tabular-nums text-foreground">
          <Clock className="size-4 text-muted-foreground" />
          {member.maxHoursPerWeek}h
        </div>
      ),
    },
    {
      key: "availability",
      label: "Available days",
      render: (member) => {
        const days = availableDays(member);
        if (days.length === 0) {
          return <StatusBadge variant="warning">Not set</StatusBadge>;
        }
        return (
          <div className="flex max-w-40 flex-wrap gap-1">
            {days.slice(0, 3).map((day) => (
              <StatusBadge key={day} variant="success">
                {shortDay(day)}
              </StatusBadge>
            ))}
            {days.length > 3 && (
              <StatusBadge variant="neutral">+{days.length - 3}</StatusBadge>
            )}
          </div>
        );
      },
    },
    {
      key: "preferences",
      label: "Preferences",
      render: (member) => {
        const preferred = member.preferences?.preferredTimeSlots || [];
        const avoided = member.preferences?.avoidTimeSlots || [];
        if (preferred.length === 0 && avoided.length === 0) {
          return <span className="text-sm text-muted-foreground">None</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {preferred.length > 0 && (
              <StatusBadge variant="success">{preferred.length} preferred</StatusBadge>
            )}
            {avoided.length > 0 && (
              <StatusBadge variant="warning">{avoided.length} avoided</StatusBadge>
            )}
          </div>
        );
      },
    },
  ];

  const viewingDays = viewingFaculty ? availableDays(viewingFaculty) : [];
  const viewingPreferred = viewingFaculty?.preferences?.preferredTimeSlots || [];
  const viewingAvoided = viewingFaculty?.preferences?.avoidTimeSlots || [];

  return (
    <AppShell brand={brand} nav={nav} quickActions={quickActions}>
      <PageHeader
        title="Faculty"
        description="Manage teaching staff, their specializations and the hours the scheduler may book them for."
        actions={
          <>
            <Button variant="outline" onClick={fetchFaculty} disabled={loading}>
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button
              onClick={() => {
                setEditingFaculty(null);
                setShowForm((open) => !open);
              }}
            >
              <Plus className="size-4" />
              Add Faculty
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
              label="Faculty"
              value={error ? "—" : faculty.length}
              icon={Users}
              loading={loading}
            />
            <StatCard
              label="Departments"
              value={error ? "—" : stats.departments}
              icon={GraduationCap}
              loading={loading}
            />
            <StatCard
              label="Specializations"
              value={error ? "—" : stats.specializations}
              icon={BookMarked}
              loading={loading}
            />
            <StatCard
              label="Weekly capacity"
              value={error ? "—" : `${stats.capacity}h`}
              icon={Clock}
              tone="success"
              loading={loading}
            />
          </div>

          {/* ---- Capacity by department ---- */}
          <SectionCard
            title="Capacity by department"
            description="Bookable hours per week, largest first"
            icon={GraduationCap}
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
                  ? "Departments cannot be summarised while faculty are unavailable."
                  : "Add a faculty member and their department appears here."}
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
                        {row.hours}h · {row.people}
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

          {/* ---- Availability health ---- */}
          <SectionCard
            title="Availability"
            description="Members the scheduler can place"
            icon={CalendarCheck}
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
                  ? "Availability cannot be checked right now."
                  : "No faculty registered yet."}
              </p>
            ) : (
              <div className="space-y-3">
                <p className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {availability.configured}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    of {faculty.length}
                  </span>
                </p>
                <Progress value={availability.percent} />
                {availability.missing > 0 ? (
                  <div className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                    {availability.missing} without an availability window cannot be
                    scheduled.
                  </div>
                ) : (
                  <div className="rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
                    Every member has at least one bookable window.
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ============ Band 2 — the form, when open ============ */}
        {showForm && (
          <SectionCard
            title={editingFaculty ? "Edit faculty member" : "Add a new faculty member"}
            description="Specializations and availability decide which classes the scheduler can assign."
            icon={Plus}
            className="animate-in fade-in duration-200"
          >
            <FacultyForm
              initialData={editingFaculty}
              onSubmit={handleCreateFaculty}
              loading={formLoading}
            />
          </SectionCard>
        )}

        {/* ============ Band 3 — the directory ============ */}
        <SectionCard
          title="All faculty"
          description={
            error
              ? "The directory could not be loaded."
              : `${faculty.length} faculty member${faculty.length === 1 ? "" : "s"} registered.`
          }
          icon={Users}
        >
          <DataTable
            data={faculty}
            columns={columns}
            searchKey="name"
            loading={loading}
            entityName="faculty"
            onView={(member) => setViewingFaculty(member)}
            onEdit={(member) => {
              setEditingFaculty(member);
              setShowForm(true);
            }}
            onDelete={(member) => setFacultyToDelete(member)}
            empty={
              error
                ? {
                    icon: Users,
                    title: "Faculty unavailable",
                    description: "The list could not be loaded. Refresh to try again.",
                    action: (
                      <Button variant="outline" onClick={fetchFaculty}>
                        <RefreshCw className="size-4" />
                        Refresh
                      </Button>
                    ),
                  }
                : {
                    icon: Users,
                    title: "No faculty yet",
                    description:
                      "Add a teaching member so the scheduler has somebody to assign classes to.",
                  }
            }
          />
        </SectionCard>
      </div>

      {/* ====== Details — the availability and preference detail the table compresses ====== */}
      <Dialog
        open={Boolean(viewingFaculty)}
        onOpenChange={(open) => {
          if (!open) setViewingFaculty(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewingFaculty?.name}</DialogTitle>
            <DialogDescription>
              {[viewingFaculty?.designation, viewingFaculty?.department, viewingFaculty?.email]
                .filter(Boolean)
                .join(" · ")}
            </DialogDescription>
          </DialogHeader>

          {viewingFaculty && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Clock className="size-4 text-muted-foreground" />
                <span className="tabular-nums">
                  Up to {viewingFaculty.maxHoursPerWeek}h per week
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Specialization</p>
                {(viewingFaculty.specialization || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">None recorded.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {viewingFaculty.specialization.map((item) => (
                      <StatusBadge key={item} variant="info">
                        {item}
                      </StatusBadge>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Availability</p>
                {viewingDays.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No windows set — this member cannot be scheduled.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {viewingDays.map((day) => (
                      <li key={day} className="flex flex-wrap items-baseline gap-2 text-sm">
                        <span className="w-24 shrink-0 text-foreground">{prettyDay(day)}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {viewingFaculty.availability[day]
                            .map((slot) => `${slot.start}–${slot.end}`)
                            .join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Preferences</p>
                {viewingPreferred.length === 0 && viewingAvoided.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {viewingPreferred.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm text-muted-foreground">Preferred</span>
                        {viewingPreferred.map((slot) => (
                          <StatusBadge key={slot} variant="success" className="tabular-nums">
                            {slot}
                          </StatusBadge>
                        ))}
                      </div>
                    )}
                    {viewingAvoided.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm text-muted-foreground">Avoid</span>
                        {viewingAvoided.map((slot) => (
                          <StatusBadge key={slot} variant="warning" className="tabular-nums">
                            {slot}
                          </StatusBadge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingFaculty(viewingFaculty);
                    setShowForm(true);
                    setViewingFaculty(null);
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
        open={Boolean(facultyToDelete)}
        onOpenChange={(open) => {
          if (!open) setFacultyToDelete(null);
        }}
        title="Delete this faculty member?"
        description={
          facultyToDelete
            ? `"${facultyToDelete.name}" will be removed permanently. Timetables that already assign them will need regenerating.`
            : ""
        }
        confirmLabel="Delete faculty"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </AppShell>
  );
}
