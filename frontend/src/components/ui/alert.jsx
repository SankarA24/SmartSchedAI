import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        info: "text-blue-600 bg-card [&>svg]:text-blue-600 border-blue-600/30 dark:text-blue-400 dark:[&>svg]:text-blue-400 dark:border-blue-400/30",
        success:
          "text-emerald-600 bg-card [&>svg]:text-emerald-600 border-emerald-600/30 dark:text-emerald-400 dark:[&>svg]:text-emerald-400 dark:border-emerald-400/30",
        warning:
          "text-amber-600 bg-card [&>svg]:text-amber-600 border-amber-600/30 dark:text-amber-400 dark:[&>svg]:text-amber-400 dark:border-amber-400/30",
        destructive:
          "text-destructive bg-card [&>svg]:text-destructive border-destructive/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props} />
  );
}

function AlertTitle({
  className,
  ...props
}) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight",
        className
      )}
      {...props} />
  );
}

function AlertDescription({
  className,
  ...props
}) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed",
        className
      )}
      {...props} />
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export { Alert, AlertTitle, AlertDescription, alertVariants }
