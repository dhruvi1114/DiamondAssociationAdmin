import dayjs, { type Dayjs } from 'dayjs';

/**
 * The price-table shape the event form works in, and the two conversions either
 * side of it.
 *
 * Kept out of `PriceTierEditor.tsx` so that file exports only its component:
 * a module mixing components and plain functions loses fast refresh, and the
 * editor is a file people iterate on.
 */

export interface TierValue {
  name?: string;
  range?: [Dayjs, Dayjs] | null;
  member_price?: number;
  non_member_price?: number;
}

export interface ApiTier {
  name: string;
  starts_on: string;
  ends_on: string;
  member_price: string;
  non_member_price: string;
}

/**
 * Which rows share a day with another row.
 *
 * Index-keyed so the form can point at the offending rows. The database refuses
 * overlapping windows outright; catching it here is what turns that refusal into
 * a message beside the row rather than a database error the form cannot place.
 */
export const overlappingRows = (tiers: TierValue[]): Set<number> => {
  const clashes = new Set<number>();

  tiers.forEach((a, i) => {
    const aStart = a.range?.[0];
    const aEnd = a.range?.[1];

    if (!aStart || !aEnd) return;

    tiers.forEach((b, j) => {
      const bStart = b.range?.[0];
      const bEnd = b.range?.[1];

      if (i === j || !bStart || !bEnd) return;

      if (!aStart.isAfter(bEnd, 'day') && !bStart.isAfter(aEnd, 'day')) {
        clashes.add(i);
        clashes.add(j);
      }
    });
  });

  return clashes;
};

/**
 * Is there anything in this row at all?
 *
 * The editor starts with three named rows because that is the shape most events
 * are sold in, but plenty of events use one or two. A row nobody filled in is an
 * offer that was never made — it is dropped, not rejected. Requiring all three
 * would mean an admin selling a single flat price had to delete two rows before
 * the form would save, and the error would not say so.
 *
 * The name alone does not count: it was put there by the form, not by a person.
 */
export const isFilledTier = (tier: TierValue): boolean =>
  Boolean(tier?.range?.[0] && tier?.range?.[1]) ||
  tier?.member_price !== undefined ||
  tier?.non_member_price !== undefined;

/** Form values → API body. Dates become plain days; money becomes a number. */
export const tiersToApi = (tiers: TierValue[]) =>
  tiers.filter(isFilledTier).map((tier, index) => ({
    name: tier.name,
    starts_on: tier.range?.[0]?.format('YYYY-MM-DD'),
    ends_on: tier.range?.[1]?.format('YYYY-MM-DD'),
    member_price: tier.member_price ?? 0,
    non_member_price: tier.non_member_price ?? 0,
    display_order: index,
  }));

/** API body → form values. */
export const tiersFromApi = (tiers: ApiTier[]): TierValue[] =>
  tiers.map((tier) => ({
    name: tier.name,
    range: [dayjs(tier.starts_on), dayjs(tier.ends_on)] as [Dayjs, Dayjs],
    member_price: Number(tier.member_price),
    non_member_price: Number(tier.non_member_price),
  }));
