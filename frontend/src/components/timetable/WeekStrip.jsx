import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { colorTokenFor, resolveEntry } from "@/lib/schedule";
import { chartBgClass } from "./TimetableLegend";
import { Button } from "@/components/ui/button";

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

const MAX_VISIBLE_ENTRIES = 3;

// Spelled out (not built from a template string) so Tailwind's on-demand
// scanner emits the class — see the note in TimetableLegend.jsx.
const GRID_COLS_CLASS = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-7",
};

/**
 * Week-at-a-glance strip. `days` is the array `lib/schedule#weekStrip`
 * returns (`{date, dayName, isToday, entries}[]`) — build it in the parent
 * with `weekStrip(schedule, { weekOffset, grid })` and pass the result
 * straight through, so this component stays presentational.
 *
 * @param {{days:Array<{date:Date, dayName:string, isToday:boolean, entries:object[]}>, weekOffset?:number, onPrev?:Function, onNext?:Function, onToday?:Function, onEntryClick?:Function, maps?:object, colorMode?:'type'|'course'}} props
 */
export function WeekStrip({
  days = [],
  weekOffset = 0,
  onPrev,
  onNext,
  onToday,
  onEntryClick,
  maps,
  colorMode = "type",
}) {
  const rangeLabel =
    days.length > 0
      ? `${DATE_FORMAT.format(days[0].date)} – ${DATE_FORMAT.format(days[days.length - 1].date)}`
      : "";

  return (
    <div className="animate-in fade-in overflow-hidden rounded-lg border border-border duration-150">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CalendarDays className="size-4 text-muted-foreground" />
          {weekOffset === 0 ? "This week" : rangeLabel}
          {weekOffset !== 0 && <span className="text-xs font-normal text-muted-foreground">{rangeLabel}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => onPrev?.()}>
            <ChevronLeft className="size-4" />
            <span className="sr-only">Previous week</span>
          </Button>
          {weekOffset !== 0 && (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onToday?.()}>
              Today
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => onNext?.()}>
            <ChevronRight className="size-4" />
            <span className="sr-only">Next week</span>
          </Button>
        </div>
      </div>

      <div className={cn("grid divide-x divide-border", GRID_COLS_CLASS[Math.min(days.length, 7) || 1])}>
        {days.map((day) => (
          <div
            key={day.dayName}
            className={cn("flex min-h-28 flex-col gap-1.5 px-2.5 py-2.5", day.isToday && "bg-primary/5")}
          >
            <div className="flex items-baseline justify-between">
              <span className={cn("text-xs font-medium", day.isToday ? "text-primary" : "text-muted-foreground")}>
                {day.dayName.slice(0, 3)}
              </span>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  day.isToday
                    ? "flex size-5 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground"
                    : "text-muted-foreground"
                )}
              >
                {day.date.getDate()}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-1">
              {day.entries.slice(0, MAX_VISIBLE_ENTRIES).map((entry, index) => {
                const resolved = resolveEntry(entry, maps);
                const token = colorTokenFor(entry, colorMode, maps);
                return (
                  <button
                    key={`${entry.day}-${entry.startTime}-${index}`}
                    type="button"
                    onClick={onEntryClick ? () => onEntryClick(entry) : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-sm bg-card px-1.5 py-1 text-left text-[11px] leading-tight text-foreground transition-colors duration-150",
                      onEntryClick && "hover:bg-accent"
                    )}
                  >
                    <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", chartBgClass(token))} />
                    <span className="truncate">{resolved.code || resolved.label}</span>
                  </button>
                );
              })}
              {day.entries.length > MAX_VISIBLE_ENTRIES && (
                <span className="px-1.5 text-[11px] text-muted-foreground">
                  +{day.entries.length - MAX_VISIBLE_ENTRIES} more
                </span>
              )}
              {day.entries.length === 0 && <span className="px-1.5 text-[11px] text-muted-foreground">—</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default WeekStrip;
