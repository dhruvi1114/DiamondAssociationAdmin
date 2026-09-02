import { PlusOutlined } from '@ant-design/icons';
import { Ban, Check, CheckCircle2, Minus, Pencil } from 'lucide-react';
import { Form, Input, Tooltip } from 'antd';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Badge,
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
  NotAvailable,
  PageHeader,
  RowActions,
  SearchInput,
  StackedCell,
  StatusChip,
  TagList,
  Tabs,
  toast,
} from '@/components/ui';
import { useConfirm } from '@/hooks/useConfirm';
import { usePermissions } from '@/hooks/usePermissions';
import RbacService, {
  type AdminUser,
  type AdminUserStatus,
  type Permission,
  type Role,
} from '@/services/rbacService';
import type { PaginationMeta } from '@/services/BaseService';

/**
 * A-31 / A-32 — who may do what, and who holds it.
 *
 * Two screens, one page. Roles define the permission sets; staff accounts are
 * the people those sets are assigned to. They were separate nav items, which
 * made assigning a role a navigation problem: you edit a role, then leave to
 * find the person, then come back to check what you gave them. Tabs put both
 * halves of that job on one screen, and make the relationship between them
 * visible — a role is only ever interesting because somebody holds it.
 *
 * Roles lead. A staff account cannot be given a role that does not exist yet, so
 * the order is the order of the work.
 *
 * **The Roles tab is read-only, deliberately.** The API exposes `GET /admin/roles`
 * and nothing else: grants are seed data (`rbac.md`), so changing them today is a
 * re-seed rather than a screen. Showing the matrix is still worth doing — it is
 * the only place the granted set can be read without opening the seed file — and
 * the tab says plainly that it cannot be edited here rather than offering
 * checkboxes that would silently fail to save.
 */

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
 * A tab body hands its create action up so the button can share the tab row
 * instead of taking a row of its own. A descriptor rather than a rendered node:
 * a node rebuilt every render would set parent state every render.
 */
interface CreateAction {
  label: string;
  onClick: () => void;
}

interface TabBodyProps {
  onRegisterCreate?: (action: CreateAction | null) => void;
  onRegisterSearch?: (node: ReactNode) => void;
  /**
   * Arbitrary controls for the tab row — the Roles tab's Save/Discard pair,
   * which appear only once something is actually changed.
   *
   * Separate from `onRegisterCreate` because that one is a descriptor for a
   * single "add" button, and these are two buttons whose enabled state changes
   * as the draft does.
   */
  onRegisterActions?: (node: ReactNode) => void;
}

// ---------------------------------------------------------------------------
// Roles — the permission matrix
// ---------------------------------------------------------------------------

/** One row of the matrix: a permission, and which roles hold it. */
interface MatrixRow {
  code: string;
  /** Everything before the dot — `application` from `application.approve`. */
  module: string;
  /** Everything after it, as the action reads on its own. */
  action: string;
  held: Record<string, boolean>;
}

/**
 * A tick or a gap, as a matrix reads it.
 *
 * Not `NotAvailable` for the denied case: "N/A" answers "was this recorded?",
 * and the question here is "is this granted?" — to which the answer is a plain
 * no, not a missing value. A dash carries that without competing with the ticks
 * for attention, which is what a grid of 100+ cells needs to stay scannable.
 */
