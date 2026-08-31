import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EyeOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import {
  Badge,
  Button,
  Card,
  DataTable,
  DateCell,
  FilterDropdown,
  FilterGroup,
  Highlight,
  FormSelect,
  MultiSelect,
  NotAvailable,
  PageHeader,
  RowActions,
  SearchInput,
  StackedCell,
  StatusChip,
  Tabs,
  TextCell,
} from '@/components/ui';
import type { TableSort } from '@/components/ui';
import { usePermissions } from '@/hooks/usePermissions';
import ApplicationsService, {
  APPLICATION_SORT_COLUMNS,
  type ApplicationQueueRow,
  type ApplicationSortBy,
  type ApplicationStatus,
  type ApprovalWorkflow,
} from '@/services/applicationsService';
import MastersService, { type Category } from '@/services/mastersService';
import MembersService, {
  type MemberListRow,
  type MemberSortBy,
  type MemberStatus,
} from '@/services/membersService';
import type { ApiResult, PaginationMeta } from '@/services/BaseService';
import { asDisplayError, type DisplayError } from '@/utils/apiError';
import { formatAge, hoursSince } from '@/utils/format';

/**
 * A-03 — the application queue (AJ-2, step one), plus Member Company (the
 * company directory, formerly its own nav item — see `constant/navigation.tsx`,
 * where the entry is kept but hidden so `/members/:id` still resolves a header
 * title).
 *
 * A work queue answers one question before any other: **what needs me, and what
 * has been waiting longest?** Everything here follows from that.
 *
 *  - The default view narrows to stages the reviewer's own roles own ("My
 *    queue" vs "All applications" — a filter, not a tab: unlike Member Company,
 *    it is the same table and the same columns, just narrowed, so it belongs
 *    behind the Filter button next to Status, Stage and Category rather than
 *    switching to a different screen). Holding `application.approve` says what
 *    you may do; the stage's role says whose queue it is (rbac.md §4), and a
 *    queue full of other people's work is the fastest way to teach someone to
 *    ignore their queue.
 *  - "Documents pending" is the same kind of filter, for the same reason: it
 *    narrows this list to applications carrying an unchecked document rather
 *    than showing a different list.
 *  - The default sort is oldest first. A newest-first queue starves the row that
 *    has been waiting a week, which is precisely the row an SLA exists for.
 *  - Age is a column, not a timestamp. "12 Aug 2026, 14:05" makes the reader do
 *    subtraction; "6 days" is the number they were going to compute anyway.
 *
 * Filters and sort live in the URL so a reviewer who opens an application,
 * decides it and comes back lands where they left (tables.md). Member Company
 * is a different table entirely (different columns, a different status enum)
 * and keeps its own state local, the way Categories' and Locations' tabs do.
 */

const DEFAULT_SORT: TableSort = { sortBy: 'submitted_at', sortOrder: 'asc' };

const STATUS_OPTIONS: Array<{ value: ApplicationStatus; label: string }> = [
  // `SUBMITTED` and `UNDER_REVIEW` both read "Under review" to a member, and
  // `constant/status.ts` is deliberately written in the member's vocabulary. A
  // reviewer needs the difference — nobody has touched this yet, versus it has
  // already cleared a stage — so the filter says it and the row carries the
  // "New" badge that approval-workflow.md §7 asks for.
  { value: 'SUBMITTED', label: 'New — no stage decided yet' },
  { value: 'UNDER_REVIEW', label: 'Under review — past stage 1' },
  // Not a third kind of decision — a rejection that still has corrections left
  // on it. The label says whose move it is, because that is what a reviewer
  // filtering the queue actually wants to know (spec D-2).
  { value: 'RETURNED_FOR_CORRECTION', label: 'Rejected — awaiting resubmission' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'WITHDRAWN', label: 'Withdrawn' },
];

/** The filters that live behind the panel button. */
interface QueueFilters {
  /** `true` = stages the caller's own roles own ("My queue"); `false` = every application. */
  mine: boolean;
  status: ApplicationStatus[];
  stage: string[];
  category: string[];
  /** `true` = only applications carrying at least one unverified document. */
  pendingOnly: boolean;
  /** `YYYY-MM-DD`, or '' for an open end. Strings, because they go straight
      into the URL and straight onto the query string. */
  submittedFrom: string;
  submittedTo: string;
  /** Primary-address city / state NAMES. Multi, like the other list filters. */
  city: string[];
  state: string[];
}

const EMPTY_QUEUE_FILTERS: QueueFilters = {
  mine: true,
  status: [],
  stage: [],
  category: [],
  pendingOnly: false,
  submittedFrom: '',
  submittedTo: '',
  city: [],
  state: [],
};

const SHOW_OPTIONS: Array<{ value: 'mine' | 'all'; label: string }> = [
  { value: 'mine', label: 'My queue' },
  { value: 'all', label: 'All applications' },
];

const DOCUMENTS_OPTIONS: Array<{ value: 'any' | 'pending'; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'pending', label: 'Pending only' },
];

/**
 * City and state names for the two tabs' location filters.
 *
 * Names, not ids, because that is what the API matches on — the master-id
 * columns on `MemberAddresses` are nullable and older rows leave them empty,
 * while the text ones never are.
 *
 * Paged to exhaustion rather than fetched once. The masters list caps `limit` at
 * 100 and the city master already holds 183 rows, so a single page would have
 * offered the first hundred alphabetically and silently dropped the rest —
 * "Surat" among them, on a filter built for a Surat-based association. Two
 * requests, and the panel offers every city there is.
 *
 * Either list failing costs a filter, not the screen, the same way the category
 * and workflow lookups behave.
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

const useLocationOptions = () => {
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
const asOptions = (names: string[]) => names.map((name) => ({ value: name, label: name }));

/** `?status=A,B` ⇄ `['A','B']`. Absent and empty are the same thing: no filter. */
const readList = (value: string | null): string[] =>
  value ? value.split(',').filter(Boolean) : [];

