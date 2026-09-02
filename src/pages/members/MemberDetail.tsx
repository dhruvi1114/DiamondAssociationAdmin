import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PauseCircleOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { History } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  Drawer,
  ErrorState,
  PageHeader,
  Skeleton,
  Tabs,
} from '@/components/ui';
import { DRAWER_BODY_STYLE } from '@/components/ui/drawerChrome';
import { resolveStatus } from '@/constant/status';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePermissions } from '@/hooks/usePermissions';
import MembersService, { type MemberDetail as MemberDetailRecord } from '@/services/membersService';
import { asDisplayError, type DisplayError } from '@/utils/apiError';
import { formatDate } from '@/utils/format';
import MemberActivityTimeline from './MemberActivityTimeline';
import AuditHistory from '@/components/AuditHistory';
import MemberDocumentsPanel from './MemberDocumentsPanel';
import ProfileTab from './ProfileTab';
import StatusDialog, { type StatusAction } from './StatusDialog';

/** Shown on every status control once a membership is terminated. */
const TERMINAL_REASON =
  'This membership is terminated. Terminated is final — returning this company would mean a fresh application.';

/**
 * A-08 — one member, everything about them.
 *
 * Same shell as the application review page: the header becomes this
 * member's name with a back arrow in front of it while the page is open
 * (`hooks/usePageTitle.tsx`), and Actions is a sticky card beside the tabs
 * rather than a row of buttons above them — the status summary line
 * (code/status/class/registered) lives in that card's description now,
 * where the reviewer queue puts "Stage 1 of 3 · ... · Admin decides".
 *
 * Membership terms and billing are M5/M6. They are absent rather than stubbed:
 * a tab that renders zeros is worse than no tab, because the operator cannot
 * tell "nothing owed" from "not built".
 */

/** The banner text for a state that changes what the rest of the screen means. */
const BANNER: Partial<
  Record<MemberDetailRecord['status'], { variant: 'warning' | 'danger'; message: string }>
> = {
  SUSPENDED: {
    variant: 'warning',
    message:
      'This membership is suspended. The company is hidden from the directory and cannot register for events. They still have portal access.',
  },
  TERMINATED: {
    variant: 'danger',
    message:
      'This membership is terminated. Terminated is final — no status change can bring it back, and returning this company would mean a fresh application.',
  },
  EXPIRED: {
    variant: 'warning',
    message: 'This membership has expired. Renewing or reactivating restores directory listing.',
  },
};

/** The activity-history control, in the Actions card header. */
const HistoryButton = ({ onClick }: { onClick: () => void }) => (
  <Tooltip title="Activity history">
    <Button
      variant="ghost"
      aria-label="Activity history"
      icon={<History size={18} strokeWidth={1.5} />}
      onClick={onClick}
    />
  </Tooltip>
);

