import { useEffect, useState } from 'react';

import MastersService from '@/services/mastersService';
import type { ApiResult } from '@/services/BaseService';

/**
 * The state and city masters, as flat NAME lists for a `MultiSelect` filter.
 *
 * Names rather than ids because that is what the API compares against: the
 * master-id columns on `MemberAddresses` are nullable and older rows leave them
 * empty, while the text ones never are.
 *
 * Paged to exhaustion rather than fetched once. The masters list caps `limit` at
 * 100 and the city master already holds 183 rows, so a single page would have
 * offered the first hundred alphabetically and silently dropped the rest —
 * "Surat" among them, on a filter built for a Surat-based association. Two
 * requests, and the panel offers every city there is.
 *
 * Either list failing costs a filter, not the screen, the same way the category
 * and workflow lookups behave.
 *
 * Shared by the two list pages that filter on an address — the membership
 * request queue and the member-company directory. It lived in
 * `ApplicationQueue.tsx` while both lists were tabs on that one page; splitting
 * them into two pages is what moved it here rather than copying it.
 */
const PAGE_SIZE = 100;
/** Backstop against a paging bug turning into an unbounded request loop. */
const MAX_PAGES = 20;

const fetchAllNames = async <T extends { name: string }>(
  fetchPage: (page: number) => Promise<ApiResult<T[]>>,
): Promise<string[]> => {
  const first = await fetchPage(1);
  const names = first.data.map((row) => row.name);
  const pages = Math.min(first.pagination?.totalPages ?? 1, MAX_PAGES);

  if (pages <= 1) return names;

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) => fetchPage(index + 2)),
  );

  return [...names, ...rest.flatMap((result) => result.data.map((row) => row.name))];
};

export const useLocationOptions = () => {
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);

  useEffect(() => {
    fetchAllNames((page) => MastersService.listStates({ page, limit: PAGE_SIZE, activeOnly: true }))
      .then(setStates)
      .catch(() => setStates([]));

    fetchAllNames((page) => MastersService.listCities({ page, limit: PAGE_SIZE, activeOnly: true }))
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  return { states, cities };
};

/** A name list as `MultiSelect` options — the value IS the name. */
export const asOptions = (names: string[]) => names.map((name) => ({ value: name, label: name }));

export default useLocationOptions;