/** Only the four allowlisted columns reach `sortBy`; anything else is a 422. */
const isSortable = (value: string): value is ApplicationSortBy =>
  APPLICATION_SORT_COLUMNS.includes(value as ApplicationSortBy);

/**
 * Each tab hands its search box and filter panel up to the tab row instead of
 * drawing a toolbar row of its own — same mechanism as `Categories.tsx` and
 * `Locations.tsx`.
 */
interface TabBodyProps {
  onRegisterSearch?: (node: ReactNode) => void;
}

/**
 * The application queue, filtered rather than tabbed by scope: "My queue" vs
 * "All applications" and "Documents pending" all narrow this one table, so
 * they live behind the Filter button alongside Status, Stage and Category.
 */
const ApplicationsTab = ({ onRegisterSearch }: TabBodyProps) => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { isSuperAdmin } = usePermissions();

  const [rows, setRows] = useState<ApplicationQueueRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [workflow, setWorkflow] = useState<ApprovalWorkflow | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DisplayError | null>(null);
  const locations = useLocationOptions();

  const search = params.get('q') ?? '';
  /*
    Kept as both the array (for the panel) and the joined string (for the fetch
    and its dependency list). The array is rebuilt on every render, so using it
    as a dependency would refetch forever; the string only changes when a filter
    does.
  */
  const statusParam = params.get('status') ?? '';
  const stageParam = params.get('stage') ?? '';
  const categoryParam = params.get('category') ?? '';
  /** Absent means the default, "my queue" — same contract `/members`'s old redirect relied on. */
  const mineParam = params.get('mine') ?? '';
  const pendingParam = params.get('pending') ?? '';
  const submittedFrom = params.get('submittedFrom') ?? '';
  const submittedTo = params.get('submittedTo') ?? '';
  const cityParam = params.get('city') ?? '';
  const stateParam = params.get('state') ?? '';

  const statuses = readList(statusParam) as ApplicationStatus[];
  const stageIds = readList(stageParam);
  const categoryIds = readList(categoryParam);
  const cityNames = readList(cityParam);
  const stateNames = readList(stateParam);
  const mine = mineParam !== 'false';
  const pendingOnly = pendingParam === 'true';
  const page = Number(params.get('page') ?? '1') || 1;
  const limit = Number(params.get('limit') ?? '20') || 20;

  const sortByParam = params.get('sortBy') ?? '';
  const sort: TableSort = {
    sortBy: isSortable(sortByParam) ? sortByParam : DEFAULT_SORT.sortBy,
    sortOrder: params.get('sortOrder') === 'desc' ? 'desc' : 'asc',
  };

  /*
    `mine` is excluded on purpose: it picks the base view, not a narrowing — the
    same reason it stayed off `QueueFilters`'s "active" count and out of the
    `filtered` empty state below when it's the only thing set. `pendingOnly` is
    a real filter (it used to be a whole tab) so it counts on both.
  */
  const hasFilters = Boolean(
    search ||
    statuses.length ||
    stageIds.length ||
    categoryIds.length ||
    pendingOnly ||
    submittedFrom ||
    submittedTo ||
    cityNames.length ||
    stateNames.length,
  );

  /*
    Memoised on the raw param strings, not the derived arrays: `statuses` etc.
    are rebuilt every render, so an object built from them would be too, and the
    search-registration effect below would re-run — and re-register the search
    box — on every keystroke elsewhere on the page.
  */
  const filters: QueueFilters = useMemo(
    () => ({
      mine,
      status: statuses,
      stage: stageIds,
      category: categoryIds,
      pendingOnly,
      submittedFrom,
      submittedTo,
      city: cityNames,
      state: stateNames,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      mineParam,
      statusParam,
      stageParam,
      categoryParam,
      pendingParam,
      submittedFrom,
      submittedTo,
      cityParam,
      stateParam,
    ],
  );
  /* The window is one filter however many of its two ends are set. */
  const activeFilterCount =
    [statuses, stageIds, categoryIds, cityNames, stateNames].filter((f) => f.length).length +
    (pendingOnly ? 1 : 0) +
    (submittedFrom || submittedTo ? 1 : 0);

  const patchParams = useCallback(
    (patch: Record<string, string | null>, options?: { keepPage?: boolean }) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);

          Object.entries(patch).forEach(([key, value]) => {
            if (value === null || value === '') {
              next.delete(key);
            } else {
              next.set(key, value);
            }
          });

          // Filtering to nine results while sitting on page four shows an empty
          // table and reads as a broken filter.
          if (!options?.keepPage) next.delete('page');

          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  /*
    The draft-plus-debounce pair this screen used to keep by hand now lives in
    `SearchInput`, which every list in the app shares. Two copies of it had
    already drifted from each other in delay and in when they committed.
  */
  const onSearch = useCallback(
    (next: string) => patchParams({ q: next.trim() || null }),
    [patchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await ApplicationsService.list({
        page,
        limit,
        mine,
        ...(pendingOnly ? { has_pending_documents: true } : {}),
        ...(search ? { search } : {}),
        // Comma-separated: the API splits them back into an `ANY(...)` match.
        ...(statuses.length ? { status: statuses.join(',') } : {}),
        ...(stageIds.length ? { stage_id: stageIds.join(',') } : {}),
        ...(categoryIds.length ? { category_id: categoryIds.join(',') } : {}),
        ...(submittedFrom ? { submitted_from: submittedFrom } : {}),
        ...(submittedTo ? { submitted_to: submittedTo } : {}),
        ...(cityNames.length ? { city: cityNames.join(',') } : {}),
        ...(stateNames.length ? { state: stateNames.join(',') } : {}),
        sortBy: sort.sortBy as ApplicationSortBy,
        sortOrder: sort.sortOrder,
      });

      setRows(result.data);
      setPagination(result.pagination);
    } catch (caught) {
      setError(asDisplayError(caught));
    } finally {
      setLoading(false);
    }
    /*
      The three arrays are derived from the three params on the line below, so
      the params are the real dependencies. Listing the arrays instead would
      refetch on every render — they are rebuilt each time.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    limit,
    mine,
    pendingOnly,
    search,
    statusParam,
    stageParam,
    categoryParam,
    sort.sortBy,
    sort.sortOrder,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // The stage and category filters need names. Both are small, fixed lists, and
    // either one failing costs the reviewer a filter rather than the screen — the
    // queue itself has its own error surface.
    ApplicationsService.workflow()
      .then((result) => setWorkflow(result.data))
      .catch(() => setWorkflow(null));

    MastersService.listCategories({ limit: 100 })
      .then((result) => setCategories(result.data))
      .catch(() => setCategories([]));
  }, []);

  const clearFilters = useCallback(() => {
    patchParams({
      q: null,
      mine: null,
      status: null,
      stage: null,
      category: null,
      pending: null,
      submittedFrom: null,
      submittedTo: null,
      city: null,
      state: null,
    });
  }, [patchParams]);

  /* Apply commits all five at once — one request, not five. */
  const applyFilters = useCallback(
    (draft: QueueFilters) =>
      patchParams({
        mine: draft.mine ? null : 'false',
        status: draft.status.join(',') || null,
        stage: draft.stage.join(',') || null,
        category: draft.category.join(',') || null,
        pending: draft.pendingOnly ? 'true' : null,
        submittedFrom: draft.submittedFrom || null,
        submittedTo: draft.submittedTo || null,
        city: draft.city.join(',') || null,
        state: draft.state.join(',') || null,
      }),
    [patchParams],
  );

  useEffect(() => {
    onRegisterSearch?.(
      <>
        <SearchInput
          value={search}
          onChange={onSearch}
          label="Search applications"
          placeholder="Search company, application number or GST"
          className="w-[320px] max-w-full"
        />

        <FilterDropdown<QueueFilters>
          value={filters}
          emptyValue={EMPTY_QUEUE_FILTERS}
          onApply={applyFilters}
          onClear={clearFilters}
          activeCount={activeFilterCount}
        >
          {(draft, setDraft) => (
            <>
              {/*
                A single-value dropdown, not a multi-select: "mine" and "all" are
                mutually exclusive views, and a control that lets you tick both
                is asking a question with no answer. `FormSelect` rather than
                `Select` because `FilterGroup` above already draws the label.

                `searchThreshold` high enough to hide the search box — it is a
                fixed two-value list, and a search field over two options is
                furniture.
              */}
              <FilterGroup label="Show">
                <FormSelect
                  className="w-full"
                  value={draft.mine ? 'mine' : 'all'}
                  options={SHOW_OPTIONS}
                  searchThreshold={8}
                  onChange={(next) => setDraft((d) => ({ ...d, mine: next === 'mine' }))}
                />
              </FilterGroup>

              {/*
                Multi-select, so a reviewer can watch "submitted OR under
                review" in one list. There is no "Any status" option any
                more: an empty selection IS "any", and an option that means
                the same as choosing nothing is a third state to explain.
              */}
              <FilterGroup label="Status">
                <MultiSelect
                  value={draft.status}
                  placeholder="Any status"
                  searchThreshold={8}
                  options={STATUS_OPTIONS}
                  onChange={(next) =>
                    setDraft((d) => ({ ...d, status: next as ApplicationStatus[] }))
                  }
                />
              </FilterGroup>

              <FilterGroup label="Stage">
                <MultiSelect
                  value={draft.stage}
                  placeholder="Any stage"
                  searchThreshold={8}
                  options={(workflow?.stages ?? []).map((stage) => ({
                    value: stage.id,
                    label: `${stage.sequence}. ${stage.name}`,
                  }))}
                  onChange={(next) => setDraft((d) => ({ ...d, stage: next.map(String) }))}
                />
              </FilterGroup>

              <FilterGroup label="Category">
                <MultiSelect
                  value={draft.category}
                  placeholder="Any category"
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                  onChange={(next) => setDraft((d) => ({ ...d, category: next.map(String) }))}
                />
              </FilterGroup>

              {/*
                Matched on the NAME, which is what the API compares against —
                the master-id columns on an address are nullable and older rows
                leave them empty. Multi-select, because "Surat OR Ahmedabad" is
                a real question and a single-value control cannot ask it.
              */}
              <FilterGroup label="State">
                <MultiSelect
                  value={draft.state}
                  placeholder="Any state"
                  searchThreshold={8}
                  options={asOptions(locations.states)}
                  onChange={(next) => setDraft((d) => ({ ...d, state: next.map(String) }))}
                />
              </FilterGroup>

              <FilterGroup label="City">
                <MultiSelect
                  value={draft.city}
                  placeholder="Any city"
                  searchThreshold={8}
                  options={asOptions(locations.cities)}
                  onChange={(next) => setDraft((d) => ({ ...d, city: next.map(String) }))}
                />
              </FilterGroup>

              <FilterGroup label="Documents">
                <FormSelect
                  className="w-full"
                  value={draft.pendingOnly ? 'pending' : 'any'}
                  options={DOCUMENTS_OPTIONS}
                  searchThreshold={8}
                  onChange={(next) => setDraft((d) => ({ ...d, pendingOnly: next === 'pending' }))}
                />
              </FilterGroup>

              {/*
                The submitted date, matching the column the queue sorts by. Both
                ends are optional — "everything since Monday" is asked as often
                as a closed window, and requiring an end date would make a
                reviewer invent one.
              */}
              <FilterGroup label="Submitted">
                <DatePicker.RangePicker
                  className="w-full"
                  format="YYYY-MM-DD"
                  allowEmpty={[true, true]}
                  value={[
                    draft.submittedFrom ? dayjs(draft.submittedFrom) : null,
                    draft.submittedTo ? dayjs(draft.submittedTo) : null,
                  ]}
                  onChange={(range) =>
                    setDraft((d) => ({
                      ...d,
                      submittedFrom: range?.[0] ? range[0].format('YYYY-MM-DD') : '',
                      submittedTo: range?.[1] ? range[1].format('YYYY-MM-DD') : '',
                    }))
                  }
                />
              </FilterGroup>
            </>
          )}
        </FilterDropdown>
      </>,
    );

    return () => onRegisterSearch?.(null);
  }, [
    search,
    onSearch,
    onRegisterSearch,
    filters,
    applyFilters,
    clearFilters,
    activeFilterCount,
    workflow,
    categories,
    locations,
  ]);

  /**
   * The association's correction limit, carried on the workflow because
   * `SystemSettings` is super-admin-only. `0` — including while the workflow is
   * still loading — means unlimited, and the column falls back to a bare count
   * rather than inventing a denominator.
   */
  const maxResubmissions = workflow?.max_resubmissions ?? 0;

  const columns = useMemo(
    () => [
      {
        /*
          Its own column, not the second line under the company. It is the
          reference quoted on the phone and in email, it is one of the three
          things the search matches on, and a value people read out is a column.
        */
        title: 'Application No.',
        dataIndex: 'application_number',
        key: 'application_number',
        width: 180,
        render: (value: string | null) =>
          value ? (
            <span className="font-mono text-supporting text-fg-muted">
              <Highlight text={value} query={search} />
            </span>
          ) : (
            <NotAvailable />
          ),
      },
      {
        title: 'Application',
        dataIndex: 'company_name',
        key: 'company_name',
        sorter: true,
        width: 200,
        render: (_: unknown, row: ApplicationQueueRow) => (
          <Highlight text={row.company_name} query={search} />
        ),
      },

      {
        title: 'In Directory',
        dataIndex: 'directory_visible',
        key: 'directory_visible',
        width: 150,
        /*
          Read-only, and it explains rather than controls. Three switches decide
          whether a company is listed — the association's global switch, the
          firm's ACTIVE status, and the member's own choice — and only the first
          is staff's. A toggle here would imply otherwise, so the cell names
          whose decision is in force and stops there.
        */
        render: (_: unknown, row: ApplicationQueueRow) => {
          if (row.member_status && row.member_status !== 'ACTIVE') {
            return <StatusChip domain="directory" status="NOT_ACTIVE" />;
          }

          if (row.directory_visible === false) {
            return <StatusChip domain="directory" status="OPTED_OUT" />;
          }

          if (row.directory_visible === true) {
            return <StatusChip domain="directory" status="LISTED" />;
          }

          return <NotAvailable />;
        },
      },
      {
        title: 'Category',
        dataIndex: 'category_name',
        key: 'category_name',
        width: 130,
        render: (_: unknown, row: ApplicationQueueRow) =>
          row.category_name ? (
            <span className="text-supporting text-fg">
              {row.category_name}
              {row.tier_name ? <span className="text-fg-muted"> · {row.tier_name}</span> : null}
            </span>
          ) : (
            <NotAvailable />
          ),
      },
      {
        title: 'Stage',
        dataIndex: 'stage_name',
        key: 'stage_name',
        width: 170,
        render: (_: unknown, row: ApplicationQueueRow) =>
          row.stage_name ? (
            /* The stage alone. The second line used to name whose queue it is —
               "ADMIN decides" — which repeated the same role on nearly every row
               and doubled the height of the whole table to say it. */
            <span className="text-supporting text-fg">{row.stage_name}</span>
          ) : (
            <NotAvailable />
          ),
      },
      {
        title: 'Email',
        dataIndex: 'applicant_email',
        key: 'applicant_email',
        width: 220,
        render: (_: unknown, row: ApplicationQueueRow) => (
          <TextCell value={row.applicant_email} width={196} />
        ),
      },
      {
        title: 'Mobile',
        dataIndex: 'applicant_phone',
        key: 'applicant_phone',
        width: 130,
        render: (_: unknown, row: ApplicationQueueRow) =>
          row.applicant_phone ? (
            <span className="font-mono text-supporting text-fg">{row.applicant_phone}</span>
          ) : (
            <NotAvailable />
          ),
      },
      {
        title: 'GST No.',
        dataIndex: 'gst_number',
        key: 'gst_number',
        width: 160,
        render: (_: unknown, row: ApplicationQueueRow) =>
          row.gst_number ? (
            <span className="font-mono text-supporting text-fg">
              <Highlight text={row.gst_number} query={search} />
            </span>
          ) : (
            <NotAvailable />
          ),
      },
      {
        title: 'PAN No.',
        dataIndex: 'pan_number',
        key: 'pan_number',
        width: 130,
        render: (_: unknown, row: ApplicationQueueRow) =>
          row.pan_number ? (
            <span className="font-mono text-supporting text-fg">{row.pan_number}</span>
          ) : (
            <NotAvailable />
          ),
      },
      {
        title: 'Company Type',
        dataIndex: 'company_type_name',
        key: 'company_type_name',
        width: 150,
        render: (_: unknown, row: ApplicationQueueRow) =>
          row.company_type_name ? (
            <span className="text-supporting text-fg">{row.company_type_name}</span>
          ) : (
            <NotAvailable />
          ),
      },
      {
        // SUBMITTED reads "New" straight from the chip now (`constant/status.ts`)
        // rather than a second badge glued on beside it — one label, not two
        // saying the same thing.
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        sorter: true,
        width: 140,
        render: (value: ApplicationStatus) => <StatusChip domain="application" status={value} />,
      },
      {
        // Plain text, not a chip — `pending_documents`/`document_count` are a
        // count read at a glance, not a state worth a coloured pill of its own.
        title: 'Documents',
        dataIndex: 'pending_documents',
        key: 'pending_documents',
        width: 130,
        render: (_: unknown, row: ApplicationQueueRow) => {
          const pending = Number(row.pending_documents);
          const total = Number(row.document_count);

          if (total === 0) return <NotAvailable />;

          return (
            <span className="tabular text-supporting text-fg">
              {pending > 0 ? `${pending} of ${total} pending` : `${total} verified`}
            </span>
          );
        },
      },
      {
        // Corrections used against the association's limit. A bare count answers
        // "has this been round before"; the denominator answers the question a
        // reviewer is actually about to act on — how close is this to closing.
        title: 'Corrections',
        dataIndex: 'resubmission_count',
        key: 'resubmission_count',
        width: 140,
        render: (_: unknown, row: ApplicationQueueRow) => {
          if (maxResubmissions <= 0) {
            return (
              <span className="tabular text-supporting text-fg">
                {row.resubmission_count > 0 ? `×${row.resubmission_count}` : '0'}
              </span>
            );
          }

          const exhausted = row.resubmission_count >= maxResubmissions;

          return (
            <span
              className={`tabular text-supporting ${exhausted ? 'text-status-danger-fg' : 'text-fg'}`}
              {...(exhausted
                ? { title: 'No corrections left — the next rejection closes this application.' }
                : {})}
            >
              {`${row.resubmission_count} / ${maxResubmissions}`}
            </span>
          );
        },
      },
      {
        title: 'Overdue',
        key: 'overdue',
        width: 110,
        render: (_: unknown, row: ApplicationQueueRow) => {
          const age = hoursSince(row.submitted_at);
          const overdue = age !== null && row.sla_hours !== null && age > row.sla_hours;

          return overdue ? (
            <Badge tone="warning">Overdue</Badge>
          ) : (
            <span className="text-supporting text-fg-muted">On time</span>
          );
        },
      },
      {
        title: 'Waiting',
        dataIndex: 'submitted_at',
        key: 'waiting',
        // 110 wrapped "under an hour" onto two lines and made that row taller
        // than every other one in the table.
        width: 150,
        render: (_: unknown, row: ApplicationQueueRow) => {
          const age = hoursSince(row.submitted_at);

          return age === null ? (
            <NotAvailable />
          ) : (
            <Tooltip
              title={
                row.sla_hours !== null
                  ? `Target for ${row.stage_name ?? 'this stage'} is ${row.sla_hours} hours, measured from submission.`
                  : undefined
              }
            >
              <span className="tabular text-supporting text-fg">{formatAge(age)}</span>
            </Tooltip>
          );
        },
      },
      {
        title: 'Submitted',
        dataIndex: 'submitted_at',
        key: 'submitted_at',
        sorter: true,
        width: 140,
        render: (_: unknown, row: ApplicationQueueRow) => (
          <DateCell value={row.submitted_at} empty="Not submitted" />
        ),
      },
      {
        title: 'Decided',
        dataIndex: 'decided_at',
        key: 'decided_at',
        width: 140,
        render: (_: unknown, row: ApplicationQueueRow) => (
          <DateCell value={row.decided_at} empty="Not decided" />
        ),
      },
      {
        title: 'Approved By',
        dataIndex: 'approved_by',
        key: 'approved_by',
        width: 180,
        render: (_: unknown, row: ApplicationQueueRow) =>
          row.approved_by ? (
            <span className="text-supporting text-fg">{row.approved_by}</span>
          ) : (
            <NotAvailable />
          ),
      },
      /*
        Only while something on this page was actually rejected.

        A rejection is rare and terminal, so on a healthy queue this column would
        be a full column of "N/A" pushing the columns that matter off the right
        edge. Judged per page, not per dataset — the table only knows what it has
        been given, and claiming otherwise would need a second request.
      */
      ...(rows.some((row) => row.rejected_by)
        ? [
            {
              title: 'Rejected By',
              dataIndex: 'rejected_by',
              key: 'rejected_by',
              width: 180,
              render: (_: unknown, row: ApplicationQueueRow) =>
                row.rejected_by ? (
                  <span className="text-supporting text-fg">{row.rejected_by}</span>
                ) : (
                  <NotAvailable />
                ),
            },
          ]
        : []),
      {
        title: 'Created',
        dataIndex: 'createdAt',
        key: 'createdAt',
        sorter: true,
        width: 130,
        render: (_: unknown, row: ApplicationQueueRow) => <DateCell value={row.createdAt} />,
      },
      {
        title: 'Created By',
        dataIndex: 'created_by',
        key: 'created_by',
        width: 150,
        render: (_: unknown, row: ApplicationQueueRow) =>
          row.created_by ? (
            <span className="text-supporting text-fg">{row.created_by}</span>
          ) : (
            <NotAvailable />
          ),
      },
      {
        title: 'Updated',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        width: 130,
        render: (_: unknown, row: ApplicationQueueRow) => <DateCell value={row.updatedAt} />,
      },

      {
        title: 'Updated By',
        dataIndex: 'updated_by',
        key: 'updated_by',
        width: 150,
        render: (_: unknown, row: ApplicationQueueRow) =>
          row.updated_by ? (
            <span className="text-supporting text-fg">{row.updated_by}</span>
          ) : (
            <NotAvailable />
          ),
      },

      {
        title: 'City',
        dataIndex: 'city',
        key: 'city',
        width: 140,
        render: (value: string | null) => <TextCell value={value} width={116} />,
      },
      {
        title: 'State',
        dataIndex: 'state',
        key: 'state',
        width: 140,
        render: (value: string | null) => <TextCell value={value} width={116} />,
      },
      {
        title: 'Actions',
        key: 'actions',
        // 80, like every other table — at 56 the word "Actions" wrapped in two.
        width: 80,
        fixed: 'right' as const,
        render: (_: unknown, row: ApplicationQueueRow) => (
          <RowActions
            actions={[
              {
                key: 'open',
                icon: <EyeOutlined />,
                label: `Review ${row.company_name}`,
                onClick: () => navigate(`/applications/${row.id}`),
              },
            ]}
          />
        ),
      },
    ],
    [navigate, search, maxResubmissions, rows],
  );

  /**
   * "Your queue is clear" is a result worth reading — it is AJ-1's all-clear,
   * and it is not the same sentence as "nobody has applied". Showing it when
   * the truth is "your filter matched nothing" reads as data loss, which is
   * why it is gated on `hasFilters` too: `pendingOnly` is now a real filter and
   * an empty result under it belongs to the shared "No matching items" state
   * `DataTable` renders from the `filtered` prop below, not this one.
   */
  const empty =
    mine && !isSuperAdmin && !hasFilters
      ? {
          title: 'Your queue is clear',
          description:
            'No application is waiting at a stage your role decides. New submissions land here as they arrive, oldest first.',
          action: (
            <Button onClick={() => patchParams({ mine: 'false' })}>Show all applications</Button>
          ),
        }
      : {
          title: 'No applications yet',
          description:
            'An application appears here the moment someone submits one. Drafts are never listed — they belong to the applicant until they submit.',
          action: undefined as ReactNode,
        };

  return (
    <Card flush className="min-h-0 flex-1">
      <DataTable<ApplicationQueueRow>
        unit="applications"
        serial
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void load()}
        pagination={pagination}
        onPageChange={(nextPage, nextLimit) =>
          patchParams(
            { page: String(nextPage), limit: String(nextLimit) },
            // The page IS the change here, so it must survive the reset.
            { keepPage: true },
          )
        }
        sort={sort}
        onSortChange={(next) =>
          patchParams({
            sortBy: next?.sortBy ?? null,
            sortOrder: next?.sortOrder ?? null,
          })
        }
        dataSource={rows}
        columns={columns}
        onRow={(row) => ({
          onClick: () => navigate(`/applications/${row.id}`),
          className: 'cursor-pointer',
        })}
        filtered={hasFilters}
        onClearFilter={clearFilters}
        emptyTitle={empty.title}
        emptyDescription={empty.description}
        emptyAction={empty.action}
      />
    </Card>
  );
};

