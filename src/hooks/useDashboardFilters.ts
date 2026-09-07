import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CompareTo, DashboardFilters, DashboardPeriod } from '@/services/dashboardService';

/**
 * The dashboard's filters, held in the URL.
 *
 * In the URL rather than in state so a dashboard can be bookmarked and sent to
 * somebody — which is most of what anyone does with a figure they find here. It
 * also means the back button undoes a filter change, which is what a reader
 * expects after clicking through three periods.
 */

const PERIODS = ['today', 'wtd', 'mtd', 'qtd', 'ytd', 'last_30d', 'custom'] as const;
const COMPARISONS = ['previous_period', 'previous_year', 'none'] as const;

const isPeriod = (value: string | null): value is DashboardPeriod =>
  PERIODS.includes(value as DashboardPeriod);

const isCompare = (value: string | null): value is CompareTo =>
  COMPARISONS.includes(value as CompareTo);

export const useDashboardFilters = (): {
  filters: DashboardFilters;
  setFilters: (next: DashboardFilters) => void;
} => {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<DashboardFilters>(() => {
    const period = params.get('period');
    const compare = params.get('compare_to');
    const from = params.get('from');
    const to = params.get('to');

    /*
      A custom period with no dates falls back to month-to-date rather than
      being sent as-is: the server refuses it, and a dashboard that errors
      because somebody edited the URL is worse than one that shows this month.
    */
    const resolved: DashboardPeriod =
      isPeriod(period) && !(period === 'custom' && !(from && to)) ? period : 'mtd';

    return {
      period: resolved,
      compare_to: isCompare(compare) ? compare : 'previous_period',
      ...(resolved === 'custom' && from ? { from } : {}),
      ...(resolved === 'custom' && to ? { to } : {}),
    };
  }, [params]);

  const setFilters = useCallback(
    (next: DashboardFilters) => {
      const search = new URLSearchParams(params);

      search.set('period', next.period);
      search.set('compare_to', next.compare_to);

      if (next.from) search.set('from', next.from);
      else search.delete('from');

      if (next.to) search.set('to', next.to);
      else search.delete('to');

      // Replace, not push: three clicks through the period selector should not
      // put three entries in the back stack.
      setParams(search, { replace: true });
    },
    [params, setParams],
  );

  return { filters, setFilters };
};

export default useDashboardFilters;
