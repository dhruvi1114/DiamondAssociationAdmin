import { PlusOutlined } from '@ant-design/icons';
import { Ban, CheckCircle2, Pencil } from 'lucide-react';
import { Form, Input, Switch } from 'antd';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  DateCell,
  FieldLabel,
  FormDrawer,
  FormSelect,
  Highlight,
  MultiSelect,
  NumberInput,
  PageHeader,
  RowActions,
  SearchInput,
  StatusChip,
  Tabs,
  toast,
} from '@/components/ui';
import { useConfirm } from '@/hooks/useConfirm';
import { usePermissions } from '@/hooks/usePermissions';
import MastersService, { type City, type Country, type State } from '@/services/mastersService';
import type { PaginationMeta } from '@/services/BaseService';

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
 * Each tab hands its search box and its "create" trigger up to the tab row
 * instead of drawing a toolbar row of its own — same mechanism as
 * `Categories.tsx`. A descriptor goes up for create (a node re-rendered every
 * time would set parent state on every render); a node goes up for search,
 * since the page renders it verbatim.
 */
export interface CreateAction {
  label: string;
  onClick: () => void;
}

interface TabBodyProps {
  onRegisterCreate?: (action: CreateAction | null) => void;
  onRegisterSearch?: (node: ReactNode) => void;
}

