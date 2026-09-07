import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPoint } from '@/services/dashboardService';
import { CHART_HEIGHT, CHART_MARGIN, axisTick, getChartColors } from './chartTheme';

/**
 * Twelve months of membership.
 *
 * Three series, and the reason they can share an axis is that all three are
 * counts of members — a level and two flows, but the same unit. Joined and
 * lapsed are drawn thinner than active on purpose: the headcount is the story
 * and the moves are the explanation.
 *
 * Always twelve months, whatever the page filter says. A membership trend read
 * over one month is two points and a straight line between them, which is not a
 * trend — the filter scopes the money, not the history.
 */

const monthLabel = (month: string): string => {
  const [year, m] = month.split('-');
  const date = new Date(Number(year), Number(m) - 1, 1);

  return date.toLocaleDateString('en-IN', { month: 'short' });
};

export const MembershipTrendChart = ({ data }: { data: TrendPoint[] }) => {
  const colors = getChartColors();

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={monthLabel}
          tick={axisTick}
          className="text-fg-muted"
          axisLine={{ stroke: colors.grid }}
          tickLine={false}
        />
        <YAxis
          tick={axisTick}
          className="text-fg-muted"
          axisLine={false}
          tickLine={false}
          width={40}
          allowDecimals={false}
        />
        <Tooltip
          labelFormatter={(value) => monthLabel(String(value ?? ''))}
          contentStyle={{
            background: colors.surface,
            border: `1px solid ${colors.grid}`,
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="active"
          name="Active members"
          stroke={colors.primary}
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="joined"
          name="Joined"
          stroke={colors.success}
          strokeWidth={1.5}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="lapsed"
          name="Lapsed"
          stroke={colors.danger}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default MembershipTrendChart;
