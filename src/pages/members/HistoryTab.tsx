import { Card, EmptyState, StatusChip } from '@/components/ui';
import type { MemberStatusHistoryRow } from '@/services/membersService';
import { formatDateTime, formatRelative } from '@/utils/format';

/**
 * A-08 · History tab — every status this membership has held, newest first.
 *
 * This is the answer to "who did this and when", read straight from
 * `MemberStatusHistory`, the same append-only rows the audit log reads
 * (AJ-10). Three things make a timeline row useful: the move, the person, and
 * their reason — a transition with no reason is the thing that produces the
 * phone call this platform exists to prevent, which is why the reason is the
 * most prominent line rather than a hover.
 */

export interface HistoryTabProps {
  history: MemberStatusHistoryRow[];
}

export const HistoryTab = ({ history }: HistoryTabProps) => {
  if (history.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No status changes yet"
          description="The first entry is written when the member record is created, so an empty history means this record predates that."
        />
      </Card>
    );
  }

  return (
    <Card>
      <ol className="m-0 flex list-none flex-col p-0">
        {history.map((row, index) => (
          <li
            key={row.id}
            className={`flex flex-col gap-1 py-3 ${index > 0 ? 'border-t border-border' : ''}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              {row.from_status ? (
                <>
                  <StatusChip domain="member" status={row.from_status} />
                  <span aria-hidden="true" className="text-12 text-fg-subtle">
                    →
                  </span>
                </>
              ) : null}
              <StatusChip domain="member" status={row.to_status} />

              <span className="tabular text-12 text-fg-muted">
                {formatDateTime(row.createdAt)}
                <span className="text-fg-subtle"> · {formatRelative(row.createdAt)}</span>
              </span>
            </div>

            <p className="m-0 text-13 text-fg">{row.reason ?? 'No reason recorded.'}</p>

            <p className="m-0 text-12 text-fg-muted">
              {/* A null actor is the platform itself — a payment landing, a term
                  expiring. Naming that is better than an empty "by". */}
              {row.changed_by?.full_name ?? 'Automatic (platform)'}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
};

export default HistoryTab;
