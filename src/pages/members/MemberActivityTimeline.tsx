import { useState } from 'react';
import { CheckCircle2, History as HistoryIcon, PauseCircle, StopCircle } from 'lucide-react';
import { Card, Drawer } from '@/components/ui';
import type { MemberStatus, MemberStatusHistoryRow } from '@/services/membersService';
import { formatDateTime } from '@/utils/format';
import HistoryTab from './HistoryTab';

/**
 * A-08 · right column — a glance at every status this membership has held,
 * oldest first, same treatment `ApplicationReview`'s `ActivityTimeline` gives
 * the approval history: a compact list in the sidebar, with the full,
 * reason-and-actor detail one click away in a drawer rather than its own tab
 * — that drawer is the exact `HistoryTab` the tab used to own.
 */

const EVENT_ICON: Record<MemberStatus, typeof CheckCircle2> = {
  DRAFT: HistoryIcon,
  PENDING: HistoryIcon,
  ACTIVE: CheckCircle2,
  SUSPENDED: PauseCircle,
  EXPIRED: PauseCircle,
  TERMINATED: StopCircle,
};

const EVENT_TONE: Record<MemberStatus, string> = {
  DRAFT: 'text-status-neutral-fg',
  PENDING: 'text-status-neutral-fg',
  ACTIVE: 'text-status-success-fg',
  SUSPENDED: 'text-status-warning-fg',
  EXPIRED: 'text-status-warning-fg',
  TERMINATED: 'text-status-danger-fg',
};

export interface MemberActivityTimelineProps {
  history: MemberStatusHistoryRow[];
}

export const MemberActivityTimeline = ({ history }: MemberActivityTimelineProps) => {
  const [open, setOpen] = useState(false);

  // Newest-first from the API; the trail elsewhere on this page reads
  // oldest-first, so this flips it the same way `ActivityTimeline` does.
  const oldestFirst = history.slice().reverse();

  return (
    <>
      <Card title="Activity Timeline">
        <div className="flex flex-col gap-4">
          {oldestFirst.length === 0 ? (
            <p className="m-0 text-13 text-fg-muted">No status changes yet.</p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-4 p-0">
              {oldestFirst.map((row) => {
                const Icon = EVENT_ICON[row.to_status];

                return (
                  <li key={row.id} className="flex items-start gap-3">
                    <Icon
                      size={16}
                      strokeWidth={1.5}
                      className={`mt-[2px] flex-none ${EVENT_TONE[row.to_status]}`}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="m-0 text-13 font-medium text-fg">
                        {row.from_status ? `${row.from_status} → ${row.to_status}` : row.to_status}
                      </p>
                      <p className="m-0 text-12 text-fg-muted">
                        <span className="tabular">{formatDateTime(row.createdAt)}</span> · By{' '}
                        {row.changed_by?.full_name ?? 'Automatic (platform)'}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {oldestFirst.length > 0 ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex w-fit cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-13 text-primary hover:underline"
            >
              <HistoryIcon size={14} strokeWidth={1.5} aria-hidden />
              View full history
            </button>
          ) : null}
        </div>
      </Card>

      <Drawer open={open} title="Full history" width={640} onClose={() => setOpen(false)}>
        <HistoryTab history={history} />
      </Drawer>
    </>
  );
};

export default MemberActivityTimeline;
