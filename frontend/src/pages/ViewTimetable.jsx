import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  FileJson,
  FileSpreadsheet,
  LayoutGrid,
  PencilLine,
  RefreshCw,
  SearchX,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { navForRole } from "@/lib/nav";
import { computeStats } from "@/lib/schedule";
import { useIdentity } from "@/hooks/useIdentity";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { useTimetableData } from "@/hooks/useTimetableData";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Callout } from "@/components/common/Callout";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { FilterBar } from "@/components/common/FilterBar";
import { SectionCard } from "@/components/common/SectionCard";
import { QualityScore } from "@/components/timetable/QualityScore";
import { TimetableCard } from "@/components/timetable/TimetableCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

// =====================================================
// /view-timetable — the timetable list (U7)
//
// The whole role-scoped list is fetched once (the server already narrows
// `GET /api/timetables` by role: students see their own published cohort,
// faculty only timetables they teach in, admins everything) and every filter
// below runs client-side over that list. That is deliberate: the filter
// options are derived from the rows themselves, so no option is ever offered
// that would return nothing, and changing a filter costs no round trip.
//
// Every action on this page maps onto a real backend route:
//   View    → /view-timetable/:id
//   Publish → PATCH /api/timetables/:id/publish
//   Export  → GET   /api/timetables/:id/export?format=csv|json
//   Delete  → DELETE /api/timetables/:id
// Publish and Delete are admin-only server-side (`adminOnly`), so they are
// only rendered for admins rather than shown and rejected.
// =====================================================

const ALL = "all";

const STATUS_OPTIONS = [
  { value: ALL, label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const EMPTY_FILTERS = {
  department: ALL,
  year: ALL,
  semester: ALL,
  academicYear: ALL,
  status: ALL,
  search: "",
};

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : DATE_FORMAT.format(date);
}

/**
 * The academic year a timetable belongs to. Legacy documents predate the
 * `academicYear` field and keep the calendar year in `year` — the backend's
 * own list filter (`buildListFilter`) treats them the same way, so this page
 * has to as well or the option and the match would disagree.
 */
function academicYearOf(timetable) {
  const value = timetable?.academicYear ?? timetable?.year;
  return value === undefined || value === null || value === "" ? "" : String(value);
}

/** Unresolved conflicts — the number the badge and the detail page agree on. */
function openConflictCount(timetable) {
  if (Array.isArray(timetable?.conflicts)) {
    return timetable.conflicts.filter((conflict) => !conflict?.resolved).length;
  }
  return timetable?.metadata?.conflictCount ?? 0;
}

/**
 * Distinct, sorted `<option>` list for one field, always prefixed with an
 * "all" entry and always containing `selected` even when the rows no longer
 * offer it (so a live filter never silently loses its own value).
 */
function buildOptions(values, allLabel, selected, labelFor) {
  const seen = new Set();
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") seen.add(String(value));
  }
  if (selected && selected !== ALL) seen.add(selected);

  const sorted = [...seen].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b);
  });

  return [
    { value: ALL, label: allLabel },
    ...sorted.map((value) => ({ value, label: labelFor ? labelFor(value) : value })),
  ];
}

/**
 * Filename for a download. The server sets it in `Content-Disposition`, but
 * that header is not exposed across the dev-server origin boundary, so this
 * mirrors the server's own `baseName` sanitisation as a fallback. Only the
 * *name* is derived here — the file's bytes always come from the export
 * route, never from the client.
 */
function exportFilename(response, timetable, format) {
  const header =
    response?.headers?.["content-disposition"] || response?.headers?.get?.("content-disposition");
  const match = header ? /filename="?([^";]+)"?/i.exec(header) : null;
  if (match) return match[1];

  const base =
    String(timetable?.name || "timetable")
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "") || "timetable";
  return `${base}.${format}`;
}

function errorMessage(error, fallback) {
  const data = error?.response?.data;
  if (data && typeof data === "object" && typeof data.error === "string") return data.error;
  return error?.message || fallback;
}

