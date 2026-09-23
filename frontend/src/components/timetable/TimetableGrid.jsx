import * as React from "react"
import { AlertTriangle, Clock, MapPin, User } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  buildGrid,
  colorTokenFor,
  entryKey,
  filterEntries,
  groupByDay,
  resolveEntry,
  slotRows,
} from "@/lib/schedule"

/*
  One renderer for every timetable matrix in the app (admin, faculty, student).

  Nothing about the week is hard-coded: days, slots and breaks all come from
  the `grid` prop (what `useSystemConfig()` exposes from `GET /api/config/grid`),
  normalised through `buildGrid` / `slotRows` so a caller may pass the raw
  config, an already-built grid, or nothing at all.

  Course type / course identity stays a colour channel, but colour never
  carries it alone: every cell also shows a 3px left border, the type label and
  a legend, so the grid survives greyscale printing and colour-blind viewing.
  Token class names are spelled out below (not built from the token string) so
  Tailwind emits them.
*/

const BORDER_TOKEN = {
  "chart-1": "border-l-chart-1",
  "chart-2": "border-l-chart-2",
  "chart-3": "border-l-chart-3",
  "chart-4": "border-l-chart-4",
  "chart-5": "border-l-chart-5",
}

const DENSITY = {
  comfortable: {
    timeCol: 145,
    colMin: 200,
    cellMin: 132,
    breakMin: 52,
    pad: "p-2",
    innerPad: "p-3",
    title: "text-sm",
    meta: "text-xs",
    gap: "gap-1.5",
  },
  compact: {
    timeCol: 112,
    colMin: 148,
    cellMin: 86,
    breakMin: 40,
    pad: "p-1.5",
    innerPad: "p-2",
    title: "text-xs",
    meta: "text-[11px]",
    gap: "gap-1",
  },
}

const VIEW_MODES = {
  standard: { key: null },
  byFaculty: { key: "facultyId" },
  byRoom: { key: "roomId" },
  byBatch: { key: "batch" },
}

function borderClass(token) {
  return BORDER_TOKEN[token] || BORDER_TOKEN["chart-1"]
}

function titleCase(value) {
  const str = String(value || "").trim()
  if (!str) return ""
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/** Translate `viewMode` + `groupValue` into a `filterEntries` filter. */
function viewFilter(viewMode, groupValue) {
  const mode = VIEW_MODES[viewMode] || VIEW_MODES.standard
  if (!mode.key || groupValue == null || groupValue === "") return {}
  return { [mode.key]: groupValue }
}

/** Batch identity of an entry's course — mirrors `filterEntries`' batch key. */
function batchKeyOf(resolved) {
  const course = resolved.course
  if (!course) return ""
  return `${course.department}|${course.semester}|${course.year}`
}

function batchLabel(key) {
  const [department, semester, year] = String(key).split("|")
  const parts = [department || "Unassigned"]
  if (semester) parts.push(`Semester ${semester}`)
  if (year) parts.push(year)
  return parts.join(" · ")
}

/**
 * Split the (already filtered) entries into the sections to render.
 * `standard`, or a grouped mode with an explicit `groupValue`, is one
 * unlabelled section; a grouped mode without a `groupValue` becomes one
 * labelled section per distinct faculty / room / batch present.
 */
function buildGroups(entries, viewMode, groupValue, maps) {
  const mode = VIEW_MODES[viewMode] || VIEW_MODES.standard
  if (!mode.key || (groupValue != null && groupValue !== "")) {
    return [{ id: "all", label: null, entries }]
  }

  const buckets = new Map()
  for (const entry of entries) {
    const resolved = resolveEntry(entry, maps)
    let id = ""
    let label = ""

    if (mode.key === "facultyId") {
      id = String(entry.facultyId ?? "")
      label = resolved.faculty?.name || id || "Unassigned faculty"
    } else if (mode.key === "roomId") {
      id = String(entry.roomId ?? "")
      label = resolved.room?.name || id || "Unassigned room"
    } else {
      id = batchKeyOf(resolved)
      label = id ? batchLabel(id) : "Unassigned batch"
    }

    if (!buckets.has(id)) buckets.set(id, { id, label, entries: [] })
    buckets.get(id).entries.push(entry)
  }

  const groups = [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label))
  return groups.length ? groups : [{ id: "all", label: null, entries: [] }]
}

/**
 * Accept conflict hints as `"Monday|09:00"` keys, raw schedule entries,
 * `{ entry }` or `{ entries: [...] }` conflict objects.
 */
