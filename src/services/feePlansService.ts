import BaseService, { type ApiResult } from './BaseService';
import { ENDPOINTS } from '@/constant/endpoints';

/**
 * M2 — the association's price list, as redesigned in
 * `docs/specs/2026-09-07-membership-fee-plans.md`.
 *
 * The shape it replaces was one flat row per price: `(category, tier, fee_type,
 * amount, duration, dates)`. Three things that could not be expressed there are
 * the whole reason for this module:
 *
 *  1. A plan has a **name**. The old public page derived one from the month
 *     count — 12 became "1 year" — so nobody could publish "Best Value".
 *  2. A plan carries **both prices**. Joining and renewal used to be two
 *     unrelated rows joined by nothing, which is how the live database ended up
 *     with one renewal row, switched off.
 *  3. A price change records **who it applies to**. `price_scope` is the only
 *     record of whether a rise was meant for everyone or for new members only,
 *     and it is knowable only at the moment the change is made.
 */

/** The four cycles are fixed system values (spec D-1). An admin names the plan, never the cycle. */
export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';

/** Who a price change reaches at renewal. Joining prices always reach new applicants only. */
export type PriceScope = 'ALL_MEMBERS' | 'NEW_MEMBERS_ONLY';

export const CYCLES: { value: BillingCycle; label: string; months: number }[] = [
  { value: 'MONTHLY', label: 'Monthly', months: 1 },
  { value: 'QUARTERLY', label: 'Quarterly', months: 3 },
  { value: 'HALF_YEARLY', label: '6 Months', months: 6 },
  { value: 'YEARLY', label: 'Yearly', months: 12 },
];

export const cycleLabel = (c: BillingCycle): string =>
  CYCLES.find((x) => x.value === c)?.label ?? c;

export const cycleMonths = (c: BillingCycle): number =>
  CYCLES.find((x) => x.value === c)?.months ?? 12;

export interface FeePlan {
  id: string;
  structure_id: string;
  billing_cycle: BillingCycle;
  /** What a member sees on the website: "Best Value". */
  name: string;
  /** Joining price, pre-tax. */
  amount: string;
  /** Renewal price, pre-tax. Required on any published plan — the hole this design closes. */
  renewal_amount: string;
  tax_rate: string;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  price_scope: PriceScope;
  is_active: boolean;
  /**
   * How many members hold a term priced from this row. It is what decides
   * whether an edit may write in place or must version — see `FeeStructures.tsx`.
   */
  member_count: number;
  /** Whether any invoice line references this row. Blocks an in-place amount edit. */
  is_billed: boolean;
}

export interface FeeStructure {
  id: string;
  name: string;
  is_active: boolean;
  /** Live plans only. A structure with none cannot be published (spec R-4). */
  plans: FeePlan[];
  createdAt: string;
  updatedAt: string;
  /** Staff names, resolved server-side. Null on rows that predate the columns. */
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateStructureBody {
  name: string;
  effective_from: string;
  /**
   * Who the new prices reach, when members are already on a retired price for one of these
   * cycles. Sent on create as well as update, because retire-then-create is how a price normally
   * changes (spec D-3) and it is the only moment that intent exists.
   */
  price_scope?: PriceScope;
  plans: {
    billing_cycle: BillingCycle;
    name: string;
    amount: string;
    renewal_amount: string;
    tax_rate: string;
  }[];
}

/**
 * A structure is saved whole, not plan by plan.
 *
 * The form edits four rows at once, so the server sees every cycle's intended
 * state in one request and can settle the whole thing in one transaction: write
 * the untouched rows off, fork the ones whose amount moved on a billed plan,
 * publish the ones newly switched on, close the ones switched off. Sending four
 * separate PATCHes would let a browser tab closing halfway leave a price list
 * half-changed, which is the one state nothing downstream can price against.
 */
export interface UpdateStructureBody extends CreateStructureBody {
  /**
   * Present only when the save forks at least one billed plan — it is the
   * answer to "do the members on the old price come with it", and the only
   * record of that intent (spec §7).
   */
  price_scope?: PriceScope;
}

/** Only the params this list actually accepts, so a typo cannot be silently dropped. */
export interface StructureListParams {
  page?: number;
  limit?: number;
  search?: string;
  /** Comma-separated: the control is a MultiSelect. */
  status?: string;
  /** Inclusive window on when the list was published, `YYYY-MM-DD`. Either end may stand alone. */
  created_from?: string;
  created_to?: string;
  /** Inclusive window on when a list's prices start applying, `YYYY-MM-DD`. */
  effective_from?: string;
  effective_to?: string;
}

const query = (params: StructureListParams = {}): string => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== false) search.set(key, String(value));
  });
  const qs = search.toString();

  return qs ? `?${qs}` : '';
};

const FeePlansService = {
  listStructures: (params?: StructureListParams): Promise<ApiResult<FeeStructure[]>> =>
    BaseService.get(`${ENDPOINTS.MASTERS.FEE_PLAN_STRUCTURES}${query(params)}`),

  getStructure: (id: string) =>
    BaseService.get<FeeStructure>(ENDPOINTS.MASTERS.feePlanStructure(id)),

  createStructure: (body: CreateStructureBody) =>
    BaseService.post<FeeStructure>(ENDPOINTS.MASTERS.FEE_PLAN_STRUCTURES, body),

  /**
   * The service decides, per row, between writing in place and forking a new
   * version; the screen only reports which happened.
   */
  updateStructure: (id: string, body: UpdateStructureBody) =>
    BaseService.patch<FeeStructure>(ENDPOINTS.MASTERS.feePlanStructure(id), body),

  /** Retire hides a structure from the website. It never stops billing (spec §7). */
  setStructureActive: (id: string, is_active: boolean) =>
    BaseService.patch<FeeStructure>(ENDPOINTS.MASTERS.feePlanStructure(id), { is_active }),
};

export default FeePlansService;
