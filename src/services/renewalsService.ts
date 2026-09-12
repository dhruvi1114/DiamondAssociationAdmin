import { ENDPOINTS } from '@/constant/endpoints';
import BaseService, { type ApiResult } from '@/services/BaseService';

/**
 * Renewal buckets and the job that drives them (M6, screen A-20).
 *
 * `due` / `grace` / `expired` are the same three states the renewal cycle
 * moves a membership term through — see Task 8's `renewal.service.ts`. The
 * summary and the list share one SQL shape per bucket, so the counts on the
 * tabs never disagree with the rows underneath them.
 */

export type RenewalBucket = 'due' | 'grace' | 'expired';

export interface RenewalSummary {
  due: number;
  grace: number;
  expired: number;
  notice_days: number;
  grace_days: number;
}

export interface RenewalRow {
  member_id: string;
  member_code: string | null;
  company_name: string;
  plan_name: string | null;
  billing_cycle: string | null;
  valid_till: string;
  grace_ends_on: string;
  renewal_term_id: string | null;
  renewal_status: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_total: string | null;
  invoice_status: string | null;
  claim_pending: boolean;
  renewal_declined: boolean;
}

export interface RenewalRunResult {
  closed: number;
  started: number;
  expired: number;
  raised: number;
  reminded: number;
  skipped: { member_code: string | null; company_name: string; reason: string }[];
}

export interface ListRenewalsParams {
  bucket: RenewalBucket;
  page: number;
  limit: number;
  search?: string;
}

const query = (params: Record<string, string | number | undefined>): string => {
  const qs = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  });

  const s = qs.toString();

  return s ? `?${s}` : '';
};

export const RenewalsService = {
  summary: (): Promise<ApiResult<RenewalSummary>> => BaseService.get(ENDPOINTS.RENEWALS.SUMMARY),

  list: (params: ListRenewalsParams): Promise<ApiResult<RenewalRow[]>> =>
    BaseService.get(`${ENDPOINTS.RENEWALS.LIST}${query({ ...params })}`),

  /** Runs the renewal cycle now: closes lapsed terms, starts grace, raises invoices, sends reminders. */
  run: (): Promise<ApiResult<RenewalRunResult>> => BaseService.post(ENDPOINTS.RENEWALS.RUN, {}),
};

export default RenewalsService;
