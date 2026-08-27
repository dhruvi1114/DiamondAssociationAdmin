/**
 * Masters ▸ News Categories (M9).
 *
 * The filter tabs on the website's news page — Press Release, Industry News,
 * Event Coverage — maintained by the association rather than fixed in code. A
 * trade body renames its own vocabulary, and a list that can only change by a
 * release is one that quietly stops being used.
 *
 * A master, so it lives here beside Event Types and Company Types rather than
 * as a tab on the News screen: it is configuration the association sets up once,
 * not work anybody does daily. Deliberately the same screen as Event Types, down
 * to the column order — they are the same kind of thing, and an admin who has
 * used one has used both.
 */
import { PlusOutlined } from '@ant-design/icons';
import { Ban, CheckCircle2, Pencil } from 'lucide-react';
import { Form, Input, Switch } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Highlight,
  MultiSelect,
  NumberInput,
  PageHeader,
  RowActions,
  SearchInput,
  StatusChip,
  toast,
} from '@/components/ui';
import { useConfirm } from '@/hooks/useConfirm';
import { usePermissions } from '@/hooks/usePermissions';
import NewsService, { type NewsCategory } from '@/services/newsService';

interface ApiError {
  message: string;
  requestId?: string;
}

/** Strip immutable keys before a PATCH — `code` cannot change. */
const omit = (source: Record<string, unknown>, keys: string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)));

const asError = (error: unknown): ApiError => {
  const err = error as { message?: string; requestId?: string };

  return {
    message: err?.message ?? 'Something went wrong',
    ...(err?.requestId ? { requestId: err.requestId } : {}),
  };
};

/** A code the association can never change once articles point at it. */
const CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

interface CategoryFilters {
  status: string[];
}

const EMPTY_FILTERS: CategoryFilters = { status: [] };

