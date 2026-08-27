/**
 * Masters ▸ Event Types (M7).
 *
 * The kinds of event the association runs — Conference, Seminar, Exhibition,
 * Buyer-Seller Meet — maintained here rather than fixed in code (client
 * decision, 2026-08-27). A trade body adds a type the week it decides to run
 * one, and a list that can only change by a release is one that quietly becomes
 * a free-text box.
 *
 * Deliberately the same screen as Company Types, down to the column order. They
 * are the same kind of thing and an admin who has used one has used both.
 */
import { PlusOutlined } from '@ant-design/icons';
import { Ban, CheckCircle2, Pencil } from 'lucide-react';
import { Form, Input, Switch, Tooltip } from 'antd';
import { useCallback, useEffect, useState } from 'react';
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
import MastersService, { type EventType } from '@/services/mastersService';
import type { PaginationMeta } from '@/services/BaseService';

interface ApiError {
  message: string;
  requestId?: string;
}

const omit = (source: Record<string, unknown>, keys: string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)));

const asError = (error: unknown): ApiError => {
  const err = error as { message?: string; requestId?: string };

  return {
    message: err?.message ?? 'Something went wrong',
    ...(err?.requestId ? { requestId: err.requestId } : {}),
  };
};

interface EventTypeFilters {
  status: string[];
}

const EMPTY: EventTypeFilters = { status: [] };

const STATUS_OPTIONS = [
  { value: 'active', label: 'Offered' },
  { value: 'inactive', label: 'Not offered' },
];

export const EventTypes = () => {
  const { can } = usePermissions();
  const canManage = can('category.manage');

  const [rows, setRows] = useState<EventType[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<EventTypeFilters>(EMPTY);
  const [editing, setEditing] = useState<EventType | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const deletion = useConfirm<EventType>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await MastersService.listEventTypes({
        page,
        limit: 20,
        ...(search ? { search } : {}),
        ...(filters.status.length > 0 ? { status: filters.status.join(',') } : {}),
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

  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);

  const applyFilters = useCallback((next: EventTypeFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY);
    setPage(1);
  }, []);

  const submit = async () => {
    const values = (await form.validateFields()) as Record<string, unknown>;
    setSaving(true);
    try {
      if (editing) {
        await MastersService.updateEventType(editing.id, omit(values, ['code']));
      } else {
        await MastersService.createEventType(values);
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
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Event Types"
        actions={
          <>
            <SearchInput
              value={search}
              onChange={onSearch}
              label="Search event types"
              placeholder="Search code or name…"
              className="w-[240px]"
            />
            <FilterDropdown<EventTypeFilters>
              value={filters}
              emptyValue={EMPTY}
              onApply={applyFilters}
              onClear={clearFilters}
              activeCount={filters.status.length > 0 ? 1 : 0}
            >
              {(draft, setDraft) => (
                <FilterGroup label="Status">
                  <MultiSelect
                    value={draft.status}
                    placeholder="All statuses"
                    options={STATUS_OPTIONS}
                    onChange={(next) => setDraft((d) => ({ ...d, status: next.map(String) }))}
                  />
                </FilterGroup>
              )}
            </FilterDropdown>
            {canManage ? (
              <Button
                variant="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditing(null);
                  form.resetFields();
                  form.setFieldsValue({ display_order: 0, is_active: true });
                  setOpen(true);
                }}
              >
                Add Event Type
              </Button>
            ) : null}
          </>
        }
      />

      <Card flush className="min-h-0 flex-1">
        <DataTable<EventType>
          unit="event types"
          serial
          rowKey="id"
          loading={loading}
          error={error}
          onRetry={() => void load()}
          pagination={pagination}
          onPageChange={setPage}
          dataSource={rows}
          filtered={Boolean(search) || filters.status.length > 0}
          onClearFilter={() => {
            onSearch('');
            clearFilters();
          }}
          emptyTitle="No event types yet"
          emptyDescription="Add the kinds of event the association runs — conference, seminar, exhibition, buyer-seller meet."
          columns={[
            {
              title: 'Code',
              dataIndex: 'code',
              width: 160,
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
            {
              /*
                The count is what decides whether this row can be removed, so it
                is on the row rather than discovered by pressing delete and
                reading the refusal.
              */
              title: 'Events',
              dataIndex: 'event_count',
              width: 110,
              render: (value?: string) => {
                const count = Number(value ?? 0);

                return (
                  <Tooltip
                    title={count === 0 ? 'No events use this type' : `${count} event(s) use this`}
                  >
                    <span className="tabular cursor-default">{count}</span>
                  </Tooltip>
                );
              },
            },
            {
              title: 'Order',
              dataIndex: 'display_order',
              width: 90,
              render: (v: number) => <span className="tabular">{v}</span>,
            },
            {
              title: 'Status',
              dataIndex: 'is_active',
              render: (active: boolean) => (
                <StatusChip domain="generic" status={active ? 'ACTIVE' : 'INACTIVE'} />
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
                    render: (_: unknown, row: EventType) => (
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
                                onClick: () => deletion.ask(row),
                              }
                            : {
                                key: 'activate',
                                icon: <CheckCircle2 size={16} strokeWidth={1.5} />,
                                label: 'Activate',
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

      {/*
        Deactivate, not delete — the same toggle every masters screen uses.
        Events already tagged with this type keep it regardless: the type is part
        of what that event WAS, so removing the row could only orphan or silently
        retype history. Deactivating says the one thing that is actually meant —
        stop offering it on the form — and says it without an in-use 409.
      */}
      <ConfirmDialog
        open={deletion.target !== null}
        title={`${deletion.target?.is_active ? 'Deactivate' : 'Activate'} ${deletion.target?.name ?? 'this event type'}?`}
        description={
          deletion.target?.is_active
            ? 'It stops appearing on the event form. Events already using it keep it.'
            : 'It becomes selectable on the event form again.'
        }
        confirmLabel={deletion.target?.is_active ? 'Deactivate' : 'Activate'}
        loading={deletion.busy}
        onCancel={deletion.cancel}
        onConfirm={() =>
          deletion.confirm(async (row) => {
            try {
              await MastersService.updateEventType(row.id, { is_active: !row.is_active });
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
        title={editing ? `Edit ${editing.name}` : 'Add Event Type'}
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
              <Input placeholder="Buyer-Seller Meet" />
            </Form.Item>
            <Form.Item
              name="code"
              label={
                <FieldLabel
                  label="Code"
                  help={
                    editing
                      ? 'Fixed when the type was created. Events point at it.'
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
                      {
                        pattern: /^[A-Z][A-Z0-9_]*$/,
                        message: 'Use BUYER_SELLER, not Buyer-Seller',
                      },
                    ]
              }
            >
              <Input placeholder="BUYER_SELLER" disabled={Boolean(editing)} />
            </Form.Item>
          </div>
          <div className="flex gap-4">
            <Form.Item name="display_order" label="Display Order" className="min-w-0 flex-1">
              <NumberInput min={0} max={9999} />
            </Form.Item>
            <Form.Item
              name="is_active"
              label="Offered on the event form"
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

export default EventTypes;
