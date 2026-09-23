import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Clock,
  Download,
  FileJson,
  LayoutGrid,
  List,
  MessageSquare,
  Percent,
  Printer,
  DoorOpen,
} from "lucide-react";

import api from "@/lib/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { navForRole } from "@/lib/nav";
import { statusVariant } from "@/lib/status";
import { computeStats, filterEntries, resolveEntry } from "@/lib/schedule";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { useTimetableData } from "@/hooks/useTimetableData";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import { FilterBar } from "@/components/common/FilterBar";
import { EmptyState } from "@/components/common/EmptyState";
import { Callout } from "@/components/common/Callout";
import { StatusBadge } from "@/components/StatusBadge";
import { QualityScore } from "@/components/timetable/QualityScore";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
import { TimetableListView } from "@/components/timetable/TimetableListView";
import { ConflictsDialog } from "@/components/timetable/ConflictsDialog";
import { CommentsDialog } from "@/components/timetable/CommentsDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/*
  /view-timetable/:id — the single timetable detail view (UI_REPLICATION_PLAN U7).

  Every control on this page is wired to something real:
    - view mode / display / colour mode / filters change what is rendered,
    - Comment    -> POST   /api/timetables/:id/comments
    - Export CSV -> GET    /api/timetables/:id/export?format=csv
    - Export JSON-> GET    /api/timetables/:id/export?format=json
    - Print      -> window.print() over the printable table below
    - Resolve    -> PATCH  /api/timetables/:id/conflicts/:index/resolve

  The page filters the schedule ONCE (`visible`) and hands the already
  filtered array to whichever renderer is on screen, so the four view modes
  are pure regroupings of the same entries and always agree on the total.
*/

const ALL = "all";

const VIEW_MODES = [
  { value: "standard", label: "Standard" },
  { value: "byFaculty", label: "By Faculty" },
  { value: "byRoom", label: "By Room" },
  { value: "byBatch", label: "By Batch" },
];

const EMPTY_FILTERS = {
  day: ALL,
  facultyId: ALL,
  roomId: ALL,
  batch: ALL,
  search: "",
};

function batchKeyOf(course) {
  if (!course) return "";
  return `${course.department}|${course.semester}|${course.year}`;
}