const CountriesTab = ({ onRegisterCreate, onRegisterSearch }: TabBodyProps) => {
  const { can } = usePermissions();
  const canManage = can('category.manage');
  const [rows, setRows] = useState<Country[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Country | null>(null);
  const [form] = Form.useForm();
  const deletion = useConfirm<Country>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await MastersService.listCountries({
        page,
        limit: 20,
        ...(search ? { search } : {}),
      });
      setRows(res.data);
      setPagination(res.pagination);
    } catch (caught) {
      setError(asError(caught));
    } finally {
      setLoading(false);
    }
  }, [page, search]);
  useEffect(() => {
    void load();
  }, [load]);

  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);

  useEffect(() => {
    onRegisterSearch?.(
      <SearchInput
        value={search}
        onChange={onSearch}
        label="Search countries"
        placeholder="Search country name or ISO code…"
        className="w-[260px]"
      />,
    );
    return () => onRegisterSearch?.(null);
  }, [search, onSearch, onRegisterSearch]);

  const openCreate = useCallback(() => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ display_order: 0, is_active: true });
    setOpen(true);
  }, [form]);

  const createAction = useMemo<CreateAction | null>(
    () => (canManage ? { label: 'Add Country', onClick: openCreate } : null),
    [canManage, openCreate],
  );
  useEffect(() => {
    onRegisterCreate?.(createAction);
    return () => onRegisterCreate?.(null);
  }, [createAction, onRegisterCreate]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <Card flush className="min-h-0 flex-1">
        <DataTable<Country>
          unit="countries"
          serial
          rowKey="id"
          loading={loading}
          error={error}
          onRetry={() => void load()}
          pagination={pagination}
          onPageChange={setPage}
          dataSource={rows}
          filtered={Boolean(search)}
          onClearFilter={() => onSearch('')}
          emptyTitle="No countries yet"
          emptyDescription="Countries are the top of the registration form's location cascade. Add the first one to make states and cities selectable."
          emptyAction={canManage ? <Button onClick={openCreate}>Add Country</Button> : undefined}
          columns={[
            {
              title: 'ISO',
              dataIndex: 'iso_code',
              width: 120,
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
              title: 'States',
              dataIndex: 'state_count',
              width: 90,
              render: (v?: string) => <span className="tabular">{Number(v ?? 0)}</span>,
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
              width: 130,
              render: (v: string) => <DateCell value={v} />,
            },
            {
              title: 'Updated',
              dataIndex: 'updatedAt',
              width: 130,
              render: (v: string) => <DateCell value={v} />,
            },
            ...(canManage
              ? [
                  {
                    title: 'Actions',
                    key: 'actions',
                    width: 80,
                    fixed: 'right' as const,
                    render: (_: unknown, row: Country) => (
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
        Hard delete replaced with the active/inactive toggle every masters
        screen uses now: a country with states could never actually be
        deleted anyway (the 409 the old copy warned about), so deactivating —
        removing it from new selections while existing addresses keep it — is
        what this button always really did.
      */}
      <ConfirmDialog
        open={deletion.target !== null}
        title={`${deletion.target?.is_active ? 'Deactivate' : 'Activate'} ${deletion.target?.name ?? 'this country'}?`}
        description={
          deletion.target?.is_active
            ? 'It stops appearing on the registration form. Existing addresses keep it.'
            : 'It becomes selectable on the registration form again.'
        }
        confirmLabel={deletion.target?.is_active ? 'Deactivate' : 'Activate'}
        loading={deletion.busy}
        onCancel={deletion.cancel}
        onConfirm={() =>
          deletion.confirm(async (row) => {
            try {
              await MastersService.updateCountry(row.id, { is_active: !row.is_active });
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
        title={editing ? `Edit ${editing.name}` : 'Add Country'}
        confirmLabel={editing ? 'Save' : 'Create'}
        loading={saving}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          const values = await form.validateFields();
          setSaving(true);
          try {
            if (editing) await MastersService.updateCountry(editing.id, values);
            else await MastersService.createCountry(values);
            setOpen(false);
            await load();
            toast.success(editing ? `${editing.name} updated` : `${String(values.name)} created`);
          } catch (e) {
            toast.error('Could not save', { description: asError(e).message });
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="India" />
            </Form.Item>
            <Form.Item
              name="iso_code"
              label={
                <FieldLabel
                  label="ISO Code"
                  help={editing ? 'Fixed once created.' : 'Two uppercase letters, e.g. IN'}
                />
              }
              rules={
                editing
                  ? []
                  : [
                      { required: true, message: 'Required' },
                      { pattern: /^[A-Z]{2}$/, message: 'Use two letters, e.g. IN' },
                    ]
              }
            >
              <Input placeholder="IN" disabled={Boolean(editing)} />
            </Form.Item>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="display_order" label="Display Order">
              <NumberInput min={0} max={9999} />
            </Form.Item>
            <Form.Item name="is_active" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
        </Form>
      </FormDrawer>
    </div>
  );
};

const StatesTab = ({ onRegisterCreate, onRegisterSearch }: TabBodyProps) => {
  const { can } = usePermissions();
  const canManage = can('category.manage');
  const [rows, setRows] = useState<State[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<State | null>(null);
  const [form] = Form.useForm();
  const deletion = useConfirm<State>();
  const countryOptions = useMemo(
    () => countries.map((c) => ({ value: c.id, label: c.name })),
    [countries],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, c] = await Promise.all([
        MastersService.listStates({
          page,
          limit: 20,
          ...(search ? { search } : {}),
          ...(countryIds.length > 0 ? { country_id: countryIds.join(',') } : {}),
        }),
        MastersService.listCountries({ limit: 200, activeOnly: true }),
      ]);
      setRows(res.data);
      setPagination(res.pagination);
      setCountries(c.data);
    } catch (e) {
      setError(asError(e));
    } finally {
      setLoading(false);
    }
  }, [page, search, countryIds]);
  useEffect(() => {
    void load();
  }, [load]);

  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);
  const onFilterChange = useCallback((next: string[]) => {
    setCountryIds(next);
    setPage(1);
  }, []);

  useEffect(() => {
    onRegisterSearch?.(
      <>
        <SearchInput
          value={search}
          onChange={onSearch}
          label="Search states"
          placeholder="Search state or code…"
          className="w-[240px]"
        />
        <MultiSelect
          value={countryIds}
          onChange={(v) => onFilterChange(v.map(String))}
          options={countryOptions}
          placeholder="Filter countries"
          className="w-[220px]"
        />
      </>,
    );
    return () => onRegisterSearch?.(null);
  }, [search, onSearch, onRegisterSearch, countryIds, onFilterChange, countryOptions]);

  const openCreate = useCallback(() => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ is_active: true });
    setOpen(true);
  }, [form]);

  const createAction = useMemo<CreateAction | null>(
    () => (canManage ? { label: 'Add State', onClick: openCreate } : null),
    [canManage, openCreate],
  );
  useEffect(() => {
    onRegisterCreate?.(createAction);
    return () => onRegisterCreate?.(null);
  }, [createAction, onRegisterCreate]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <Card flush className="min-h-0 flex-1">
        <DataTable<State>
          unit="states"
          serial
          rowKey="id"
          loading={loading}
          error={error}
          onRetry={() => void load()}
          pagination={pagination}
          onPageChange={setPage}
          dataSource={rows}
          filtered={Boolean(search) || countryIds.length > 0}
          onClearFilter={() => {
            onSearch('');
            onFilterChange([]);
          }}
          emptyTitle="No states yet"
          emptyDescription="States sit under a country in the registration form's location cascade. Add the first one to make cities selectable."
          emptyAction={canManage ? <Button onClick={openCreate}>Add State</Button> : undefined}
          columns={[
            {
              title: 'State',
              dataIndex: 'name',
              width: 220,
              render: (v: string) => <Highlight text={v} query={search} />,
            },
            {
              title: 'Code',
              dataIndex: 'code',
              width: 120,
              render: (v: string) => (
                <span className="font-mono text-supporting">
                  <Highlight text={v} query={search} />
                </span>
              ),
            },
            {
              title: 'Country',
              dataIndex: 'country_name',
              width: 180,
              render: (v: string) => <Highlight text={v} query={search} />,
            },
            {
              title: 'Cities',
              dataIndex: 'city_count',
              width: 90,
              render: (v?: string) => <span className="tabular">{Number(v ?? 0)}</span>,
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
              width: 130,
              render: (v: string) => <DateCell value={v} />,
            },
            {
              title: 'Updated',
              dataIndex: 'updatedAt',
              width: 130,
              render: (v: string) => <DateCell value={v} />,
            },
            ...(canManage
              ? [
                  {
                    title: 'Actions',
                    key: 'actions',
                    width: 80,
                    fixed: 'right' as const,
                    render: (_: unknown, row: State) => (
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
      {/* Hard delete replaced with the active/inactive toggle — see CountriesTab. */}
      <ConfirmDialog
        open={deletion.target !== null}
        title={`${deletion.target?.is_active ? 'Deactivate' : 'Activate'} ${deletion.target?.name ?? 'this state'}?`}
        description={
          deletion.target?.is_active
            ? 'It stops appearing on the registration form. Existing addresses keep it.'
            : 'It becomes selectable on the registration form again.'
        }
        confirmLabel={deletion.target?.is_active ? 'Deactivate' : 'Activate'}
        loading={deletion.busy}
        onCancel={deletion.cancel}
        onConfirm={() =>
          deletion.confirm(async (row) => {
            try {
              await MastersService.updateState(row.id, { is_active: !row.is_active });
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
        title={editing ? `Edit ${editing.name}` : 'Add State'}
        confirmLabel={editing ? 'Save' : 'Create'}
        loading={saving}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          const values = await form.validateFields();
          setSaving(true);
          try {
            if (editing)
              await MastersService.updateState(editing.id, {
                name: values.name,
                is_active: values.is_active,
              });
            else await MastersService.createState(values);
            setOpen(false);
            await load();
            toast.success(editing ? `${editing.name} updated` : `${String(values.name)} created`);
          } catch (e) {
            toast.error('Could not save', { description: asError(e).message });
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          {!editing ? (
            <Form.Item
              name="country_id"
              label="Country"
              rules={[{ required: true, message: 'Required' }]}
            >
              <FormSelect options={countryOptions} placeholder="Choose country" />
            </Form.Item>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="Gujarat" />
            </Form.Item>
            {!editing ? (
              <Form.Item
                name="code"
                label="Code"
                rules={[
                  { required: true, message: 'Required' },
                  { pattern: /^[A-Z0-9]+$/, message: 'Use capitals and digits only' },
                ]}
              >
                <Input placeholder="GJ" />
              </Form.Item>
            ) : null}
          </div>
          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </FormDrawer>
    </div>
  );
};

const CitiesTab = ({ onRegisterCreate, onRegisterSearch }: TabBodyProps) => {
  const { can } = usePermissions();
  const canManage = can('category.manage');
  const [rows, setRows] = useState<City[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [stateIds, setStateIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<City | null>(null);
  const [form] = Form.useForm();
  const deletion = useConfirm<City>();
  const stateOptions = useMemo(
    () =>
      states.map((s) => ({
        value: s.id,
        label: `${s.name}${s.country_name ? ` (${s.country_name})` : ''}`,
      })),
    [states],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, s] = await Promise.all([
        MastersService.listCities({
          page,
          limit: 20,
          ...(search ? { search } : {}),
          ...(stateIds.length > 0 ? { state_id: stateIds.join(',') } : {}),
        }),
        MastersService.listStates({ limit: 500, activeOnly: true }),
      ]);
      setRows(res.data);
      setPagination(res.pagination);
      setStates(s.data);
    } catch (e) {
      setError(asError(e));
    } finally {
      setLoading(false);
    }
  }, [page, search, stateIds]);
  useEffect(() => {
    void load();
  }, [load]);

  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);
  const onFilterChange = useCallback((next: string[]) => {
    setStateIds(next);
    setPage(1);
  }, []);

  useEffect(() => {
    onRegisterSearch?.(
      <>
        <SearchInput
          value={search}
          onChange={onSearch}
          label="Search cities"
          placeholder="Search city…"
          className="w-[240px]"
        />
        <MultiSelect
          value={stateIds}
          onChange={(v) => onFilterChange(v.map(String))}
          options={stateOptions}
          placeholder="Filter states"
          className="w-[240px]"
        />
      </>,
    );
    return () => onRegisterSearch?.(null);
  }, [search, onSearch, onRegisterSearch, stateIds, onFilterChange, stateOptions]);

  const openCreate = useCallback(() => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ is_active: true });
    setOpen(true);
  }, [form]);

  const createAction = useMemo<CreateAction | null>(
    () => (canManage ? { label: 'Add City', onClick: openCreate } : null),
    [canManage, openCreate],
  );
  useEffect(() => {
    onRegisterCreate?.(createAction);
    return () => onRegisterCreate?.(null);
  }, [createAction, onRegisterCreate]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <Card flush className="min-h-0 flex-1">
        <DataTable<City>
          unit="cities"
          serial
          rowKey="id"
          loading={loading}
          error={error}
          onRetry={() => void load()}
          pagination={pagination}
          onPageChange={setPage}
          dataSource={rows}
          filtered={Boolean(search) || stateIds.length > 0}
          onClearFilter={() => {
            onSearch('');
            onFilterChange([]);
          }}
          emptyTitle="No cities yet"
          emptyDescription="Cities sit under a state in the registration form's location cascade. Add the first one to make it selectable."
          emptyAction={canManage ? <Button onClick={openCreate}>Add City</Button> : undefined}
          columns={[
            {
              title: 'City',
              dataIndex: 'name',
              width: 220,
              render: (v: string) => <Highlight text={v} query={search} />,
            },
            {
              title: 'State',
              dataIndex: 'state_name',
              width: 180,
              render: (v: string) => <Highlight text={v} query={search} />,
            },
            {
              title: 'Country',
              dataIndex: 'country_name',
              width: 160,
              render: (v: string) => <Highlight text={v} query={search} />,
            },
            {
              title: 'Addresses',
              dataIndex: 'address_count',
              width: 100,
              render: (v?: string) => <span className="tabular">{Number(v ?? 0)}</span>,
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
              width: 130,
              render: (v: string) => <DateCell value={v} />,
            },
            {
              title: 'Updated',
              dataIndex: 'updatedAt',
              width: 130,
              render: (v: string) => <DateCell value={v} />,
            },
            ...(canManage
              ? [
                  {
                    title: 'Actions',
                    key: 'actions',
                    width: 80,
                    fixed: 'right' as const,
                    render: (_: unknown, row: City) => (
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
      {/* Hard delete replaced with the active/inactive toggle — see CountriesTab. */}
      <ConfirmDialog
        open={deletion.target !== null}
        title={`${deletion.target?.is_active ? 'Deactivate' : 'Activate'} ${deletion.target?.name ?? 'this city'}?`}
        description={
          deletion.target?.is_active
            ? 'It stops appearing on the registration form. Existing addresses keep it.'
            : 'It becomes selectable on the registration form again.'
        }
        confirmLabel={deletion.target?.is_active ? 'Deactivate' : 'Activate'}
        loading={deletion.busy}
        onCancel={deletion.cancel}
        onConfirm={() =>
          deletion.confirm(async (row) => {
            try {
              await MastersService.updateCity(row.id, { is_active: !row.is_active });
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
        title={editing ? `Edit ${editing.name}` : 'Add City'}
        confirmLabel={editing ? 'Save' : 'Create'}
        loading={saving}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          const values = await form.validateFields();
          setSaving(true);
          try {
            if (editing)
              await MastersService.updateCity(editing.id, {
                name: values.name,
                is_active: values.is_active,
              });
            else await MastersService.createCity(values);
            setOpen(false);
            await load();
            toast.success(editing ? `${editing.name} updated` : `${String(values.name)} created`);
          } catch (e) {
            toast.error('Could not save', { description: asError(e).message });
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          {!editing ? (
            <Form.Item
              name="state_id"
              label="State"
              rules={[{ required: true, message: 'Required' }]}
            >
              <FormSelect options={stateOptions} placeholder="Choose state" />
            </Form.Item>
          ) : null}
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="Surat" />
          </Form.Item>
          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </FormDrawer>
    </div>
  );
};

export default function Locations() {
  /*
    Search/filter and the tab's create button are registered up from whichever
    tab is mounted, so they can share the tab row instead of a toolbar row of
    their own — same mechanism as Categories.tsx and ApplicationQueue.tsx
    (association-admin-ui skill: "tabs and controls share ONE line"). `Tabs`
    variant="pill" mounts only the active pane, so switching tabs naturally
    unregisters the old tab's controls and registers the new one's.
  */
  const [create, setCreate] = useState<CreateAction | null>(null);
  const [searchBox, setSearchBox] = useState<ReactNode>(null);

  const registerCreate = useCallback((action: CreateAction | null) => setCreate(action), []);
  const registerSearch = useCallback((node: ReactNode) => setSearchBox(node), []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Locations" />
      <Tabs
        variant="pill"
        actions={
          <>
            {searchBox}
            {create ? (
              <Button variant="primary" icon={<PlusOutlined />} onClick={create.onClick}>
                {create.label}
              </Button>
            ) : null}
          </>
        }
        items={[
          {
            key: 'countries',
            label: 'Countries',
            children: (
              <CountriesTab onRegisterCreate={registerCreate} onRegisterSearch={registerSearch} />
            ),
          },
          {
            key: 'states',
            label: 'States',
            children: (
              <StatesTab onRegisterCreate={registerCreate} onRegisterSearch={registerSearch} />
            ),
          },
          {
            key: 'cities',
            label: 'Cities',
            children: (
              <CitiesTab onRegisterCreate={registerCreate} onRegisterSearch={registerSearch} />
            ),
          },
        ]}
      />
    </div>
  );
}
