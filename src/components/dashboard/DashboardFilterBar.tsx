import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import { InlineSelect } from '@/components/ui';
import type { CompareTo, DashboardFilters, DashboardPeriod } from '@/services/dashboardService';

/**
 * The period and comparison the whole dashboard answers for.
 *
 * One bar, not one per widget: without a single control every card can be
 * showing a different window, and a reader comparing two numbers on one screen
 * would be comparing two questions.
 *
 * The selection lives in the URL, so a dashboard can be bookmarked and sent to
 * somebody — which is most of what anyone does with a figure they find here.
 */

const PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'wtd', label: 'This week' },
  { value: 'mtd', label: 'This month' },
  { value: 'qtd', label: 'This quarter' },
  { value: 'ytd', label: 'This year' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

const COMPARISONS: { value: CompareTo; label: string }[] = [
  { value: 'previous_period', label: 'vs previous period' },
  { value: 'previous_year', label: 'vs last year' },
  { value: 'none', label: 'No comparison' },
];

export interface DashboardFilterBarProps {
  value: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
}

export const DashboardFilterBar = ({ value, onChange }: DashboardFilterBarProps) => (
  <div className="flex flex-wrap items-center gap-2">
    <InlineSelect
      label="Period"
      /*
        Wide enough for the longest option, because the dropdown panel inherits
        the trigger's width: at the default it fitted "This year" and truncated
        "This quarter" and "Last 30 days" to "This qu…" and "Last 30 …", which
        is the one place a period selector must not be ambiguous.
      */
      className="min-w-[150px]"
      value={value.period}
      options={PERIODS.map((period) => ({ value: period.value, label: period.label }))}
      onChange={(next) => {
        const period = String(next) as DashboardPeriod;

        // Leaving custom drops the dates with it, so a stale range cannot ride
        // along and be sent with a preset the server would then ignore.
        onChange(
          period === 'custom' ? { ...value, period } : { period, compare_to: value.compare_to },
        );
      }}
    />

    {/* Only when it means something. A date range beside "This month" is a
        control that does nothing, and a control that does nothing gets tried. */}
    {value.period === 'custom' ? (
      <DatePicker.RangePicker
        format="YYYY-MM-DD"
        allowEmpty={[false, false]}
        value={[value.from ? dayjs(value.from) : null, value.to ? dayjs(value.to) : null]}
        onChange={(range) =>
          onChange({
            ...value,
            ...(range?.[0] ? { from: range[0].format('YYYY-MM-DD') } : {}),
            ...(range?.[1] ? { to: range[1].format('YYYY-MM-DD') } : {}),
          })
        }
      />
    ) : null}

    <InlineSelect
      label="Compare to"
      /* Sized to "vs previous period", the longest of the three. */
      className="min-w-[190px]"
      value={value.compare_to}
      options={COMPARISONS.map((option) => ({ value: option.value, label: option.label }))}
      onChange={(next) => onChange({ ...value, compare_to: String(next) as CompareTo })}
    />
  </div>
);

export default DashboardFilterBar;
