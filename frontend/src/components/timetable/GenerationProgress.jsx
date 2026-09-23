import { AlertCircle } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressChecklist } from "@/components/common/ProgressChecklist";

const STATUS_BADGE_VARIANT = {
  running: "info",
  done: "success",
  failed: "destructive",
};

/**
 * Live-generation status card. Entirely prop-driven: there is no
 * Socket.io or async job registry yet (that's U4), so the caller passes
 * whatever it has (possibly nothing) and this renders an idle placeholder
 * rather than opening a connection or polling anything itself.
 *
 * Props:
 *  - steps, currentIndex, percentage  — forwarded to ProgressChecklist
 *  - generation, maxGenerations, bestFitness, hardViolations — GA stats
 *  - status: 'running' | 'done' | 'failed' | undefined
 *  - error:  string | undefined
 *  - onCancel: (() => void) | undefined — omitted entirely when not provided
 */

function StatCell({ label, children }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
        {children ?? "—"}
      </div>
    </div>
  );
}

export function GenerationProgress({
  steps,
  currentIndex,
  percentage,
  generation,
  maxGenerations,
  bestFitness,
  hardViolations,
  status,
  error,
  onCancel,
}) {
  const hasSteps = Array.isArray(steps) && steps.length > 0;
  const isRunning = status === "running";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generation progress</CardTitle>
        <CardDescription>
          {hasSteps ? "Tracking the current generation run." : "No generation run in progress."}
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          {status && (
            <StatusBadge variant={STATUS_BADGE_VARIANT[status] || "neutral"}>{status}</StatusBadge>
          )}
          {isRunning && onCancel && (
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {hasSteps ? (
          <ProgressChecklist
            steps={steps}
            currentIndex={currentIndex}
            status={status}
            percentage={percentage}
            detail={
              typeof generation === "number" && typeof maxGenerations === "number"
                ? `Generation ${generation} of ${maxGenerations}`
                : undefined
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Start a generation run to see live progress here.
          </p>
        )}

        {(typeof generation === "number" ||
          typeof bestFitness === "number" ||
          typeof hardViolations === "number") && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatCell label="Generation">
              {typeof generation === "number"
                ? typeof maxGenerations === "number"
                  ? `${generation} / ${maxGenerations}`
                  : generation
                : undefined}
            </StatCell>
            <StatCell label="Best fitness">
              {typeof bestFitness === "number" ? bestFitness.toFixed(4) : undefined}
            </StatCell>
            <StatCell label="Hard violations">
              {typeof hardViolations === "number" ? (
                <span className={hardViolations === 0 ? "text-success" : "text-destructive"}>
                  {hardViolations}
                </span>
              ) : undefined}
            </StatCell>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export default GenerationProgress;
