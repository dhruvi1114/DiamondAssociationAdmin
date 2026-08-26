import { ENDPOINTS } from '@/constant/endpoints';
import { BaseService, http, type ApiResult } from '@/services/BaseService';

/**
 * Every invoice across every member (M5, A-14) — the org-wide counterpart to
 * the per-member invoice card on the profile screen (`ProfileTab.tsx`, M4),
 * which stays exactly as it is: this list is for finding an invoice, that
 * card is for acting on one.
 */

export type InvoiceStatus =
  'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type InvoiceSortBy = 'issue_date' | 'due_date' | 'total_amount' | 'invoice_number';

export interface InvoiceListRow {
  id: string;
  invoice_number: string;
  invoice_type: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  /** Before tax. String with 2dp, like every money field (api-conventions.md §1). */
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  amount_paid: string;
  balance_due: string;
  currency: string;
  member_id: string;
  company_name: string;
  member_code: string | null;
  /** When the invoice was settled. NULL until a receipt exists for it. */
  paid_at: string | null;
}

export interface ListInvoicesParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  /** Inclusive issue-date window, `YYYY-MM-DD`. Either end may stand alone. */
  issued_from?: string;
  issued_to?: string;
  sortBy?: InvoiceSortBy;
  sortOrder?: 'asc' | 'desc';
}

const query = (params: ListInvoicesParams = {}): string => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });

  const qs = search.toString();

  return qs ? `?${qs}` : '';
};

/**
 * Auth here is a bearer token, not a cookie (`BaseService.ts`'s request
 * interceptor), so a plain `<a href>` to a PDF route would 401 — the browser
 * has no way to attach it. Fetch as a blob, then hand the browser a save.
 *
 * No `x-audience` header: the route (`authenticateEitherAudience`,
 * `member.routes.ts`) reads the audience out of the JWT's own `aud` claim,
 * not a header — and CORS's `allowedHeaders` (`security.ts`) doesn't list
 * `x-audience`, so sending it here would make the browser block the request
 * at the preflight before it ever reaches the server.
 */
const downloadPdf = async (url: string, filename: string): Promise<void> => {
  const response = await http.get<Blob>(url, { responseType: 'blob' });

  const objectUrl = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

export const InvoicesService = {
  list: (params?: ListInvoicesParams): Promise<ApiResult<InvoiceListRow[]>> =>
    BaseService.get(`${ENDPOINTS.INVOICES.LIST}${query(params)}`),

  downloadInvoicePdf: (id: string, filename: string): Promise<void> =>
    downloadPdf(ENDPOINTS.INVOICES.pdf(id), filename),

  downloadReceiptPdf: (id: string, filename: string): Promise<void> =>
    downloadPdf(ENDPOINTS.INVOICES.receiptPdf(id), filename),
};

export default InvoicesService;
