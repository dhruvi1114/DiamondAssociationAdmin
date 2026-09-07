import { ENDPOINTS } from '@/constant/endpoints';
import { BaseService, type ApiResult } from '@/services/BaseService';

/**
 * The admin landing page's work-queue counts (A-02, AJ-1).
 *
 * Every figure is computed in the backend. The screen renders what it is given
 * and adds nothing up itself — two places counting "renewals due" eventually
 * disagree about whether a lapsed one counts.
 */

/**
 * Only the tiles this admin may act on come back.
 *
 * A key that is ABSENT means the server did not offer that queue — the role
 * cannot work it, and the card is not drawn at all. That is different from a key
 * present with the value `0`, which means the queue is genuinely empty.
 */
export interface DashboardSummary {
  applications?: number;
  documents?: number;
  changeRequests?: number;
  invoices?: number;
  renewals?: number;
  notifications?: number;
}

/**
 * The filter every dashboard request carries.
 *
 * One shape for all three endpoints, mirroring the server's single schema: two
 * widgets on the same screen answering for two different periods is exactly what
 * a shared contract exists to prevent.
 */
export type DashboardPeriod = 'today' | 'wtd' | 'mtd' | 'qtd' | 'ytd' | 'last_30d' | 'custom';

export type CompareTo = 'previous_period' | 'previous_year' | 'none';

export interface DashboardFilters {
  period: DashboardPeriod;
  compare_to: CompareTo;
  /** `YYYY-MM-DD`, required together when the period is custom. */
  from?: string;
  to?: string;
}

/**
 * A headline figure.
 *
 * `delta_pct` is null whenever a comparison cannot honestly be made — no
 * previous period, or comparison switched off. The tile draws no chip at all for
 * that, rather than a 0% that would read as "flat".
 */
export interface KpiValue {
  value: number;
  delta_pct: number | null;
}

export interface NextEvent {
  id: string;
  title: string;
  start_at: string;
  city: string | null;
  /** NULL means the event has no seat limit. */
  capacity: number | null;
  booked: number;
}

export interface DashboardKpis {
  period: { from: string; to: string; compare_to: CompareTo };
  active_members: KpiValue;
  overdue_amount: KpiValue;
  overdue_invoice_count: number;
  collected: KpiValue;
  open_applications: KpiValue;
  stale_applications: number;
  next_event: NextEvent | null;
}

export interface TrendPoint {
  month: string;
  active: number;
  joined: number;
  lapsed: number;
}

export interface RevenueBucket {
  label: string;
  /** Money as a 2-decimal string (ADR-007), never a JSON number. */
  billed: string;
  collected: string;
}

export interface DashboardCharts {
  membership_trend: TrendPoint[];
  revenue: {
    grain: 'day' | 'week' | 'month';
    buckets: RevenueBucket[];
    billed: string;
    collected: string;
    pending: string;
    refunded: string;
  };
  top_members: { company_name: string; days: number; share_pct: number }[];
  /** Everything outside the top slices, so the donut sums to the whole. */
  other_share_pct: number;
  upcoming_events: NextEvent[];
}

const query = (filters: DashboardFilters): string => {
  const search = new URLSearchParams({
    period: filters.period,
    compare_to: filters.compare_to,
  });

  if (filters.from) search.set('from', filters.from);
  if (filters.to) search.set('to', filters.to);

  return `?${search.toString()}`;
};

export const DashboardService = {
  summary: (): Promise<ApiResult<DashboardSummary>> => BaseService.get(ENDPOINTS.DASHBOARD.SUMMARY),

  /**
   * The headline figures. Its own request, separate from the charts, so the
   * tiles paint while a twelve-month aggregate is still running rather than the
   * whole screen waiting on the slowest query.
   */
  kpis: (filters: DashboardFilters): Promise<ApiResult<DashboardKpis>> =>
    BaseService.get(`${ENDPOINTS.DASHBOARD.KPIS}${query(filters)}`),

  charts: (filters: DashboardFilters): Promise<ApiResult<DashboardCharts>> =>
    BaseService.get(`${ENDPOINTS.DASHBOARD.CHARTS}${query(filters)}`),
};

export default DashboardService;
