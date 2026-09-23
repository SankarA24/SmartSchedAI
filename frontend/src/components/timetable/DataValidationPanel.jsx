import { AlertTriangle, CheckCircle2, CircleDashed, RefreshCw, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";

/**
 * Readiness checklist for the entities a generation run depends on
 * (courses, faculty, rooms, ...). Entirely prop-driven — no fetching, no
 * validation logic here.
 *
 * Props:
 *  - entities: [{ id, label, icon, count, issues: [], status }]
 *              status: 'complete' | 'warning' | 'error' | 'pending'
 *  - onRefresh: () => void
 *  - loading:   boolean
 */

const STATUS_ICON = {
  complete: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  pending: CircleDashed,
};

const STATUS_ICON_TONE = {
  complete: "text-success",
  warning: "text-warning",
  error: "text-destructive",
  pending: "text-muted-foreground",
};

const STATUS_BADGE_VARIANT = {
  complete: "success",
  warning: "warning",
  error: "destructive",
  pending: "neutral",
};

export function DataValidationPanel({ entities, onRefresh, loading }) {
  const list = Array.isArray(entities) ? entities : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data validation</CardTitle>
        <CardDescription>
          Readiness checks for the data a generation run needs.
        </CardDescription>
        {onRefresh && (
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No entities to validate.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((entity) => {
              const status = entity?.status || "pending";
              const StatusIcon = STATUS_ICON[status] || CircleDashed;
              const EntityIcon = entity?.icon;
              const issues = Array.isArray(entity?.issues) ? entity.issues : [];

              return (
                <li
                  key={entity?.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
                >
                  <StatusIcon
                    className={cn("mt-0.5 size-4 shrink-0", STATUS_ICON_TONE[status] || STATUS_ICON_TONE.pending)}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {EntityIcon && <EntityIcon className="size-3.5 text-muted-foreground" />}
                      <span className="text-sm font-medium text-foreground">{entity?.label}</span>
                      {typeof entity?.count === "number" && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {entity.count}
                        </span>
                      )}
                    </div>
                    {issues.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {issues.map((issue, index) => (
                          <li key={index} className="text-xs text-muted-foreground">
                            {typeof issue === "string" ? issue : issue?.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <StatusBadge
                    variant={STATUS_BADGE_VARIANT[status] || "neutral"}
                    className="shrink-0"
                  >
                    {status}
                  </StatusBadge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default DataValidationPanel;
