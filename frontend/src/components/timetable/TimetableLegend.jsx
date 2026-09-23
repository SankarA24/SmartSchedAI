import { cn } from "@/lib/utils";
import { colorTokenFor, resolveEntry } from "@/lib/schedule";
import { courseTypeToken } from "@/lib/status";

/*
  Tailwind (v4, on-demand scan) only emits classes it can see spelled out in
  source, so the `chart-1`..`chart-5` tokens `colorTokenFor` returns are
  mapped through static lookup tables here rather than built with template
  strings. `TimetableListView`, `TimetableCard` and `WeekStrip` import these
  helpers so every timetable surface tints the same token the same way.
*/
const BORDER_CLASS = {
  "chart-1": "border-l-chart-1",
  "chart-2": "border-l-chart-2",
  "chart-3": "border-l-chart-3",
  "chart-4": "border-l-chart-4",
  "chart-5": "border-l-chart-5",
};

const BG_CLASS = {
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  "chart-4": "bg-chart-4",
  "chart-5": "bg-chart-5",
};

// eslint-disable-next-line react-refresh/only-export-components
export function chartBorderClass(token) {
  return BORDER_CLASS[token] || BORDER_CLASS["chart-1"];
}

// eslint-disable-next-line react-refresh/only-export-components
export function chartBgClass(token) {
  return BG_CLASS[token] || BG_CLASS["chart-1"];
}

const DEFAULT_TYPE_ITEMS = [
  { label: "Lecture", token: courseTypeToken("lecture") },
  { label: "Lab", token: courseTypeToken("lab") },
  { label: "Tutorial / Seminar", token: courseTypeToken("seminar") },
];

/**
 * Derive default legend items when the caller doesn't pass `items` directly.
 * - mode 'type': the fixed three-way course-type key (driven by `courseTypeToken`).
 * - mode 'course': one entry per distinct course in `schedule`, tinted via
 *   `colorTokenFor(entry, 'course', maps)` so the colour matches every other
 *   surface reading the same schedule.
 */
function deriveItems(mode, schedule, maps) {
  if (mode === "course") {
    if (!Array.isArray(schedule) || !schedule.length) return [];
    const seen = new Map();
    for (const entry of schedule) {
      const { code, label } = resolveEntry(entry, maps);
      const key = code || label;
      if (!key || seen.has(key)) continue;
      seen.set(key, { label: label || code, token: colorTokenFor(entry, "course", maps) });
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }
  return DEFAULT_TYPE_ITEMS;
}

/**
 * Colour key for the timetable grid/list/strip. Pass `items` explicitly to
 * take full control, or let `mode` + `schedule`/`maps` derive them.
 *
 * @param {{mode?:'type'|'course', items?:Array<{label:string, token:string}>, schedule?:object[], maps?:object, className?:string}} props
 */
export function TimetableLegend({ mode = "type", items, schedule, maps, className }) {
  const resolvedItems = items ?? deriveItems(mode, schedule, maps);

  if (!resolvedItems.length) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>No legend data yet.</p>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      {resolvedItems.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              "h-3.5 w-5 shrink-0 rounded-sm border border-border border-l-2 bg-card",
              chartBorderClass(item.token)
            )}
          />
          <span className="text-xs text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export default TimetableLegend;
