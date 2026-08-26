import { PlusOutlined } from '@ant-design/icons';
import { Ban, CheckCircle2, Pencil } from 'lucide-react';
import { DatePicker, Form, Input, Switch, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
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
import MastersService, { type Category, type Tier } from '@/services/mastersService';
import type { PaginationMeta } from '@/services/BaseService';

/**
 * A-10 — membership categories and their tiers.
 *
 * Two tabs rather than two pages: a tier only means something inside a category,
 * and an admin setting the catalogue up moves between them constantly.
 *
 * Nothing here is seeded. The federation's real categories are OQ-2, so this
 * screen is how they arrive — which is why the empty state explains that rather
 * than looking like a loading failure.
 */

interface ApiError {
  message: string;
  requestId?: string;
}

/**
 * Both tab bodies own a "create" drawer, and both hand their trigger up to the
 * tab row so the button can share the line with the switcher instead of taking a
 * row of its own.
 *
 * A descriptor goes up, not a rendered button: a node rebuilt on every render
 * would set parent state on every render. This is memoised on primitives, so the
 * registering effect fires only when something about the action actually changes.
 */
export interface CreateAction {
  label: string;
  onClick: () => void;
  /** Set when the action exists but cannot run yet — the Button turns it into a
   *  tooltip, so a dead control still says why it is dead. */
  disabledReason?: string;
}

/**
 * A count, with the sentence it stands for on hover.
 *
 * The number alone is ambiguous in a narrow column — "1" under a heading reading
 * "Fees" could as easily be an amount as a row count, and the two are the sort of
 * thing an admin acts on. The tooltip spells it out, including the zero case,
 * which is the one that changes what you do next.
 */
const CountCell = ({
  value,
  one,
  many,
  none,
}: {
  value?: string;
  one: string;
  many: string;
  none: string;
}) => {
  const count = Number(value ?? 0);

  return (
    <Tooltip title={count === 0 ? none : `${count} ${count === 1 ? one : many}`}>
      <span className="tabular cursor-default">{count}</span>
    </Tooltip>
  );
};

interface TabBodyProps {
  onRegisterCreate?: (action: CreateAction | null) => void;
  /**
   * The tab body's search box, handed up so it can sit beside the create button
   * on the tab row rather than claim a row of its own. A node, unlike the
   * button's descriptor: the page renders nothing of its own around it.
   */
  onRegisterSearch?: (node: ReactNode) => void;
}

/** Strip immutable keys before a PATCH — `code` and `category_id` cannot change. */
const omit = (source: Record<string, unknown>, keys: string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)));

const asError = (error: unknown): ApiError => {
  const err = error as { message?: string; requestId?: string };

  return {
    message: err?.message ?? 'Something went wrong',
    ...(err?.requestId ? { requestId: err.requestId } : {}),
  };
};

/**
 * What the Categories list can be narrowed by.
 *
 * Both are server-side. Status has to be, because a deactivated category on
 * page three is invisible to any filter that only sees the twenty rows already
 * fetched; the date range has to be for the same reason.
 *
 * `''` is the empty state for every field, so `EMPTY_CATEGORY_FILTERS` doubles
 * as the reset value and as the thing `activeCount` compares against.
 */
export interface CategoryFilters {
  /** Multi-select, so an admin can ask for both states at once. */
  status: string[];
  createdFrom: string;
  createdTo: string;
}

const EMPTY_CATEGORY_FILTERS: CategoryFilters = { status: [], createdFrom: '', createdTo: '' };

const STATUS_OPTIONS = [
  { value: 'active', label: 'Offered' },
  { value: 'inactive', label: 'Not offered' },
];

