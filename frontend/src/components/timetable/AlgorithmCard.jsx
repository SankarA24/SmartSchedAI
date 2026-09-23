import { Check, Info, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/StatusBadge";

/**
 * One selectable generation-engine card. The caller renders one of these
 * per engine (Genetic, Backtracking, AI-assisted, Hybrid — the honest list;
 * there is no Greedy engine in this codebase).
 *
 * Props:
 *  - id, name, description, icon (component)
 *  - advantages: string[]
 *  - considerations: string[]
 *  - selected, recommended: boolean
 *  - onSelect: (id) => void
 *  - disabled, disabledReason: boolean, string
 */

export function AlgorithmCard({
  id,
  name,
  description,
  icon: Icon,
  advantages,
  considerations,
  selected,
  recommended,
  onSelect,
  disabled,
  disabledReason,
}) {
  const handleActivate = () => {
    if (disabled) return;
    onSelect?.(id);
  };

  const card = (
    <Card
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={!!selected}
      aria-disabled={!!disabled}
      onClick={handleActivate}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleActivate();
        }
      }}
      className={cn(
        "relative cursor-pointer py-5 transition-colors duration-150",
        selected ? "border-primary ring-1 ring-primary" : "hover:border-primary/40",
        disabled && "cursor-not-allowed opacity-60 hover:border-border"
      )}
    >
      {recommended && (
        <StatusBadge
          variant="info"
          className="absolute -top-2 right-4 gap-1"
        >
          <Sparkles className="size-3" />
          Recommended
        </StatusBadge>
      )}
      <CardHeader>
        <div className="flex items-center gap-2">
          {Icon && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
          )}
          <CardTitle className="text-base">{name}</CardTitle>
          {selected && <Check className="ml-auto size-4 shrink-0 text-primary" />}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {(advantages?.length > 0 || considerations?.length > 0) && (
        <CardContent className="flex flex-col gap-2 text-xs">
          {advantages?.length > 0 && (
            <ul className="flex flex-col gap-1">
              {advantages.map((item, index) => (
                <li key={index} className="flex items-start gap-1.5 text-muted-foreground">
                  <Check className="mt-0.5 size-3 shrink-0 text-success" />
                  {item}
                </li>
              ))}
            </ul>
          )}
          {considerations?.length > 0 && (
            <ul className="flex flex-col gap-1">
              {considerations.map((item, index) => (
                <li key={index} className="flex items-start gap-1.5 text-muted-foreground">
                  <Info className="mt-0.5 size-3 shrink-0 text-warning" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );

  if (disabled && disabledReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    );
  }

  return card;
}

export default AlgorithmCard;
