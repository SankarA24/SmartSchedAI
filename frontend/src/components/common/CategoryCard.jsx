import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";

/**
 * Clickable module tile used on hub/overview screens: icon + title +
 * description, a row of small label/value stats, and a status pill.
 */
const STATUS_META = {
  complete: { variant: "success", label: "Complete" },
  "in-progress": { variant: "info", label: "In Progress" },
  pending: { variant: "neutral", label: "Pending" },
};

export function CategoryCard({
  icon: Icon,
  title,
  description,
  status,
  items = [],
  onClick,
  disabled = false,
  className,
  ...props
}) {
  const meta = STATUS_META[status];
  const interactive = typeof onClick === "function" && !disabled;

  const handleKeyDown = (event) => {
    if (!interactive) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick(event);
    }
  };

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-disabled={disabled || undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        "group flex animate-in flex-col gap-4 rounded-xl border border-border bg-card p-5 text-left shadow-sm outline-none fade-in duration-150 transition-colors",
        interactive &&
          "cursor-pointer hover:border-primary/40 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50",
        disabled && "cursor-not-allowed opacity-60",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-5" />
            </div>
          ) : null}
          <div className="flex min-w-0 flex-col gap-1">
            {title ? <span className="font-semibold text-foreground">{title}</span> : null}
            {description ? (
              <span className="text-sm text-muted-foreground">{description}</span>
            ) : null}
          </div>
        </div>

        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      {items.length > 0 ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {items.map((item, index) => (
            <div key={item.label ?? index} className="flex flex-col">
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <span className="text-sm font-medium text-foreground">{item.value}</span>
            </div>
          ))}
        </div>
      ) : null}

      {meta ? (
        <div>
          <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
        </div>
      ) : null}
    </div>
  );
}

export default CategoryCard;