function conflictKeySet(highlightConflicts) {
  const set = new Set()
  for (const item of highlightConflicts || []) {
    if (!item) continue
    if (typeof item === "string") {
      set.add(item)
      continue
    }
    if (item.entry) set.add(entryKey(item.entry))
    if (Array.isArray(item.entries)) {
      for (const nested of item.entries) set.add(entryKey(nested))
    }
    if (item.day || item.startTime) set.add(entryKey(item))
  }
  return set
}

/** Distinct legend rows for whatever is actually on screen. */
function legendItems(entries, colorMode, maps) {
  const seen = new Map()
  for (const entry of entries) {
    const resolved = resolveEntry(entry, maps)
    const label =
      colorMode === "course"
        ? resolved.code || resolved.label || String(entry.courseId || "")
        : titleCase(resolved.type)
    if (!label) continue
    if (!seen.has(label)) seen.set(label, colorTokenFor(entry, colorMode, maps))
  }
  return [...seen.entries()]
    .map(([label, token]) => ({ label, token }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Bucket a section's entries into day → startTime → entries[]. */
function indexByDayAndSlot(entries, grid) {
  const grouped = groupByDay(entries, grid)
  const index = new Map()
  for (const [day, list] of grouped) {
    const bySlot = new Map()
    for (const entry of list) {
      const key = String(entry.startTime || "")
      if (!bySlot.has(key)) bySlot.set(key, [])
      bySlot.get(key).push(entry)
    }
    index.set(day, bySlot)
  }
  return index
}

function EntryCard({ entry, maps, colorMode, dims, isConflict }) {
  const { course, faculty, room, type, code, label } = resolveEntry(entry, maps)
  const token = colorTokenFor(entry, colorMode, maps)

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col justify-between rounded-md border border-l-[3px] bg-card text-left",
        dims.innerPad,
        // `borderClass` must come last: `cn` is twMerge, and an all-sides
        // border colour later in the list would drop the `border-l-chart-*`
        // colour that carries the legend's colour channel.
        isConflict ? "border-destructive/60 bg-destructive/10" : "border-border",
        borderClass(token)
      )}
    >
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-muted-foreground">
            {code || "COURSE"}
          </span>
          {isConflict && (
            <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />
          )}
        </div>
        <div
          className={cn(
            "line-clamp-2 font-medium leading-snug text-foreground",
            dims.title
          )}
        >
          {course?.name || label || entry.courseId}
        </div>
      </div>

      <div
        className={cn("mt-2 flex flex-col text-muted-foreground", dims.gap, dims.meta)}
      >
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{faculty?.name || entry.facultyId}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{room?.name || entry.roomId}</span>
        </div>
        <span className="inline-block capitalize text-muted-foreground">{type}</span>
      </div>
    </div>
  )
}

function TimeCell({ row, dims, muted }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center border-b border-r border-border px-2 text-center",
        muted ? "bg-muted text-muted-foreground" : "bg-card"
      )}
      style={{ minHeight: row.kind === "break" ? dims.breakMin : dims.cellMin }}
    >
      <div>
        <div className="font-mono text-xs tabular-nums text-foreground">
          {row.start}-{row.end}
        </div>
        {row.kind === "break" && (
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {row.label}
          </div>
        )}
      </div>
    </div>
  )
}

