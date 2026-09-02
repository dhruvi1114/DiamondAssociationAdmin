import { ENDPOINTS } from '@/constant/endpoints';
import { BaseService, type ApiResult } from '@/services/BaseService';

/**
 * The refund queue (M5, A-5).
 *
 * A refund is never created here. One is raised only by cancelling a whole
 * event, in the events module — this screen moves an existing refund forward.
 * There is deliberately no "raise a refund" call to reach for.
 */

/** Mirrors `REFUND_STATUS` in `backend/src/modules/billing/payment.constants.ts`. */
export const REFUND_STATUS = {
  REQUESTED: 0,
  PROCESSING: 1,
  COMPLETED: 2,
  FAILED: 3,
  REJECTED: 4,
} as const;

/** The name `StatusChip` wants, from the code the API sends. */
export const REFUND_STATUS_NAME: Record<number, string> = {
  [REFUND_STATUS.REQUESTED]: 'REQUESTED',
  [REFUND_STATUS.PROCESSING]: 'PROCESSING',
  [REFUND_STATUS.COMPLETED]: 'COMPLETED',
  [REFUND_STATUS.FAILED]: 'FAILED',
  [REFUND_STATUS.REJECTED]: 'REJECTED',
};

export interface RefundRow {
  id: string;
  refund_number: string;
  /** String with 2dp, like every money field (api-conventions.md §1). */
  amount: string;
  status: number;
  /** Why it was refused or why it bounced. Null until one of those happens. */
  reason: string | null;
  /** The bank's reference, set when the money actually went. */
  provider_refund_id: string | null;
  processed_at: string | null;
  createdAt: string;
  /** Staff names, resolved server-side. Null where that step has not happened. */
  requested_by: string | null;
  approved_by: string | null;
  /** Whoever ended it. `status` says whether that was a reject, a send or a fail. */
  finalised_by: string | null;
  payment: { id: string; amount: string; invoice_number: string };
  /** Resolved by the server, so the screen does not care member or guest. */
  payer: { kind: 'MEMBER' | 'GUEST'; name: string };
}

export interface ListRefundsParams {
  page?: number;
  limit?: number;
  status?: number;
  /** Matches the refund number, the invoice number, or the payer's name. */
  search?: string;
}

const query = (params: ListRefundsParams = {}): string => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });

  const qs = search.toString();

  return qs ? `?${qs}` : '';
};

export const RefundsService = {
  list: (params?: ListRefundsParams): Promise<ApiResult<RefundRow[]>> =>
    BaseService.get(`${ENDPOINTS.REFUNDS.LIST}${query(params)}`),

  approve: (id: string): Promise<ApiResult<unknown>> =>
    BaseService.post(ENDPOINTS.REFUNDS.approve(id), {}),

  reject: (id: string, reason: string): Promise<ApiResult<unknown>> =>
    BaseService.post(ENDPOINTS.REFUNDS.reject(id), { reason }),

  complete: (id: string, reference: string): Promise<ApiResult<unknown>> =>
    BaseService.post(ENDPOINTS.REFUNDS.complete(id), { reference }),

  fail: (id: string, reason: string): Promise<ApiResult<unknown>> =>
    BaseService.post(ENDPOINTS.REFUNDS.fail(id), { reason }),
};

export default RefundsService;
