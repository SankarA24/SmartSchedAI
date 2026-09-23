import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";

import ChartFrame, { CHART_COLORS, ChartTooltipContent } from "@/components/charts/ChartFrame";

/**
 * Horizontal bar chart of `[{ name, value }]` entries against a fixed
 * `max` (e.g. room/faculty utilization out of 100). Data-only: fetch
 * elsewhere, pass in.
 *
 * @param {object} props
 * @param {Array<{name:string,value:number}>} props.data
 * @param {number} [props.max=100]
 * @param {string} [props.title='Utilization']
 * @param {string} [props.description]
 * @param {React.ReactNode} [props.actions]
 * @param {number} [props.height=260]
 * @param {boolean} [props.loading]
 * @param {string} [props.className]
 * @param {string} [props.dataKey='value']
 * @param {string} [props.nameKey='name']
 * @param {(value:number,name:string)=>React.ReactNode} [props.valueFormatter]
 */
export default function UtilizationBar({
  data,
  max = 100,
  title = "Utilization",
  description,
  actions,
  height = 260,
  loading = false,
  className,
  dataKey = "value",
  nameKey = "name",
  valueFormatter = (value) => `${value}%`,
}) {
  const entries = Array.isArray(data) ? data : [];
  const empty = !loading && entries.length === 0;
  const rowHeight = 32;
  const chartHeight = Math.max(height, entries.length * rowHeight + 32);

  return (
    <ChartFrame
      title={title}
      description={description}
      actions={actions}
      height={chartHeight}
      loading={loading}
      empty={empty}
      emptyMessage="No utilization data yet"
      className={className}
    >
      <BarChart
        data={entries}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        barCategoryGap="28%"
      >
        <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          type="number"
          domain={[0, max]}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
        />
        <YAxis
          type="category"
          dataKey={nameKey}
          tickLine={false}
          axisLine={false}
          width={104}
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
        />
        <Tooltip
          content={<ChartTooltipContent formatter={valueFormatter} />}
          cursor={{ fill: "var(--muted)" }}
        />
        <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
          {entries.map((entry, index) => (
            <Cell key={entry[nameKey] ?? index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}
