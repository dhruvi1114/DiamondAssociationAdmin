import { ENDPOINTS } from '@/constant/endpoints';
import { BaseService, http, type ApiResult } from '@/services/BaseService';

/**
 * Member records, KYC documents and status changes (M3).
 *
 * Mirrors `backend/src/modules/member` and `backend/src/modules/document`
 * exactly. Two contract details shape every type below:
 *
 *  1. **Every BigInt id arrives as a string.** The controller serialises with a
 *     replacer (`member.controller.ts`) because `JSON.stringify` throws on a
 *     BigInt. Typing these as `number` would work until an id passes 2^53 and
 *     then silently round — so they are strings all the way to the URL.
 *  2. **Counts from the raw list query are strings too**, for the same reason:
 *     `count(*)` comes back from Postgres as a bigint.
 */

export type MemberStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'TERMINATED';

export type DocumentVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

/** Columns the backend will sort by. Anything else is a 422 (member.types.ts). */
export type MemberSortBy = 'company_name' | 'member_code' | 'status' | 'createdAt';

export interface MemberListRow {
  id: string;
  member_code: string | null;
  company_name: string;
  legal_name: string | null;
  status: MemberStatus;
  category_name: string | null;
  tier_name: string | null;
  contact_email: string | null;
  city: string | null;
  document_count: string;
  pending_documents: string;
  createdAt: string;
  updatedAt: string;
  gst_number: string | null;
  pan_number: string | null;
  mobile: string | null;
  company_type_name: string | null;
  /** Always the applicant — a member row is created at signup, ADR-016. */
  created_by: string;
  /** Whoever recorded the most recent status change. NULL when the platform
   *  made the change itself (payment received, term expired). */
  updated_by: string | null;
  /** The PENDING → ACTIVE transition specifically — often NULL, since
   *  activation is usually automatic (payment), not an admin decision. */
  approved_by: string | null;
}

export interface MemberContact {
  id: string;
  name: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
}

export interface MemberAddress {
  id: string;
  address_type: 'REGISTERED' | 'FACTORY' | 'CORRESPONDENCE';
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  country: string;
  pincode: string;
  is_primary: boolean;
}

export interface MemberStatusHistoryRow {
  id: string;
  from_status: MemberStatus | null;
  to_status: MemberStatus;
  reason: string | null;
  changed_by_admin_id: string | null;
  changed_by: { id: string; full_name: string } | null;
  createdAt: string;
}

export interface MemberChangeRequest {
  id: string;
  changes_json: Record<string, { old: unknown; new: unknown }>;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  remarks: string | null;
  decided_at: string | null;
  createdAt: string;
}

export type InvoiceStatus =
  'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface MemberInvoice {
  id: string;
  invoice_number: string;
  invoice_type: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  total_amount: string;
  amount_paid: string;
  balance_due: string;
  currency: string;
}

export interface MemberDetail {
  id: string;
  member_code: string | null;
  company_name: string;
  company_type_id: string | null;
  company_type: { id: string; code: string; name: string } | null;
  gstin_holder: boolean;
  company_category: boolean | null;
  landline: string | null;
  consent_accepted_at: string | null;
  consent_ip: string | null;
  legal_name: string | null;
  business_type: string | null;
  iec_code: string | null;
  gst_number: string | null;
  pan_number: string | null;
  trade_license_no: string | null;
  website: string | null;
  about: string | null;
  status: MemberStatus;
  directory_visible: boolean;
  joined_on: string | null;
  createdAt: string;
  updatedAt: string;
  category_id: string | null;
  tier_id: string | null;
  categories?: { category: { id: string; code: string; name: string } }[];
  category: { id: string; code: string; name: string } | null;
  tier: { id: string; code: string; name: string } | null;
  primary_user: {
    id: string;
    email: string;
    full_name: string;
    phone: string | null;
    status: string;
  } | null;
  contacts: MemberContact[];
  addresses: MemberAddress[];
  invoices: MemberInvoice[];
  status_history: MemberStatusHistoryRow[];
  change_requests: MemberChangeRequest[];
}

export interface MemberDocument {
  id: string;
  member_id: string;
  document_type_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: string;
  version: number;
  verification_status: DocumentVerificationStatus;
  verified_at: string | null;
  remarks: string | null;
  createdAt: string;
  /** Which face of the document this file is. SINGLE for a one-file type. */
  side: 'SINGLE' | 'FRONT' | 'BACK' | 'COMBINED';
  document_type: {
    id: string;
    code: string;
    name: string;
    is_required: boolean;
    sides: 'SINGLE' | 'FRONT_AND_BACK';
  };
  verified_by: { id: string; full_name: string } | null;
}

