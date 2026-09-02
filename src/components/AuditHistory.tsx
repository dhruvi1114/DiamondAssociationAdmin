import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorState, NotAvailable, Skeleton } from '@/components/ui';
import { usePermissions } from '@/hooks/usePermissions';
import AuditService, { type AuditLog } from '@/services/auditService';
import { formatDateTime } from '@/utils/format';

/**
 * Every audited change to one record, newest first (AJ-10).
 *
 * The same `AuditLogs` rows the audit log screen reads, narrowed to one entity.
 * It sits beside the domain histories rather than replacing them: a member's
 * status history says how the membership moved, and this says what anybody
 * changed about the record — a corrected GST number, a re-verified document, a
 * role granted — which no domain timeline records.
 *
 * Gated on `audit.view`, so a role that cannot open the audit log screen cannot
 * read the same rows through a detail page either.
 */

export interface AuditHistoryProps {
  /** The table name exactly as the writer recorded it — `Members`, `Applications`. */
  entityName: string;
  entityId: string;
  /** How many to show. The audit screen carries the rest. */
  limit?: number;
}

interface ApiError {
  message: string;
  requestId?: string;
}

/** "approved" from "application.approved" — the module is context, not the event. */
const verb = (action: string): string => {
  const [module, ...rest] = action.split('.');
  const tail = rest.join('.') || module;

  return tail.replace(/_/g, ' ');
};

/**
 * One changed field, as a sentence.
 *
 * The writer records only what changed, so this is a short list rather than a
 * whole record — which is what makes "from X to Y" readable inline instead of
 * needing a diff table.
 */
const changes = (row: AuditLog): string[] => {
  const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  const before = isObject(row.before) ? row.before : {};
  const after = isObject(row.after) ? row.after : {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();

  const show = (value: unknown): string =>
    value === null || value === undefined
      ? 'not set'
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);

  return keys.map((key) => {
    const label = key.replace(/_/g, ' ');

    if (!(key in before)) return `${label} set to ${show(after[key])}`;
    if (!(key in after)) return `${label} cleared`;

    return `${label}: ${show(before[key])} → ${show(after[key])}`;
  });
};

/** Who did it, worded for the case where the account is gone. */
const actorName = (row: AuditLog): string => {
  if (row.actor.type === 'SYSTEM') return 'System';
  if (row.actor.name) return row.actor.name;

  // The row deliberately outlives its actor (ADR-006), so a missing name is a
  // normal outcome and not a rendering failure.
  return row.actor.id ? `Deleted account #${row.actor.id}` : 'Unknown';
};

export const AuditHistory = ({ entityName, entityId, limit = 20 }: AuditHistoryProps) => {
  const { can } = usePermissions();
  const canView = can('audit.view');

  const [rows, setRows] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await AuditService.list({ entity_name: entityName, entity_id: entityId, limit });

      setRows(res.data);
      setTotal(res.pagination?.total ?? res.data.length);
    } catch (err) {
      const e = err as { message?: string; requestId?: string };

      setError({
        message: e?.message ?? 'Could not load the history',
        ...(e?.requestId ? { requestId: e.requestId } : {}),
      });
    } finally {
      setLoading(false);
    }
  }, [canView, entityName, entityId, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canView) {
    return (
      <EmptyState
        title="You cannot read the audit trail"
        description="Viewing who changed a record needs the audit permission. A super admin can grant it under Configure → Roles & Permissions."
      />
    );
  }

  if (loading) return <Skeleton variant="list" rows={4} />;

  if (error) {
    return (
      <ErrorState
        description={error.message}
        {...(error.requestId ? { requestId: error.requestId } : {})}
        onRetry={() => void load()}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing recorded against this record"
        description="Every approval, status change and edit writes a row here as it happens. An empty history means this record has not been changed since it was created."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ol className="m-0 flex list-none flex-col p-0">
        {rows.map((row, index) => {
          const fields = changes(row);

          return (
            <li
              key={row.id}
              className={`flex flex-col gap-1 py-3 ${index > 0 ? 'border-t border-border' : ''}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-supporting font-medium text-fg">{verb(row.action)}</span>
                <span className="text-supporting text-fg-muted">by {actorName(row)}</span>
                {/* Date AND time: on a history the minute is the data — the
                    question it answers is which of two changes came first. */}
                <span className="tabular text-12 text-fg-subtle">
                  {formatDateTime(row.createdAt)}
                </span>
              </div>

              {fields.length > 0 ? (
                <ul className="m-0 flex list-none flex-col gap-[2px] p-0">
                  {fields.map((line) => (
                    <li key={line} className="text-12 text-fg-muted">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                /* An event rather than an edit — a download, a login, a send. */
                <span className="text-12 text-fg-subtle">
                  <NotAvailable label="No field values recorded" />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {total > rows.length ? (
        <p className="m-0 text-12 text-fg-subtle">
          Showing the {rows.length} most recent of {total}. The Audit Log screen carries the rest.
        </p>
      ) : null}
    </div>
  );
};

export default AuditHistory;
