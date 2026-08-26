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
import MastersService, { type CompanyType } from '@/services/mastersService';
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

interface CompanyTypeFilters {
  status: string[];
}

const EMPTY: CompanyTypeFilters = { status: [] };

const STATUS_OPTIONS = [
  { value: 'active', label: 'Offered' },
  { value: 'inactive', label: 'Not offered' },
];

export const CompanyTypes = () => {
  const { can } = usePermissions();
  const canManage = can('category.manage');

  const [rows, setRows] = useState<CompanyType[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<CompanyTypeFilters>(EMPTY);
  const [editing, setEditing] = useState<CompanyType | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const deletion = useConfirm<CompanyType>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await MastersService.listCompanyTypes({
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

  const applyFilters = useCallback((next: CompanyTypeFilters) => {
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
        await MastersService.updateCompanyType(editing.id, omit(values, ['code']));
      } else {
        await MastersService.createCompanyType(values);
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
        title="Company Types"
        actions={
          <>
            <SearchInput
              value={search}
              onChange={onSearch}
              label="Search company types"
              placeholder="Search code or name…"
              className="w-[240px]"
            />
            <FilterDropdown<CompanyTypeFilters>
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
                Add Company Type
              </Button>
            ) : null}
          </>
        }
      />

      <Card flush className="min-h-0 flex-1">
        <DataTable<CompanyType>
          unit="company types"
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
          emptyTitle="No company types yet"
          emptyDescription="Add the legal forms the registration form offers — LLP, private limited, partnership."
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
              title: 'Members',
              dataIndex: 'member_count',
              width: 110,
              render: (value?: string) => {
                const count = Number(value ?? 0);

                return (
                  <Tooltip title={count === 0 ? 'No members use this type' : `${count} members`}>
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
                    render: (_: unknown, row: CompanyType) => (
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
        Hard delete replaced with the same active/inactive toggle every masters
        screen uses (client decision): members already registered under this
        type keep it regardless, so deleting only ever meant "stop offering
        it", which deactivating already says without the in-use 409.
      */}
      <ConfirmDialog
        open={deletion.target !== null}
        title={`${deletion.target?.is_active ? 'Deactivate' : 'Activate'} ${deletion.target?.name ?? 'this company type'}?`}
        description={
          deletion.target?.is_active
            ? 'It stops appearing on the registration form. Members already using it keep it.'
            : 'It becomes selectable on the registration form again.'
        }
        confirmLabel={deletion.target?.is_active ? 'Deactivate' : 'Activate'}
        loading={deletion.busy}
        onCancel={deletion.cancel}
        onConfirm={() =>
          deletion.confirm(async (row) => {
            try {
              await MastersService.updateCompanyType(row.id, { is_active: !row.is_active });
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
        title={editing ? `Edit ${editing.name}` : 'Add Company Type'}
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
              <Input placeholder="Limited Liability Partnership" />
            </Form.Item>
            <Form.Item
              name="code"
              label={
                <FieldLabel
                  label="Code"
                  help={
                    editing
                      ? 'Fixed when the type was created. Other records point at it.'
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
                      { pattern: /^[A-Z][A-Z0-9_]*$/, message: 'Use LLP, not Llp' },
                    ]
              }
            >
              <Input placeholder="LLP" disabled={Boolean(editing)} />
            </Form.Item>
          </div>
          <div className="flex gap-4">
            <Form.Item name="display_order" label="Display Order" className="min-w-0 flex-1">
              <NumberInput min={0} max={9999} />
            </Form.Item>
            <Form.Item
              name="is_active"
              label="Offered on registration"
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

export default CompanyTypes;