const CategoriesTab = ({ onRegisterCreate, onRegisterSearch }: TabBodyProps) => {
  const { can } = usePermissions();
  const canManage = can('category.manage');

  const [rows, setRows] = useState<Category[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<CategoryFilters>(EMPTY_CATEGORY_FILTERS);
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const toggle = useConfirm<Category>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The filter runs server-side: it has to match rows on pages nobody has
      // fetched, which a client-side filter over the current twenty cannot.
      const res = await MastersService.listCategories({
        page,
        limit: 20,
        ...(search ? { search } : {}),
        // Spread conditionally so an unset filter sends no key at all — the API
        // treats a missing param as "no opinion", and an empty string would be
        // a value it has to reject.
        // Joined here rather than by the HTTP layer: the shared query builder
        // stringifies whatever it is given, and an array would arrive as
        // "active,inactive" by accident rather than by decision.
        ...(filters.status.length > 0 ? { status: filters.status.join(',') } : {}),
        ...(filters.createdFrom ? { created_from: filters.createdFrom } : {}),
        ...(filters.createdTo ? { created_to: filters.createdTo } : {}),
      });
      setRows(res.data);
      setPagination(res.pagination);
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    A new query starts at page one. Staying on page four of the unfiltered list
    while the filter cuts it to six rows shows an empty table, which reads as
    "no matches" rather than "you are past the end".
  */
  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);

  /*
    Applying always returns to page one, for the same reason searching does:
    landing on page three of a list the filter has cut to six rows shows an
    empty table, which reads as "no matches" rather than "you are past the end".
  */
  const applyFilters = useCallback((next: CategoryFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_CATEGORY_FILTERS);
    setPage(1);
  }, []);

  // A date range counts once, not twice — it is one decision the user made.
  const activeFilterCount =
    (filters.status.length > 0 ? 1 : 0) + (filters.createdFrom || filters.createdTo ? 1 : 0);

  useEffect(() => {
    onRegisterSearch?.(
      <>
        <SearchInput
          value={search}
          onChange={onSearch}
          label="Search categories"
          placeholder="Search code or name…"
          className="w-[240px]"
        />

        <FilterDropdown<CategoryFilters>
          value={filters}
          emptyValue={EMPTY_CATEGORY_FILTERS}
          onApply={applyFilters}
          onClear={clearFilters}
          activeCount={activeFilterCount}
        >
          {(draft, setDraft) => (
            <>
              <FilterGroup label="Status">
                <MultiSelect
                  value={draft.status}
                  placeholder="All statuses"
                  options={STATUS_OPTIONS}
                  onChange={(next) => setDraft((d) => ({ ...d, status: next.map(String) }))}
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
      </>,
    );

    return () => onRegisterSearch?.(null);
  }, [search, onSearch, onRegisterSearch, filters, applyFilters, clearFilters, activeFilterCount]);

  const openCreate = useCallback(() => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ display_order: 0, is_active: true });
    setOpen(true);
  }, [form]);

  const createAction = useMemo<CreateAction | null>(
    () => (canManage ? { label: 'Add category', onClick: openCreate } : null),
    [canManage, openCreate],
  );

  useEffect(() => {
    onRegisterCreate?.(createAction);
    return () => onRegisterCreate?.(null);
  }, [createAction, onRegisterCreate]);

  const openEdit = (row: Category) => {
    setEditing(row);
    form.setFieldsValue(row);
    setOpen(true);
  };

  const submit = async () => {
    const values = (await form.validateFields()) as Record<string, unknown>;
    setSaving(true);
    try {
      if (editing) {
        // `code` is intentionally absent from the update payload — a machine name
        // that other rows resolve by cannot be renamed after the fact.
        await MastersService.updateCategory(editing.id, omit(values, ['code']));
      } else {
        await MastersService.createCategory(values);
      }
      setOpen(false);
      await load();
      toast.success(editing ? `${editing.name} updated` : `${String(values.name)} created`);
    } catch (err) {
      toast.error('Could not save', { description: asError(err).message });
    } finally {
      setSaving(false);
    }
  };

  /*
    Hard delete replaced with the same active/inactive toggle every masters
    screen uses (client decision): a category already referenced by a fee or a
    member cannot be deleted anyway, and staff kept hitting that 409. Toggling
    `is_active` off removes it from new selections without touching history.
    Restore the block below if hard delete returns.

  const remove = async (row: Category) => {
    setError(null);
    try {
      await MastersService.deleteCategory(row.id);
      await load();
      toast.success(`${row.name} deleted`);
    } catch (err) {
      toast.error('Could not delete', { description: asError(err).message });
    }
  };
  */

  const toggleActive = async (row: Category) => {
    setError(null);
    try {
      await MastersService.updateCategory(row.id, { is_active: !row.is_active });
      await load();
      toast.success(`${row.name} ${row.is_active ? 'deactivated' : 'activated'}`);
    } catch (err) {
      toast.error('Could not update status', { description: asError(err).message });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* No toolbar row: the "Add category" button is registered above and drawn
          on the tab row. No card title either — the tab already names this list
          and a third heading on one screen is noise (layout.md page anatomy). */}
      <Card flush className="min-h-0 flex-1">
        <DataTable<Category>
          unit="categories"
          serial
          rowKey="id"
          loading={loading}
          error={error}
          onRetry={() => void load()}
          pagination={pagination}
          onPageChange={setPage}
          dataSource={rows}
          filtered={Boolean(search) || activeFilterCount > 0}
          /*
            Clears BOTH. The empty state is shown when a search OR a filter has
            emptied the list, so a button that only reset the search left the
            user staring at the same empty table having done what it asked.
          */
          onClearFilter={() => {
            onSearch('');
            clearFilters();
          }}
          emptyTitle="No categories yet"
          emptyDescription="Membership categories are the federation's own vocabulary — Grower, Manufacturer, Trader. Add the first one to make it selectable on the application form."
          emptyAction={canManage ? <Button onClick={openCreate}>Add category</Button> : undefined}
          columns={[
            {
              /*
                Code and name are the two fields the server matches on, so they
                are the two that carry the mark. A filtered list otherwise says
                which rows matched without saying which cell did the matching.
              */
              title: 'Code',
              dataIndex: 'code',
              width: 160,
              render: (v: string) => (
                <span className="font-mono text-supporting">
                  <Highlight text={v} query={search} />
                </span>
              ),
            },
            /*
              Name is capped rather than elastic. Left open it absorbed every
              spare pixel in the table and pushed the counts and dates into the
              far right third, a screen-width away from the row they describe.
              The slack now collects on Status instead, which is the last column
              before the frozen actions and the one that loses nothing by being
              wide.
            */
            {
              title: 'Name',
              dataIndex: 'name',
              width: 260,
              render: (v: string) => <Highlight text={v} query={search} />,
            },
            {
              title: 'Description',
              dataIndex: 'description',
              width: 280,
              // 280 less the cell's 24px of padding — see `TextCell` for why
              // the width is passed rather than left to the column's `ellipsis`.
              render: (value: string | null) => <TextCell value={value} width={256} />,
            },
            // Tiers column hidden — tiers are not used.
            // {
            //   title: 'Tiers',
            //   dataIndex: 'tier_count',
            //   width: 90,
            //   render: (value: string | undefined) => (
            //     <CountCell
            //       value={value}
            //       one="tier in this category"
            //       many="tiers in this category"
            //       none="No tiers — this category is priced as a whole"
            //     />
            //   ),
            // },
            // Fees column hidden at the client's request.
            // {
            //   title: 'Fees',
            //   dataIndex: 'fee_count',
            //   width: 90,
            //   render: (value: string | undefined) => (
            //     <CountCell
            //       value={value}
            //       one="fee published against this category"
            //       many="fees published against this category"
            //       none="No fee published yet — this category cannot be applied for"
            //     />
            //   ),
            // },
            {
              title: 'Created',
              dataIndex: 'createdAt',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              /*
                Date only, like Created. A time would imply the two are meant to
                be compared to the minute; what an admin reads this column for is
                "has anyone touched it lately", and the drawer holds the detail.
              */
              title: 'Updated',
              dataIndex: 'updatedAt',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              title: 'Status',
              dataIndex: 'is_active',
              width: 130,
              render: (active: boolean) => (
                <StatusChip domain="catalogue" status={active ? 'ACTIVE' : 'INACTIVE'} />
              ),
            },
            ...(canManage
              ? [
                  {
                    title: 'Actions',
                    key: 'actions',
                    width: 80,
                    fixed: 'right' as const,
                    render: (_: unknown, row: Category) => (
                      <RowActions
                        actions={[
                          {
                            key: 'edit',
                            icon: <Pencil size={16} strokeWidth={1.5} />,
                            label: 'Edit category',
                            onClick: () => openEdit(row),
                          },
                          row.is_active
                            ? {
                                key: 'deactivate',
                                icon: <Ban size={16} strokeWidth={1.5} />,
                                label: 'Deactivate category',
                                danger: true,
                                onClick: () => toggle.ask(row),
                              }
                            : {
                                key: 'activate',
                                icon: <CheckCircle2 size={16} strokeWidth={1.5} />,
                                label: 'Activate category',
                                success: true,
                                onClick: () => toggle.ask(row),
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

      {/*
        A deactivated category disappears from new selections but existing
        records keep pointing at it — reversible, unlike delete, so it needs
        confirming but not the delete dialog's warnings about what it breaks.
      */}
      <ConfirmDialog
        open={toggle.target !== null}
        title={`${toggle.target?.is_active ? 'Deactivate' : 'Activate'} ${toggle.target?.name ?? 'this category'}?`}
        description={
          toggle.target?.is_active
            ? 'It stops appearing as a Business Nature choice on new registrations. Existing members keep it.'
            : 'It becomes selectable as a Business Nature choice on new registrations again.'
        }
        confirmLabel={toggle.target?.is_active ? 'Deactivate' : 'Activate'}
        loading={toggle.busy}
        onCancel={toggle.cancel}
        onConfirm={() => toggle.confirm(toggleActive)}
      />

      <FormDrawer
        open={open}
        title={editing ? `Edit ${editing.name}` : 'Add category'}
        confirmLabel={editing ? 'Save' : 'Create'}
        loading={saving}
        onCancel={() => setOpen(false)}
        onConfirm={() => void submit()}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          {/*
            Name leads. It is the thing the admin already has in mind and the only
            one of the pair they choose freely; the code is derived from it and is
            write-once, so it reads as a consequence of the name rather than a
            gate in front of it. On an edit there is no code field at all and Name
            simply takes the row.
          */}
          <div className="flex gap-4">
            <Form.Item
              name="name"
              label="Name"
              className="min-w-0 flex-1"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input placeholder="Grower" />
            </Form.Item>
            {/*
              Shown on an edit too, disabled rather than removed. The code is how
              this row is referred to everywhere else in the system, and a form
              that hides it leaves the admin checking they opened the right row by
              its name alone. Disabled says "this is it, and it cannot change" —
              which the help text already promised at create time.
            */}
            <Form.Item
              name="code"
              label={
                <FieldLabel
                  label="Code"
                  help={
                    editing
                      ? 'Fixed when the category was created. Other records point at it.'
                      : 'Capitals, digits and underscores. Cannot be changed later.'
                  }
                />
              }
              className="min-w-0 flex-1"
              rules={
                editing
                  ? []
                  : [
                      { required: true, message: 'Required' },
                      { pattern: /^[A-Z][A-Z0-9_]*$/, message: 'Use GROWER, not Grower' },
                    ]
              }
            >
              <Input placeholder="GROWER" disabled={Boolean(editing)} />
            </Form.Item>
          </div>
          <Form.Item
            name="description"
            label={<FieldLabel label="Description" help="Shown on the public membership page." />}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
          {/*
            Both are one-line controls, so a row each left a band of empty drawer
            between them. Paired, they also read as what they are: the two
            settings that decide where this appears and whether it appears at all.
          */}
          <div className="flex gap-4">
            <Form.Item name="display_order" label="Display order" className="min-w-0 flex-1">
              <NumberInput min={0} max={999} />
            </Form.Item>
            <Form.Item
              name="is_active"
              label="Offered to new applicants"
              valuePropName="checked"
              className="min-w-0 flex-1"
            >
              <Switch />
            </Form.Item>
          </div>
        </Form>
      </FormDrawer>
    </div>
  );
};

/** Tiers narrow by the category they sit under, plus the shared status/created pair. */
export interface TierFilters {
  categories: string[];
  status: string[];
  createdFrom: string;
  createdTo: string;
}

const EMPTY_TIER_FILTERS: TierFilters = {
  categories: [],
  status: [],
  createdFrom: '',
  createdTo: '',
};

const TiersTab = ({ onRegisterCreate, onRegisterSearch }: TabBodyProps) => {
  const { can } = usePermissions();
  const canManage = can('category.manage');

  const [rows, setRows] = useState<Tier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<TierFilters>(EMPTY_TIER_FILTERS);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tier | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const deletion = useConfirm<Tier>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tiers, cats] = await Promise.all([
        MastersService.listTiers({
          page,
          limit: 20,
          ...(search ? { search } : {}),
          ...(filters.categories.length > 0 ? { category_id: filters.categories.join(',') } : {}),
          ...(filters.status.length > 0 ? { status: filters.status.join(',') } : {}),
          ...(filters.createdFrom ? { created_from: filters.createdFrom } : {}),
          ...(filters.createdTo ? { created_to: filters.createdTo } : {}),
        }),
        MastersService.listCategories({ limit: 100, activeOnly: true }),
      ]);
      setRows(tiers.data);
      setPagination(tiers.pagination);
      setCategories(cats.data);
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    A new query starts at page one. Staying on page four of the unfiltered list
    while the filter cuts it to six rows shows an empty table, which reads as
    "no matches" rather than "you are past the end".
  */
  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);

  const applyFilters = useCallback((next: TierFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_TIER_FILTERS);
    setPage(1);
  }, []);

  const activeFilterCount =
    (filters.categories.length > 0 ? 1 : 0) +
    (filters.status.length > 0 ? 1 : 0) +
    (filters.createdFrom || filters.createdTo ? 1 : 0);

  useEffect(() => {
    onRegisterSearch?.(
      <>
        <SearchInput
          value={search}
          onChange={onSearch}
          label="Search tiers"
          placeholder="Search code or name…"
          className="w-[240px]"
        />

        <FilterDropdown<TierFilters>
          value={filters}
          emptyValue={EMPTY_TIER_FILTERS}
          onApply={applyFilters}
          onClear={clearFilters}
          activeCount={activeFilterCount}
        >
          {(draft, setDraft) => (
            <>
              <FilterGroup label="Category">
                <MultiSelect
                  value={draft.categories}
                  placeholder="All categories"
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  onChange={(next) => setDraft((d) => ({ ...d, categories: next.map(String) }))}
                />
              </FilterGroup>

              <FilterGroup label="Status">
                <MultiSelect
                  value={draft.status}
                  placeholder="All statuses"
                  options={STATUS_OPTIONS}
                  onChange={(next) => setDraft((d) => ({ ...d, status: next.map(String) }))}
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
  ]);

  const openCreate = useCallback(() => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ display_order: 0, is_active: true });
    setOpen(true);
  }, [form]);

  /*
    A tier belongs to a category, so with no categories on file there is nothing
    to attach one to. The action stays visible and explains itself rather than
    disappearing — a missing button is indistinguishable from a missing
    permission.
  */
  const createAction = useMemo<CreateAction | null>(
    () =>
      canManage
        ? {
            label: 'Add tier',
            onClick: openCreate,
            ...(categories.length === 0
              ? { disabledReason: 'Add a category first — a tier sits inside one.' }
              : {}),
          }
        : null,
    [canManage, categories.length, openCreate],
  );

  useEffect(() => {
    onRegisterCreate?.(createAction);
    return () => onRegisterCreate?.(null);
  }, [createAction, onRegisterCreate]);

  const submit = async () => {
    const values = (await form.validateFields()) as Record<string, unknown>;
    setSaving(true);
    try {
      if (editing) {
        await MastersService.updateTier(editing.id, omit(values, ['code', 'category_id']));
      } else {
        await MastersService.createTier(values as Partial<Tier>);
      }
      setOpen(false);
      await load();
      toast.success(editing ? `${editing.name} updated` : `${String(values.name)} created`);
    } catch (err) {
      toast.error('Could not save', { description: asError(err).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/*
        The tab's standing hint is commented out at the client's request. To
        bring it back, drop this block in above the card:

          <p className="m-0 text-12 text-fg-muted">
            Optional bands inside a category. A category with no tiers is priced
            as a whole.
          </p>

        The rule it explains is still enforced and still explained where it is
        actionable — the Add tier button says why it is disabled when there are
        no categories, and the empty state says the same thing at length.
      */}

      <Card flush className="min-h-0 flex-1">
        <DataTable<Tier>
          unit="tiers"
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
          emptyTitle={categories.length === 0 ? 'Add a category first' : 'No tiers yet'}
          emptyDescription={
            categories.length === 0
              ? 'A tier belongs to a category, so there is nothing to attach one to yet.'
              : 'Tiers are optional. Add them only if the federation prices different bands inside a category.'
          }
          columns={[
            { title: 'Category', dataIndex: 'category_name', width: 200 },
            {
              title: 'Tier Code',
              dataIndex: 'code',
              width: 140,
              render: (v: string) => (
                <span className="font-mono text-supporting">
                  <Highlight text={v} query={search} />
                </span>
              ),
            },
            {
              title: 'Tier Name',
              dataIndex: 'name',
              width: 260,
              render: (v: string) => <Highlight text={v} query={search} />,
            },
            {
              title: 'Description',
              dataIndex: 'description',
              width: 280,
              // 280 less the cell's 24px of padding — see `TextCell` for why
              // the width is passed rather than left to the column's `ellipsis`.
              render: (value: string | null) => <TextCell value={value} width={256} />,
            },
            {
              title: 'Fees',
              dataIndex: 'fee_count',
              width: 90,
              render: (value: string | undefined) => (
                <CountCell
                  value={value}
                  one="fee published against this tier"
                  many="fees published against this tier"
                  none="No fee published yet — this tier falls back to its category price"
                />
              ),
            },
            {
              title: 'Created',
              dataIndex: 'createdAt',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              /*
                Date only, like Created. A time would imply the two are meant to
                be compared to the minute; what an admin reads this column for is
                "has anyone touched it lately", and the drawer holds the detail.
              */
              title: 'Updated',
              dataIndex: 'updatedAt',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              title: 'Status',
              dataIndex: 'is_active',
              width: 130,
              render: (active: boolean) => (
                <StatusChip domain="catalogue" status={active ? 'ACTIVE' : 'INACTIVE'} />
              ),
            },
            ...(canManage
              ? [
                  {
                    title: 'Actions',
                    key: 'actions',
                    width: 80,
                    fixed: 'right' as const,
                    render: (_: unknown, row: Tier) => (
                      <RowActions
                        actions={[
                          {
                            key: 'edit',
                            icon: <Pencil size={16} strokeWidth={1.5} />,
                            label: 'Edit tier',
                            onClick: () => {
                              setEditing(row);
                              form.setFieldsValue(row);
                              setOpen(true);
                            },
                          },
                          row.is_active
                            ? {
                                key: 'deactivate',
                                icon: <Ban size={16} strokeWidth={1.5} />,
                                label: 'Deactivate tier',
                                danger: true,
                                onClick: () => deletion.ask(row),
                              }
                            : {
                                key: 'activate',
                                icon: <CheckCircle2 size={16} strokeWidth={1.5} />,
                                label: 'Activate tier',
                                success: true,
                                onClick: () => deletion.ask(row),
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
        open={deletion.target !== null}
        title={`${deletion.target?.is_active ? 'Deactivate' : 'Activate'} ${deletion.target?.name ?? 'this tier'}?`}
        description={
          deletion.target?.is_active
            ? 'It stops appearing as a choice on new applications. Existing members keep it.'
            : 'It becomes selectable on new applications again.'
        }
        confirmLabel={deletion.target?.is_active ? 'Deactivate' : 'Activate'}
        loading={deletion.busy}
        onCancel={deletion.cancel}
        onConfirm={() =>
          deletion.confirm(async (row) => {
            try {
              await MastersService.updateTier(row.id, { is_active: !row.is_active });
              await load();
              toast.success(`${row.name} ${row.is_active ? 'deactivated' : 'activated'}`);
            } catch (err) {
              toast.error('Could not update status', { description: asError(err).message });
            }
          })
        }
      />

      <FormDrawer
        open={open}
        title={editing ? `Edit ${editing.name}` : 'Add tier'}
        confirmLabel={editing ? 'Save' : 'Create'}
        loading={saving}
        onCancel={() => setOpen(false)}
        onConfirm={() => void submit()}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <div className="flex gap-4">
            <Form.Item
              name="name"
              label="Name"
              className="min-w-0 flex-1"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input placeholder="Gold" />
            </Form.Item>
            <Form.Item
              name="code"
              label={
                <FieldLabel
                  label="Code"
                  help={
                    editing
                      ? 'Fixed when the tier was created. Fee rows point at it.'
                      : 'Unique within the category. Cannot be changed later.'
                  }
                />
              }
              className="min-w-0 flex-1"
              rules={
                editing
                  ? []
                  : [
                      { required: true, message: 'Required' },
                      { pattern: /^[A-Z][A-Z0-9_]*$/, message: 'Use GOLD, not Gold' },
                    ]
              }
            >
              <Input placeholder="GOLD" disabled={Boolean(editing)} />
            </Form.Item>
          </div>
          {/*
            Category follows the pair rather than leading it. The name is what the
            admin already has in mind; the category is a filing decision made about
            the thing once it has one. It is still what the code must be unique
            against, but the code field's own help text carries that rule — it does
            not have to be enforced by making the user answer this first.

            `FormSelect`, not a native `<select>`: the list grows with the
            catalogue and a native dropdown cannot be searched, cannot be styled to
            match the inputs beside it, and renders as an OS menu on every
            platform.
          */}
          {/* Two equal cells: category and display order share the row. */}
          <div className="grid grid-cols-2 gap-4">
            {/*
              Locked on an edit, not hidden. A tier means nothing without the
              category it sits inside — "Gold" is a different thing under Grower
              than under Trader — so the drawer has to say which one it is even
              though it cannot be moved.
            */}
            <Form.Item
              name="category_id"
              label="Category"
              className="min-w-0"
              rules={editing ? [] : [{ required: true, message: 'Required' }]}
            >
              <FormSelect
                placeholder="Choose a category"
                disabled={Boolean(editing)}
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Form.Item>

            <Form.Item name="display_order" label="Display order" className="min-w-0">
              <NumberInput min={0} max={999} />
            </Form.Item>
          </div>

          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="is_active" label="Offered to new applicants" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </FormDrawer>
    </div>
  );
};

export const Categories = () => {
  /*
    Search and create are registered up from CategoriesTab so they can sit on
    the page header. The Tiers tab (and the Tabs shell) were removed — flat fee
    means categories alone; restore Tabs + TiersTab if tiers return.
  */
  const [create, setCreate] = useState<CreateAction | null>(null);
  const [searchBox, setSearchBox] = useState<ReactNode>(null);

  /* Stable, or the child's registering effects would re-run on every parent render. */
  const register = useCallback((action: CreateAction | null) => setCreate(action), []);
  const registerSearch = useCallback((node: ReactNode) => setSearchBox(node), []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Categories"
        actions={
          <>
            {searchBox}
            {create ? (
              <Button
                variant="primary"
                icon={<PlusOutlined />}
                onClick={create.onClick}
                {...(create.disabledReason
                  ? { disabled: true, disabledReason: create.disabledReason }
                  : {})}
              >
                {create.label}
              </Button>
            ) : null}
          </>
        }
      />

      <CategoriesTab onRegisterCreate={register} onRegisterSearch={registerSearch} />
    </div>
  );
};

export default Categories;
