import { cn } from "@/lib/utils";

/**
 * Generic empty/placeholder panel for lists, tables and dashboards with
 * nothing to show yet (no data, no results, a feature not wired up).
 *
 * Props: { icon, title, description, action }
 * `action` is any renderable node (typically a <Button>); rendered as-is.
 */
export function EmptyState({ icon, title, description, action, className }) {
  const Icon = icon;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center",
        className
      )}
    >
      {Icon && (
        <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </div>
      )}
      {title && <div className="text-sm font-medium text-foreground">{title}</div>}
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export default EmptyState;
