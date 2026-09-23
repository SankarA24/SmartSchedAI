import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Generic content section: optional icon + title/description header with a
 * trailing actions slot, a body, and an optional footer. Thin wrapper over
 * ui/card.jsx so pages stop hand-rolling the same header layout.
 */
export function SectionCard({
  title,
  description,
  icon: Icon,
  actions,
  footer,
  padded = true,
  children,
  className,
  ...props
}) {
  const hasHeader = Boolean(title || description || Icon || actions);

  return (
    <Card className={cn("animate-in fade-in duration-150", className)} {...props}>
      {hasHeader ? (
        <CardHeader>
          <div className="flex items-start gap-3">
            {Icon ? (
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </div>
            ) : null}
            <div className="flex min-w-0 flex-col gap-1">
              {title ? <CardTitle>{title}</CardTitle> : null}
              {description ? <CardDescription>{description}</CardDescription> : null}
            </div>
          </div>
          {actions ? <CardAction>{actions}</CardAction> : null}
        </CardHeader>
      ) : null}

      {children ? (
        <CardContent className={cn(padded ? "px-6" : "px-0")}>{children}</CardContent>
      ) : null}

      {footer ? <CardFooter className="border-t">{footer}</CardFooter> : null}
    </Card>
  );
}

export default SectionCard;
