import { useId } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import ChartFrame, { ChartTooltipContent } from "@/components/charts/ChartFrame";

/**
 * Area chart of `[{ label, value }]` entries (e.g. classes per day of the
 * week). Data-only: fetch elsewhere, pass in.
 *
 * @param {object} props
 * @param {Array<{label:string,value:number}>} props.data
 * @param {string} [props.dataKey='value']
 * @param {string} [props.labelKey='label']
 * @param {string} [props.title='Weekly activity']
 * @param {string} [props.description]
 * @param {React.ReactNode} [props.actions]
 * @param {number} [props.height=260]
 * @param {boolean} [props.loading]
 * @param {string} [props.className]
 * @param {string} [props.color='var(--chart-1)']
 * @param {(value:number,name:string)=>React.ReactNode} [props.valueFormatter]
 */
export default function WeeklyActivityArea({
  data,
  dataKey = "value",
  labelKey = "label",
  title = "Weekly activity",
  description,
  actions,
  height = 260,
  loading = false,
  className,
  color = "var(--chart-1)",
  valueFormatter,
}) {
  const gradientId = useId();
  const entries = Array.isArray(data) ? data : [];
  const empty = !loading && entries.every((entry) => !Number(entry?.[dataKey]));

  return (
    <ChartFrame
      title={title}
      description={description}
      actions={actions}
      height={height}
      loading={loading}
      empty={empty}
      emptyMessage="No activity this week yet"
      className={className}
    >
      <AreaChart data={entries} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey={labelKey}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
        />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={32}
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
        />
        <Tooltip
          content={<ChartTooltipContent formatter={valueFormatter} />}
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          activeDot={{ r: 4, stroke: color, fill: "var(--card)", strokeWidth: 2 }}
        />
      </AreaChart>
    </ChartFrame>
  );
}