export default function ViewTimetable() {
  const navigate = useNavigate();
  const { user } = useIdentity();
  const { grid } = useSystemConfig();

  // No filters are forwarded to the hook: the page filters the full
  // role-scoped list client-side (see the note at the top of the file).
  const { timetables, maps, loading, error, refresh } = useTimetableData();

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [busyId, setBusyId] = useState(null);
  const [publishTarget, setPublishTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [exportTarget, setExportTarget] = useState(null);

  const role = String(user?.role || "").toLowerCase();
  const isAdmin = role === "admin";
  const { brand, nav, quickActions } = navForRole(role || "admin");

  const handleFilterChange = useCallback((id, value) => {
    setFilters((current) => ({ ...current, [id]: value }));
  }, []);

  const resetFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const filterDefs = useMemo(
    () => [
      {
        id: "department",
        label: "Department",
        type: "select",
        value: filters.department,
        options: buildOptions(
          timetables.map((item) => item.department),
          "All departments",
          filters.department
        ),
      },
      {
        id: "year",
        label: "Year",
        type: "select",
        value: filters.year,
        options: buildOptions(
          timetables.map((item) => item.year),
          "All years",
          filters.year,
          (value) => `Year ${value}`
        ),
      },
      {
        id: "semester",
        label: "Semester",
        type: "select",
        value: filters.semester,
        options: buildOptions(
          timetables.map((item) => item.semester),
          "All semesters",
          filters.semester,
          (value) => `Semester ${value}`
        ),
      },
      {
        id: "academicYear",
        label: "Academic year",
        type: "select",
        value: filters.academicYear,
        options: buildOptions(
          timetables.map(academicYearOf),
          "All academic years",
          filters.academicYear
        ),
      },
      {
        id: "status",
        label: "Status",
        type: "select",
        value: filters.status,
        options: STATUS_OPTIONS,
      },
      {
        id: "search",
        label: "Search",
        type: "search",
        value: filters.search,
        placeholder: "Name or department",
      },
    ],
    [filters, timetables]
  );

  const filtersActive = useMemo(
    () =>
      Object.keys(EMPTY_FILTERS).some(
        (key) => String(filters[key] ?? "") !== String(EMPTY_FILTERS[key])
      ),
    [filters]
  );

  const rows = useMemo(() => {
    const query = filters.search.trim().toLowerCase();

    return timetables
      .filter((timetable) => {
        if (
          filters.department !== ALL &&
          String(timetable.department || "").toLowerCase() !== filters.department.toLowerCase()
        ) {
          return false;
        }
        if (filters.year !== ALL && String(timetable.year ?? "") !== filters.year) return false;
        if (filters.semester !== ALL && String(timetable.semester ?? "") !== filters.semester) {
          return false;
        }
        if (filters.academicYear !== ALL && academicYearOf(timetable) !== filters.academicYear) {
          return false;
        }
        if (filters.status !== ALL && String(timetable.status || "draft") !== filters.status) {
          return false;
        }
        if (query) {
          const haystack = [
            timetable.name,
            timetable.department,
            timetable.semester,
            timetable.year,
            timetable.status,
            timetable.metadata?.generationMethod,
          ]
            .filter((part) => part !== undefined && part !== null)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      })
      .map((timetable) => {
        const stats = computeStats(timetable.schedule, grid, maps);
        return {
          timetable,
          counts: {
            classes: stats.totalClasses,
            hoursPerWeek: stats.hoursPerWeek,
            conflicts: openConflictCount(timetable),
          },
        };
      });
  }, [timetables, filters, grid, maps]);

  const listError = error?.timetables || null;

  /**
   * The library at a glance, counted over the whole role-scoped list rather
   * than the filtered rows — it is the context the filters are narrowing, so
   * it must not move as they change. When the list failed to load every
   * figure renders an em dash: an unreachable list and an empty one must not
   * look the same.
   *
   * Each row is an alpha wash of a semantic token with the matching solid
   * token on it, which stays legible in both themes.
   */
  const summary = useMemo(() => {
    let published = 0;
    let draft = 0;
    let archived = 0;
    let conflicts = 0;

    for (const timetable of timetables) {
      const status = String(timetable.status || "draft").toLowerCase();
      if (status === "published") published += 1;
      else if (status === "archived") archived += 1;
      else draft += 1;
      conflicts += openConflictCount(timetable);
    }

    const figure = (value) => (listError ? "—" : value);
    const alarming = conflicts > 0 && !listError;

    return [
      {
        key: "published",
        label: "Published",
        value: figure(published),
        Icon: CheckCircle2,
        wash: "bg-success/10",
        text: "text-success",
      },
      {
        key: "draft",
        label: "Draft",
        value: figure(draft),
        Icon: PencilLine,
        wash: "bg-warning/10",
        text: "text-warning",
      },
      {
        key: "archived",
        label: "Archived",
        value: figure(archived),
        Icon: Archive,
        wash: "bg-muted",
        text: "text-muted-foreground",
      },
      {
        key: "conflicts",
        label: "Open conflicts",
        value: figure(conflicts),
        Icon: TriangleAlert,
        wash: alarming ? "bg-destructive/10" : "bg-muted",
        text: alarming ? "text-destructive" : "text-muted-foreground",
      },
    ];
  }, [timetables, listError]);

  /**
   * How many other published timetables publishing `timetable` would archive.
   * Mirrors the server's `updateMany` match in `PATCH /:id/publish` exactly —
   * same department, semester, year and academic year — so the confirmation
   * states the real blast radius instead of a guess.
   */
  const siblingsToArchive = useCallback(
    (timetable) => {
      if (!timetable) return 0;
      return timetables.filter(
        (other) =>
          String(other._id) !== String(timetable._id) &&
          other.status === "published" &&
          String(other.department ?? "") === String(timetable.department ?? "") &&
          String(other.semester ?? "") === String(timetable.semester ?? "") &&
          Number(other.year) === Number(timetable.year) &&
          (other.academicYear ?? null) === (timetable.academicYear ?? null)
      ).length;
    },
    [timetables]
  );

  const handleView = useCallback(
    (timetable) => navigate(`/view-timetable/${timetable._id}`),
    [navigate]
  );

  const handlePublish = useCallback(async () => {
    const timetable = publishTarget;
    if (!timetable) return;

    setBusyId(String(timetable._id));
    try {
      const { data } = await api.patch(`/timetables/${timetable._id}/publish`);
      const archived = data?.archivedCount ?? 0;
      toast.success(
        `"${timetable.name}" published.` +
          (archived > 0 ? ` ${archived} previously published timetable(s) archived.` : "")
      );
      setPublishTarget(null);
      await refresh();
    } catch (requestError) {
      toast.error(errorMessage(requestError, "Failed to publish timetable"));
    } finally {
      setBusyId(null);
    }
  }, [publishTarget, refresh]);

  const handleDelete = useCallback(async () => {
    const timetable = deleteTarget;
    if (!timetable) return;

    setBusyId(String(timetable._id));
    try {
      await api.delete(`/timetables/${timetable._id}`);
      toast.success(`"${timetable.name}" deleted.`);
      setDeleteTarget(null);
      await refresh();
    } catch (requestError) {
      toast.error(errorMessage(requestError, "Failed to delete timetable"));
    } finally {
      setBusyId(null);
    }
  }, [deleteTarget, refresh]);

  // The export route is the single source of truth for the file's contents;
  // this only hands the blob it answers with to the browser.
  const handleExport = useCallback(
    async (timetable, format) => {
      setBusyId(String(timetable._id));
      try {
        const response = await api.get(`/timetables/${timetable._id}/export`, {
          params: { format },
          responseType: "blob",
        });

        const blob =
          response.data instanceof Blob ? response.data : new Blob([response.data]);
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = exportFilename(response, timetable, format);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);

        toast.success(`"${timetable.name}" exported as ${format.toUpperCase()}.`);
        setExportTarget(null);
      } catch {
        // A failed export answers JSON, but `responseType: "blob"` wraps it,
        // so there is no readable server message here.
        toast.error("Failed to export timetable");
      } finally {
        setBusyId(null);
      }
    },
    []
  );

  const listLoading = loading && timetables.length === 0;

  return (
    <AppShell
      brand={brand}
      nav={nav}
      quickActions={quickActions}
      chatbot={{ context: { page: "view-timetable", visible: rows.length } }}
    >
      <PageHeader
        title="Timetables"
        description="Browse, publish and export every generated timetable."
        actions={
          <>
            <Button variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
              Refresh
            </Button>
            {isAdmin && (
              <Button onClick={() => navigate("/generate-timetable")}>
                <Sparkles className="size-4" />
                Generate
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-5">
        {listError && (
          <Callout tone="destructive" title="Could not load timetables">
            {listError}
          </Callout>
        )}

        {/* ============ Band 1 — filters beside the library at a glance ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/*
            The filter bar keeps its own slim cell. `FilterBar` draws its own
            bottom rule, which lands on the cell's bottom edge, so the only
            divider inside the cell is the one under the header.
          */}
          <section className="animate-in overflow-hidden rounded-xl border border-border bg-card shadow-sm fade-in duration-200 xl:col-span-8">
            <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <SlidersHorizontal className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Filters</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Narrows the timetables you have access to
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {rows.length} of {timetables.length} shown
              </span>
            </div>

            <div className="border-t border-border">
              <FilterBar
                filters={filterDefs}
                onChange={handleFilterChange}
                onReset={filtersActive ? resetFilters : undefined}
              />
            </div>
          </section>

          <SectionCard
            title="At a glance"
            description="Every timetable in this list, by status"
            icon={LayoutGrid}
            className="xl:col-span-4"
          >
            {listLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((key) => (
                  <Skeleton key={key} className="h-11 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <dl className="space-y-2">
                {summary.map((row) => (
                  <div
                    key={row.key}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg px-3 py-2",
                      row.wash
                    )}
                  >
                    <dt
                      className={cn(
                        "flex min-w-0 items-center gap-2 text-sm font-medium",
                        row.text
                      )}
                    >
                      <row.Icon className="size-4 shrink-0" />
                      <span className="truncate">{row.label}</span>
                    </dt>
                    <dd className={cn("text-sm font-semibold tabular-nums", row.text)}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </SectionCard>
        </div>

        {/* ============ Band 2 — the results ============ */}
        {listLoading ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-72 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={filtersActive ? SearchX : CalendarDays}
            title={filtersActive ? "No timetables match these filters" : "No timetables yet"}
            description={
              filtersActive
                ? "Nothing in this list matches the current filters. Reset them to see everything you have access to."
                : isAdmin
                  ? "Generate a timetable to see it listed here."
                  : "No timetable has been published for you yet."
            }
            action={
              filtersActive ? (
                <Button variant="outline" onClick={resetFilters}>
                  Reset filters
                </Button>
              ) : isAdmin ? (
                <Button onClick={() => navigate("/generate-timetable")}>
                  <Sparkles className="size-4" />
                  Generate timetable
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {rows.map(({ timetable, counts }) => {
              const id = String(timetable._id);
              const busy = busyId === id;
              const created = formatDate(timetable.createdAt);
              const published = formatDate(timetable.publishedAt);

              return (
                <div key={id} className="min-w-0">
                  <TimetableCard
                    timetable={timetable}
                    counts={counts}
                    busy={busy}
                    onView={() => handleView(timetable)}
                    onPublish={isAdmin ? () => setPublishTarget(timetable) : undefined}
                    onExport={() => setExportTarget(timetable)}
                    onDelete={isAdmin ? () => setDeleteTarget(timetable) : undefined}
                  />

                  {/*
                    Dates and the quality bar live in a strip welded to the
                    bottom of the card: `TimetableCard` is shared by the
                    dashboard and has no slot for them, and it is not this
                    page's file to change. The negative margin tucks the strip
                    under the card's bottom edge so the two read as one card.
                  */}
                  <div className="-mt-4 flex flex-col gap-3 rounded-b-xl border border-t-0 border-border bg-card px-5 pb-4 pt-5 shadow-sm">
                    <QualityScore
                      score={timetable.metadata?.qualityScore}
                      breakdown={timetable.metadata?.qualityBreakdown}
                    />

                    <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                      <div className="flex gap-1.5">
                        <dt>Created</dt>
                        <dd className="font-medium text-foreground">{created || "—"}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>Published</dt>
                        <dd className="font-medium text-foreground">
                          {published || "Not published"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(publishTarget)}
        onOpenChange={(open) => {
          if (!open) setPublishTarget(null);
        }}
        title={`Publish "${publishTarget?.name ?? ""}"?`}
        description={
          publishTarget
            ? `Publishing makes this timetable visible to faculty and students in ${[
                publishTarget.department,
                publishTarget.semester ? `Semester ${publishTarget.semester}` : null,
                publishTarget.year ? `Year ${publishTarget.year}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}. Every other published timetable for that same cohort is archived automatically — ${
                siblingsToArchive(publishTarget) === 1
                  ? "1 timetable is currently published for it and will be archived."
                  : siblingsToArchive(publishTarget) > 1
                    ? `${siblingsToArchive(publishTarget)} timetables are currently published for it and will be archived.`
                    : "no other timetable is currently published for it."
              }`
            : ""
        }
        confirmLabel="Publish"
        loading={Boolean(publishTarget) && busyId === String(publishTarget?._id)}
        onConfirm={handlePublish}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete "${deleteTarget?.name ?? ""}"?`}
        description="This permanently removes the timetable and its schedule, conflicts and comments. It cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={Boolean(deleteTarget) && busyId === String(deleteTarget?._id)}
        onConfirm={handleDelete}
      />

      <Dialog
        open={Boolean(exportTarget)}
        onOpenChange={(open) => {
          if (!open && !busyId) setExportTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Export timetable</DialogTitle>
            <DialogDescription>
              Download "{exportTarget?.name}" as a spreadsheet-ready CSV or as structured JSON.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              disabled={Boolean(busyId)}
              onClick={() => handleExport(exportTarget, "csv")}
            >
              <FileSpreadsheet className="size-4" />
              CSV
            </Button>
            <Button
              variant="outline"
              disabled={Boolean(busyId)}
              onClick={() => handleExport(exportTarget, "json")}
            >
              <FileJson className="size-4" />
              JSON
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={Boolean(busyId)} onClick={() => setExportTarget(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export { ViewTimetable };
