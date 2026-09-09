import { PlusOutlined } from '@ant-design/icons';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import { Ban, CheckCircle2, Eye, Pencil } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  DateCell,
  FilterDropdown,
  FilterGroup,
  Highlight,
  MultiSelect,
  NotAvailable,
  PageHeader,
  RowActions,
  SearchInput,
  StackedCell,
  StatusChip,
  TextCell,
  toast,
} from '@/components/ui';
import { useConfirm } from '@/hooks/useConfirm';
import { usePermissions } from '@/hooks/usePermissions';
import FeePlansService, {
  CYCLES,
  type CreateStructureBody,
  type FeeStructure,
  type PriceScope,
} from '@/services/feePlansService';
import type { PaginationMeta } from '@/services/BaseService';
import StructureDetailDrawer from './StructureDetailDrawer';
import StructureFormDrawer from './StructureFormDrawer';

/**
 * A-11 (redesigned) — the association's price list.
 *
 * The unit on this screen is a STRUCTURE, not a price. One row is one version of
 * the price list; its four cycles live inside it. The screen it replaces listed
 * every price separately, which is how eight rows that differ only by a hidden
 * category came to look like eight duplicates, and how a joining price came to
 * exist with no renewal price behind it.
 *
 * Spec: `docs/specs/2026-09-07-membership-fee-plans.md`.
 */

export interface StructureFilters {
  status: string[];
  scope: string[];
  /** `YYYY-MM-DD`, or empty. Either end may stand alone. */
  createdFrom: string;
  createdTo: string;
  effectiveFrom: string;
  effectiveTo: string;
}

const EMPTY_FILTERS: StructureFilters = {
  status: [],
  scope: [],
  createdFrom: '',
  createdTo: '',
  effectiveFrom: '',
  effectiveTo: '',
};

const FILTER_STATUS_OPTIONS = [
  { value: 'active', label: 'Live' },
  { value: 'inactive', label: 'Retired' },
];

const FILTER_SCOPE_OPTIONS = [
  { value: 'ALL_MEMBERS', label: 'All members' },
  { value: 'NEW_MEMBERS_ONLY', label: 'New members only' },
];

interface ApiError {
  message: string;
  requestId?: string;
}

const asError = (error: unknown): ApiError => {
  const err = error as { message?: string; requestId?: string };

  return {
    message: err?.message ?? 'Something went wrong',
    ...(err?.requestId ? { requestId: err.requestId } : {}),
  };
};

/**
 * A live structure is described by its live plans; a retired one has none, and
 * describing it as "N/A" would hide the very dates that say when it applied.
 * So retired structures are read from every plan they hold.
 */
const window_ = (s: FeeStructure): { from: string | null; to: string | null } => {
  const live = s.is_active ? s.plans.filter((p) => p.is_active) : s.plans;
  if (live.length === 0) return { from: null, to: null };

  const from = live.reduce(
    (a, p) => (p.effective_from < a ? p.effective_from : a),
    live[0]!.effective_from,
  );
  /* One open-ended plan makes the whole list open-ended: something in it is still sellable. */
  const to = live.some((p) => p.effective_to === null)
    ? null
    : live.reduce<string | null>(
        (a, p) => (a && p.effective_to && p.effective_to > a ? p.effective_to : a),
        live[0]!.effective_to,
      );

  return { from, to };
};

/**
 * One dissenting plan is enough to answer "applies to". The question this column
 * exists for is "is anybody frozen on an old price because of this list", and
 * that is true as soon as one cycle says so.
 */
const scopeOf = (s: FeeStructure): PriceScope => {
  /* Superseded rows carry the scope of the change that RETIRED them, which is a
     fact about the version that replaced this one, not about this one. Reading
     them here made a list whose live plans all say "all members" report itself
     as "new members only". */
  const current = s.is_active ? s.plans.filter((p) => p.is_active) : s.plans;

  return current.some((p) => p.price_scope === 'NEW_MEMBERS_ONLY')
    ? 'NEW_MEMBERS_ONLY'
    : 'ALL_MEMBERS';
};