export const MemberDetail = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canChangeStatus = can('member.status');

  const [member, setMember] = useState<MemberDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DisplayError | null>(null);
  const [statusAction, setStatusAction] = useState<StatusAction | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await MembersService.detail(id);
      setMember(result.data);
    } catch (caught) {
      setError(asDisplayError(caught));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Stable, or `usePageTitle`'s effect would re-fire — and re-register the
  // back handler with the shell — on every render of this page.
  const goBack = useCallback(() => navigate(-1), [navigate]);

  // The shell header becomes the company name while this page is open — see
  // `hooks/usePageTitle.tsx`. Called unconditionally, before the early
  // returns below: a hook cannot follow one.
  // Same treatment as the application review page: the shell header names the
  // record and carries its reference code beside it, so the page itself needs
  // no <h1> of its own.
  usePageTitle(member?.company_name ?? null, {
    onBack: goBack,
    meta: member?.member_code ?? null,
    status: member ? { domain: 'member', value: member.status } : null,
  });

  if (loading && !member) {
    return <Skeleton variant="detail" />;
  }

  if (error || !member) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <ErrorState
          title="This member could not be loaded"
          description={error?.message ?? 'The record is not available.'}
          {...(error?.requestId ? { requestId: error.requestId } : {})}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  /** TERMINATED has no outgoing transition — see the comment on the action row. */
  const isTerminated = member.status === 'TERMINATED';

  const banner = BANNER[member.status];

  // The code/status/class/registered line the top meta row used to carry —
  // it moved into the Actions card's own description, the same place the
  // application review page puts "Stage 1 of 3 · ... · Admin decides".
  const statusSummary = [
    member.member_code,
    resolveStatus('member', member.status).label,
    member.category?.name ?? 'No class chosen',
    member.tier?.name,
    `registered ${formatDate(member.createdAt)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col">
      {/* Contributes the hidden h1 only — the shell header carries the name
          and the back arrow now (`hooks/usePageTitle.tsx`, called above),
          same treatment as the application review page. */}
      <PageHeader title={member.company_name} />

      {banner ? <Alert className="mb-4" variant={banner.variant} message={banner.message} /> : null}

      {/*
        Two columns, same relationship to the page's scroll as the
        application review page: the left one — everything about the company
        (`ProfileTab`) — is the reading order and scrolls with the page. The
        right one is Actions, Documents and Activity Timeline together,
        `sticky` so they travel with the reader rather than being three
        separate tabs a status decision or a document check meant leaving.
      */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <ProfileTab member={member} onChanged={() => void load()} />
        </div>

        {/*
          The summary line (code, status, class, registered date) shows
          regardless of permission — it is information, not a control. Only
          the buttons underneath it are gated on `member.status`, the same
          permission that gated the old inline row.
        */}
        <div className="sticky top-0 flex max-h-[calc(100vh-var(--header-height)-24px)] flex-col gap-4 overflow-y-auto">
          <Card
            dense
            title="Actions"
            description={statusSummary}
            actions={<HistoryButton onClick={() => setHistoryOpen(true)} />}
          >
            {canChangeStatus ? (
              /*
                Two different cases, handled differently on purpose.

                An illegal-but-plausible move (suspending a DRAFT member) keeps its
                button: the server's 409 names both states and teaches more than a
                control that silently is not there.

                TERMINATED is not that. It is terminal — the transition table has no
                exit, so every one of these actions is permanently impossible for
                this record. Leaving them live invites an operator to try, and the
                refusal would carry no new information. They are disabled WITH the
                reason attached, never hidden, so the screen still explains itself
                (ux-principles.md §4).
              */
              <div className="flex flex-col gap-2">
                <Button
                  block
                  variant="success"
                  icon={<PlayCircleOutlined />}
                  disabled={isTerminated}
                  {...(isTerminated ? { disabledReason: TERMINAL_REASON } : {})}
                  onClick={() => setStatusAction('reactivate')}
                >
                  Reactivate
                </Button>
                <Button
                  block
                  icon={<PauseCircleOutlined />}
                  disabled={isTerminated}
                  {...(isTerminated ? { disabledReason: TERMINAL_REASON } : {})}
                  onClick={() => setStatusAction('suspend')}
                >
                  Suspend
                </Button>
                <Button
                  block
                  variant="danger"
                  icon={<StopOutlined />}
                  disabled={isTerminated}
                  {...(isTerminated ? { disabledReason: TERMINAL_REASON } : {})}
                  onClick={() => setStatusAction('terminate')}
                >
                  Terminate
                </Button>
              </div>
            ) : (
              <p className="m-0 text-supporting text-fg-subtle">
                Your role can view this member but not change their status.
              </p>
            )}
          </Card>

          <MemberDocumentsPanel memberId={member.id} onChanged={() => void load()} />
        </div>
      </div>

      {/*
        The status history is a drawer here for the same reason it is one on the
        application review page: it is read once, at the start, and as a third
        card it pushed Actions — the reason the column exists — off the screen.
      */}
      <Drawer
        open={historyOpen}
        width={640}
        closable={false}
        styles={{ body: DRAWER_BODY_STYLE }}
        title={<span className="block min-w-0 truncate text-title-primary text-fg">Activity</span>}
        onClose={() => setHistoryOpen(false)}
        footer={
          <Button variant="secondary" onClick={() => setHistoryOpen(false)}>
            Close
          </Button>
        }
      >
        {/*
          Two questions, two tabs, one drawer.

          "Status changes" is how the MEMBERSHIP moved — the domain history the
          member sees the consequences of. "All changes" is the audit trail:
          every edit anybody made to this record, including the ones no status
          moved for, like a corrected GST number or a re-verified document.

          Status leads because it is what somebody opening this drawer usually
          came for; the audit trail is what they reach for when the status
          history does not explain what they are looking at.
        */}
        <Tabs
          variant="pill"
          queryParam="activity"
          items={[
            {
              key: 'status',
              label: 'Status Changes',
              children: <MemberActivityTimeline history={member.status_history} />,
            },
            {
              key: 'all',
              label: 'All Changes',
              children: <AuditHistory entityName="Members" entityId={member.id} />,
            },
          ]}
        />
      </Drawer>

      <StatusDialog
        action={statusAction}
        member={{ id: member.id, company_name: member.company_name }}
        onClose={() => setStatusAction(null)}
        onChanged={() => {
          void load();
          // The list's pending/status columns are now stale; a return trip
          // re-fetches, so nothing to do beyond refreshing this record.
        }}
      />

      {/* Async state changes are announced, not just animated (ux-principles §9). */}
      <div className="sr-only" role="status" aria-live="polite">
        {loading ? 'Refreshing member record' : ''}
      </div>
    </div>
  );
};

export default MemberDetail;
