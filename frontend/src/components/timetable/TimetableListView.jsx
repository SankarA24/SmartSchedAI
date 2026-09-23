import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { colorTokenFor, entryKey, filterEntries, resolveEntry } from "@/lib/schedule";
import { chartBorderClass } from "./TimetableLegend";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const COLUMNS = [
  { id: "day", label: "Day" },
  { id: "time", label: "Time" },
  { id: "course", label: "Course" },
  { id: "faculty", label: "Faculty" },
  { id: "room", label: "Room" },
  { id: "type", label: "Type" },
];

function toRow(entry, index, days, maps, colorMode) {
  const resolved = resolveEntry(entry, maps);
  const dayIndex = days.findIndex((d) => d.toLowerCase() === String(entry?.day || "").toLowerCase());
  return {
    entry,
    key: `${entryKey(entry)}|${entry?.courseId ?? ""}|${entry?.roomId ?? ""}|${index}`,
    day: entry?.day || "",
    dayIndex: dayIndex === -1 ? days.length : dayIndex,
    time: entry?.startTime || "",
    timeLabel: entry?.startTime && entry?.endTime ? `${entry.startTime}-${entry.endTime}` : entry?.startTime || "",
    courseLabel: resolved.label || "Untitled",
    courseCode: resolved.code,
    facultyName: resolved.faculty?.name || "Unassigned",
    roomName: resolved.room?.name || "Unassigned",
    type: resolved.type || "lecture",
    token: colorTokenFor(entry, colorMode, maps),
  };
}

function compareRows(a, b, key) {
  switch (key) {
    case "day":
      return a.dayIndex - b.dayIndex || a.time.localeCompare(b.time);
    case "time":
      return a.time.localeCompare(b.time);
    case "course":
      return a.courseLabel.localeCompare(b.courseLabel);
    case "faculty":
      return a.facultyName.localeCompare(b.facultyName);
    case "room":
      return a.roomName.localeCompare(b.roomName);
    case "type":
      return a.type.localeCompare(b.type);
    default:
      return 0;
  }
}

/**
 * Flat, sortable list rendering of the same entries `TimetableGrid` shows.
 * Consumes `filterEntries`/`resolveEntry`/`colorTokenFor` from `lib/schedule`
 * rather than re-deriving grouping/filtering/colour logic.
 *
 * @param {{schedule:object[], grid?:object, maps?:object, groupBy?:'day'|'course', filters?:object, colorMode?:'type'|'course', onEntryClick?:(entry:object)=>void}} props
 */
export function TimetableListView({
  schedule,
  grid,
  maps,
  groupBy = "day",
  filters,
  colorMode = "type",
  onEntryClick,
}) {
  const [sort, setSort] = useState({ key: "day", dir: "asc" });
  const days = grid?.days?.length ? grid.days : [];

  const rows = useMemo(() => {
    const filtered = filterEntries(schedule, filters, maps);
    return filtered.map((entry, index) => toRow(entry, index, days, maps, colorMode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, filters, maps, colorMode, days.join("|")]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = compareRows(a, b, sort.key);
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort]);

  const groups = useMemo(() => {
    if (groupBy !== "course") return [{ label: null, rows: sorted }];
    const map = new Map();
    for (const row of sorted) {
      const key = row.courseCode || row.courseLabel || "Other";
      if (!map.has(key)) map.set(key, { label: row.courseLabel || key, rows: [] });
      map.get(key).rows.push(row);
    }
    return Array.from(map.values());
  }, [sorted, groupBy]);

  const toggleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  };

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-10 text-center">
        <p className="text-sm font-medium text-foreground">No classes to show</p>
        <p className="text-xs text-muted-foreground">Nothing matches the current filters.</p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in overflow-hidden rounded-lg border border-border duration-150">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {COLUMNS.map((col) => (
              <TableHead key={col.id}>
                <button
                  type="button"
                  onClick={() => toggleSort(col.id)}
                  className="inline-flex items-center gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase transition-colors duration-150 hover:text-foreground"
                >
                  {col.label}
                  {sort.key === col.id ? (
                    sort.dir === "asc" ? (
                      <ArrowUp className="size-3" />
                    ) : (
                      <ArrowDown className="size-3" />
                    )
                  ) : (
                    <ArrowUpDown className="size-3 opacity-40" />
                  )}
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <RowGroup key={group.label ?? "flat"} group={group} onEntryClick={onEntryClick} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RowGroup({ group, onEntryClick }) {
  return (
    <>
      {group.label && (
        <TableRow className="hover:bg-transparent">
          <TableCell
            colSpan={COLUMNS.length}
            className="bg-muted/40 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {group.label}
          </TableCell>
        </TableRow>
      )}
      {group.rows.map((row) => (
        <TableRow
          key={row.key}
          onClick={onEntryClick ? () => onEntryClick(row.entry) : undefined}
          className={cn("transition-colors duration-150", onEntryClick && "cursor-pointer")}
        >
          <TableCell className={cn("border-l-2 font-medium whitespace-nowrap", chartBorderClass(row.token))}>
            {row.day}
          </TableCell>
          <TableCell className="whitespace-nowrap tabular-nums">{row.timeLabel}</TableCell>
          <TableCell>
            <div className="flex flex-col">
              <span className="font-medium text-foreground">{row.courseCode || row.courseLabel}</span>
              {row.courseCode && row.courseLabel !== row.courseCode && (
                <span className="text-xs text-muted-foreground">{row.courseLabel}</span>
              )}
            </div>
          </TableCell>
          <TableCell className="whitespace-nowrap">{row.facultyName}</TableCell>
          <TableCell className="whitespace-nowrap">{row.roomName}</TableCell>
          <TableCell>
            <Badge variant="secondary" className="capitalize">
              {row.type}
            </Badge>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export default TimetableListView;