const Grant = ({
  granted,
  role,
  permission,
  onToggle,
  lockedReason,
}: {
  granted: boolean;
  role: string;
  permission: string;
  /** Absent when this cell cannot be changed by this admin. */
  onToggle?: () => void;
  /** Why it cannot, for the tooltip. A dead control must say why it is dead. */
  lockedReason?: string;
}) => {
  const label = `${role} ${granted ? 'holds' : 'does not hold'} ${permission}`;
  const mark = granted ? (
    <Check size={16} strokeWidth={2} className="text-fg" />
  ) : (
    <Minus size={16} strokeWidth={1.5} className="text-fg-subtle opacity-60" />
  );

  if (!onToggle) {
    return (
      <Tooltip title={lockedReason ? `${label}. ${lockedReason}` : label}>
        <span className="flex justify-center" aria-label={granted ? 'Granted' : 'Not granted'}>
          {mark}
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={`${label}. Click to ${granted ? 'revoke' : 'grant'}.`}>
      {/* A real button: the grid is operated by keyboard as much as by mouse,
          and a clickable span is invisible to both a tab key and a screen reader. */}
      <button
        type="button"
        aria-pressed={granted}
        aria-label={label}
        onClick={onToggle}
        className="flex w-full cursor-pointer justify-center rounded-md border-0 bg-transparent py-1 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
      >
        {mark}
      </button>
    </Tooltip>
  );
};

const RolesTab = ({ onRegisterSearch, onRegisterActions }: TabBodyProps) => {
  const { can, isSuperAdmin, roles: myRoles } = usePermissions();
  const canManage = can('rbac.manage');

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  /**
   * The ticks as the admin has them, before saving.
   *
   * A draft rather than a write per click: a permission matrix is edited in
   * sweeps — grant a role four things, take two away — and saving each tick
   * would be four requests, four audit rows, and four chances to leave the role
   * in a state nobody chose.
   */
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [roleRes, permissionRes] = await Promise.all([
        RbacService.listRoles(),
        RbacService.listPermissions(),
      ]);

      setRoles(roleRes.data);
      setPermissions(permissionRes.data);
      setDraft(
        Object.fromEntries(roleRes.data.map((role) => [role.code, new Set(role.permissions)])),
      );
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Whether this admin may edit a given role.
   *
   * SUPER_ADMIN is never editable — the role carries a blanket bypass, so its
   * grant list decides nothing, and emptying it would read on this grid as
   * though it did. Nobody may edit a role they hold themselves unless they are a
   * super admin: this saves the whole set, so one careless save on your own role
   * removes your access to the screen that would put it back.
   *
   * The server enforces both independently; this only decides what to draw.
   */
  const editable = useCallback(
    (role: Role): boolean => {
      if (!canManage) return false;
      if (role.code === 'SUPER_ADMIN') return false;

      return isSuperAdmin || !myRoles.includes(role.code);
    },
    [canManage, isSuperAdmin, myRoles],
  );

  const dirty = useMemo(
    () =>
      roles.filter((role) => {
        const current = draft[role.code];

        if (!current) return false;

        return (
          current.size !== role.permissions.length ||
          role.permissions.some((code) => !current.has(code))
        );
      }),
    [roles, draft],
  );

  const toggle = (roleCode: string, permissionCode: string) => {
    setDraft((current) => {
      const next = new Set(current[roleCode] ?? []);

      if (next.has(permissionCode)) next.delete(permissionCode);
      else next.add(permissionCode);

      return { ...current, [roleCode]: next };
    });
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      /*
        One request per changed role, in sequence. Each is its own audit row —
        "who widened ACCOUNTS" is the question this trail exists to answer — and
        a failure part-way leaves a trail saying exactly which roles landed.
      */
      for (const role of dirty) {
        await RbacService.setRolePermissions(role.code, [...(draft[role.code] ?? [])]);
      }

      toast.success(
        dirty.length === 1 ? `${dirty[0].name} updated` : `${dirty.length} roles updated`,
      );
      await load();
    } catch (err) {
      toast.error('Could not save', { description: asError(err).message });
      // Reload rather than keep the draft: after a partial failure the screen
      // must show what the server actually holds, not what was attempted.
      await load();
    } finally {
      setSaving(false);
    }
  }, [dirty, draft, load]);

  /*
    Client-side, unlike every list on this app — and correct here.

    The server-side rule exists because a filter that only sees the fetched page
    cannot match rows on pages nobody has fetched. This endpoint is not paged: it
    returns every permission in one response, so the fetched set IS the whole
    set.
  */
  const rows = useMemo<MatrixRow[]>(() => {
    const q = search.trim().toLowerCase();

    return permissions
      .filter((permission) => !q || permission.code.toLowerCase().includes(q))
      .map((permission) => {
        const [module, ...rest] = permission.code.split('.');

        return {
          code: permission.code,
          module,
          action: rest.join('.'),
          held: Object.fromEntries(
            roles.map((role) => [role.code, Boolean(draft[role.code]?.has(permission.code))]),
          ),
        };
      });
  }, [permissions, roles, draft, search]);

  useEffect(() => {
    onRegisterSearch?.(
      <SearchInput
        value={search}
        onChange={setSearch}
        label="Search permissions"
        placeholder="Search permission…"
        className="min-w-0 w-full max-w-[240px] sm:w-[240px]"
      />,
    );

    return () => onRegisterSearch?.(null);
  }, [search, onRegisterSearch]);

  useEffect(() => {
    onRegisterActions?.(
      dirty.length > 0 ? (
        <>
          <Button variant="secondary" onClick={() => void load()} disabled={saving}>
            Discard
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save {dirty.length === 1 ? '1 role' : `${dirty.length} roles`}
          </Button>
        </>
      ) : null,
    );

    return () => onRegisterActions?.(null);
  }, [dirty, saving, save, load, onRegisterActions]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4">
      {!canManage ? (
        <Alert
          variant="info"
          message="Read-only. Changing what a role may do needs the RBAC permission, which only a super admin holds."
        />
      ) : null}

      <Card flush className="min-h-0 min-w-0 flex-1">
        <DataTable<MatrixRow>
          unit="permissions"
          rowKey="code"
          loading={loading}
          error={error}
          onRetry={() => void load()}
          dataSource={rows}
          filtered={Boolean(search)}
          onClearFilter={() => setSearch('')}
          emptyTitle="No permissions found"
          emptyDescription="Permissions are seed data. An empty grid means the RBAC seed has not run."
          columns={[
            {
              title: 'Permission',
              dataIndex: 'code',
              width: 280,
              render: (_: string, row: MatrixRow) => (
                <StackedCell
                  primary={<Highlight text={row.action} query={search} />}
                  secondary={<Highlight text={row.module} query={search} />}
                  mono
                />
              ),
            },
            /*
              One column per role, built from the response rather than hardcoded:
              the matrix has to stay correct when a role is added to the seed, and
              a fixed four-column layout would silently omit the fifth.
            */
            ...roles.map((role) => ({
              title: role.name,
              key: role.code,
              align: 'center' as const,
              render: (_: unknown, row: MatrixRow) => (
                <Grant
                  granted={Boolean(row.held[role.code])}
                  role={role.name}
                  permission={row.code}
                  {...(editable(role)
                    ? { onToggle: () => toggle(role.code, row.code) }
                    : {
                        lockedReason:
                          role.code === 'SUPER_ADMIN'
                            ? 'Super admin bypasses every permission check, so this list decides nothing.'
                            : !canManage
                              ? 'You cannot change role permissions.'
                              : 'You hold this role. Ask a super admin to change it.',
                      })}
                />
              ),
            })),
          ]}
        />
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Staff — the people who sign in
// ---------------------------------------------------------------------------

interface StaffFilters {
  status: string[];
}

const EMPTY_STAFF_FILTERS: StaffFilters = { status: [] };

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'BLOCKED', label: 'Blocked' },
];

