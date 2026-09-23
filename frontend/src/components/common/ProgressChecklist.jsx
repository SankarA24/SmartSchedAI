import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

/**
 * Vertical checklist for a long-running, step-based flow (e.g. timetable
 * generation). Renders entirely from props — no socket/stream wiring, so it
 * is safe to use ahead of the async job registry landing in a later phase.
 *
 * Props:
 *  - steps:        [{ id, label }]
 *  - currentIndex: index into `steps` that is presently active
 *  - status:       'running' | 'done' | 'failed'   overall flow status
 *  - percentage:   0-100 overall progress
 *  - detail?:      short status line rendered under the progress bar
 */
export function ProgressChecklist({
  steps = [],
  currentIndex = 0,
  status = "running",
  percentage = 0,
  detail,
}) {
  const overallFailed = status === "failed";
  const overallDone = status === "done";

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex && !overallDone;
          const isPast = index < currentIndex || overallDone;
          const isFailedStep = overallFailed && index === currentIndex;

          let Icon = Circle;
          let iconClass = "text-muted-foreground";
          if (isFailedStep) {
            Icon = XCircle;
            iconClass = "text-destructive";
          } else if (isPast) {
            Icon = CheckCircle2;
            iconClass = "text-success";
          } else if (isCurrent) {
            Icon = Loader2;
            iconClass = "text-primary animate-spin";
          }

          return (
            <li key={step.id} className="flex items-center gap-3">
              <Icon className={cn("size-4 shrink-0", iconClass)} />
              <span
                className={cn(
                  "text-sm",
                  isCurrent || isFailedStep
                    ? "text-foreground font-medium"
                    : isPast
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="space-y-1.5">
        <Progress
          value={Math.min(100, Math.max(0, percentage || 0))}
          className={cn(
            overallFailed && "[&>[data-slot=progress-indicator]]:bg-destructive",
            overallDone && "[&>[data-slot=progress-indicator]]:bg-success"
          )}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{detail || " "}</span>
          <span className="tabular-nums">{Math.round(percentage || 0)}%</span>
        </div>
      </div>
    </div>
  );
}

export default ProgressChecklist;
