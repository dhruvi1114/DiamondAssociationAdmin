import { PlusOutlined } from '@ant-design/icons';
import { Ban, CheckCircle2 } from 'lucide-react';
import { DatePicker, Form, Input, Switch } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  DateCell,
  FieldLabel,
  FilterDropdown,
  FilterGroup,
  FormDrawer,
  FormSelect,
  Highlight,
  MoneyText,
  MultiSelect,
  NumberInput,
  PageHeader,
  RowActions,
  SearchInput,
  StatusChip,
  TextCell,
  toast,
} from '@/components/ui';
import { useConfirm } from '@/hooks/useConfirm';
import { usePermissions } from '@/hooks/usePermissions';
import MastersService, {
  type Category,
  type Fee,
  type FeeType,
  type Tier,
} from '@/services/mastersService';
import type { PaginationMeta } from '@/services/BaseService';

/**
 * A-11 — the association's price list.
 *
 * Two rules from `billing-payment.md` §2 drive the whole screen, and the copy says
 * both out loud because getting them wrong is expensive:
 *
 *  1. **A price is never edited.** Amounts are immutable once published; changing
 *     one means closing the old row and publishing a new one. That is what keeps
 *     last year's invoice explainable.
 *  2. **Two live prices may not overlap.** The database enforces it with an
 *     exclusion constraint, so a 409 here is the guard firing, not a UI bug.
 */

/**
 * A price list is asked two different date questions, and they are not the same
 * one: "what did we publish last week" (created) versus "what price applies in
 * March" (effective). Both are offered, because answering the second with the
 * first is the mistake this screen invites.
 */
export interface FeeFilters {
  categories: string[];
  feeTypes: string[];
  status: string[];
  effectiveFrom: string;
  effectiveTo: string;
  createdFrom: string;
  createdTo: string;
}

const EMPTY_FEE_FILTERS: FeeFilters = {
  categories: [],
  feeTypes: [],
  status: [],
  effectiveFrom: '',
  effectiveTo: '',
  createdFrom: '',
  createdTo: '',
};

const FILTER_STATUS_OPTIONS = [
  { value: 'active', label: 'Live' },
  { value: 'inactive', label: 'Retired' },
];

