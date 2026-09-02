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

export const DashboardService = {
  summary: (): Promise<ApiResult<DashboardSummary>> => BaseService.get(ENDPOINTS.DASHBOARD.SUMMARY),
};

export default DashboardService;
