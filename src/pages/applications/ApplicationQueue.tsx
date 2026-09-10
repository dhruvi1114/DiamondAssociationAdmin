import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EyeOutlined } from '@ant-design/icons';
// `Tooltip` and `formatAge` below belong to the commented-out Waiting column.
// Uncomment both when that column comes back.
// import { Tooltip } from 'antd';
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
  StatusChip,
  TextCell,
} from '@/components/ui';
import type { TableSort } from '@/components/ui';
import { usePermissions } from '@/hooks/usePermissions';
import { useLocationOptions, asOptions } from '@/hooks/useLocationOptions';
import ApplicationsService, {
  APPLICATION_SORT_COLUMNS,
  type ApplicationQueueRow,
  type ApplicationSortBy,
  type ApplicationStatus,
  type ApprovalWorkflow,
} from '@/services/applicationsService';
import MastersService, { type Category } from '@/services/mastersService';
import type { PaginationMeta } from '@/services/BaseService';
import { asDisplayError, type DisplayError } from '@/utils/apiError';
import { hoursSince } from '@/utils/format'; // + `formatAge` with the Waiting column

/**
 * A-03 — the member request queue (AJ-2, step one).
 *
 * Its own page. Member Companies used to sit beside it as a second tab, and the
 * pairing taught the wrong thing: a request is work that arrives, gets decided
 * and leaves, while the directory is a standing register you look things up in.
 * Two jobs, two entries in the rail — see `pages/members/MemberList.tsx`.
 *
 * A work queue answers one question before any other: **what needs me, and what
 * has been waiting longest?** Everything here follows from that.
 *
 *  - The default view narrows to stages the reviewer's own roles own ("My
 *    queue" vs "All requests" — a filter, not a page of its own: it is the same
 *    table and the same columns, just narrowed, so it belongs behind the Filter
 *    button next to Status, Stage and Category). Holding `application.approve`
 *    says what you may do; the stage's role says whose queue it is (rbac.md §4),
 *    and a queue full of other people's work is the fastest way to teach someone
 *    to ignore their queue.
 *  - "Documents pending" is the same kind of filter, for the same reason: it
 *    narrows this list to requests carrying an unchecked document rather than
 *    showing a different list.
 *  - The default sort is oldest first. A newest-first queue starves the row that
 *    has been waiting a week, which is precisely the row an SLA exists for.
 *  - Age is a column, not a timestamp. "12 Aug 2026, 14:05" makes the reader do
 *    subtraction; "6 days" is the number they were going to compute anyway.
 *
 * Filters and sort live in the URL so a reviewer who opens a request, decides it
 * and comes back lands where they left (tables.md).
 */

const DEFAULT_SORT: TableSort = { sortBy: 'submitted_at', sortOrder: 'asc' };

/**
 * The filter's own option values. Not `ApplicationStatus` any more: `Pending`
 * has to stand for two real statuses at once (`SUBMITTED` and `UNDER_REVIEW`),
 * which a one-to-one `value` can't express.
 *
 * `DRAFT` and `WITHDRAWN` are gone from the list entirely — nothing on this
 * screen can reach either one (public registration creates `SUBMITTED`
 * directly, and nothing in the app sets `WITHDRAWN`), so both options always
 * returned an empty table. They remain valid `ApplicationStatus` values
 * everywhere else; only this filter stops offering them.
 */
type StatusFilterOption = 'PENDING' | 'RETURNED_FOR_CORRECTION' | 'APPROVED' | 'REJECTED';

