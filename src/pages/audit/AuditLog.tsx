import { Eye } from 'lucide-react';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Card,
  DataTable,
  Drawer,
  FilterDropdown,
  FilterGroup,
  FormSelect,
  MultiSelect,
  NotAvailable,
  NumberInput,
  PageHeader,
  RowActions,
  StackedCell,
} from '@/components/ui';
import { Field as DetailField, Group as DetailGroup } from '@/components/ui/DetailFields';
import AuditService, { type AuditFacets, type AuditLog as AuditRow } from '@/services/auditService';
import type { PaginationMeta } from '@/services/BaseService';
import { formatDateTime } from '@/utils/format';

/**
 * A-35 — the audit trail.
 *
 * "Who changed this, and from what to what." Every other screen in this app
 * shows the current state of something; this one is the only place the *history*
 * of a change is readable, and it is what the association answers a disputed
 * decision with months later.
 *
 * **No search box, deliberately.** Every list screen here carries one, and this
 * is the exception: an audit row has no free-text column worth an ILIKE. Its
 * fields are an enum, a table name, an id and a timestamp — every real question
 * ("what did Kiran do last week", "everything that touched application 482") is
 * a filter, not a search. A search box over `action` would be a slower, vaguer
 * version of the Action filter sitting beside it.
 *
 * Read-only, and permanently: `AuditLogs` has no update or delete path anywhere
 * in the platform, so there is no row action here but "look at it".
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

interface AuditFilters {
  entity: string;
  recordId: string;
  actions: string[];
  actorTypes: string[];
  from: string;
  to: string;
}

const EMPTY_FILTERS: AuditFilters = {
  entity: '',
  recordId: '',
  actions: [],
  actorTypes: [],
  from: '',
  to: '',
};

const ACTOR_TYPE_OPTIONS = [
  { value: 'ADMIN', label: 'Staff' },
  { value: 'MEMBER', label: 'Member' },
  { value: 'SYSTEM', label: 'System' },
];

/**
 * How the actor reads when the account behind it is gone.
 *
 * The row deliberately outlives its actor (ADR-006), so a missing name is a
 * normal outcome and not a rendering failure. Saying so beats an empty cell,
 * which cannot be told apart from a bug.
 */
const actorName = (row: AuditRow): string => {
  if (row.actor.type === 'SYSTEM') return 'System';
  if (row.actor.name) return row.actor.name;

  return row.actor.id ? `Deleted account #${row.actor.id}` : 'Unknown';
};

/** One changed field, as the drawer lays it out. */
interface DiffRow {
  field: string;
  before: string | null;
  after: string | null;
}

const asText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;

  return JSON.stringify(value);
};

/**
 * The union of the keys either side mentions, so a field that only appears in
 * `after` (a create) or only in `before` (a delete) still gets a row. The writer
 * records only what changed, so this is a short list, not a whole record.
 */
const diff = (before: unknown, after: unknown): DiffRow[] => {
  const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  const b = isObject(before) ? before : {};
  const a = isObject(after) ? after : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();

  return keys.map((field) => ({ field, before: asText(b[field]), after: asText(a[field]) }));
};

/** "created", "deleted", or how many fields moved. */
const changeSummary = (row: AuditRow): string => {
  const count = diff(row.before, row.after).length;

  if (row.before === null && row.after !== null) return 'Created';
  if (row.after === null && row.before !== null) return 'Deleted';
  if (count === 0) return 'No field change';

  return `${count} ${count === 1 ? 'field' : 'fields'}`;
};

