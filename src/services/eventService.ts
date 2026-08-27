import { ENDPOINTS } from '@/constant/endpoints';
import { BaseService, http, type ApiResult } from '@/services/BaseService';

/**
 * Events API (M7). Mirrors `backend/src/modules/event` exactly.
 *
 * Money crosses the wire as a 2-decimal **string**, never a JSON number: a float
 * is what turns ₹1,000.10 into ₹1,000.0999999 (ADR-007).
 *
 * Visibility and status are integer codes rather than strings, because the tables
 * created from M7 store them that way (event-module schema spec §0.1). The maps
 * below are the only place the admin app is allowed to know the numbers.
 */

export const EVENT_VISIBILITY = { MEMBER_ONLY: 0, PUBLIC: 1 } as const;
export const EVENT_STATUS = { DRAFT: 0, PUBLISHED: 1, CANCELLED: 2, COMPLETED: 3 } as const;

export type EventVisibility = (typeof EVENT_VISIBILITY)[keyof typeof EVENT_VISIBILITY];
export type EventStatus = (typeof EVENT_STATUS)[keyof typeof EVENT_STATUS];

export interface EventPriceTier {
  name: string;
  starts_on: string;
  ends_on: string;
  member_price: string;
  non_member_price: string;
  display_order?: number;
}

/** A row in the admin list. */
export interface EventRow {
  id: string;
  slug: string;
  title: string;
  /** The `EventTypes` master row, if the event was classified. */
  event_type_id: string | null;
  /** Its name, resolved by the API — an id in a column tells nobody anything. */
  event_type: string | null;
  description: string | null;
  start_at: string;
  end_at: string;
  venue_name: string | null;
  city: string | null;
  registration_closes_at: string | null;
  requires_approval: boolean;
  visibility: number;
  status: number;
  capacity: number | null;
  seats_taken: number;
  createdAt: string;
  updatedAt: string;
  /** Staff names, resolved by the API — an id in a column tells nobody anything. */
  created_by: string | null;
  updated_by: string | null;
  tier_count: string;
}

export interface EventDetail extends EventRow {
  description: string | null;
  banner_path: string | null;
  venue_name: string | null;
  venue_address_line1: string | null;
  venue_address_line2: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  map_url: string | null;
  tax_rate: string;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  requires_approval: boolean;
  collect_food_preference: boolean;
  collect_photo: boolean;
  collect_gov_id: boolean;
  terms_version: string;
  price_tiers: EventPriceTier[];
}

/** What `publish` reports back: the audience the confirmation dialog promised. */
export interface PublishResult {
  id: string;
  status: number;
  audience_size: number;
}

export interface EventListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  visibility?: string;
}

const query = (params?: EventListParams | QueueParams): string => {
  if (!params) return '';

  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== false) search.set(key, String(value));
  });

  const qs = search.toString();

  return qs ? `?${qs}` : '';
};

/** 0…7, matching `registration.constants.ts` on the server. */
export const REGISTRATION_STATUS = {
  PENDING_APPROVAL: 0,
  PENDING_PAYMENT: 1,
  PAYMENT_UNDER_VERIFICATION: 2,
  CONFIRMED: 3,
  EXPIRED: 4,
  CANCELLED: 5,
  REJECTED: 6,
  REFUNDED: 7,
} as const;

export const SUBMISSION_STATUS = { PENDING: 0, VERIFIED: 1, REJECTED: 2 } as const;

export const SUBMISSION_METHOD: Record<number, string> = {
  0: 'Bank transfer',
  1: 'UPI',
  2: 'Cheque',
  3: 'Cash',
};

/** A booking, as the admin queues show it. */
export interface RegistrationRow {
  id: string;
  registration_code: string;
  event_id: string;
  event_title: string;
  registrant_type: number;
  status: number;
  attendee_count: number;
  total_amount: string;
  registered_at: string;
  expires_at: string | null;
  booked_by: string | null;
  /** The company's own email and phone, or the guest's. */
  contact_email: string | null;
  contact_phone: string | null;
  city: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  invoice_number: string | null;
}

