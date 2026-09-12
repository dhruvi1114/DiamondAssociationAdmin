import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EyeOutlined } from '@ant-design/icons';
import {
  Badge,
  Card,
  DataTable,
  DateCell,
  FilterDropdown,
  FilterGroup,
  FormSelect,
  Highlight,
  MultiSelect,
  NotAvailable,
  PageHeader,
  RowActions,
  SearchInput,
  StackedCell,
  StatusChip,
  TextCell,
} from '@/components/ui';
import type { TableSort } from '@/components/ui';
import { useLocationOptions, asOptions } from '@/hooks/useLocationOptions';
import MastersService, { type Category } from '@/services/mastersService';
import MembersService, {
  type MemberListRow,
  type MemberSortBy,
  type MemberStatus,
} from '@/services/membersService';
import type { PaginationMeta } from '@/services/BaseService';
import { asDisplayError, type DisplayError } from '@/utils/apiError';

/**
 * M3 — Member Companies: every company on record, whatever state its membership
 * is in.
 *
 * Its own page, not a tab. It shared the applications screen with the request
 * queue for one release, and the pairing taught the wrong thing: a member
 * request is a piece of work that arrives, gets decided and leaves, while this
 * is the standing register you look something up in. Two jobs, two entries in
 * the rail, and the tab row that used to hide one behind the other is gone.
 *
 * Filters stay in component state rather than the URL. The two lists would
 * otherwise share query keys (`status`, `category`) whose values mean different
 * enums on each — the same call `Categories.tsx` and `Locations.tsx` make.
 */

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
  /** Only members holding a document nobody has checked yet. */
  pendingDocuments: boolean;
}

const EMPTY_MEMBER_FILTERS: MemberFilters = {
  status: [],
  category: [],
  city: [],
  state: [],
  pendingDocuments: false,
};

const DOCUMENTS_OPTIONS: Array<{ value: 'any' | 'pending'; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'pending', label: 'Awaiting verification' },
];

export const MemberList = () => {
  const navigate = useNavigate();
  /* Read once, for the dashboard's Replaced Documents tile
     (`/members?documents=pending`); the filter panel owns it from then on. */
  const [params, setParams] = useSearchParams();

  const [rows, setRows] = useState<MemberListRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DisplayError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<MemberFilters>(() => ({
    ...EMPTY_MEMBER_FILTERS,
    pendingDocuments: params.get('documents') === 'pending',
  }));
  const [sort, setSort] = useState<TableSort>(MEMBER_DEFAULT_SORT);
  const locations = useLocationOptions();

  const hasFilters = Boolean(
    search ||
    filters.status.length ||
    filters.category.length ||
    filters.city.length ||
    filters.state.length ||
    filters.pendingDocuments,
  );
  const activeFilterCount =
    [filters.status, filters.category, filters.city, filters.state].filter((f) => f.length).length +
    (filters.pendingDocuments ? 1 : 0);

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
        ...(filters.pendingDocuments ? { documents: 'pending' as const } : {}),
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

  /* Keeps `?documents=pending` in step with the panel, so a refresh or a
     shared link shows the same list and clearing the filter really clears it. */
  const syncDocumentsParam = useCallback(
    (pending: boolean) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (pending) next.set('documents', 'pending');
          else next.delete('documents');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const applyFilters = useCallback(
    (next: MemberFilters) => {
      setFilters(next);
      setPage(1);
      syncDocumentsParam(next.pendingDocuments);
    },
    [syncDocumentsParam],
  );

  const clearFilters = useCallback(() => {
    setSearch('');
    setFilters(EMPTY_MEMBER_FILTERS);
    setPage(1);
    syncDocumentsParam(false);
  }, [syncDocumentsParam]);

  /* Search first, then the filter panel — the toolbar order every list uses. */
  const toolbar = (
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

            <FilterGroup label="Documents">
              <FormSelect
                className="w-full"
                value={draft.pendingDocuments ? 'pending' : 'any'}
                options={DOCUMENTS_OPTIONS}
                onChange={(next) =>
                  setDraft((d) => ({ ...d, pendingDocuments: next === 'pending' }))
                }
              />
            </FilterGroup>
          </>
        )}
      </FilterDropdown>
    </>
  );

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

          /* Amber when something waits on the admin — a file the member
             replaced from their Profile — so it stands out in the list. */
          if (pending > 0) {
            return (
              <Badge
                tone="warning"
                tooltip={`${pending} of ${total} on file awaiting verification`}
              >
                {`${pending} to verify`}
              </Badge>
            );
          }

          return <span className="tabular text-supporting text-fg">{`${total} on file`}</span>;
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
        width: 140,
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
        width: 160,
        // 160 less the cell's 24px of padding — see `TextCell`.
        render: (value: string | null) => <TextCell value={value} width={136} />,
      },
      {
        title: 'Updated By',
        dataIndex: 'updated_by',
        key: 'updated_by',
        width: 160,
        render: (value: string | null) => <TextCell value={value} width={136} empty="System" />,
      },
      {
        title: 'Approved By',
        dataIndex: 'approved_by',
        key: 'approved_by',
        width: 180,
        render: (value: string | null) => <TextCell value={value} width={156} empty="System" />,
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
              render: (value: string | null) => <TextCell value={value} width={156} />,
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
    <div className="flex h-full min-h-0 flex-col">
      {/* `title` must match this page's nav label exactly — `AppShell` draws the
          visible heading from `NAV_GROUPS`, and `PageHeader`'s own is sr-only. */}
      <PageHeader title="Member Companies" actions={toolbar} />

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
    </div>
  );
};

export default MemberList;