export const FeeStructures = () => {
  const { canAny } = usePermissions();
  const canManage = canAny('fee.manage');

  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<StructureFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();

  const [saving, setSaving] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  /*
    `null` is closed; a structure id edits it; the empty string creates one. One
    piece of state rather than two booleans, so "create while a detail is open"
    cannot be represented at all.
  */
  const [formFor, setFormFor] = useState<string | null>(null);

  const retirement = useConfirm<FeeStructure>();

  const statusKey = filters.status.join(',');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await FeePlansService.listStructures({
        page,
        limit: 20,
        ...(search ? { search } : {}),
        ...(statusKey ? { status: statusKey } : {}),
        ...(filters.createdFrom ? { created_from: filters.createdFrom } : {}),
        ...(filters.createdTo ? { created_to: filters.createdTo } : {}),
        ...(filters.effectiveFrom ? { effective_from: filters.effectiveFrom } : {}),
        ...(filters.effectiveTo ? { effective_to: filters.effectiveTo } : {}),
      });

      setStructures(res.data);
      setPagination(res.pagination);
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, [
    page,
    search,
    statusKey,
    filters.createdFrom,
    filters.createdTo,
    filters.effectiveFrom,
    filters.effectiveTo,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const detail = structures.find((s) => s.id === detailId) ?? null;
  const filtered =
    search.trim() !== '' ||
    filters.status.length > 0 ||
    filters.scope.length > 0 ||
    filters.createdFrom !== '' ||
    filters.createdTo !== '' ||
    filters.effectiveFrom !== '' ||
    filters.effectiveTo !== '';

  /*
    Applies-to is filtered here rather than by the API. It is derived from the
    plans on each row, not a column the server can index — sending it would mean
    the query recomputing per row anyway, on every row in the table.
  */
  const visible =
    filters.scope.length > 0
      ? structures.filter((row) => filters.scope.includes(scopeOf(row)))
      : structures;

  const editingStructure = formFor ? (structures.find((s) => s.id === formFor) ?? null) : null;

  const submitStructure = async (body: CreateStructureBody, scope?: PriceScope) => {
    setSaving(true);
    try {
      if (editingStructure) {
        await FeePlansService.updateStructure(editingStructure.id, {
          ...body,
          ...(scope ? { price_scope: scope } : {}),
        });
      } else {
        /* The scope answer travels on create too: under D-3 a price change is normally made by
           retiring the old list and publishing this one, so this is where the question is
           actually asked. Dropping it here made "New members only" a no-op. */
        await FeePlansService.createStructure({
          ...body,
          ...(scope ? { price_scope: scope } : {}),
        });
      }
      toast.success(
        scope === 'ALL_MEMBERS'
          ? 'Saved. Existing members will renew at the new price.'
          : scope === 'NEW_MEMBERS_ONLY'
            ? 'Saved. Existing members keep the price they are on.'
            : editingStructure
              ? `${body.name} updated.`
              : `${body.name} published. ${body.plans.length} plan${body.plans.length === 1 ? '' : 's'} live on the website.`,
      );
      setFormFor(null);
      await load();
    } catch (err) {
      toast.error(asError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Fee Plans"
        actions={
          <>
            <SearchInput
              value={search}
              onChange={(next) => {
                setSearch(next);
                setPage(1);
              }}
              placeholder="Search structures…"
              label="Search fee structures"
            />
            <FilterDropdown<StructureFilters>
              value={filters}
              emptyValue={EMPTY_FILTERS}
              activeCount={
                filters.status.length +
                filters.scope.length +
                (filters.createdFrom || filters.createdTo ? 1 : 0) +
                (filters.effectiveFrom || filters.effectiveTo ? 1 : 0)
              }
              onClear={() => {
                setFilters(EMPTY_FILTERS);
                setPage(1);
              }}
              onApply={(next) => {
                setFilters(next);
                setPage(1);
              }}
            >
              {(draft, setDraft) => (
                <>
                  <FilterGroup label="Status">
                    <MultiSelect
                      value={draft.status}
                      placeholder="All statuses"
                      onChange={(status) => setDraft({ ...draft, status: status as string[] })}
                      options={FILTER_STATUS_OPTIONS}
                    />
                  </FilterGroup>

                  <FilterGroup label="Applies To">
                    <MultiSelect
                      value={draft.scope}
                      placeholder="All members and new-only"
                      onChange={(scope) => setDraft({ ...draft, scope: scope as string[] })}
                      options={FILTER_SCOPE_OPTIONS}
                    />
                  </FilterGroup>

                  {/*
                    Filtered on the server, so it reaches structures on pages
                    nobody has fetched. Either end may stand alone — "everything
                    since March" is a question, and so is "everything before it".
                  */}
                  <FilterGroup label="Effective From">
                    <DatePicker.RangePicker
                      className="w-full"
                      format="YYYY-MM-DD"
                      value={[
                        draft.effectiveFrom ? dayjs(draft.effectiveFrom) : null,
                        draft.effectiveTo ? dayjs(draft.effectiveTo) : null,
                      ]}
                      onChange={(range) =>
                        setDraft({
                          ...draft,
                          effectiveFrom: range?.[0]?.format('YYYY-MM-DD') ?? '',
                          effectiveTo: range?.[1]?.format('YYYY-MM-DD') ?? '',
                        })
                      }
                    />
                  </FilterGroup>

                  <FilterGroup label="Created">
                    <DatePicker.RangePicker
                      className="w-full"
                      format="YYYY-MM-DD"
                      value={[
                        draft.createdFrom ? dayjs(draft.createdFrom) : null,
                        draft.createdTo ? dayjs(draft.createdTo) : null,
                      ]}
                      onChange={(range) =>
                        setDraft({
                          ...draft,
                          createdFrom: range?.[0]?.format('YYYY-MM-DD') ?? '',
                          createdTo: range?.[1]?.format('YYYY-MM-DD') ?? '',
                        })
                      }
                    />
                  </FilterGroup>
                </>
              )}
            </FilterDropdown>
            {canManage ? (
              <Button variant="primary" icon={<PlusOutlined />} onClick={() => setFormFor('')}>
                New structure
              </Button>
            ) : null}
          </>
        }
      />

      <Card flush className="min-h-0 flex-1">
        <DataTable<FeeStructure>
          rowKey="id"
          serial
          unit="structures"
          loading={loading}
          error={error}
          onRetry={load}
          pagination={pagination}
          onPageChange={setPage}
          dataSource={visible}
          filtered={filtered}
          onClearFilter={() => {
            setSearch('');
            setFilters(EMPTY_FILTERS);
            setPage(1);
          }}
          emptyTitle="No fee structures yet"
          emptyDescription="Publish one so applicants can see what membership costs. Nothing appears on the website until you do."
          emptyAction={
            canManage ? (
              <Button variant="primary" icon={<PlusOutlined />} onClick={() => setFormFor('')}>
                New structure
              </Button>
            ) : undefined
          }
          onRow={(row) => ({
            onClick: () => setDetailId(row.id),
            style: { cursor: 'pointer' },
          })}
          columns={[
            {
              title: 'Structure',
              dataIndex: 'name',
              width: 260,
              render: (name: string) => (
                <span className="font-medium">
                  <Highlight text={name} query={search} />
                </span>
              ),
            },
            {
              title: 'Plans',
              key: 'plans',
              width: 150,
              render: (_: unknown, row: FeeStructure) => {
                /* How many of the four CYCLES this list covers — not how many
                   rows it holds. A cycle whose price has been superseded is
                   still covered, and a retired structure covered what it
                   covered; counting live rows reported a complete 2025 list as
                   "0 of 4". */
                const live = new Set(row.plans.map((p) => p.billing_cycle)).size;
                const complete = live === CYCLES.length;

                return (
                  <Badge
                    tone={complete ? 'neutral' : 'warning'}
                    tooltip={
                      complete
                        ? 'All four billing cycles are published.'
                        : `${CYCLES.length - live} cycle(s) are not on the website.`
                    }
                  >
                    {`${live} of ${CYCLES.length} plans`}
                  </Badge>
                );
              },
            },
            {
              title: 'Effective',
              key: 'effective',
              width: 150,
              render: (_: unknown, row: FeeStructure) => {
                const w = window_(row);

                /* No second line when there is no end date. "Open-ended" was a
                   label for the absence of one, which every row without an end
                   date carried — a word repeated down a column says nothing. */
                return w.to ? (
                  <StackedCell
                    primary={<DateCell value={w.from} />}
                    secondary={
                      <>
                        until <DateCell value={w.to} />
                      </>
                    }
                  />
                ) : (
                  <DateCell value={w.from} />
                );
              },
            },
            {
              title: 'Applies To',
              key: 'scope',
              width: 180,
              render: (_: unknown, row: FeeStructure) =>
                scopeOf(row) === 'ALL_MEMBERS' ? (
                  'All members'
                ) : (
                  <StackedCell primary="New members only" secondary="Existing members frozen" />
                ),
            },
            {
              title: 'Created',
              dataIndex: 'createdAt',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              /* Its own column, not a second line under the date. Sorting and
                 scanning a column of names is the point of having them. */
              title: 'Created By',
              dataIndex: 'created_by',
              width: 160,
              render: (value: string | null) =>
                value ? <TextCell value={value} /> : <NotAvailable />,
            },
            {
              title: 'Last Updated',
              dataIndex: 'updatedAt',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              title: 'Updated By',
              dataIndex: 'updated_by',
              width: 160,
              render: (value: string | null) =>
                value ? <TextCell value={value} /> : <NotAvailable />,
            },
            {
              /* No width — this column absorbs the slack (components rule 7). */
              title: 'Status',
              key: 'status',
              render: (_: unknown, row: FeeStructure) => (
                <StatusChip
                  domain="fee"
                  status={row.is_active ? 'ACTIVE' : 'INACTIVE'}
                  tooltip={
                    row.is_active
                      ? undefined
                      : 'Hidden from the website. Members already on these plans keep renewing from them.'
                  }
                />
              ),
            },
            {
              title: 'Actions',
              key: 'actions',
              // Three icon buttons on a manager's row, one on a viewer's.
              width: canManage ? 108 : 60,
              fixed: 'right' as const,
              render: (_: unknown, row: FeeStructure) => (
                <RowActions
                  actions={[
                    {
                      key: 'view',
                      icon: <Eye size={16} strokeWidth={1.5} />,
                      label: 'View this structure',
                      onClick: () => setDetailId(row.id),
                    },
                    {
                      key: 'edit',
                      icon: <Pencil size={16} strokeWidth={1.5} />,
                      label: 'Edit this structure',
                      hidden: !canManage,
                      onClick: () => setFormFor(row.id),
                    },
                    ...(canManage
                      ? [
                          row.is_active
                            ? {
                                key: 'retire',
                                icon: <Ban size={16} strokeWidth={1.5} />,
                                label: 'Retire this structure',
                                danger: true,
                                onClick: () => retirement.ask(row),
                              }
                            : {
                                key: 'restore',
                                icon: <CheckCircle2 size={16} strokeWidth={1.5} />,
                                label: 'Bring back to the website',
                                success: true,
                                onClick: () => retirement.ask(row),
                              },
                        ]
                      : []),
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      <StructureDetailDrawer
        open={detailId !== null && formFor === null}
        structure={detail}
        onClose={() => setDetailId(null)}
        onEdit={() => setFormFor(detail?.id ?? '')}
        canManage={canManage}
      />

      <StructureFormDrawer
        open={formFor !== null}
        structure={editingStructure}
        onCancel={() => setFormFor(null)}
        onSubmit={submitStructure}
        structures={structures}
        saving={saving}
      />

      <ConfirmDialog
        open={retirement.target !== null}
        loading={retirement.busy}
        danger={retirement.target?.is_active ?? false}
        title={
          retirement.target?.is_active
            ? `Retire ${retirement.target?.name}?`
            : `Bring ${retirement.target?.name} back?`
        }
        description={
          retirement.target?.is_active ? (
            <>
              Its plans stop appearing on the website and new applications will not accept them.
              <strong> Members already on these plans keep renewing from them</strong> — retiring a
              price list does not move anybody off it.
            </>
          ) : (
            'Its live plans appear on the website again. This is refused if another structure already covers the same cycle and dates.'
          )
        }
        confirmLabel={retirement.target?.is_active ? 'Retire' : 'Bring back'}
        onCancel={retirement.cancel}
        onConfirm={() =>
          retirement.confirm(async (row) => {
            try {
              await FeePlansService.setStructureActive(row.id, !row.is_active);
              toast.success(
                row.is_active ? `${row.name} retired.` : `${row.name} is back on the website.`,
              );
              await load();
            } catch (err) {
              toast.error(asError(err).message);
            }
          })
        }
      />
    </div>
  );
};

export default FeeStructures;
