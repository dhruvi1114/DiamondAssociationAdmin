import { ENDPOINTS } from '@/constant/endpoints';
import { BaseService, type ApiResult } from '@/services/BaseService';

/**
 * Enquiries sent from the public contact form (M8).
 *
 * A tracked to-do list, not a helpdesk: staff reply from their own inbox — the
 * notification carries the sender's address as Reply-To — and come back here to
 * mark it dealt with.
 */

/** Mirrors `ENQUIRY_STATUS` in `backend/src/modules/contact/contact.types.ts`. */
export const ENQUIRY_STATUS = { NEW: 0, HANDLED: 1 } as const;

export const ENQUIRY_STATUS_NAME: Record<number, string> = {
  [ENQUIRY_STATUS.NEW]: 'NEW',
  [ENQUIRY_STATUS.HANDLED]: 'HANDLED',
};

export interface EnquiryRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: number;
  /** Staff name, resolved server-side. Null while the enquiry is still new. */
  handled_by: string | null;
  handled_at: string | null;
  createdAt: string;
}

export interface ListEnquiriesParams {
  page?: number;
  limit?: number;
  status?: number;
  search?: string;
}

const query = (params: ListEnquiriesParams = {}): string => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });

  const qs = search.toString();

  return qs ? `?${qs}` : '';
};

export const EnquiriesService = {
  list: (params?: ListEnquiriesParams): Promise<ApiResult<EnquiryRow[]>> =>
    BaseService.get(`${ENDPOINTS.ENQUIRIES.LIST}${query(params)}`),

  setHandled: (id: string, handled: boolean): Promise<ApiResult<unknown>> =>
    BaseService.patch(ENDPOINTS.ENQUIRIES.status(id), { handled }),
};

export default EnquiriesService;