export const NewsCategories = () => {
  const { can } = usePermissions();
  const canManage = can('news.manage');

  const [rows, setRows] = useState<NewsCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<CategoryFilters>(EMPTY_FILTERS);
  const [editing, setEditing] = useState<NewsCategory | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const toggle = useConfirm<NewsCategory>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Inactive ones included: this screen is where they are switched back on,
      // and a list that hides them makes a deactivated category look deleted.
      const res = await NewsService.listCategories(true);

      setRows(res.data.categories);
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    Filtered here rather than on the server, unlike every list screen in this
    app. This master is a dozen rows the API returns in one unpaginated call, so
    there are no rows on "pages nobody has fetched" for a client filter to miss —
    the reason that rule exists does not apply. If it ever grows past a page,
    move both the search and the status filter into the request.
  */
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesText =
        !needle ||
        row.name.toLowerCase().includes(needle) ||
        row.code.toLowerCase().includes(needle);

      const matchesStatus =
        filters.status.length === 0 ||
        filters.status.includes(row.is_active ? 'active' : 'inactive');

      return matchesText && matchesStatus;
    });
  }, [rows, search, filters]);

  const openCreate = useCallback(() => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ display_order: rows.length + 1, is_active: true });
    setOpen(true);
  }, [form, rows.length]);

  const submit = async () => {
    const values = (await form.validateFields()) as Record<string, unknown>;

    setSaving(true);

    try {
      if (editing) {
        // `code` is immutable — stripped rather than sent and refused.
        await NewsService.updateCategory(editing.id, omit(values, ['code']) as never);
        toast.success('Category updated');
      } else {
        await NewsService.createCategory(values as never);
        toast.success('Category created');
      }

      setOpen(false);
      await load();
    } catch (err) {
      const fields = (err as { fields?: Record<string, string> }).fields;

      if (fields && Object.keys(fields).length > 0) {
        const entries = Object.entries(fields);

        form.setFields(entries.map(([name, message]) => ({ name, errors: [message] })));
        toast.error(entries[0]![1]);
      } else {
        toast.error(asError(err).message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="News Categories"
        actions={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              label="Search news categories"
              placeholder="Search code or name…"
              className="w-[240px]"
            />

            <FilterDropdown<CategoryFilters>
              value={filters}
              emptyValue={EMPTY_FILTERS}
              activeCount={filters.status.length > 0 ? 1 : 0}
              onApply={setFilters}
              onClear={() => setFilters(EMPTY_FILTERS)}
            >
              {(draft, setDraft) => (
                <FilterGroup label="Status">
                  <MultiSelect
                    value={draft.status}
                    placeholder="Any status"
                    onChange={(next) => setDraft((d) => ({ ...d, status: next.map(String) }))}
                    options={[
                      { value: 'active', label: 'Offered' },
                      { value: 'inactive', label: 'Not offered' },
                    ]}
                  />
                </FilterGroup>
              )}
            </FilterDropdown>

            {canManage && (
              <Button variant="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Add Category
              </Button>
            )}
          </>
        }
      />

      <Card flush className="min-h-0 flex-1">
        <DataTable<NewsCategory>
          unit="categories"
          serial
          rowKey="id"
          loading={loading}
          error={error}
          onRetry={() => void load()}
          dataSource={visible}
          filtered={Boolean(search) || filters.status.length > 0}
          onClearFilter={() => {
            setSearch('');
            setFilters(EMPTY_FILTERS);
          }}
          emptyTitle="No news categories yet"
          emptyDescription="Categories are the filter tabs on the website's news page — Press Release, Industry News, Event Coverage. Add the ones this association actually uses."
          emptyAction={canManage ? <Button onClick={openCreate}>Add Category</Button> : undefined}
          columns={[
            {
              title: 'Code',
              dataIndex: 'code',
              width: 200,
              render: (v: string) => (
                <span className="font-mono text-supporting">
                  <Highlight text={v} query={search} />
                </span>
              ),
            },
            {
              title: 'Name',
              dataIndex: 'name',
              width: 240,
              render: (v: string) => <Highlight text={v} query={search} />,
            },
            /*
              The web address is not a column. It is derived from the name, it is
              never scanned across rows, and at this width it truncated to
              "/news?category=press-relea…" — a column that shows nothing useful
              costs the ones beside it. It stays on the form, where it is set.
            */
            {
              title: 'Order',
              dataIndex: 'display_order',
              width: 90,
              render: (v: number) => <span className="tabular">{v}</span>,
            },
            {
              // No width: this column absorbs the slack.
              title: 'Status',
              dataIndex: 'is_active',
              render: (active: boolean) => (
                <StatusChip domain="catalogue" status={active ? 'ACTIVE' : 'INACTIVE'} />
              ),
            },
            {
              title: 'Created',
              dataIndex: 'createdAt',
              width: 140,
              render: (v: string) => <DateCell value={v} />,
            },
            {
              title: 'Updated',
              dataIndex: 'updatedAt',
              width: 140,
              render: (v: string) => <DateCell value={v} />,
            },
            ...(canManage
              ? [
                  {
                    title: 'Actions',
                    key: 'actions',
                    width: 80,
                    fixed: 'right' as const,
                    render: (_: unknown, row: NewsCategory) => (
                      <RowActions
                        actions={[
                          {
                            key: 'edit',
                            icon: <Pencil size={16} strokeWidth={1.5} />,
                            label: 'Edit',
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
                                label: 'Deactivate',
                                danger: true,
                                onClick: () => toggle.ask(row),
                              }
                            : {
                                key: 'activate',
                                icon: <CheckCircle2 size={16} strokeWidth={1.5} />,
                                label: 'Activate',
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
        Deactivate, not delete — the same toggle every masters screen uses.
        Articles already filed under a category keep it regardless: the category
        is part of how that article WAS filed, so removing the row could only
        orphan or silently re-file history. Deactivating says the one thing
        actually meant — stop offering it — and says it without an in-use 409.
      */}
      <ConfirmDialog
        open={toggle.target !== null}
        title={`${toggle.target?.is_active ? 'Deactivate' : 'Activate'} ${toggle.target?.name ?? 'this category'}?`}
        description={
          toggle.target?.is_active
            ? 'The tab stops appearing on the website and the category stops being offered when writing an article. Articles already filed under it keep it.'
            : 'It becomes selectable again when writing an article, and its tab returns to the website once an article uses it.'
        }
        confirmLabel={toggle.target?.is_active ? 'Deactivate' : 'Activate'}
        loading={toggle.busy}
        onCancel={toggle.cancel}
        onConfirm={() =>
          toggle.confirm(async (row) => {
            try {
              await NewsService.updateCategory(row.id, { is_active: !row.is_active });
              await load();
              toast.success(row.is_active ? 'Category deactivated' : 'Category activated');
            } catch (err) {
              toast.error(asError(err).message);
            }
          })
        }
      />

      <FormDrawer
        open={open}
        title={editing ? 'Edit Category' : 'Add Category'}
        description="A filter tab on the website's news page."
        loading={saving}
        onConfirm={submit}
        onCancel={() => setOpen(false)}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          {/*
            Name leads, write-once code follows it, and the pair shares a row:
            the name is what the admin has in mind, and the code is a
            consequence of it.
          */}
          <div className="flex gap-4">
            <Form.Item
              name="name"
              label="Name"
              className="min-w-0 flex-1"
              rules={[
                { required: true, message: 'A name is required' },
                { max: 120, message: 'Keep the name under 120 characters' },
              ]}
            >
              <Input placeholder="Press Release" />
            </Form.Item>

            {/*
              Visible but locked on edit rather than hidden: the code is how this
              row is referred to elsewhere, and a form that hides it leaves you
              checking you opened the right record by its name alone.
            */}
            <Form.Item
              name="code"
              label={
                <FieldLabel
                  label="Code"
                  help={
                    editing
                      ? 'Fixed once created — reports and links refer to it.'
                      : 'Capitals, digits and underscores. It cannot be changed later.'
                  }
                />
              }
              className="min-w-0 flex-1"
              rules={
                editing
                  ? []
                  : [
                      { required: true, message: 'A code is required' },
                      { pattern: CODE_PATTERN, message: 'Capitals, digits and underscores only' },
                    ]
              }
            >
              <Input disabled={Boolean(editing)} placeholder="PRESS_RELEASE" />
            </Form.Item>
          </div>

          {/*
            The web address is not a field.

            It is derived from the name — "Press Release" becomes press-release —
            and nothing on this screen benefits from letting an admin type a
            different one: the link is generated, shared and read by the site,
            never by a person composing it. The column behind it still exists and
            the server still fills it, so the day the association wants to choose
            its own addresses, this block comes back rather than a migration.

            <Form.Item name="slug" label={<FieldLabel label="Web Address" help="…" />}>
              <Input placeholder="press-release" />
            </Form.Item>
          */}

          <div className="flex gap-4">
            <Form.Item
              name="display_order"
              label={<FieldLabel label="Order" help="Where the tab sits. Lower comes first." />}
              className="min-w-0 flex-1"
            >
              <NumberInput min={0} className="w-full" />
            </Form.Item>

            <Form.Item
              name="is_active"
              label={
                <FieldLabel
                  label="Offered"
                  help="Off takes the tab off the website. Articles already filed under it keep it."
                />
              }
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

export default NewsCategories;
