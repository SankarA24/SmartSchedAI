import { ResponsiveContainer } from "recharts";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The eight theme-driven series colours every chart in this folder cycles
 * through. Always passed to recharts as the literal CSS variable string so
 * light/dark/print follow `index.css` automatically — never resolved in JS.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

/** Pick a chart colour by index, wrapping around the 8-colour palette. */
// eslint-disable-next-line react-refresh/only-export-components
export function chartColorAt(index) {
  return CHART_COLORS[((index % CHART_COLORS.length) + CHART_COLORS.length) % CHART_COLORS.length];
}

/**
 * Shared recharts `<Tooltip content>` renderer, styled with tokens
 * (`bg-popover`/`border-border`) instead of recharts' default tooltip.
 * Pass as `<Tooltip content={<ChartTooltipContent formatter={...} />} />`.
 */
export function ChartTooltipContent({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {label != null && <p className="mb-1 font-medium">{label}</p>}
      <ul className="flex flex-col gap-1">
        {payload.map((entry, index) => (
          <li key={entry.dataKey ?? entry.name ?? index} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color || entry.fill || entry.payload?.fill }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-medium text-popover-foreground">
              {formatter ? formatter(entry.value, entry.name, entry) : entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Shared wrapper for every chart in this folder: title/description/actions
 * header, a fixed-height `ResponsiveContainer`, and loading/empty states so
 * individual charts only render the recharts tree itself.
 *
 * @param {object} props
 * @param {string} [props.title]
 * @param {string} [props.description]
 * @param {React.ReactNode} [props.actions] - rendered top-right of the header
 * @param {number} [props.height=260]
 * @param {boolean} [props.loading] - shows a skeleton in place of the chart
 * @param {boolean} [props.empty] - shows `emptyMessage` in place of the chart
 * @param {string} [props.emptyMessage='No data available']
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children - a single recharts chart element
 */
export default function ChartFrame({
  title,
  description,
  actions,
  height = 260,
  loading = false,
  empty = false,
  emptyMessage = "No data available",
  className,
  children,
}) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <Card className={cn("gap-4 print:break-inside-avoid print:shadow-none", className)}>
      {hasHeader && (
        <CardHeader>
          {title && <CardTitle className="text-base">{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
          {actions && <CardAction className="print:hidden">{actions}</CardAction>}
        </CardHeader>
      )}
      <CardContent>
        {loading ? (
          <Skeleton className="w-full rounded-md" style={{ height }} />
        ) : empty ? (
          <div
            className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground"
            style={{ height }}
          >
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <div className="w-full print:min-h-[200px]" style={{ height }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              {children}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
