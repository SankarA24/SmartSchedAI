import { Cell, Legend, Pie, PieChart, Tooltip } from "recharts";

import ChartFrame, { CHART_COLORS, ChartTooltipContent } from "@/components/charts/ChartFrame";

/**
 * Donut chart of `[{ name, value }]` entries (e.g. classes per department),
 * one theme chart colour per slice. Data-only: fetch elsewhere, pass in.
 *
 * @param {object} props
 * @param {Array<{name:string,value:number}>} props.data
 * @param {string} [props.title='Departments']
 * @param {string} [props.description]
 * @param {React.ReactNode} [props.actions]
 * @param {number} [props.height=260]
 * @param {boolean} [props.loading]
 * @param {string} [props.className]
 * @param {string} [props.dataKey='value']
 * @param {string} [props.nameKey='name']
 * @param {(value:number,name:string)=>React.ReactNode} [props.valueFormatter]
 */
export default function DepartmentPie({
  data,
  title = "Departments",
  description,
  actions,
  height = 260,
  loading = false,
  className,
  dataKey = "value",
  nameKey = "name",
  valueFormatter,
}) {
  const entries = Array.isArray(data) ? data.filter((entry) => Number(entry?.[dataKey]) > 0) : [];
  const empty = !loading && entries.length === 0;

  return (
    <ChartFrame
      title={title}
      description={description}
      actions={actions}
      height={height}
      loading={loading}
      empty={empty}
      emptyMessage="No department data yet"
      className={className}
    >
      <PieChart>
        <Pie
          data={entries}
          dataKey={dataKey}
          nameKey={nameKey}
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={entries.length > 1 ? 2 : 0}
          stroke="var(--card)"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {entries.map((entry, index) => (
            <Cell key={entry[nameKey] ?? index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltipContent formatter={valueFormatter} />} />
        <Legend
          verticalAlign="bottom"
          height={36}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
        />
      </PieChart>
    </ChartFrame>
  );
}
