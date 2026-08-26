import {
  CheckCircle2,
  MessageSquare,
  RotateCcw,
  Send,
  Shuffle,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState, NotAvailable, StatusChip } from '@/components/ui';
import type { ApplicationDetail, ApprovalAction } from '@/services/applicationsService';
import { formatDateTime, formatRelative } from '@/utils/format';

/**
 * A-04/A-05 — everything that has happened to this application, oldest first.
 *
 * This is now one component where there used to be two. `ActivityTimeline` was
 * a card in the review page's right column showing what/when/who, with a "View
 * full history" link into a drawer holding `TimelinePanel`, which showed the
 * same events again with their remarks and their status transitions. Two
 * renderings of one append-only table, and the interesting half — the reason a
 * reviewer gave — was the half behind the link.
 *
 * The review page now opens this in a drawer of its own (`ActivityDrawer`), so
 * there is no longer a narrow column to summarise into and no second surface to
 * link to. One list, carrying everything: what happened, at which stage, who did
 * it, when, and their words.
 *
 * **Rounds, not one flat list.** A returned application closes its approval
 * request and opens a fresh one when the applicant resubmits, so a flat timeline
 * interleaves "rejected at document verification" from round 1 with "approved at
 * document verification" from round 2 and reads as a contradiction. Within a
 * round the actions are sorted by `acted_at` ascending — the API returns each
 * round's actions newest first, and the direction a timeline reads has to match
 * the stage trail the reviewer just looked at.
 *
 * Read straight from `ApprovalActions`, which is append-only by grant: no row
 * here has ever been edited or deleted, and that is the whole reason the screen
 * is worth trusting.
 */

type EventKind = ApprovalAction['action'] | 'SUBMITTED';

const EVENT_ICON: Record<EventKind, LucideIcon> = {
  SUBMITTED: Send,
  APPROVE: CheckCircle2,
  REJECT: XCircle,
  RETURN: RotateCcw,
  REASSIGN: Shuffle,
  COMMENT: MessageSquare,
};

const EVENT_TONE: Record<EventKind, string> = {
  SUBMITTED: 'text-status-neutral-fg',
  APPROVE: 'text-status-success-fg',
  REJECT: 'text-status-danger-fg',
  RETURN: 'text-status-warning-fg',
  REASSIGN: 'text-status-info-fg',
  COMMENT: 'text-status-neutral-fg',
};

/** "Document verification" + APPROVE → "Document verification cleared". */
const describe = (action: ApprovalAction): string => {
  switch (action.action) {
    case 'APPROVE':
      return `${action.stage.name} cleared`;
    case 'REJECT':
      return `${action.stage.name} rejected`;
    case 'RETURN':
      return `Returned for correction at ${action.stage.name}`;
    case 'REASSIGN':
      return `Reassigned from ${action.stage.name}`;
    case 'COMMENT':
      return `Comment at ${action.stage.name}`;
    default:
      return action.stage.name;
  }
};

interface TimelineEvent {
  key: string;
  kind: EventKind;
  label: string;
  by: string;
  at: string;
  /**
   * The reason given, when there was one. It gets its own line rather than a
   * hover: a decision with no stated reason is exactly the thing that produces
   * the phone call this platform exists to prevent, so the words are the point
   * of the row, not a detail of it.
   */
  remarks?: string | null;
  /** Present only for a real approval action — the submission has no transition. */
  fromStatus?: string | null;
  toStatus?: string | null;
}

/** One round of review, with a heading only when there is more than one. */
interface TimelineRound {
  key: string;
  /** `null` for the pre-round events — the submission itself. */
  heading: string | null;
  events: TimelineEvent[];
}

const EventRow = ({ event }: { event: TimelineEvent }) => {
  const Icon = EVENT_ICON[event.kind];

  return (
    <li className="flex items-start gap-3">
      <Icon
        size={16}
        strokeWidth={1.5}
        className={`mt-[2px] flex-none ${EVENT_TONE[event.kind]}`}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <p className="m-0 text-supporting font-medium text-fg">{event.label}</p>

        {/* Both statuses, always. "Approved" alone does not say whether that
            meant another stage or a member — the pair does. */}
        {event.toStatus ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {event.fromStatus ? (
              <>
                <StatusChip domain="application" status={event.fromStatus} />
                <span aria-hidden="true" className="text-12 text-fg-subtle">
                  →
                </span>
              </>
            ) : null}
            <StatusChip domain="application" status={event.toStatus} />
          </div>
        ) : null}

        {event.kind === 'SUBMITTED' ? null : (
          <p className="m-0 mt-1 text-supporting text-fg">
            {event.remarks ?? <NotAvailable label="No remarks recorded." />}
          </p>
        )}

        <p className="m-0 text-12 text-fg-muted">
          <span className="tabular">{formatDateTime(event.at)}</span> · By {event.by}
          <span className="text-fg-subtle"> · {formatRelative(event.at)}</span>
        </p>
      </div>
    </li>
  );
};

export interface ActivityTimelineProps {
  application: ApplicationDetail;
}

export const ActivityTimeline = ({ application }: ActivityTimelineProps) => {
  // Requests arrive newest round first, so reversing gives round 1 first — the
  // same direction the events inside each round are about to be put in.
  const rounds = application.approval_requests
    .filter((request) => request.actions.length > 0)
    .slice()
    .reverse();

  const groups: TimelineRound[] = [
    ...(application.submitted_at
      ? [
          {
            key: 'submitted',
            heading: null,
            events: [
              {
                key: 'submitted',
                kind: 'SUBMITTED' as const,
                label: 'Application submitted',
                by: application.user?.full_name ?? application.company_name,
                at: application.submitted_at,
              },
            ],
          },
        ]
      : []),
    ...rounds.map((request, index) => ({
      key: request.id,
      heading: rounds.length > 1 ? `Review round ${index + 1}` : null,
      events: request.actions
        .slice()
        .sort((a, b) => new Date(a.acted_at).getTime() - new Date(b.acted_at).getTime())
        .map((action) => ({
          key: action.id,
          kind: action.action,
          label: describe(action),
          by: `${action.admin_user.full_name} · ${action.stage.sequence}. ${action.stage.name}`,
          at: action.acted_at,
          remarks: action.remarks,
          fromStatus: action.from_status,
          toStatus: action.to_status,
        })),
    })),
  ];

  if (groups.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="This application has not been submitted. Every approval, return, rejection and reassignment appears here as it happens."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-3">
          {group.heading ? (
            <h3 className="m-0 text-12 font-semibold uppercase text-fg-subtle">{group.heading}</h3>
          ) : null}

          <ol className="m-0 flex list-none flex-col gap-4 p-0">
            {group.events.map((event) => (
              <EventRow key={event.key} event={event} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
};

export default ActivityTimeline;