export interface ListMembersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: MemberStatus | '' | string;
  category_id?: string;
  tier_id?: string;
  sortBy?: MemberSortBy;
  sortOrder?: 'asc' | 'desc';
}

/** Fields an admin may edit directly (`adminUpdateMemberSchema`). */
export interface AdminUpdateMemberInput {
  company_name?: string;
  legal_name?: string | null;
  business_type?: string | null;
  iec_code?: string | null;
  gst_number?: string | null;
  pan_number?: string | null;
  trade_license_no?: string | null;
  website?: string | null;
  about?: string | null;
  directory_visible?: boolean;
}

const query = (params: ListMembersParams = {}): string => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });

  const qs = search.toString();

  return qs ? `?${qs}` : '';
};

export const MembersService = {
  list: (params?: ListMembersParams): Promise<ApiResult<MemberListRow[]>> =>
    BaseService.get(`${ENDPOINTS.MEMBERS.LIST}${query(params)}`),

  detail: (id: string): Promise<ApiResult<MemberDetail>> =>
    BaseService.get(ENDPOINTS.MEMBERS.detail(id)),

  update: (id: string, body: AdminUpdateMemberInput): Promise<ApiResult<MemberDetail>> =>
    BaseService.patch(ENDPOINTS.MEMBERS.detail(id), body),

  /** Reason is mandatory — the member is told why their class changed. */
  changeCategory: (
    id: string,
    body: { category_ids: string[]; reason: string },
  ): Promise<ApiResult<MemberDetail>> => BaseService.patch(ENDPOINTS.MEMBERS.category(id), body),

  suspend: (id: string, reason: string) =>
    BaseService.post<MemberDetail>(ENDPOINTS.MEMBERS.suspend(id), { reason }),

  reactivate: (id: string, reason: string) =>
    BaseService.post<MemberDetail>(ENDPOINTS.MEMBERS.reactivate(id), { reason }),

  terminate: (id: string, reason: string) =>
    BaseService.post<MemberDetail>(ENDPOINTS.MEMBERS.terminate(id), { reason }),

  documents: (id: string): Promise<ApiResult<MemberDocument[]>> =>
    BaseService.get(ENDPOINTS.MEMBERS.documents(id)),

  /**
   * Record an offline payment against an invoice (`payment.record`).
   *
   * No online checkout exists yet — a member pays by bank transfer or similar
   * and staff confirm it here. Activates the member and its term together when
   * this was the invoice they were waiting on.
   */
  markInvoicePaid: (
    id: string,
    invoiceId: string,
  ): Promise<ApiResult<{ invoice: MemberInvoice; member: MemberDetail }>> =>
    BaseService.post(ENDPOINTS.MEMBERS.markInvoicePaid(id, invoiceId), {}),

  /** `remarks` is mandatory on REJECTED — 422 without it, by schema and by CHECK. */
  verifyDocument: (
    documentId: string,
    body: { status: 'VERIFIED' | 'REJECTED'; remarks?: string },
  ): Promise<ApiResult<MemberDocument>> =>
    BaseService.patch(ENDPOINTS.DOCUMENTS.verify(documentId), body),

  /**
   * Pull a KYC file through the authorised endpoint and hand it to the browser.
   *
   * There is no static URL for these files by design (file-storage.md §3), so an
   * `<a href>` cannot work: the request has to carry the admin's bearer token and
   * the `x-audience: admin` header that tells the shared route which middleware
   * to run. That means fetching the bytes and driving the save from an object
   * URL rather than letting the browser navigate.
   *
   * The filename comes from the row we already hold rather than from
   * `Content-Disposition` — that header is not in the API's
   * `Access-Control-Expose-Headers`, so a cross-origin reader cannot see it.
   */
  downloadDocument: async (documentId: string, filename: string): Promise<void> => {
    const response = await http.get<Blob>(ENDPOINTS.DOCUMENTS.download(documentId), {
      responseType: 'blob',
      headers: { 'x-audience': 'admin' },
    });

    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    // Revoking immediately can race the save on some browsers; one tick is enough.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

export default MembersService;
