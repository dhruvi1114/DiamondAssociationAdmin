import { ENDPOINTS } from '@/constant/endpoints';
import { BaseService, type ApiResult } from '@/services/BaseService';

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

/** A row in the admin list. Narrower than the detail on purpose. */
export interface EventRow {
  id: string;
  slug: string;
  title: string;
  start_at: string;
  end_at: string;
  city: string | null;
  visibility: number;
  status: number;
  capacity: number | null;
  seats_taken: number;
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

const query = (params?: EventListParams): string => {
  if (!params) return '';

  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== false) search.set(key, String(value));
  });

  const qs = search.toString();

  return qs ? `?${qs}` : '';
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
};

export default EventService;