const StaffTab = ({ onRegisterCreate, onRegisterSearch }: TabBodyProps) => {
  const { can } = usePermissions();
  const canManage = can('rbac.manage');

  const [rows, setRows] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<StaffFilters>(EMPTY_STAFF_FILTERS);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const toggle = useConfirm<AdminUser>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await RbacService.listAdminUsers({
        page,
        limit: 20,
        ...(search ? { search } : {}),
        // Joined here, not by the HTTP layer: the query builder stringifies
        // whatever it is handed, so an array would become "ACTIVE,INACTIVE" by
        // accident rather than by decision.
        ...(filters.status.length > 0
          ? { status: filters.status.join(',') as unknown as AdminUserStatus }
          : {}),
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

  /* The role list feeds the drawer's picker. Fetched once — it changes with a
     re-seed, not with anything this screen does. */
  useEffect(() => {
    RbacService.listRoles()
      .then((res) => setRoles(res.data))
      // A role list that will not load must not become an empty picker that
      // silently offers nothing; the drawer says so instead.
      .catch(() => setRoles([]));
  }, []);

  /* A new query starts at page one: staying on page four while the filter cuts
     the list to six rows shows an empty table, which reads as "no matches". */
  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);

  const applyFilters = useCallback((next: StaffFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_STAFF_FILTERS);
    setPage(1);
  }, []);

  const activeFilterCount = filters.status.length > 0 ? 1 : 0;

  useEffect(() => {
    onRegisterSearch?.(
      <>
        <SearchInput
          value={search}
          onChange={onSearch}
          label="Search staff"
          placeholder="Search name or email…"
          className="min-w-0 w-full max-w-[240px] sm:w-[240px]"
        />

        <FilterDropdown<StaffFilters>
          value={filters}
          emptyValue={EMPTY_STAFF_FILTERS}
          onApply={applyFilters}
          onClear={clearFilters}
          activeCount={activeFilterCount}
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
      </>,
    );

    return () => onRegisterSearch?.(null);
  }, [search, onSearch, onRegisterSearch, filters, applyFilters, clearFilters, activeFilterCount]);

  const openCreate = useCallback(() => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ role_codes: [] });
    setOpen(true);
  }, [form]);

  const createAction = useMemo<CreateAction | null>(
    () => (canManage ? { label: 'Add staff', onClick: openCreate } : null),
    [canManage, openCreate],
  );

  useEffect(() => {
    onRegisterCreate?.(createAction);
    return () => onRegisterCreate?.(null);
  }, [createAction, onRegisterCreate]);

  const openEdit = (row: AdminUser) => {
    setEditing(row);
    form.setFieldsValue({
      full_name: row.full_name,
      email: row.email,
      phone: row.phone ?? '',
      role_codes: row.roles.map((role) => role.code),
    });
    setOpen(true);
  };

  /**
   * Roles are granted and withdrawn one at a time — there is no "set roles to
   * this list" endpoint — so the drawer diffs the choice against what the
   * account already held and sends only the difference.
   *
   * Sequential, not `Promise.all`: each grant writes its own audit row, and a
   * failure part-way through must leave a trail that says which ones landed.
   */
  const syncRoles = async (id: string, before: string[], after: string[]) => {
    for (const code of after.filter((c) => !before.includes(c))) {
      await RbacService.assignRole(id, code);
    }

    for (const code of before.filter((c) => !after.includes(c))) {
      await RbacService.revokeRole(id, code);
    }
  };

  const submit = async () => {
    const values = (await form.validateFields()) as {
      full_name: string;
      email: string;
      phone?: string;
      password?: string;
      role_codes?: string[];
    };
    const chosen = values.role_codes ?? [];

    setSaving(true);
    try {
      if (editing) {
        await RbacService.updateAdminUser(editing.id, {
          full_name: values.full_name,
          // An emptied field is a deliberate "remove the number", which the API
          // takes as null. Sending '' would fail the phone pattern instead.
          phone: values.phone?.trim() ? values.phone.trim() : null,
        });
        await syncRoles(
          editing.id,
          editing.roles.map((role) => role.code),
          chosen,
        );
      } else {
        await RbacService.createAdminUser({
          email: values.email,
          full_name: values.full_name,
          ...(values.phone?.trim() ? { phone: values.phone.trim() } : {}),
          password: values.password as string,
          ...(chosen.length > 0 ? { role_codes: chosen } : {}),
        });
      }

      setOpen(false);
      await load();
      toast.success(editing ? `${editing.full_name} updated` : `${values.full_name} added`);
    } catch (err) {
      toast.error('Could not save', { description: asError(err).message });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Activate / deactivate. Both server guards surface here as a plain message:
   * the last super admin cannot be stood down, and nobody can deactivate
   * themselves. Neither is re-checked in the browser — the server owns the
   * question, and a client copy of the rule is a client copy that drifts.
   */
  const toggleActive = async (row: AdminUser) => {
    try {
      await RbacService.updateAdminUser(row.id, {
        status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      });
      await load();
      toast.success(`${row.full_name} ${row.status === 'ACTIVE' ? 'deactivated' : 'activated'}`);
    } catch (err) {
      toast.error('Could not change status', { description: asError(err).message });
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4">
      <Card flush className="min-h-0 min-w-0 flex-1">
        <DataTable<AdminUser>
          unit="staff accounts"
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
          emptyTitle="No staff accounts yet"
          emptyDescription="These are the people who sign in to this admin. Add the first one, then give it a role on this same screen."
          emptyAction={canManage ? <Button onClick={openCreate}>Add staff</Button> : undefined}
          columns={[
            {
              /*
                Name and email are the two fields the server matches on, so they
                are the two that carry the mark.
              */
              title: 'Name',
              dataIndex: 'full_name',
              width: 240,
              render: (value: string, row: AdminUser) => (
                <div className="flex items-center gap-2">
                  <Highlight text={value} query={search} />
                  {/*
                    The flag, not the role. `is_super_admin` bypasses every
                    permission check, so it belongs beside the name rather than
                    buried among the role chips it does not behave like.
                  */}
                  {row.is_super_admin ? (
                    <Tooltip title="Bypasses every permission check. Set outside this screen.">
                      <span className="inline-flex">
                        <Badge>Super admin</Badge>
                      </span>
                    </Tooltip>
                  ) : null}
                </div>
              ),
            },
            {
              title: 'Email',
              dataIndex: 'email',
              width: 260,
              render: (value: string) => (
                <span className="text-supporting">
                  <Highlight text={value} query={search} />
                </span>
              ),
            },
            {
              title: 'Phone',
              dataIndex: 'phone',
              width: 150,
              render: (value: string | null) =>
                value ? <span className="tabular">{value}</span> : <NotAvailable />,
            },
            {
              title: 'Roles',
              dataIndex: 'roles',
              width: 220,
              render: (value: AdminUser['roles']) => (
                <TagList
                  items={value.map((role) => role.name)}
                  max={2}
                  label="Roles held"
                  empty="No role yet"
                />
              ),
            },
            {
              title: 'Last Login',
              dataIndex: 'last_login_at',
              width: 130,
              render: (value: string | null) =>
                value ? <DateCell value={value} /> : <NotAvailable label="Never" />,
            },
            {
              /* Carries no width: the last column before the frozen actions
                 absorbs the slack, so the name column never stretches. */
              title: 'Status',
              dataIndex: 'status',
              render: (value: AdminUserStatus) => <StatusChip domain="generic" status={value} />,
            },
            ...(canManage
              ? [
                  {
                    title: 'Actions',
                    key: 'actions',
                    width: 80,
                    fixed: 'right' as const,
                    render: (_: unknown, row: AdminUser) => (
                      <RowActions
                        actions={[
                          {
                            key: 'edit',
                            icon: <Pencil size={16} strokeWidth={1.5} />,
                            label: 'Edit staff account',
                            onClick: () => openEdit(row),
                          },
                          row.status === 'ACTIVE'
                            ? {
                                key: 'deactivate',
                                icon: <Ban size={16} strokeWidth={1.5} />,
                                label: 'Deactivate account',
                                danger: true,
                                onClick: () => toggle.ask(row),
                              }
                            : {
                                key: 'activate',
                                icon: <CheckCircle2 size={16} strokeWidth={1.5} />,
                                label: 'Activate account',
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
        Deactivation is how a staff account is retired — never deletion. The
        audit rows this person wrote point at their id, and an account that is
        gone turns every one of them into an unattributable change.
      */}
      <ConfirmDialog
        open={toggle.target !== null}
        title={`${toggle.target?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} ${toggle.target?.full_name ?? 'this account'}?`}
        description={
          toggle.target?.status === 'ACTIVE'
            ? 'They can no longer sign in. Their past actions stay in the audit log under their name, and the account can be reactivated at any time.'
            : 'They can sign in again with the roles they already hold.'
        }
        confirmLabel={toggle.target?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        loading={toggle.busy}
        onCancel={toggle.cancel}
        onConfirm={() => toggle.confirm(toggleActive)}
      />

      <FormDrawer
        open={open}
        title={editing ? `Edit ${editing.full_name}` : 'Add staff'}
        confirmLabel={editing ? 'Save' : 'Create'}
        loading={saving}
        onCancel={() => setOpen(false)}
        onConfirm={() => void submit()}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          {/* Name leads: it is what the admin already has in mind. The address is
              how the account signs in, and is fixed once it exists. */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <Form.Item
              name="full_name"
              label="Full Name"
              className="min-w-0 flex-1"
              rules={[
                { required: true, message: 'Required' },
                { min: 2, message: 'At least 2 characters' },
              ]}
            >
              <Input placeholder="Meena Shah" />
            </Form.Item>
            {/*
              Visible on an edit, disabled rather than removed. The address is how
              this account is referred to everywhere else, and a form that hides
              it leaves you checking you opened the right person by name alone.
            */}
            <Form.Item
              name="email"
              label={
                <FieldLabel
                  label="Email"
                  help={
                    editing
                      ? 'Fixed when the account was created. It is how this person signs in.'
                      : 'This is the sign-in address. It cannot be changed later.'
                  }
                />
              }
              className="min-w-0 flex-1"
              rules={editing ? [] : [{ required: true, type: 'email', message: 'A valid email' }]}
            >
              <Input placeholder="meena@ilgda.org" disabled={Boolean(editing)} />
            </Form.Item>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <Form.Item
              name="phone"
              label="Phone"
              className="min-w-0 flex-1"
              rules={[
                {
                  pattern: /^\+?[0-9][0-9\s-]{6,19}$/,
                  message: 'Digits, optionally with + and spaces',
                },
              ]}
            >
              <Input placeholder="+91 98765 43210" />
            </Form.Item>

            {/*
              Create only. There is no endpoint that sets another person's
              password after the fact, so an edit form offering the field would
              be offering something the API cannot do. A forgotten password goes
              through the reset flow, which is the account holder's own.
            */}
            {editing ? null : (
              <Form.Item
                name="password"
                label={
                  <FieldLabel
                    label="Temporary Password"
                    help="At least 12 characters, with a letter and a digit. Share it with them and ask them to change it."
                  />
                }
                className="min-w-0 flex-1"
                rules={[
                  { required: true, message: 'Required' },
                  { min: 12, message: 'At least 12 characters' },
                  {
                    pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/,
                    message: 'Needs at least one letter and one digit',
                  },
                ]}
              >
                <Input.Password placeholder="At least 12 characters" />
              </Form.Item>
            )}
          </div>

          {/*
            A staff account with no role is a legitimate intermediate state, not
            an error — the API accepts it — so this field is not required. What it
            means in practice is an account that can sign in and see nothing,
            which the help text says rather than leaving the admin to discover.
          */}
          <Form.Item
            name="role_codes"
            label={
              <FieldLabel
                label="Roles"
                help="What this person may do. An account with no role can sign in but sees no queues."
              />
            }
          >
            <MultiSelect
              placeholder={roles.length > 0 ? 'Choose roles' : 'Roles could not be loaded'}
              disabled={roles.length === 0}
              options={roles.map((role) => ({ value: role.code, label: role.name }))}
              selectAllLabel="Select all roles"
              deselectAllLabel="Deselect all roles"
            />
          </Form.Item>

          {/*
            Standing guidance, not a one-line rule, so it stays visible rather
            than hiding behind a `?`. Someone editing their own account is
            exactly who needs to read it before pressing Save.
          */}
          {editing ? (
            <Alert
              variant="info"
              message="Status is changed from the row's actions, not here. The last super admin cannot be stood down, and nobody can deactivate their own account."
            />
          ) : null}
        </Form>
      </FormDrawer>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const RolesAndPermissions = () => {
  const [create, setCreate] = useState<CreateAction | null>(null);
  const [searchBox, setSearchBox] = useState<ReactNode>(null);
  const [tabActions, setTabActions] = useState<ReactNode>(null);

  /* Stable, or the child's registering effects re-run on every parent render. */
  const registerCreate = useCallback((action: CreateAction | null) => setCreate(action), []);
  const registerSearch = useCallback((node: ReactNode) => setSearchBox(node), []);
  const registerActions = useCallback((node: ReactNode) => setTabActions(node), []);

  return (
    /* `min-w-0` is load-bearing: without it a wide table inside a flex child
       expands the page instead of scrolling inside `DataTable`'s body. */
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <PageHeader title="Roles & Permissions" />

      <Tabs
        variant="pill"
        defaultTab="roles"
        actions={
          <>
            {searchBox}
            {tabActions}
            {create ? (
              <Button variant="primary" icon={<PlusOutlined />} onClick={create.onClick}>
                {create.label}
              </Button>
            ) : null}
          </>
        }
        items={[
          {
            key: 'roles',
            label: 'Roles',
            children: (
              <RolesTab onRegisterSearch={registerSearch} onRegisterActions={registerActions} />
            ),
          },
          {
            key: 'staff',
            label: 'Staff',
            children: (
              <StaffTab onRegisterCreate={registerCreate} onRegisterSearch={registerSearch} />
            ),
          },
        ]}
      />
    </div>
  );
};

export default RolesAndPermissions;