const FEE_TYPES: { value: FeeType; label: string; hint: string }[] = [
  {
    value: 'NEW_MEMBERSHIP',
    label: 'New membership',
    hint: 'Charged when an application is approved.',
  },
  { value: 'RENEWAL', label: 'Renewal', hint: 'Charged when an existing member renews.' },
  {
    value: 'EVENT_DEFAULT',
    label: 'Event default',
    hint: 'Fallback for a paid event with no fee of its own.',
  },
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

/** Live today, scheduled for later, closed in the past, or retired by an admin. */
const feeState = (fee: Fee): string => {
  if (!fee.is_active) return 'INACTIVE';
  const today = dayjs().startOf('day');
  if (dayjs(fee.effective_from).isAfter(today)) return 'SCHEDULED';
  if (fee.effective_to && dayjs(fee.effective_to).isBefore(today)) return 'CLOSED';

  return 'ACTIVE';
};

export const Fees = () => {
  const { can } = usePermissions();
  const canManage = can('fee.manage');

  const [rows, setRows] = useState<Fee[]>([]);

  /*
    The Note column appears only when a note exists on this page. Fees are
    usually published without one, so a permanently empty column would spend
    220px of a table that already scrolls sideways — and a column of em dashes
    reads as data missing rather than data absent.
  */
  const hasNotes = rows.some((row) => Boolean(row.notes?.trim()));

  /*
    Retiring is one click on an icon and it cannot be undone from this screen —
    a published price is never edited, so putting one back means publishing it
    again. The same `useConfirm` the delete actions use, so all three destructive
    paths on the masters screens ask in the same voice.
  */
  const retirement = useConfirm<Fee>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FeeFilters>(EMPTY_FEE_FILTERS);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fees, cats, tierList] = await Promise.all([
        // Server-side: the filter has to reach rows on pages nobody has fetched.
        MastersService.listFees({
          page,
          limit: 20,
          ...(search ? { search } : {}),
          ...(filters.categories.length > 0 ? { category_id: filters.categories.join(',') } : {}),
          ...(filters.feeTypes.length > 0 ? { fee_type: filters.feeTypes.join(',') } : {}),
          ...(filters.status.length > 0 ? { status: filters.status.join(',') } : {}),
          ...(filters.effectiveFrom ? { effective_from: filters.effectiveFrom } : {}),
          ...(filters.effectiveTo ? { effective_to: filters.effectiveTo } : {}),
          ...(filters.createdFrom ? { created_from: filters.createdFrom } : {}),
          ...(filters.createdTo ? { created_to: filters.createdTo } : {}),
        }),
        MastersService.listCategories({ limit: 100, activeOnly: true }),
        MastersService.listTiers({ limit: 200, activeOnly: true }),
      ]);
      setRows(fees.data);
      setPagination(fees.pagination);
      setCategories(cats.data);
      setTiers(tierList.data);
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedCategory = Form.useWatch('category_id', form) as string | undefined;
  const tiersForCategory = tiers.filter((t) => t.category_id === selectedCategory);

  const submit = async () => {
    const values = (await form.validateFields()) as Record<string, unknown>;
    setSaving(true);
    try {
      await MastersService.createFee({
        category_id: values.category_id || null,
        tier_id: values.tier_id || null,
        fee_type: values.fee_type,
        // Money leaves as a string on purpose — see the service comment.
        amount: String(values.amount),
        tax_rate: values.tax_rate === undefined ? '0' : String(values.tax_rate),
        duration_months: values.duration_months ?? 12,
        effective_from: dayjs(values.effective_from as string).format('YYYY-MM-DD'),
        effective_to: values.effective_to
          ? dayjs(values.effective_to as string).format('YYYY-MM-DD')
          : null,
        is_active: values.is_active ?? true,
        notes: values.notes || undefined,
      });
      setOpen(false);
      await load();
      toast.success('Fee published');
    } catch (err) {
      toast.error('Could not publish', { description: asError(err).message });
    } finally {
      setSaving(false);
    }
  };

  /* A new query starts at page one — see the note in `Categories`. */
  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);

  /*
    Client decision: retiring is now reversible, matching the toggle every
    other masters screen uses. Reactivating an old row still goes through the
    same overlap guard `updateFee` already enforces — if another active price
    now covers the same category/tier/dates, the 409 from that constraint
    surfaces here rather than silently creating two live prices.
  */
  const toggleActive = async (fee: Fee) => {
    setError(null);
    try {
      await MastersService.updateFee(fee.id, { is_active: !fee.is_active });
      await load();
      toast.success(fee.is_active ? 'Price retired' : 'Price reactivated');
    } catch (err) {
      toast.error('Could not update status', { description: asError(err).message });
    }
  };

  const applyFilters = useCallback((next: FeeFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FEE_FILTERS);
    setPage(1);
  }, []);

  // Each date range counts once — one range is one decision the admin made.
  const activeFilterCount =
    (filters.categories.length > 0 ? 1 : 0) +
    (filters.feeTypes.length > 0 ? 1 : 0) +
    (filters.status.length > 0 ? 1 : 0) +
    (filters.effectiveFrom || filters.effectiveTo ? 1 : 0) +
    (filters.createdFrom || filters.createdTo ? 1 : 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/*
        The strapline is commented out at the client's request. To bring it back,
        pass it to PageHeader again:
          subtitle="What each category and tier costs, and from when."
      */}
      <PageHeader
        title="Fee Structures"
        actions={
          <>
            <SearchInput
              value={search}
              onChange={onSearch}
              label="Search fees"
              placeholder="Search category, tier or note…"
              className="w-[240px]"
            />

            <FilterDropdown<FeeFilters>
              value={filters}
              emptyValue={EMPTY_FEE_FILTERS}
              onApply={applyFilters}
              onClear={clearFilters}
              activeCount={activeFilterCount}
            >
              {(draft, setDraft) => (
                <>
                  {/* Category filter hidden — flat global fee only.
                  <FilterGroup label="Category">
                    <MultiSelect
                      value={draft.categories}
                      placeholder="All categories"
                      options={categories.map((c) => ({ value: c.id, label: c.name }))}
                      onChange={(next) => setDraft((d) => ({ ...d, categories: next.map(String) }))}
                    />
                  </FilterGroup>
                  */}

                  <FilterGroup label="Charged for">
                    <MultiSelect
                      value={draft.feeTypes}
                      placeholder="All types"
                      options={FEE_TYPES.map((f) => ({ value: f.value, label: f.label }))}
                      onChange={(next) => setDraft((d) => ({ ...d, feeTypes: next.map(String) }))}
                    />
                  </FilterGroup>

                  <FilterGroup label="Status">
                    <MultiSelect
                      value={draft.status}
                      placeholder="All statuses"
                      options={FILTER_STATUS_OPTIONS}
                      onChange={(next) => setDraft((d) => ({ ...d, status: next.map(String) }))}
                    />
                  </FilterGroup>

                  <FilterGroup label="Applies during">
                    <DatePicker.RangePicker
                      className="w-full"
                      format="YYYY-MM-DD"
                      allowEmpty={[true, true]}
                      value={[
                        draft.effectiveFrom ? dayjs(draft.effectiveFrom) : null,
                        draft.effectiveTo ? dayjs(draft.effectiveTo) : null,
                      ]}
                      onChange={(range) =>
                        setDraft((d) => ({
                          ...d,
                          effectiveFrom: range?.[0] ? range[0].format('YYYY-MM-DD') : '',
                          effectiveTo: range?.[1] ? range[1].format('YYYY-MM-DD') : '',
                        }))
                      }
                    />
                  </FilterGroup>

                  <FilterGroup label="Created">
                    <DatePicker.RangePicker
                      className="w-full"
                      format="YYYY-MM-DD"
                      allowEmpty={[true, true]}
                      value={[
                        draft.createdFrom ? dayjs(draft.createdFrom) : null,
                        draft.createdTo ? dayjs(draft.createdTo) : null,
                      ]}
                      onChange={(range) =>
                        setDraft((d) => ({
                          ...d,
                          createdFrom: range?.[0] ? range[0].format('YYYY-MM-DD') : '',
                          createdTo: range?.[1] ? range[1].format('YYYY-MM-DD') : '',
                        }))
                      }
                    />
                  </FilterGroup>
                </>
              )}
            </FilterDropdown>
            {canManage ? (
              <Button
                variant="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  form.resetFields();
                  form.setFieldsValue({
                    fee_type: 'NEW_MEMBERSHIP',
                    duration_months: 12,
                    tax_rate: 0,
                    is_active: true,
                    effective_from: dayjs(),
                  });
                  setOpen(true);
                }}
              >
                Publish a fee
              </Button>
            ) : null}
          </>
        }
      />

      {!canManage ? (
        <Alert
          className="mb-4"
          variant="info"
          message="You can see prices but not set them. Fee changes are an Accounts responsibility."
        />
      ) : null}

      <Card flush className="min-h-0 flex-1">
        <DataTable<Fee>
          unit="fees"
          serial
          rowKey="id"
          loading={loading}
          error={error}
          onRetry={() => void load()}
          pagination={pagination}
          onPageChange={setPage}
          dataSource={rows}
          filtered={Boolean(search) || activeFilterCount > 0}
          onClearFilter={() => {
            onSearch('');
            clearFilters();
          }}
          emptyTitle="No fees published yet"
          emptyDescription="Publish a global fee first. Category-specific overrides are optional."
          columns={[
            // Category column hidden — flat global fee only.
            // {
            //   title: 'Category',
            //   dataIndex: 'category_name',
            //   width: 190,
            //   render: (v: string | null) =>
            //     v ? <Highlight text={v} query={search} /> : <span className="text-fg-muted">Global</span>,
            // },
            // Tier column hidden — tiers are not used in the flat-fee flow.
            // {
            //   title: 'Tier',
            //   dataIndex: 'tier_name',
            //   width: 170,
            //   render: (t: string | null) =>
            //     t ? <Highlight text={t} query={search} /> : <span className="text-fg-muted">All tiers</span>,
            // },
            {
              title: 'Type',
              dataIndex: 'fee_type',
              width: 150,
              render: (t: FeeType) => FEE_TYPES.find((f) => f.value === t)?.label ?? t,
            },
            {
              title: 'Amount',
              dataIndex: 'amount',
              width: 120,
              align: 'right' as const,
              render: (_: unknown, row: Fee) => (
                <MoneyText amount={row.amount} currency={row.currency} />
              ),
            },
            {
              title: 'Tax',
              key: 'tax',
              width: 110,
              align: 'right' as const,
              render: (_: unknown, row: Fee) =>
                Number(row.tax_rate) > 0 ? (
                  <span className="tabular text-supporting">{row.tax_rate}%</span>
                ) : (
                  <span className="text-fg-muted">No tax</span>
                ),
            },
            {
              /*
                Computed here rather than read from the row: the list endpoint
                returns the base amount and the rate, and the resolve endpoint is
                the only one that sends a total. Deriving it keeps the column
                honest against whichever of the two fed the table.
              */
              title: 'Total',
              key: 'total',
              width: 130,
              align: 'right' as const,
              render: (_: unknown, row: Fee) => (
                <MoneyText
                  amount={(Number(row.amount) * (1 + Number(row.tax_rate) / 100)).toFixed(2)}
                  currency={row.currency}
                />
              ),
            },
            {
              title: 'Term',
              dataIndex: 'duration_months',
              width: 90,
              render: (m: number) => `${m} mo`,
            },
            {
              title: 'Effective From',
              dataIndex: 'effective_from',
              width: 140,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              /*
                An open-ended price is the common case, and an em dash would read
                as missing data. It is a deliberate state, so it is named.
              */
              title: 'Effective To',
              dataIndex: 'effective_to',
              width: 140,
              render: (value: string | null) =>
                value ? <DateCell value={value} /> : <span className="text-fg-muted">Open</span>,
            },
            ...(hasNotes
              ? [
                  {
                    title: 'Note',
                    dataIndex: 'notes',
                    width: 220,
                    render: (value: string | null) => <TextCell value={value} width={200} />,
                  },
                ]
              : []),
            {
              title: 'Created',
              dataIndex: 'createdAt',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              title: 'Updated',
              dataIndex: 'updatedAt',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              title: 'Status',
              key: 'status',
              width: 130,
              render: (_: unknown, row: Fee) => <StatusChip domain="fee" status={feeState(row)} />,
            },
            ...(canManage
              ? [
                  {
                    title: 'Actions',
                    key: 'actions',
                    width: 80,
                    fixed: 'right' as const,
                    render: (_: unknown, row: Fee) => (
                      <RowActions
                        actions={[
                          row.is_active
                            ? {
                                key: 'deactivate',
                                icon: <Ban size={16} strokeWidth={1.5} />,
                                label: 'Retire this price',
                                danger: true,
                                onClick: () => retirement.ask(row),
                              }
                            : {
                                key: 'activate',
                                icon: <CheckCircle2 size={16} strokeWidth={1.5} />,
                                label: 'Reactivate this price',
                                success: true,
                                onClick: () => retirement.ask(row),
                              },
                        ]}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>

      <ConfirmDialog
        open={retirement.target !== null}
        title={retirement.target?.is_active ? 'Retire this price?' : 'Reactivate this price?'}
        description={
          retirement.target?.is_active
            ? 'It stops applying to new applications. Invoices already raised keep the old price.'
            : 'It becomes live again. If another active price now overlaps the same category, tier and dates, this is blocked until that conflict is resolved.'
        }
        confirmLabel={retirement.target?.is_active ? 'Retire' : 'Reactivate'}
        loading={retirement.busy}
        onCancel={retirement.cancel}
        onConfirm={() => retirement.confirm(toggleActive)}
      />

      <FormDrawer
        open={open}
        title="Publish a fee"
        width={520}
        description="Amounts cannot be edited once published. To change a price later, retire this one and publish a new one."
        confirmLabel="Publish"
        loading={saving}
        onCancel={() => setOpen(false)}
        onConfirm={() => void submit()}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          {/*
            Paired two to a row, and the pairing is not arbitrary — each row is one
            question. What is priced (category and tier), what the charge is for
            and how much, how it is taxed and for how long, and when it applies
            from and to. Read down the left column and the fee still makes sense.

            `grid`, not `flex`: a row where one field carries a hint line and the
            other does not would otherwise leave the shorter control stretched or
            mis-aligned. Equal columns keep every control the same width whatever
            hangs beneath it.
          */}
          {/* Category and Tier fields are not used — flat global fee only.
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="category_id" label="Category" className="min-w-0">
              <FormSelect
                placeholder="Global (all categories)"
                allowClear
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Form.Item>
            <Form.Item
              name="tier_id"
              label={
                <FieldLabel
                  label="Tier"
                  help="Leave blank to price the whole category. A tier price beats a category price."
                />
              }
              className="min-w-0"
            >
              <FormSelect
                placeholder="All tiers"
                allowClear
                options={tiersForCategory.map((t) => ({ value: t.id, label: t.name }))}
              />
            </Form.Item>
          </div>
          */}

          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item
              name="fee_type"
              label="Charged for"
              className="min-w-0"
              rules={[{ required: true, message: 'Required' }]}
            >
              <FormSelect options={FEE_TYPES.map((f) => ({ value: f.value, label: f.label }))} />
            </Form.Item>

            <Form.Item
              name="amount"
              label="Amount (₹)"
              className="min-w-0"
              rules={[{ required: true, message: 'Required' }]}
            >
              <NumberInput min={0} precision={2} placeholder="25000.00" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item
              name="tax_rate"
              label={
                <FieldLabel
                  label="Tax %"
                  help="0 if the association does not charge tax on this fee."
                />
              }
              className="min-w-0"
            >
              <NumberInput min={0} max={100} precision={2} />
            </Form.Item>

            <Form.Item name="duration_months" label="Membership term (months)" className="min-w-0">
              <NumberInput min={1} max={120} />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item
              name="effective_from"
              label="Effective from"
              className="min-w-0"
              rules={[{ required: true, message: 'Required' }]}
            >
              <DatePicker className="w-full" format="YYYY-MM-DD" />
            </Form.Item>

            <Form.Item
              name="effective_to"
              label={
                <FieldLabel label="Effective to" help="Leave blank for an open-ended price." />
              }
              className="min-w-0"
            >
              <DatePicker className="w-full" format="YYYY-MM-DD" />
            </Form.Item>
          </div>

          <Form.Item
            name="notes"
            label={
              <FieldLabel
                label="Internal note"
                help="Never shown to members — e.g. the resolution that set this price."
              />
            }
          >
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item name="is_active" label="Live" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </FormDrawer>
    </div>
  );
};

export default Fees;
