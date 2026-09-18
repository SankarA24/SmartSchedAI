import { cn } from "@/lib/utils";

/**
 * Subtle tinted chip for statuses and small labels.
 * Colour is reserved for real status meaning; use "neutral" for categories
 * such as department, type, or credits.
 *
 * variant: "neutral" | "info" | "success" | "warning" | "destructive"
 */
const VARIANTS = {
  neutral: "bg-secondary text-secondary-foreground",
  info: "bg-primary/12 text-primary",
  success: "bg-success/14 text-success",
  warning: "bg-warning/16 text-warning",
  destructive: "bg-destructive/14 text-destructive",
};

export function StatusBadge({ variant = "neutral", className, children, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-transparent px-2 py-0.5 text-xs font-medium [&>svg]:size-3",
        VARIANTS[variant] || VARIANTS.neutral,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export default StatusBadge;
