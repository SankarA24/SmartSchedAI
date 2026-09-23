import { cn } from "@/lib/utils";

/**
 * Renders a timetable quality score (0-100) as a tinted bar plus an optional
 * breakdown grid. `score` is entirely prop-driven — the backend does not
 * compute one yet (U4), so an absent/non-numeric score renders a neutral
 * "not scored" state instead of a fake zero.
 *
 * Props:
 *  - score:     number | undefined
 *  - breakdown: { constraintCompliance, roomUtilization, facultyBalance, studentConvenience } | undefined
 *  - size:      'sm' | 'lg' (default 'sm') — 'lg' also renders the breakdown grid
 */

const BREAKDOWN_LABELS = {
  constraintCompliance: "Constraint compliance",
  roomUtilization: "Room utilization",
  facultyBalance: "Faculty balance",
  studentConvenience: "Student convenience",
};

function toneForScore(score) {
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  return "destructive";
}

const TONE_BAR = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

const TONE_TEXT = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

export function QualityScore({ score, breakdown, size = "sm", className }) {
  const hasScore = typeof score === "number" && Number.isFinite(score);
  const clamped = hasScore ? Math.max(0, Math.min(100, score)) : 0;
  const tone = hasScore ? toneForScore(clamped) : null;
  const isLg = size === "lg";

  return (
    <div className={cn("w-full", isLg ? "space-y-3" : "space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "font-medium text-foreground",
            isLg ? "text-sm" : "text-xs"
          )}
        >
          Quality score
        </span>
        <span
          className={cn(
            "font-semibold tabular-nums",
            isLg ? "text-lg" : "text-sm",
            hasScore ? TONE_TEXT[tone] : "text-muted-foreground"
          )}
        >
          {hasScore ? Math.round(clamped) : "Not scored"}
        </span>
      </div>

      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-muted",
          isLg ? "h-2.5" : "h-1.5"
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-200",
            hasScore ? TONE_BAR[tone] : "bg-border"
          )}
          style={{ width: hasScore ? `${clamped}%` : "100%" }}
        />
      </div>

      {!hasScore && (
        <p className="text-xs text-muted-foreground">
          This timetable has not been scored yet.
        </p>
      )}

      {hasScore && isLg && breakdown && (
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 pt-1 sm:grid-cols-2">
          {Object.entries(BREAKDOWN_LABELS).map(([key, label]) => {
            const value = breakdown[key];
            const hasValue = typeof value === "number" && Number.isFinite(value);
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium tabular-nums text-foreground">
                  {hasValue ? Math.round(value) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default QualityScore;