function Matrix({
  grid,
  rows,
  entries,
  maps,
  colorMode,
  dims,
  conflicts,
  onCellClick,
}) {
  const days = grid.days
  const index = React.useMemo(() => indexByDayAndSlot(entries, grid), [entries, grid])

  const gridStyle = {
    gridTemplateColumns: `${dims.timeCol}px repeat(${days.length}, minmax(${dims.colMin}px, 1fr))`,
  }
  const minWidth = dims.timeCol + days.length * dims.colMin

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth }}>
        <div className="grid border-b border-border bg-muted" style={gridStyle}>
          <div className="flex items-center justify-center gap-2 border-r border-border px-3 py-3 text-xs font-medium text-muted-foreground">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Time
          </div>
          {days.map((day) => (
            <div
              key={day}
              className="border-r border-border px-3 py-3 text-center text-sm font-medium text-foreground last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>

        {rows.map((row) => {
          if (row.kind === "break") {
            return (
              <div key={`break-${row.start}`} className="grid" style={gridStyle}>
                <TimeCell row={row} dims={dims} muted />
                <div
                  className="flex items-center justify-center border-b border-border bg-muted px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  style={{ gridColumn: `span ${days.length}`, minHeight: dims.breakMin }}
                >
                  {row.label}
                </div>
              </div>
            )
          }

          return (
            <div key={`slot-${row.start}`} className="grid" style={gridStyle}>
              <TimeCell row={row} dims={dims} />

              {days.map((day) => {
                const cellEntries = index.get(day)?.get(row.start) || []
                const interactive = typeof onCellClick === "function"

                if (!cellEntries.length) {
                  return (
                    <div
                      key={`${day}-${row.start}`}
                      className={cn(
                        "border-b border-r border-border bg-background last:border-r-0",
                        dims.pad
                      )}
                      style={{ minHeight: dims.cellMin }}
                    >
                      {interactive ? (
                        <button
                          type="button"
                          onClick={() => onCellClick(null, { day, slot: row })}
                          aria-label={`Free slot, ${day} ${row.label}`}
                          className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={{ minHeight: dims.cellMin - 16 }}
                        >
                          Free
                        </button>
                      ) : (
                        <div
                          className="flex h-full items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground"
                          style={{ minHeight: dims.cellMin - 16 }}
                        >
                          Free
                        </div>
                      )}
                    </div>
                  )
                }

                return (
                  <div
                    key={`${day}-${row.start}`}
                    className={cn(
                      "flex flex-col gap-2 border-b border-r border-border bg-background last:border-r-0",
                      dims.pad
                    )}
                    style={{ minHeight: dims.cellMin }}
                  >
                    {cellEntries.map((entry, entryIndex) => {
                      const isConflict = conflicts.has(entryKey(entry))
                      const card = (
                        <EntryCard
                          entry={entry}
                          maps={maps}
                          colorMode={colorMode}
                          dims={dims}
                          isConflict={isConflict}
                        />
                      )

                      const key = `${entryKey(entry)}-${entry.courseId || ""}-${entryIndex}`
                      if (!interactive) {
                        return (
                          <div
                            key={key}
                            className="flex-1 animate-in fade-in duration-150"
                            style={{ minHeight: dims.cellMin - 16 }}
                          >
                            {card}
                          </div>
                        )
                      }

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => onCellClick(entry, { day, slot: row })}
                          className="flex-1 animate-in fade-in rounded-md text-left duration-150 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={{ minHeight: dims.cellMin - 16 }}
                        >
                          {card}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Institutional A4-landscape table. `.print-table` and the `@page` rule live
 * in `index.css`; this only has to stay a plain, borderless-on-screen table.
 */
function PrintableTable({ grid, rows, entries, maps, title, subtitle }) {
  const days = grid.days
  const index = React.useMemo(() => indexByDayAndSlot(entries, grid), [entries, grid])

  return (
    <div className="overflow-x-auto">
      <table className="print-table w-full min-w-[720px] border-collapse border border-border text-xs">
        {(title || subtitle) && (
          <caption className="caption-top pb-3 text-center">
            {title && (
              <span className="block text-base font-semibold text-foreground">{title}</span>
            )}
            {subtitle && (
              <span className="block text-xs text-muted-foreground">{subtitle}</span>
            )}
          </caption>
        )}
        <thead>
          <tr className="bg-muted">
            <th
              scope="col"
              className="border border-border px-2 py-2 text-left font-medium text-muted-foreground"
            >
              Time
            </th>
            {days.map((day) => (
              <th
                key={day}
                scope="col"
                className="border border-border px-2 py-2 text-center font-medium text-foreground"
              >
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.kind === "break") {
              return (
                <tr key={`break-${row.start}`} className="bg-muted">
                  <th
                    scope="row"
                    className="border border-border px-2 py-1.5 text-left font-mono text-[11px] font-normal tabular-nums text-muted-foreground"
                  >
                    {row.start}-{row.end}
                  </th>
                  <td
                    colSpan={days.length}
                    className="border border-border px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {row.label}
                  </td>
                </tr>
              )
            }

            return (
              <tr key={`slot-${row.start}`}>
                <th
                  scope="row"
                  className="border border-border px-2 py-1.5 text-left font-mono text-[11px] font-normal tabular-nums text-foreground"
                >
                  {row.start}-{row.end}
                </th>
                {days.map((day) => {
                  const cellEntries = index.get(day)?.get(row.start) || []
                  if (!cellEntries.length) {
                    return (
                      <td
                        key={`${day}-${row.start}`}
                        className="border border-border px-2 py-1.5 text-center text-muted-foreground"
                      >
                        —
                      </td>
                    )
                  }

                  return (
                    <td
                      key={`${day}-${row.start}`}
                      className="border border-border px-2 py-1.5 align-top"
                    >
                      {cellEntries.map((entry, entryIndex) => {
                        const { course, faculty, room, type, code } = resolveEntry(entry, maps)
                        return (
                          <div
                            key={`${entryKey(entry)}-${entry.courseId || ""}-${entryIndex}`}
                            className={entryIndex ? "mt-1.5 border-t border-border pt-1.5" : ""}
                          >
                            <div className="font-medium text-foreground">
                              {code || entry.courseId}
                            </div>
                            <div className="text-foreground">{course?.name || ""}</div>
                            <div className="text-muted-foreground">
                              {faculty?.name || entry.facultyId}
                            </div>
                            <div className="text-muted-foreground">
                              {room?.name || entry.roomId}
                              {type ? ` · ${type}` : ""}
                            </div>
                          </div>
                        )
                      })}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Legend({ items, colorMode }) {
  if (!items.length) return null

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-1 pt-3 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">
        {colorMode === "course" ? "Courses" : "Legend"}
      </span>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-2">
          <span
            className={cn(
              "h-3.5 w-5 rounded-sm border border-l-[3px] border-border bg-card",
              borderClass(item.token)
            )}
          />
          {item.label}
        </span>
      ))}
      <span className="ml-auto hidden md:block">
        Every cell also carries its type label, so the grid reads in print.
      </span>
    </div>
  )
}

/**
 * @param {object} props
 * @param {Array<object>} props.schedule — `Timetable.schedule[]`
 * @param {object} [props.grid] — `useSystemConfig().grid` (raw config or built grid)
 * @param {{courses?:*, faculty?:*, rooms?:*}} [props.maps]
 * @param {'standard'|'byFaculty'|'byRoom'|'byBatch'} [props.viewMode]
 * @param {string|object} [props.groupValue] — facultyId / roomId / batch key
 * @param {'type'|'course'} [props.colorMode]
 * @param {object} [props.filters] — passed straight to `filterEntries`
 * @param {'comfortable'|'compact'} [props.density]
 * @param {(entry:object|null, ctx:{day:string, slot:object}) => void} [props.onCellClick]
 * @param {boolean} [props.printable]
 * @param {boolean} [props.showLegend]
 * @param {Array<string|object>} [props.highlightConflicts]
 * @param {string} [props.title] — printable caption
 * @param {string} [props.subtitle] — printable caption
 */
export function TimetableGrid({
  schedule,
  grid,
  maps,
  viewMode = "standard",
  groupValue,
  colorMode = "type",
  filters,
  density = "comfortable",
  onCellClick,
  printable = false,
  showLegend = true,
  highlightConflicts,
  title,
  subtitle,
  className,
  ...props
}) {
  const builtGrid = React.useMemo(() => buildGrid(grid), [grid])
  const rows = React.useMemo(() => slotRows(builtGrid), [builtGrid])
  const dims = DENSITY[density] || DENSITY.comfortable

  const entries = React.useMemo(
    () =>
      filterEntries(schedule, { ...(filters || {}), ...viewFilter(viewMode, groupValue) }, maps),
    [schedule, filters, viewMode, groupValue, maps]
  )

  const groups = React.useMemo(
    () => buildGroups(entries, viewMode, groupValue, maps),
    [entries, viewMode, groupValue, maps]
  )

  const conflicts = React.useMemo(
    () => conflictKeySet(highlightConflicts),
    [highlightConflicts]
  )

  const legend = React.useMemo(
    () => (showLegend ? legendItems(entries, colorMode, maps) : []),
    [showLegend, entries, colorMode, maps]
  )

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {groups.map((group) => (
        <section key={group.id} className="flex flex-col gap-3">
          {group.label && (
            <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
          )}

          {printable ? (
            <PrintableTable
              grid={builtGrid}
              rows={rows}
              entries={group.entries}
              maps={maps}
              title={groups.length > 1 ? group.label || title : title}
              subtitle={subtitle}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Matrix
                grid={builtGrid}
                rows={rows}
                entries={group.entries}
                maps={maps}
                colorMode={colorMode}
                dims={dims}
                conflicts={conflicts}
                onCellClick={onCellClick}
              />
            </div>
          )}
        </section>
      ))}

      {showLegend && <Legend items={legend} colorMode={colorMode} />}
    </div>
  )
}

export default TimetableGrid
