import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CHART_HEIGHT_SM, donutSlice, getChartColors } from './chartTheme';

/**
 * The longest-standing members, by share of total membership tenure.
 *
 * A donut rather than a bar chart because the question is "how much of our
 * history sits with a few companies" — a share of a whole, which is the one
 * question a donut answers better than a bar.
 *
 * The slices are the NEUTRAL ramp, not the status palette. A share of tenure is
 * neither good news nor bad news, and colouring the largest member green would
 * say something about them that is not true.
 *
 * "Others" is computed on the server from the total rather than summed from the
 * slices, so the legend reads 100% instead of 99.9% after five roundings.
 */

export interface TopMembersDonutProps {
  members: { company_name: string; days: number; share_pct: number }[];
  otherSharePct: number;
}

export const TopMembersDonut = ({ members, otherSharePct }: TopMembersDonutProps) => {
  const colors = getChartColors();

  const data = [
    ...members.map((member) => ({ name: member.company_name, value: member.share_pct })),
    // Only when there is one. A 0% "Others" slice is a legend row that says
    // nothing and a wedge nobody can see.
    ...(otherSharePct > 0 ? [{ name: 'Others', value: otherSharePct }] : []),
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="w-full sm:w-[45%]">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT_SM}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="88%"
              paddingAngle={1}
              stroke={colors.surface}
              strokeWidth={2}
            >
              {data.map((slice, index) => (
                <Cell key={slice.name} fill={donutSlice(index)} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => `${Number(value ?? 0)}%`}
              contentStyle={{
                background: colors.surface,
                border: `1px solid ${colors.grid}`,
                borderRadius: 8,
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/*
        The legend is a list, not Recharts' own: at five entries plus a share
        each, its inline legend wraps into the plot. A list also lets the
        percentage sit in a column that can be read down.
      */}
      <ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-2 p-0">
        {data.map((slice, index) => (
          <li key={slice.name} className="flex items-center gap-2">
            <span
              className="size-[10px] shrink-0 rounded-full"
              style={{ background: donutSlice(index) }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-supporting text-fg">{slice.name}</span>
            <span className="tabular text-supporting text-fg-muted">{slice.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TopMembersDonut;