/* -------------------------------------------------------------------------- */
/* Member Company                                                              */
/* -------------------------------------------------------------------------- */

/*
  DRAFT and PENDING (awaiting payment) are absent on purpose: the backend
  never returns them here any more — see the doc comment on `listMembers` —
  so offering them as filter choices would only ever narrow the list to zero.
*/
const MEMBER_STATUS_OPTIONS: Array<{ value: MemberStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'TERMINATED', label: 'Terminated' },
];

const MEMBER_DEFAULT_SORT: TableSort = { sortBy: 'createdAt', sortOrder: 'desc' };

interface MemberFilters {
  status: MemberStatus[];
  category: string[];
  /** Primary-address city / state NAMES — the same match the API does. */
  city: string[];
  state: string[];
}

const EMPTY_MEMBER_FILTERS: MemberFilters = { status: [], category: [], city: [], state: [] };

/**
 * The company directory, moved here from its own nav item. Kept as local
 * component state rather than the URL — unlike the three application tabs
 * above, this is a new addition with no established "come back and find your
 * filter" contract yet, and it would otherwise share URL keys (`status`,
 * `category`) with a different enum than the application tabs use for the
 * same names (Categories' and Locations' tabs make the same choice).
 */
const MemberCompanyTab = ({ onRegisterSearch }: TabBodyProps) => {
  const navigate = useNavigate();

  const [rows, setRows] = useState<MemberListRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DisplayError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<MemberFilters>(EMPTY_MEMBER_FILTERS);
  const [sort, setSort] = useState<TableSort>(MEMBER_DEFAULT_SORT);
  const locations = useLocationOptions();

  const hasFilters = Boolean(
    search ||
    filters.status.length ||
    filters.category.length ||
    filters.city.length ||
    filters.state.length,
  );
  const activeFilterCount = [filters.status, filters.category, filters.city, filters.state].filter(
    (f) => f.length,
  ).length;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await MembersService.list({
        page,
        limit: 20,
        ...(search ? { search } : {}),
        ...(filters.status.length ? { status: filters.status.join(',') } : {}),
        ...(filters.category.length ? { category_id: filters.category.join(',') } : {}),
        ...(filters.city.length ? { city: filters.city.join(',') } : {}),
        ...(filters.state.length ? { state: filters.state.join(',') } : {}),
        sortBy: sort.sortBy as MemberSortBy,
        sortOrder: sort.sortOrder,
      });

      setRows(result.data);
      setPagination(result.pagination);
    } catch (caught) {
      setError(asDisplayError(caught));
    } finally {
      setLoading(false);
    }
  }, [page, search, filters, sort.sortBy, sort.sortOrder]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    MastersService.listCategories({ limit: 100 })
      .then((result) => setCategories(result.data))
      .catch(() => setCategories([]));
  }, []);

  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);

  const applyFilters = useCallback((next: MemberFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setFilters(EMPTY_MEMBER_FILTERS);
    setPage(1);
  }, []);

  useEffect(() => {
    onRegisterSearch?.(
      <>
        <SearchInput
          value={search}
          onChange={onSearch}
          label="Search members"
          placeholder="Search company, legal name, code, GST or email"
          className="w-[320px] max-w-full"
        />

        <FilterDropdown<MemberFilters>
          value={filters}
          emptyValue={EMPTY_MEMBER_FILTERS}
          onApply={applyFilters}
          onClear={clearFilters}
          activeCount={activeFilterCount}
        >
          {(draft, setDraft) => (
            <>
              <FilterGroup label="Status">
                <MultiSelect
                  value={draft.status}
                  placeholder="Any status"
                  searchThreshold={8}
                  options={MEMBER_STATUS_OPTIONS}
                  onChange={(next) => setDraft((d) => ({ ...d, status: next as MemberStatus[] }))}
                />
              </FilterGroup>

              <FilterGroup label="Category">
                <MultiSelect
                  value={draft.category}
                  placeholder="Any category"
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                  onChange={(next) => setDraft((d) => ({ ...d, category: next.map(String) }))}
                />
              </FilterGroup>

              {/* By name, matching the API — see `useLocationOptions`. */}
              <FilterGroup label="State">
                <MultiSelect
                  value={draft.state}
                  placeholder="Any state"
                  searchThreshold={8}
                  options={asOptions(locations.states)}
                  onChange={(next) => setDraft((d) => ({ ...d, state: next.map(String) }))}
                />
              </FilterGroup>

              <FilterGroup label="City">
                <MultiSelect
                  value={draft.city}
                  placeholder="Any city"
                  searchThreshold={8}
                  options={asOptions(locations.cities)}
                  onChange={(next) => setDraft((d) => ({ ...d, city: next.map(String) }))}
                />
              </FilterGroup>
            </>
          )}
        </FilterDropdown>
      </>,
    );

    return () => onRegisterSearch?.(null);
  }, [
    search,
    onSearch,
    onRegisterSearch,
    filters,
    applyFilters,
    clearFilters,
    activeFilterCount,
    categories,
    locations,
  ]);

  const columns = useMemo(
    () => [
      {
        title: 'Member',
        dataIndex: 'company_name',
        key: 'company_name',
        sorter: true,
        width: 220,
        render: (_: unknown, row: MemberListRow) => (
          /* The city moved out to its own column — it is filterable now, and a
             value you can filter on is a column, not a suffix on a name. */
          <StackedCell
            primary={<Highlight text={row.company_name} query={search} />}
            secondary={
              row.legal_name && row.legal_name !== row.company_name ? row.legal_name : null
            }
          />
        ),
      },
      {
        title: 'Code',
        dataIndex: 'member_code',
        key: 'member_code',
        sorter: true,
        width: 170,
        render: (value: string | null) =>
          value ? (
            <span className="font-mono text-supporting text-fg">
              <Highlight text={value} query={search} />
            </span>
          ) : (
            <NotAvailable />
          ),
      },
      {
        title: 'Class',
        dataIndex: 'category_name',
        key: 'category_name',
        width: 130,
        render: (_: unknown, row: MemberListRow) =>
          row.category_name ? (
            <span className="text-supporting text-fg">
              <Highlight text={row.category_name} query={search} />
              {row.tier_name ? <span className="text-fg-muted"> · {row.tier_name}</span> : null}
            </span>
          ) : (
            <NotAvailable />
          ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        sorter: true,
        width: 145,
        render: (value: MemberStatus) => <StatusChip domain="member" status={value} />,
      },
      {
        // Plain text, not a chip — a count read at a glance, not a state
        // worth a coloured pill of its own.
        title: 'Documents',
        dataIndex: 'pending_documents',
        key: 'pending_documents',
        width: 130,
        render: (_: unknown, row: MemberListRow) => {
          const pending = Number(row.pending_documents);
          const total = Number(row.document_count);

          if (total === 0) return <NotAvailable />;

          return (
            <span className="tabular text-supporting text-fg">
              {pending > 0 ? `${pending} of ${total} pending` : `${total} on file`}
            </span>
          );
        },
      },
      {
        title: 'Login Email',
        dataIndex: 'contact_email',
        key: 'contact_email',
        width: 220,
        render: (value: string | null) => <TextCell value={value} width={196} />,
      },
      {
        title: 'Mobile',
        dataIndex: 'mobile',
        key: 'mobile',
        width: 130,
        render: (_: unknown, row: MemberListRow) =>
          row.mobile ? (
            <span className="font-mono text-supporting text-fg">{row.mobile}</span>
          ) : (
            <NotAvailable />
          ),
      },
      {
        title: 'GST No.',
        dataIndex: 'gst_number',
        key: 'gst_number',
        width: 160,
        render: (_: unknown, row: MemberListRow) =>
          row.gst_number ? (
            <span className="font-mono text-supporting text-fg">
              <Highlight text={row.gst_number} query={search} />
            </span>
          ) : (
            <NotAvailable />
          ),
      },
      {
        title: 'PAN No.',
        dataIndex: 'pan_number',
        key: 'pan_number',
        width: 130,
        render: (_: unknown, row: MemberListRow) =>
          row.pan_number ? (
            <span className="font-mono text-supporting text-fg">{row.pan_number}</span>
          ) : (
            <NotAvailable />
          ),
      },
      {
        title: 'Company Type',
        dataIndex: 'company_type_name',
        key: 'company_type_name',
        width: 150,
        render: (_: unknown, row: MemberListRow) =>
          row.company_type_name ? (
            <span className="text-supporting text-fg">{row.company_type_name}</span>
          ) : (
            <NotAvailable />
          ),
      },
      {
        title: 'Created',
        dataIndex: 'createdAt',
        key: 'createdAt',
        sorter: true,
        width: 130,
        render: (_: unknown, row: MemberListRow) => <DateCell value={row.createdAt} />,
      },
      {
        title: 'Updated',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        width: 130,
        render: (_: unknown, row: MemberListRow) => <DateCell value={row.updatedAt} />,
      },
      {
        title: 'Created By',
        dataIndex: 'created_by',
        key: 'created_by',
        width: 150,
        render: (_: unknown, row: MemberListRow) =>
          row.created_by ? (
            <span className="text-supporting text-fg">{row.created_by}</span>
          ) : (
            <NotAvailable />
          ),
      },
      {
        title: 'Updated By',
        dataIndex: 'updated_by',
        key: 'updated_by',
        width: 150,
        render: (_: unknown, row: MemberListRow) =>
          row.updated_by ? (
            <span className="text-supporting text-fg">{row.updated_by}</span>
          ) : (
            <NotAvailable label="System" />
          ),
      },
      {
        title: 'Approved By',
        dataIndex: 'approved_by',
        key: 'approved_by',
        width: 180,
        render: (_: unknown, row: MemberListRow) =>
          row.approved_by ? (
            <span className="text-supporting text-fg">{row.approved_by}</span>
          ) : (
            <NotAvailable label="System" />
          ),
      },
      /*
        Only while something on this page carries one.

        For a member that means TERMINATED — a row in this list was approved to
        get here, so there is no application rejection to report. On a healthy
        directory the column would otherwise be a full column of "N/A".
      */
      ...(rows.some((row) => row.rejected_by)
        ? [
            {
              title: 'Rejected By',
              dataIndex: 'rejected_by',
              key: 'rejected_by',
              width: 180,
              render: (_: unknown, row: MemberListRow) =>
                row.rejected_by ? (
                  <span className="text-supporting text-fg">{row.rejected_by}</span>
                ) : (
                  <NotAvailable />
                ),
            },
          ]
        : []),
      {
        title: 'City',
        dataIndex: 'city',
        key: 'city',
        width: 140,
        render: (value: string | null) => <TextCell value={value} width={116} />,
      },
      {
        title: 'State',
        dataIndex: 'state',
        key: 'state',
        width: 140,
        render: (value: string | null) => <TextCell value={value} width={116} />,
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 80,
        fixed: 'right' as const,
        render: (_: unknown, row: MemberListRow) => (
          <RowActions
            actions={[
              {
                key: 'open',
                icon: <EyeOutlined />,
                label: `Open ${row.company_name}`,
                onClick: () => navigate(`/members/${row.id}`),
              },
            ]}
          />
        ),
      },
    ],
    [navigate, search, rows],
  );

  return (
    <Card flush className="min-h-0 flex-1">
      <DataTable<MemberListRow>
        unit="members"
        serial
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void load()}
        pagination={pagination}
        onPageChange={(nextPage) => setPage(nextPage)}
        sort={sort}
        onSortChange={(next) => setSort(next ?? MEMBER_DEFAULT_SORT)}
        dataSource={rows}
        columns={columns}
        onRow={(row) => ({
          onClick: () => navigate(`/members/${row.id}`),
          className: 'cursor-pointer',
        })}
        filtered={hasFilters}
        onClearFilter={clearFilters}
        emptyTitle="No members yet"
        emptyDescription="A company record appears here as soon as someone signs up and starts an application."
      />
    </Card>
  );
};

