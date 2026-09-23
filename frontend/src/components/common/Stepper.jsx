import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Multi-step progress indicator. Purely presentational: the caller owns
 * which step is "current" and which ids are "completed".
 *
 * Props:
 *  - steps:        [{ id, label, description?, icon? }]
 *  - current:      id of the active step
 *  - completed:    [id] steps considered done (rendered with a check)
 *  - onStepClick?: (id) => void   omit to render non-interactive steps
 *  - orientation:  'horizontal' | 'vertical'   default 'horizontal'
 */
export function Stepper({
  steps = [],
  current,
  completed = [],
  onStepClick,
  orientation = "horizontal",
}) {
  const isVertical = orientation === "vertical";
  const isCompleted = (id) => completed.includes(id);
  const isCurrent = (id) => id === current;

  return (
    <ol
      className={cn(
        "flex",
        isVertical ? "flex-col gap-1" : "w-full flex-row items-start"
      )}
    >
      {steps.map((step, index) => {
        const Icon = step.icon;
        const done = isCompleted(step.id);
        const active = isCurrent(step.id);
        const last = index === steps.length - 1;
        const clickable = typeof onStepClick === "function";

        const marker = (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors duration-150",
              done && "border-primary bg-primary text-primary-foreground",
              active && !done && "border-primary text-primary",
              !active && !done && "border-border text-muted-foreground"
            )}
          >
            {done ? (
              <Check className="size-4" />
            ) : Icon ? (
              <Icon className="size-4" />
            ) : (
              index + 1
            )}
          </span>
        );

        const label = (
          <div className={cn("min-w-0", isVertical ? "" : "mt-2 text-center")}>
            <div
              className={cn(
                "truncate text-sm font-medium",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {step.label}
            </div>
            {step.description && (
              <div className="truncate text-xs text-muted-foreground">
                {step.description}
              </div>
            )}
          </div>
        );

        const content = (
          <div
            className={cn(
              "flex items-center gap-3",
              isVertical ? "flex-row" : "flex-1 flex-col"
            )}
          >
            {marker}
            {label}
          </div>
        );

        return (
          <li
            key={step.id}
            className={cn(
              isVertical
                ? "flex flex-col"
                : "flex flex-1 flex-col items-center",
              !isVertical && !last && "relative"
            )}
          >
            <div
              className={cn(
                "flex items-center",
                isVertical ? "flex-row gap-3" : "w-full flex-row"
              )}
            >
              {!isVertical && (
                <div
                  className={cn(
                    "h-px flex-1",
                    index === 0 ? "opacity-0" : done ? "bg-primary" : "bg-border"
                  )}
                />
              )}
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick(step.id)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    !isVertical && "flex flex-col items-center",
                    "rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  )}
                >
                  {content}
                </button>
              ) : (
                <div aria-current={active ? "step" : undefined}>{content}</div>
              )}
              {!isVertical && (
                <div
                  className={cn(
                    "h-px flex-1",
                    last ? "opacity-0" : done ? "bg-primary" : "bg-border"
                  )}
                />
              )}
            </div>
            {isVertical && !last && (
              <div className="ml-4 h-6 w-px bg-border" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default Stepper;