/** One person on a booking — the "who is going to attend" row. */
export interface AttendeeRow {
  attendee_code: string;
  full_name: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  unit_price: string;
  food_preference: number | null;
  special_requirement: string | null;
  registration_code: string;
  status: number;
  booked_by: string | null;
  registrant_type: number;
}

/** A claim that money was sent, awaiting a decision. */
export interface PaymentSubmissionRow {
  id: string;
  invoice_id: string;
  invoice_number: string;
  method: number;
  reference_no: string;
  amount: string;
  paid_on: string;
  proof_path: string | null;
  status: number;
  rejection_reason: string | null;
  createdAt: string;
  paid_by: string | null;
  /** The person who filed the claim, as distinct from the company it is billed to. */
  claimed_by: string | null;
  /** The staff account that decided, split by which way they decided. */
  verified_by: string | null;
  verified_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  event_title: string | null;
  registration_code: string | null;
}

export interface QueueParams {
  page?: number;
  limit?: number;
  /** Comma-separated codes — "0,2" is "either of these". Empty means any. */
  status?: string;
  /** Payment queue only. Comma-separated `PAYMENT_METHOD` codes. */
  method?: string;
  event_id?: string;
  /** Matched server-side across the codes, names and contacts on the row. */
  search?: string;
}

/**
 * Auth is a bearer token, so a plain link to the export would 401 — the browser
 * has no way to attach it. Fetch as a blob, then hand over a save.
 *
 * The filename comes from the server's `Content-Disposition` where it sends one,
 * because the server is what knows the event's title and the date it ran.
 */
const downloadFile = async (url: string, fallbackName: string): Promise<void> => {
  const response = await http.get<Blob>(url, { responseType: 'blob' });
  const disposition = String(response.headers['content-disposition'] ?? '');
  const match = /filename="?([^"]+)"?/.exec(disposition);

  const objectUrl = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = match?.[1] ?? fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

export const EventService = {
  list: (params?: EventListParams): Promise<ApiResult<{ rows: EventRow[] }>> =>
    BaseService.get(`${ENDPOINTS.EVENTS.LIST}${query(params)}`),
  get: (id: string): Promise<ApiResult<EventDetail>> =>
    BaseService.get(ENDPOINTS.EVENTS.detail(id)),
  create: (body: unknown) => BaseService.post<EventDetail>(ENDPOINTS.EVENTS.LIST, body),
  update: (id: string, body: unknown) =>
    BaseService.patch<EventDetail>(ENDPOINTS.EVENTS.detail(id), body),
  remove: (id: string) => BaseService.delete(ENDPOINTS.EVENTS.detail(id)),
  publish: (id: string) => BaseService.post<PublishResult>(ENDPOINTS.EVENTS.publish(id), {}),
  cancel: (id: string, reason: string) => BaseService.post(ENDPOINTS.EVENTS.cancel(id), { reason }),

  listRegistrations: (params?: QueueParams): Promise<ApiResult<{ rows: RegistrationRow[] }>> =>
    BaseService.get(`${ENDPOINTS.EVENTS.REGISTRATIONS}${query(params)}`),
  approveRegistration: (id: string) => BaseService.post(ENDPOINTS.EVENTS.approve(id), {}),
  rejectRegistration: (id: string, reason: string) =>
    BaseService.post(ENDPOINTS.EVENTS.reject(id), { reason }),

  listAttendees: (
    eventId: string,
    params?: QueueParams,
  ): Promise<ApiResult<{ rows: AttendeeRow[] }>> =>
    BaseService.get(`${ENDPOINTS.EVENTS.attendees(eventId)}${query(params)}`),
  downloadAttendees: (eventId: string) =>
    downloadFile(ENDPOINTS.EVENTS.attendeesExport(eventId), 'attendees.xlsx'),

  listPaymentSubmissions: (
    params?: QueueParams,
  ): Promise<ApiResult<{ rows: PaymentSubmissionRow[] }>> =>
    BaseService.get(`${ENDPOINTS.EVENTS.PAYMENT_SUBMISSIONS}${query(params)}`),
  verifyPayment: (id: string) => BaseService.post(ENDPOINTS.EVENTS.verifyPayment(id), {}),
  rejectPayment: (id: string, reason: string) =>
    BaseService.post(ENDPOINTS.EVENTS.rejectPayment(id), { reason }),
};

export default EventService;
