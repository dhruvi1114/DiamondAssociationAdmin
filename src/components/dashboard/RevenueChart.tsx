import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { RevenueBucket } from '@/services/dashboardService';
import { CHART_HEIGHT, CHART_MARGIN, axisTick, getChartColors } from './chartTheme';

/**
 * Billed against collected, across the chosen period.
 *
 * Two bars, not one stacked. They are two different events — an invoice is
 * raised on one day and paid on another — and the GAP between them is the
 * receivable, which is the thing this chart exists to show. Stacking them would
 * hide it.
 *
 * Money arrives as a string (ADR-007) and is converted here, at the last
 * possible moment, because a chart needs a number and nothing downstream of this
 * does arithmetic on it.
 */

const inr = (value: number): string =>
  value >= 1_00_000
    ? `₹${(value / 1_00_000).toFixed(1)}L`
    : `₹${Math.round(value).toLocaleString('en-IN')}`;

export const RevenueChart = ({
  buckets,
  grain,
}: {
  buckets: RevenueBucket[];
  grain: 'day' | 'week' | 'month';
}) => {
  const colors = getChartColors();

  const label = (iso: string): string => {
    const date = new Date(iso);

    if (grain === 'month') return date.toLocaleDateString('en-IN', { month: 'short' });

    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  const data = buckets.map((bucket) => ({
    label: bucket.label,
    Billed: Number(bucket.billed),
    Collected: Number(bucket.collected),
  }));

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tickFormatter={label}
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
          width={56}
          tickFormatter={inr}
        />
        <Tooltip
          labelFormatter={(value) => label(String(value ?? ''))}
          formatter={(value) => inr(Number(value ?? 0))}
          contentStyle={{
            background: colors.surface,
            border: `1px solid ${colors.grid}`,
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Billed" fill={colors.primary} radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Bar dataKey="Collected" fill={colors.success} radius={[3, 3, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default RevenueChart;
