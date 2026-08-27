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
const saveBlob = (blob: Blob, filename: string): void => {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

/**
 * Open the PDF in a new tab instead of saving it.
 *
 * The tab is opened SYNCHRONOUSLY, before the fetch, and pointed at the file
 * once the bytes arrive. Opening it after the `await` is a window opened from a
 * timer as far as the browser is concerned, and every popup blocker stops it —
 * the click that asked for it is long over by then.
 *
 * The object URL is revoked on a long timer rather than immediately: it is what
 * the other tab is reading from, and revoking it the moment this one is done
 * leaves the reader with a blank viewer.
 */
const previewPdf = async (url: string, filename: string): Promise<void> => {
  /*
    No `noopener` here, deliberately: with it `window.open` returns null by
    specification, and null is exactly the handle this needs to point the tab at
    the file once the bytes arrive. The opener is severed below instead, which
    buys the same thing without giving up the reference.
  */
  const tab = window.open('', '_blank');

  if (tab) tab.opener = null;

  try {
    const response = await http.get<Blob>(url, { responseType: 'blob' });
    const objectUrl = URL.createObjectURL(response.data);

    if (tab) {
      tab.location.href = objectUrl;
    } else {
      // A blocked popup is not a reason to lose the document: fall back to the
      // save the button used to do, so the click still produces the PDF.
      saveBlob(response.data, filename);
    }

    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
};

export const InvoicesService = {
  list: (params?: ListInvoicesParams): Promise<ApiResult<InvoiceListRow[]>> =>
    BaseService.get(`${ENDPOINTS.INVOICES.LIST}${query(params)}`),

  previewInvoicePdf: (id: string, filename: string): Promise<void> =>
    previewPdf(ENDPOINTS.INVOICES.pdf(id), filename),

  previewReceiptPdf: (id: string, filename: string): Promise<void> =>
    previewPdf(ENDPOINTS.INVOICES.receiptPdf(id), filename),
};

export default InvoicesService;