const STATUS_OPTIONS: Array<{ value: StatusFilterOption; label: string }> = [
  // Same reasoning as `constant/status.ts`: with only the Final approval stage
  // active, `SUBMITTED` and `UNDER_REVIEW` are both "nobody has decided this
  // yet" to a reviewer, so one option covers both underlying statuses.
  { value: 'PENDING', label: 'Pending' },
  // Not a third kind of decision — a rejection that still has corrections left
  // on it. "Action needed" says whose move it is (the applicant's) rather than
  // repeating "Rejected", which the Rejected option below already owns for the
  // closed ending.
  { value: 'RETURNED_FOR_CORRECTION', label: 'Action needed' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

/**
 * One filter option can stand for more than one real status. Keyed the same
 * way whichever direction it's read: expanding an option list into the
 * statuses the URL/API carry, or collapsing a status list back into the
 * options that should show as checked.
 */
const STATUS_OPTION_STATUSES: Record<StatusFilterOption, ApplicationStatus[]> = {
  PENDING: ['SUBMITTED', 'UNDER_REVIEW'],
  RETURNED_FOR_CORRECTION: ['RETURNED_FOR_CORRECTION'],
  APPROVED: ['APPROVED'],
  REJECTED: ['REJECTED'],
};

/**
 * Option values → the real statuses the URL and the API see. The wire format
 * is untouched: `PENDING` still becomes `SUBMITTED,UNDER_REVIEW` in
 * `?status=` and in the request, exactly as if the two had been picked by
 * hand — the backend has no way to tell "Pending" was ever one click.
 */
const expandStatusOptions = (options: StatusFilterOption[]): ApplicationStatus[] =>
  Array.from(new Set(options.flatMap((option) => STATUS_OPTION_STATUSES[option])));

/**
 * The inverse, for the MultiSelect's own `value` — read on load, on reload,
 * and off a pasted link. An option counts as checked when ANY of the statuses
 * it stands for is present, not only when every one is: a link carrying just
 * `?status=SUBMITTED` (hand-written, or from before this change) should still
 * show "Pending" selected rather than nothing, which is the naive version of
 * this mapping — round-trip a full `SUBMITTED,UNDER_REVIEW` through it and it
 * shows nothing checked, because it looked for an exact-match pair instead of
 * an overlap.
 */
const collapseStatusesToOptions = (statuses: ApplicationStatus[]): StatusFilterOption[] =>
  (Object.keys(STATUS_OPTION_STATUSES) as StatusFilterOption[]).filter((option) =>
    STATUS_OPTION_STATUSES[option].some((status) => statuses.includes(status)),
  );

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

/** `?status=A,B` ⇄ `['A','B']`. Absent and empty are the same thing: no filter. */
const readList = (value: string | null): string[] =>
  value ? value.split(',').filter(Boolean) : [];

/** Only the four allowlisted columns reach `sortBy`; anything else is a 422. */
const isSortable = (value: string): value is ApplicationSortBy =>
  APPLICATION_SORT_COLUMNS.includes(value as ApplicationSortBy);

/**
 * The queue, filtered rather than tabbed: "My queue" vs "All requests" and
 * "Documents pending" all narrow this one table, so they live behind the Filter
 * button alongside Status, Stage and Category.
 */
export const ApplicationQueue = () => {
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

  /* Search first, then the filter panel — the toolbar order every list uses. */
  const toolbar = (
    <>
      <SearchInput
        value={search}
        onChange={onSearch}
        label="Search member requests"
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
                // `draft.status` stays real `ApplicationStatus` values end to
                // end (URL, API, `QueueFilters`) — only the MultiSelect's own
                // value/onChange cross through the option ⇄ status mapping.
                value={collapseStatusesToOptions(draft.status)}
                placeholder="Any status"
                searchThreshold={8}
                options={STATUS_OPTIONS}
                onChange={(next) =>
                  setDraft((d) => ({
                    ...d,
                    status: expandStatusOptions(next as StatusFilterOption[]),
                  }))
                }
              />
            </FilterGroup>

            {/*
              Hidden on request (2026-09-10). Only ONE approval stage is switched
              on — "Final approval"; Document verification and Committee review are
              both off — so every open application sits at the same stage and the
              filter cannot narrow anything. Switch a second stage back on and this
              becomes useful again, which is why it is commented rather than deleted.
              The `stage` filter state, its URL param and the request all still work
              untouched, so restoring it is uncommenting this block.

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
            */}

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
    </>
  );

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

      /*
        Hidden on request (2026-09-09). Whether a company is listed in the public
        directory is a fact about a MEMBER, and this queue is about requests that
        have not become members yet — on most rows it can only say "Not active".
        The Member Companies page is where the answer belongs.
        
        Inner comment markers are neutered to `(* *)` only because block comments
        do not nest. Restore them with the column.

      {
        title: 'In Directory',
        dataIndex: 'directory_visible',
        key: 'directory_visible',
        width: 150,
        (*
          Read-only, and it explains rather than controls. Three switches decide
          whether a company is listed — the association's global switch, the
          firm's ACTIVE status, and the member's own choice — and only the first
          is staff's. A toggle here would imply otherwise, so the cell names
          whose decision is in force and stops there.
        *)
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
      */

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
      /*
        Beside Category, not out past the contact columns. What a request IS and
        where it has got to are read together — a Grower still under review and a
        Grower already approved are different rows to a reviewer — and the two
        sat far enough apart that seeing both meant scrolling sideways.
      */
      {
        // SUBMITTED and UNDER_REVIEW both read "Pending" straight from the chip
        // (`constant/status.ts`) rather than a second badge glued on beside it —
        // one label, not two saying the same thing.
        //
        // APPROVED is different: it is a fact about the APPLICATION, and it
        // cannot say whether the resulting member has ever paid. An approved row
        // whose member is still `PENDING` (`Member.status` — "approved, awaiting
        // first payment", `member.prisma:13`) says so in the chip's tooltip,
        // otherwise a reviewer has to open the application one at a time to find out.
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        sorter: true,
        width: 140,
        render: (value: ApplicationStatus, row: ApplicationQueueRow) => {
          /*
            The unpaid qualifier rides the chip's own tooltip rather than a Badge
            beside it. A visible badge did not fit: this column is 140px, and the
            pair overflowed into Email and printed on top of the addresses. Hover
            also matches how the rest of this table explains itself, and it keeps
            one chip per row so the column stays scannable.
          */
          const awaitingPayment = value === 'APPROVED' && row.member_status === 'PENDING';

          return (
            <StatusChip
              domain="application"
              status={value}
              {...(awaitingPayment
                ? { tooltip: 'Approved — awaiting payment of the first invoice.' }
                : {})}
            />
          );
        },
      },
      /*
        Hidden on request (2026-09-09). Stage is still a filter in the Filters
        panel and still drives "My queue", and the review screen shows it in full —
        this column repeated it on a table already wide enough to scroll.

      {
        title: 'Stage',
        dataIndex: 'stage_name',
        key: 'stage_name',
        width: 170,
        render: (_: unknown, row: ApplicationQueueRow) =>
          row.stage_name ? (
            (* The stage alone. The second line used to name whose queue it is —
               "ADMIN decides" — which repeated the same role on nearly every row
               and doubled the height of the whole table to say it. *)
            <span className="text-supporting text-fg">{row.stage_name}</span>
          ) : (
            <NotAvailable />
          ),
      },
      */

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
      /*
        Hidden on request (2026-09-09). Read on the review screen, where the
        verifier has the document beside it; nobody scans a queue by PAN.

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
      */

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
      /*
        Hidden on request (2026-09-09). The Overdue column beside it already
        answers the question this one exists for — is this row late — and says it
        in a word rather than a duration the reader has to compare against an SLA
        they cannot see. The queue also still sorts oldest-first by default, so
        the longest wait is at the top whether or not a column names it.

        The `//` line comments inside are rewritten to `(*` only because block
        comments do not nest. Restore them with the column.

      {
        title: 'Waiting',
        dataIndex: 'submitted_at',
        key: 'waiting',
        (* 110 wrapped "under an hour" onto two lines and made that row taller
        (* than every other one in the table.
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
      */

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
      /*
        Hidden on request (2026-09-09). State is still a filter in the Filters
        panel — asking "which of these are Gujarat" is the real question, and the
        panel answers it without a column that repeats one value down the page.

      {
        title: 'State',
        dataIndex: 'state',
        key: 'state',
        width: 140,
        render: (value: string | null) => <TextCell value={value} width={116} />,
      },
      */

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
    <div className="flex h-full min-h-0 flex-col">
      {/* `title` must match this page's nav label exactly — `AppShell` draws the
          visible heading from `NAV_GROUPS`, and `PageHeader`'s own is sr-only. */}
      <PageHeader title="Member Requests" actions={toolbar} />

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
    </div>
  );
};

export default ApplicationQueue;
