import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Compact KPI tile: label + big value, an optional icon tile, and an
 * optional up/down delta. Renders as a react-router <Link> when `href`
 * is set, otherwise a plain div.
 */
const TONES = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaLabel,
  tone = "default",
  href,
  loading = false,
  className,
  ...props
}) {
  const toneClass = TONES[tone] || TONES.default;
  const hasDelta = delta !== undefined && delta !== null && delta !== "";
  const isPositive = typeof delta === "number" && delta > 0;
  const isNegative = typeof delta === "number" && delta < 0;
  const deltaTone = isPositive
    ? "text-success"
    : isNegative
      ? "text-destructive"
      : "text-muted-foreground";

  const Wrapper = href ? Link : "div";
  const wrapperProps = href ? { to: href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "flex animate-in items-start justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-sm fade-in duration-150",
        href && "transition-colors hover:border-primary/40",
        className
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">{label}</span>

        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </span>
        )}

        {!loading && hasDelta ? (
          <span className={cn("inline-flex items-center gap-1 text-xs font-medium", deltaTone)}>
            {isPositive ? <TrendingUp className="size-3.5" /> : null}
            {isNegative ? <TrendingDown className="size-3.5" /> : null}
            <span>{delta}</span>
            {deltaLabel ? <span className="font-normal">{deltaLabel}</span> : null}
          </span>
        ) : null}
      </div>

      {loading ? (
        <Skeleton className="size-10 shrink-0 rounded-lg" />
      ) : Icon ? (
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            toneClass
          )}
        >
          <Icon className="size-5" />
        </div>
      ) : null}
    </Wrapper>
  );
}

export default StatCard;