function batchLabel(key) {
  const [department, semester, year] = String(key).split("|");
  const parts = [department || "Unassigned"];
  if (semester) parts.push(`Semester ${semester}`);
  if (year) parts.push(String(year));
  return parts.join(" · ");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function messageFor(error) {
  return error?.response?.data?.error || error?.message || "Request failed";
}

/**
 * Split entries into the sections a view mode shows. Mirrors the grouping
 * `TimetableGrid` does internally (that helper is private to it) so the list
 * renderer can show the same sections. Every entry lands in exactly one
 * group in every mode, which is what keeps the four totals identical.
 */
function groupEntries(entries, viewMode, maps) {
  if (viewMode === "standard") {
    return [{ id: "all", label: null, entries }];
  }

  const buckets = new Map();

  for (const entry of entries) {
    const resolved = resolveEntry(entry, maps);
    let id = "";
    let label = "";

    if (viewMode === "byFaculty") {
      id = String(entry.facultyId ?? "");
      label = resolved.faculty?.name || id || "Unassigned faculty";
    } else if (viewMode === "byRoom") {
      id = String(entry.roomId ?? "");
      label = resolved.room?.name || id || "Unassigned room";
    } else {
      id = batchKeyOf(resolved.course);
      label = id ? batchLabel(id) : "Unassigned batch";
    }

    if (!buckets.has(id)) buckets.set(id, { id, label, entries: [] });
    buckets.get(id).entries.push(entry);
  }

  return [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Distinct, resolvable filter options for whatever this timetable contains. */
function buildOptions(schedule, maps) {
  const faculty = new Map();
  const rooms = new Map();
  const batches = new Map();

  for (const entry of schedule || []) {
    const resolved = resolveEntry(entry, maps);

    const facultyId = String(entry.facultyId ?? "");
    if (facultyId && !faculty.has(facultyId)) {
      faculty.set(facultyId, resolved.faculty?.name || facultyId);
    }

    const roomId = String(entry.roomId ?? "");
    if (roomId && !rooms.has(roomId)) {
      rooms.set(roomId, resolved.room?.name || roomId);
    }

    // Only offer a batch we can actually filter on: `filterEntries` matches a
    // batch by its `department|semester|year` key, so an entry whose course
    // did not resolve has no key and gets no (unusable) option.
    const batchKey = batchKeyOf(resolved.course);
    if (batchKey && !batches.has(batchKey)) {
      batches.set(batchKey, batchLabel(batchKey));
    }
  }

  const toOptions = (map) =>
    [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

  return {
    faculty: toOptions(faculty),
    rooms: toOptions(rooms),
    batches: toOptions(batches),
  };
}

function ToggleButton({ active, onClick, icon: Icon, children, label }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
    >
      {Icon ? <Icon className="size-4" /> : null}
      {children}
    </Button>
  );
}

function InfoField({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}

export default function ViewTimetableDetail() {
  const { id } = useParams();
  const { brand, nav, quickActions } = navForRole("admin");
  const { grid } = useSystemConfig();
  const { maps } = useTimetableData();

  const [timetable, setTimetable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const [viewMode, setViewMode] = useState("standard");
  const [display, setDisplay] = useState("grid");
  const [colorMode, setColorMode] = useState("type");
  const [filterValues, setFilterValues] = useState(EMPTY_FILTERS);

  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [exporting, setExporting] = useState(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/timetables/${id}`);
      setTimetable(data || null);
      setLoadError(null);
    } catch (error) {
      console.warn("ViewTimetableDetail: failed to load timetable", error);
      setLoadError(messageFor(error));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const schedule = useMemo(() => timetable?.schedule || [], [timetable]);
  const conflicts = useMemo(() => timetable?.conflicts || [], [timetable]);
  const unresolvedCount = useMemo(
    () => conflicts.filter((conflict) => !conflict?.resolved).length,
    [conflicts]
  );

  const comments = useMemo(
    () =>
      (timetable?.comments || []).map((comment, index) => ({
        id: comment?._id ?? index,
        author: comment?.name || comment?.role || "Unknown",
        text: comment?.text || "",
        createdAt: comment?.createdAt,
      })),
    [timetable]
  );

  const options = useMemo(() => buildOptions(schedule, maps), [schedule, maps]);

  // `filterEntries` treats every absent key as "no filter", so the sentinel
  // "all" is dropped rather than passed through as a value that matches nothing.
  const activeFilters = useMemo(() => {
    const next = {};
    if (filterValues.day !== ALL) next.day = filterValues.day;
    if (filterValues.facultyId !== ALL) next.facultyId = filterValues.facultyId;
    if (filterValues.roomId !== ALL) next.roomId = filterValues.roomId;
    if (filterValues.batch !== ALL) next.batch = filterValues.batch;
    if (filterValues.search.trim()) next.search = filterValues.search.trim();
    return next;
  }, [filterValues]);

  const filtersActive = Object.keys(activeFilters).length > 0;

  const visible = useMemo(
    () => filterEntries(schedule, activeFilters, maps),
    [schedule, activeFilters, maps]
  );

  const groups = useMemo(
    () => groupEntries(visible, viewMode, maps),
    [visible, viewMode, maps]
  );

  const stats = useMemo(() => computeStats(visible, grid, maps), [visible, grid, maps]);

  const filterDefs = useMemo(
    () => [
      {
        id: "day",
        label: "Day",
        type: "select",
        value: filterValues.day,
        options: [
          { value: ALL, label: "All days" },
          ...(grid?.days || []).map((day) => ({ value: day, label: day })),
        ],
      },
      {
        id: "facultyId",
        label: "Faculty",
        type: "select",
        value: filterValues.facultyId,
        options: [{ value: ALL, label: "All faculty" }, ...options.faculty],
      },
      {
        id: "roomId",
        label: "Room",
        type: "select",
        value: filterValues.roomId,
        options: [{ value: ALL, label: "All rooms" }, ...options.rooms],
      },
      {
        id: "batch",
        label: "Batch",
        type: "select",
        value: filterValues.batch,
        options: [{ value: ALL, label: "All batches" }, ...options.batches],
      },
      {
        id: "search",
        label: "Search",
        type: "search",
        value: filterValues.search,
        placeholder: "Course, faculty or room",
      },
    ],
    [filterValues, grid, options]
  );

  const handleFilterChange = (key, value) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleResolveConflict = async (index, note) => {
    setActionError(null);
    try {
      // The server recomputes conflictCount and the quality score from the
      // saved document and returns the whole timetable, so the badge and the
      // score below both come from that response — never from a local guess.
      const { data } = await api.patch(
        `/timetables/${id}/conflicts/${index}/resolve`,
        { note: note || "" }
      );
      setTimetable(data || null);
    } catch (error) {
      console.warn("ViewTimetableDetail: failed to resolve conflict", error);
      setActionError(messageFor(error));
    }
  };

  const handleAddComment = async (text) => {
    setActionError(null);
    setCommentBusy(true);
    try {
      const { data } = await api.post(`/timetables/${id}/comments`, { text });
      const created = data?.comment;
      if (created) {
        setTimetable((prev) =>
          prev ? { ...prev, comments: [...(prev.comments || []), created] } : prev
        );
      }
    } catch (error) {
      console.warn("ViewTimetableDetail: failed to add comment", error);
      setActionError(messageFor(error));
    } finally {
      setCommentBusy(false);
    }
  };

  const handleExport = async (format) => {
    setActionError(null);
    setExporting(format);
    try {
      // The export route is behind requireAuth, so it has to go through the
      // shared axios client (which attaches the Bearer token) rather than a
      // plain link to the URL.
      const response = await api.get(`/timetables/${id}/export`, {
        params: { format },
        responseType: "blob",
      });

      const disposition = response.headers?.["content-disposition"] || "";
      const match = /filename="?([^";]+)"?/.exec(disposition);
      const fallback = `${(timetable?.name || "timetable").replace(/[^\w.-]+/g, "-")}.${format}`;
      const filename = match ? match[1] : fallback;

      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.warn("ViewTimetableDetail: failed to export timetable", error);
      setActionError(messageFor(error));
    } finally {
      setExporting(null);
    }
  };

  const printSubtitle = timetable
    ? [
        timetable.department,
        timetable.semester ? `Semester ${timetable.semester}` : null,
        timetable.year,
        timetable.academicYear ? `AY ${timetable.academicYear}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const shell = (children) => (
    <AppShell
      brand={brand}
      nav={nav}
      quickActions={quickActions}
      chatbot={{ context: { page: "view-timetable-detail", timetableId: id } }}
    >
      {children}
    </AppShell>
  );

  if (loading && !timetable) {
    return shell(
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!timetable) {
    return shell(
      <>
        <PageHeader
          title="Timetable"
          actions={
            <Button asChild variant="outline" size="sm">
              <Link to="/view-timetable">
                <ArrowLeft className="size-4" />
                Back to timetables
              </Link>
            </Button>
          }
        />
        <EmptyState
          icon={CalendarDays}
          title={loadError ? "Could not load this timetable" : "Timetable not found"}
          description={loadError || "It may have been deleted or you may not have access to it."}
          action={
            <Button type="button" variant="outline" onClick={load}>
              Try again
            </Button>
          }
        />
      </>
    );
  }

  return shell(
    <>
      <div className="print:hidden">
        <PageHeader
          title={timetable.name}
          description={printSubtitle}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link to="/view-timetable">
                <ArrowLeft className="size-4" />
                Back to timetables
              </Link>
            </Button>
          }
        />
      </div>

      <div className="flex flex-col gap-6 print:hidden">
        {actionError && (
          <Callout tone="destructive" title="Action failed" icon={AlertTriangle}>
            {actionError}
          </Callout>
        )}

        {/* ---------------------------------------------- Info */}
        <SectionCard
          title="Timetable details"
          icon={CalendarDays}
          actions={<StatusBadge variant={statusVariant(timetable.status)}>{timetable.status}</StatusBadge>}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <InfoField label="Department">{timetable.department || "—"}</InfoField>
              <InfoField label="Semester">{timetable.semester || "—"}</InfoField>
              <InfoField label="Year">{timetable.year ?? "—"}</InfoField>
              <InfoField label="Academic year">{timetable.academicYear ?? "—"}</InfoField>
              <InfoField label="Classes">{schedule.length}</InfoField>
              <InfoField label="Generated by">
                {timetable.metadata?.generationMethod || "—"}
              </InfoField>
              <InfoField label="Created">{formatDate(timetable.createdAt)}</InfoField>
              <InfoField label="Published">{formatDate(timetable.publishedAt)}</InfoField>
              <InfoField label="Comments">{comments.length}</InfoField>
            </div>

            <div className="flex flex-col gap-4">
              <QualityScore
                size="lg"
                score={timetable.metadata?.qualityScore}
                breakdown={timetable.metadata?.qualityBreakdown}
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConflictsOpen(true)}
                >
                  <AlertTriangle className="size-4" />
                  Conflicts
                  <StatusBadge variant={unresolvedCount ? "destructive" : "success"}>
                    {unresolvedCount}
                  </StatusBadge>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCommentsOpen(true)}
                >
                  <MessageSquare className="size-4" />
                  Comments
                  <StatusBadge variant="neutral">{comments.length}</StatusBadge>
                </Button>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ---------------------------------------------- Controls */}
        <SectionCard title="View" description="Regroup, recolour, filter, export or print this timetable." padded={false}>
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="view-mode" className="text-xs text-muted-foreground">
                  View mode
                </Label>
                <Select value={viewMode} onValueChange={setViewMode}>
                  <SelectTrigger id="view-mode" className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VIEW_MODES.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        {mode.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Display</span>
                <div className="flex items-center gap-1.5">
                  <ToggleButton
                    active={display === "grid"}
                    onClick={() => setDisplay("grid")}
                    icon={LayoutGrid}
                    label="Grid view"
                  >
                    Grid
                  </ToggleButton>
                  <ToggleButton
                    active={display === "list"}
                    onClick={() => setDisplay("list")}
                    icon={List}
                    label="List view"
                  >
                    List
                  </ToggleButton>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Colour by</span>
                <div className="flex items-center gap-1.5">
                  <ToggleButton
                    active={colorMode === "type"}
                    onClick={() => setColorMode("type")}
                    label="Colour by class type"
                  >
                    Type
                  </ToggleButton>
                  <ToggleButton
                    active={colorMode === "course"}
                    onClick={() => setColorMode("course")}
                    label="Colour by course"
                  >
                    Course
                  </ToggleButton>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCommentsOpen(true)}>
                <MessageSquare className="size-4" />
                Comment
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={exporting !== null}
                onClick={() => handleExport("csv")}
              >
                <Download className="size-4" />
                {exporting === "csv" ? "Exporting…" : "Export CSV"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={exporting !== null}
                onClick={() => handleExport("json")}
              >
                <FileJson className="size-4" />
                {exporting === "json" ? "Exporting…" : "Export JSON"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="size-4" />
                Print
              </Button>
            </div>
          </div>

          <FilterBar
            filters={filterDefs}
            onChange={handleFilterChange}
            onReset={filtersActive ? () => setFilterValues(EMPTY_FILTERS) : undefined}
            right={
              <span className="text-xs text-muted-foreground">
                {visible.length} of {schedule.length} classes
              </span>
            }
          />
        </SectionCard>

        {/* ---------------------------------------------- Body */}
        {visible.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No classes to show"
            description={
              filtersActive
                ? "Nothing matches the current filters."
                : "This timetable has no scheduled classes."
            }
            action={
              filtersActive ? (
                <Button type="button" variant="outline" onClick={() => setFilterValues(EMPTY_FILTERS)}>
                  Reset filters
                </Button>
              ) : null
            }
          />
        ) : display === "grid" ? (
          <TimetableGrid
            schedule={visible}
            grid={grid}
            maps={maps}
            viewMode={viewMode}
            colorMode={colorMode}
            title={timetable.name}
            subtitle={printSubtitle}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.id} className="flex flex-col gap-3">
                {group.label && (
                  <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
                )}
                <TimetableListView
                  schedule={group.entries}
                  grid={grid}
                  maps={maps}
                  colorMode={colorMode}
                />
              </section>
            ))}
          </div>
        )}

        {/* ---------------------------------------------- Statistics */}
        <SectionCard
          title="Statistics"
          description={
            filtersActive ? "Computed over the filtered classes." : "Computed over every class."
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total classes" value={stats.totalClasses} icon={CalendarDays} />
            <StatCard label="Hours per week" value={stats.hoursPerWeek} icon={Clock} />
            <StatCard label="Rooms used" value={stats.rooms} icon={DoorOpen} />
            <StatCard label="Slot utilization" value={`${stats.utilization}%`} icon={Percent} />
          </div>
        </SectionCard>
      </div>

      {/*
        Print surface: TimetableGrid's `printable` mode renders the
        institutional table (break rows included). Hidden on screen, shown by
        the `@media print` rules in index.css, which also hide the shell.
      */}
      <div className="hidden print:block">
        <TimetableGrid
          schedule={visible}
          grid={grid}
          maps={maps}
          viewMode={viewMode}
          colorMode={colorMode}
          printable
          showLegend={false}
          title={timetable.name}
          subtitle={printSubtitle}
        />
      </div>

      <ConflictsDialog
        open={conflictsOpen}
        onOpenChange={setConflictsOpen}
        conflicts={conflicts}
        canResolve
        onResolve={handleResolveConflict}
        maps={maps}
      />

      <CommentsDialog
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
        comments={comments}
        onAdd={handleAddComment}
        busy={commentBusy}
      />
    </>
  );
}
