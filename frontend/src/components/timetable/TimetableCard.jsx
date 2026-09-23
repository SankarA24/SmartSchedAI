import { CalendarDays, Download, Eye, Loader2, Send, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { statusVariant } from "@/lib/status";
import { computeStats } from "@/lib/schedule";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function IconAction({ label, icon, onClick, disabled, destructive }) {
  const Icon = icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onClick?.();
          }}
          className={cn(destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive")}
        >
          <Icon className="size-4" />
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Summary card for one timetable in a list — name, scope, status and quick
 * actions. Status uses the shared `StatusBadge` + `statusVariant` mapping so
 * it always matches the pill shown everywhere else.
 *
 * @param {{timetable:object, counts?:{classes?:number, conflicts?:number}, onView?:Function, onPublish?:Function, onExport?:Function, onDelete?:Function, busy?:boolean}} props
 */
export function TimetableCard({ timetable, counts, onView, onPublish, onExport, onDelete, busy = false }) {
  if (!timetable) return null;

  const stats = counts || computeStats(timetable.schedule, timetable.grid, timetable.maps);
  const classes = counts?.classes ?? stats.totalClasses ?? 0;
  const conflicts = counts?.conflicts ?? timetable?.metadata?.conflictCount ?? 0;
  const isDraft = String(timetable.status || "").toLowerCase() === "draft";

  return (
    <Card
      className={cn(
        "animate-in fade-in gap-0 overflow-hidden py-0 duration-150 transition-colors",
        onView && "cursor-pointer hover:border-primary/40"
      )}
      onClick={onView ? () => onView() : undefined}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <CalendarDays className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{timetable.name || "Untitled timetable"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[timetable.department, timetable.semester && `Semester ${timetable.semester}`, timetable.year]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {busy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          <StatusBadge variant={statusVariant(timetable.status)} className="capitalize">
            {timetable.status || "draft"}
          </StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <StatusBadge className="tabular-nums">{classes} classes</StatusBadge>
          {typeof stats.hoursPerWeek === "number" && (
            <StatusBadge className="tabular-nums">{stats.hoursPerWeek} hrs/wk</StatusBadge>
          )}
          <StatusBadge variant={conflicts > 0 ? "destructive" : "neutral"} className="tabular-nums">
            {conflicts} conflicts
          </StatusBadge>
        </div>
      </CardContent>

      <CardFooter
        className="flex items-center justify-between gap-2 border-t border-border px-5 py-3"
        onClick={(event) => event.stopPropagation()}
      >
        <Button type="button" variant="outline" size="sm" disabled={busy || !onView} onClick={() => onView?.()}>
          <Eye className="size-4" />
          View
        </Button>
        <div className="flex items-center gap-2">
          {onPublish && isDraft && (
            <IconAction label="Publish" icon={Send} onClick={onPublish} disabled={busy} />
          )}
          {onExport && <IconAction label="Export" icon={Download} onClick={onExport} disabled={busy} />}
          {onDelete && <IconAction label="Delete" icon={Trash2} onClick={onDelete} disabled={busy} destructive />}
        </div>
      </CardFooter>
    </Card>
  );
}

export default TimetableCard;