/* -------------------------------------------------------------------------- */

export const ApplicationQueue = () => {
  const { can } = usePermissions();
  const canViewMembers = can('member.view');

  const [searchBox, setSearchBox] = useState<ReactNode>(null);
  const registerSearch = useCallback((node: ReactNode) => setSearchBox(node), []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Applications" />

      {/*
        Applications vs Member Company is a tab: two different LISTS with
        different columns, not one list narrowed several ways. My queue / all
        and documents-pending live inside the Applications tab's own Filter
        panel instead — see `ApplicationsTab` above.

        `queryParam="scope"` keeps it deep-linkable and matches the value
        `/members` redirects with (`?scope=member-company`).

        Tabs, search and filters share one row: `Tabs` lays its row out
        tabs-left / actions-right, so handing the controls to it puts them on
        the tab line instead of a second row below it.
      */}
      <Tabs
        variant="pill"
        queryParam="scope"
        actions={searchBox}
        items={[
          {
            key: 'applications',
            label: 'Applications',
            children: <ApplicationsTab onRegisterSearch={registerSearch} />,
          },
          ...(canViewMembers
            ? [
                {
                  key: 'member-company',
                  label: 'Member Company',
                  children: <MemberCompanyTab onRegisterSearch={registerSearch} />,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
};

export default ApplicationQueue;