export const AuditLog = () => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [facets, setFacets] = useState<AuditFacets>({ actions: [], entities: [] });
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [viewing, setViewing] = useState<AuditRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await AuditService.list({
        page,
        limit: 20,
        // Spread conditionally so an unset filter sends no key at all — the API
        // treats a missing param as "no opinion", and an empty string as a value
        // it has to reject.
        ...(filters.entity ? { entity_name: filters.entity } : {}),
        ...(filters.recordId ? { entity_id: filters.recordId } : {}),
        ...(filters.actions.length > 0 ? { action: filters.actions.join(',') } : {}),
        ...(filters.actorTypes.length > 0 ? { actor_type: filters.actorTypes.join(',') } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
      });
      setRows(res.data);
      setPagination(res.pagination);
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  /* The filter panel's option lists. Fetched once: the action vocabulary is a
     constant on the server and the entity list changes only as new modules ship. */
  useEffect(() => {
    AuditService.facets()
      .then((res) => setFacets(res.data))
      .catch(() => setFacets({ actions: [], entities: [] }));
  }, []);

  /* Applying always returns to page one: landing on page three of a list the
     filter has cut to six rows shows an empty table, which reads as "no matches"
     rather than "you are past the end". */
  const applyFilters = useCallback((next: AuditFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  /* Entity and record id are one decision — "this record" — and so is the date
     range. Counting each half separately would say "4 filters" for what the
     admin thinks of as two. */
  const activeFilterCount =
    (filters.entity || filters.recordId ? 1 : 0) +
    (filters.actions.length > 0 ? 1 : 0) +
    (filters.actorTypes.length > 0 ? 1 : 0) +
    (filters.from || filters.to ? 1 : 0);

  const diffRows = useMemo(() => (viewing ? diff(viewing.before, viewing.after) : []), [viewing]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <PageHeader
        title="Audit Log"
        actions={
          <FilterDropdown<AuditFilters>
            value={filters}
            emptyValue={EMPTY_FILTERS}
            onApply={applyFilters}
            onClear={clearFilters}
            activeCount={activeFilterCount}
          >
            {(draft, setDraft) => (
              <>
                {/*
                  Single-select, unlike the other filters here: "everything that
                  touched Applications 482" is one record, and a multi-select
                  paired with a single id field would let an admin ask a question
                  with no answer — record 482 of two different tables.
                */}
                <FilterGroup label="Record type">
                  <FormSelect
                    value={draft.entity || undefined}
                    placeholder="Any record type"
                    allowClear
                    options={facets.entities.map((name) => ({ value: name, label: name }))}
                    onChange={(next) =>
                      setDraft((d) => ({ ...d, entity: next ? String(next) : '' }))
                    }
                  />
                </FilterGroup>

                <FilterGroup label="Record ID">
                  <NumberInput
                    min={1}
                    value={draft.recordId ? Number(draft.recordId) : undefined}
                    placeholder="e.g. 482"
                    onChange={(next) =>
                      setDraft((d) => ({
                        ...d,
                        recordId: next === null || next === undefined ? '' : String(next),
                      }))
                    }
                  />
                </FilterGroup>

                <FilterGroup label="Action">
                  <MultiSelect
                    value={draft.actions}
                    placeholder="Any action"
                    options={facets.actions.map((code) => ({ value: code, label: code }))}
                    onChange={(next) => setDraft((d) => ({ ...d, actions: next.map(String) }))}
                  />
                </FilterGroup>

                <FilterGroup label="Actor">
                  <MultiSelect
                    value={draft.actorTypes}
                    placeholder="Anyone"
                    options={ACTOR_TYPE_OPTIONS}
                    onChange={(next) => setDraft((d) => ({ ...d, actorTypes: next.map(String) }))}
                  />
                </FilterGroup>

                {/* Both bounds are inclusive whole days — the server widens the
                    upper one to the end of its date, so "1 Sep to 1 Sep" returns
                    that day rather than nothing. */}
                <FilterGroup label="When">
                  <DatePicker.RangePicker
                    className="w-full"
                    format="YYYY-MM-DD"
                    allowEmpty={[true, true]}
                    value={[
                      draft.from ? dayjs(draft.from) : null,
                      draft.to ? dayjs(draft.to) : null,
                    ]}
                    onChange={(range) =>
                      setDraft((d) => ({
                        ...d,
                        from: range?.[0] ? range[0].format('YYYY-MM-DD') : '',
                        to: range?.[1] ? range[1].format('YYYY-MM-DD') : '',
                      }))
                    }
                  />
                </FilterGroup>
              </>
            )}
          </FilterDropdown>
        }
      />

      <Card flush className="min-h-0 min-w-0 flex-1">
        <DataTable<AuditRow>
          unit="entries"
          serial
          rowKey="id"
          loading={loading}
          error={error}
          onRetry={() => void load()}
          pagination={pagination}
          onPageChange={setPage}
          dataSource={rows}
          filtered={activeFilterCount > 0}
          onClearFilter={clearFilters}
          emptyTitle="Nothing recorded yet"
          emptyDescription="Every approval, status change and setting edit writes a row here as it happens. An empty log means nothing has been changed since the platform went live."
          columns={[
            {
              /*
                Date AND time on the row, not the day with the time on hover. This
                is the one table in the app where the minute IS the data — the
                question it exists to answer is which of two changes came first.
              */
              title: 'When',
              dataIndex: 'createdAt',
              width: 190,
              render: (value: string) => (
                <span className="tabular text-supporting">{formatDateTime(value)}</span>
              ),
            },
            {
              title: 'Actor',
              dataIndex: 'actor',
              width: 210,
              render: (_: unknown, row: AuditRow) => (
                <StackedCell
                  primary={actorName(row)}
                  secondary={
                    row.actor.email ?? (row.actor.type === 'SYSTEM' ? 'Scheduled job' : undefined)
                  }
                />
              ),
            },
            {
              /* Split at the dot: the verb is what is scanned, and the module it
                 belongs to is the context under it. */
              title: 'Action',
              dataIndex: 'action',
              width: 220,
              render: (value: string) => {
                const [module, ...rest] = value.split('.');

                return <StackedCell primary={rest.join('.') || value} secondary={module} mono />;
              },
            },
            {
              title: 'Record',
              dataIndex: 'entity_name',
              width: 200,
              render: (value: string, row: AuditRow) => (
                <StackedCell
                  primary={value}
                  secondary={row.entity_id ? `#${row.entity_id}` : undefined}
                  mono
                />
              ),
            },
            {
              /* Carries no width: the last column before the frozen actions
                 absorbs the slack. */
              title: 'Changed',
              key: 'changed',
              render: (_: unknown, row: AuditRow) => <Badge>{changeSummary(row)}</Badge>,
            },
            {
              title: 'Actions',
              key: 'actions',
              width: 80,
              fixed: 'right' as const,
              render: (_: unknown, row: AuditRow) => (
                <RowActions
                  actions={[
                    {
                      key: 'view',
                      icon: <Eye size={16} strokeWidth={1.5} />,
                      label: 'View this change',
                      onClick: () => setViewing(row),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? viewing.action : 'Change'}
        destroyOnHidden
      >
        {viewing ? (
          <div className="flex flex-col gap-6 overflow-y-auto">
            <DetailGroup title="What happened">
              <DetailField label="Action" value={viewing.action} mono />
              <DetailField label="When" value={formatDateTime(viewing.createdAt)} />
              <DetailField label="Actor" value={actorName(viewing)} />
              <DetailField label="Actor type" value={viewing.actor.type} />
              <DetailField label="Record" value={viewing.entity_name} mono />
              <DetailField label="Record ID" value={viewing.entity_id} mono />
            </DetailGroup>

            {/*
              The provenance half. Kept in its own group and below the change
              itself: it is what an investigation reaches for second, once the
              "what" is understood, and `request_id` is the value that ties this
              row to the application logs for the same request.
            */}
            <DetailGroup
              title="Where it came from"
              description="Matches the request in the application logs."
            >
              <DetailField label="Request ID" value={viewing.request_id} mono />
              <DetailField label="IP address" value={viewing.ip} mono />
              <DetailField label="User agent" value={viewing.user_agent} />
            </DetailGroup>

            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-title-secondary">The change</h3>

              {diffRows.length === 0 ? (
                <p className="m-0 text-supporting text-fg-muted">
                  This action recorded no field values. It is an event rather than an edit — a
                  download, a login, a notification send.
                </p>
              ) : (
                /* Its own horizontal scroll: a long JSON value must not widen
                   the drawer or push the page sideways. */
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-supporting">
                    <thead>
                      <tr className="text-left text-11 uppercase tracking-[0.04em] text-fg-muted">
                        <th className="py-2 pr-3 font-medium">Field</th>
                        <th className="py-2 pr-3 font-medium">Before</th>
                        <th className="py-2 font-medium">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diffRows.map((row) => (
                        <tr key={row.field} className="border-t border-border align-top">
                          <td className="py-2 pr-3 font-mono text-12">{row.field}</td>
                          <td className="py-2 pr-3">
                            {row.before === null ? (
                              <NotAvailable label="Not set" />
                            ) : (
                              <span className="break-words font-mono text-12 text-fg-muted">
                                {row.before}
                              </span>
                            )}
                          </td>
                          <td className="py-2">
                            {row.after === null ? (
                              <NotAvailable label="Not set" />
                            ) : (
                              <span className="break-words font-mono text-12">{row.after}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
};

export default AuditLog;
