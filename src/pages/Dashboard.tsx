import { Link } from 'react-router-dom';
import {
  BellOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  SafetyOutlined,
  SolutionOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { usePermissions } from '@/hooks/usePermissions';
import DashboardService, { type DashboardSummary } from '@/services/dashboardService';
import { useAppSelector } from '@/store';

/**
 * A-02 — work-queue landing (AJ-1).
 *
 * "See what needs me, in priority order." Not a stats wall: every row is
 * something a person can act on, and a queue the role cannot act on is **absent
 * rather than empty** — AJ-1's failure/recovery line, and the reason each entry
 * declares the permission that reveals it.
 *
 * The counts arrive with the cycles that create the underlying records (M4
 * applications, M5 invoices, M6 renewals, M8 notices). Until then each visible
 * queue states plainly that it is waiting on its cycle. That is the whole point
 * of the `screen-inventory.md` A-02 "per-queue empty" state: a blank card reads
 * as a bug, and a fabricated zero reads as "nothing to do", which is a lie.
 */

interface QueueDefinition {
  key: string;
  label: string;
  /** What being in this queue means, in the approver's language. */
  description: string;
  icon: ReactNode;
  /** Visible when the admin holds at least one of these (rbac.md §3). */
  anyOf: string[];
  /** Cycle that fills it. */
  module: string;
  path: string;
  /**
   * The field on the summary response that carries this queue's count.
   *
   * Named on the definition rather than derived from `key`: the two are allowed
   * to differ ('approvals' is 'applications' on the wire), and a silent mismatch
   * would show "Arrives in M4" beside a queue that is already live.
   */
  field: keyof DashboardSummary;
}

const QUEUES: QueueDefinition[] = [
  {
    key: 'approvals',
    field: 'applications',
    label: 'Applications at your stage',
    description: 'Membership applications waiting for your decision, oldest first.',
    icon: <SolutionOutlined />,
    anyOf: ['application.view', 'application.approve'],
    module: 'M4',
    path: '/applications',
  },
  {
    key: 'documents',
    field: 'documents',
    label: 'Documents awaiting verification',
    description: 'Uploaded KYC documents that no one has checked yet.',
    icon: <CheckCircleOutlined />,
    anyOf: ['document.verify'],
    module: 'M3',
    // The Verification tab on the Applications page — applications carrying
    // at least one PENDING document. Used to point at the member list, which
    // moved to its own tab (`member-company`) on the same page.
    path: '/applications?scope=verification',
  },
  {
    key: 'change-requests',
    field: 'changeRequests',
    label: 'Profile change requests',
    description: 'Members asking to change a field that needs approval.',
    icon: <UserSwitchOutlined />,
    anyOf: ['member.approve_change'],
    module: 'M3',
    path: '/members/change-requests',
  },
  {
    key: 'invoices',
    field: 'invoices',
    label: 'Overdue invoices',
    description: 'Issued invoices past their due date.',
    icon: <FileTextOutlined />,
    anyOf: ['invoice.view'],
    module: 'M4',
    path: '/billing/invoices',
  },
  /*
    Renewals card hidden at the client's request.

    Commented rather than deleted: the count behind it is live and correct — the
    server still returns `renewals`, and `/renewals` is still in the nav — so
    restoring the card is uncommenting this block and nothing else.

    {
      key: 'renewals',
      field: 'renewals',
      label: 'Renewals due in 30 days',
      description: 'Memberships expiring soon, and those already in grace.',
      icon: <FileTextOutlined />, // was ReloadOutlined; re-add the import when restoring
      anyOf: ['renewal.view'],
      module: 'M6',
      path: '/renewals',
    },
  */
  {
    key: 'notifications',
    field: 'notifications',
    label: 'Failed notifications',
    description: 'Messages the outbox could not deliver after five attempts.',
    icon: <BellOutlined />,
    anyOf: ['notification.view'],
    module: 'M8',
    path: '/communication/outbox',
  },
];

const QueueCard = ({ queue, count }: { queue: QueueDefinition; count?: number | null }) => (
  <Card
    title={
      <span className="flex items-center gap-2">
        <span className="text-fg-muted" aria-hidden="true">
          {queue.icon}
        </span>
        {queue.label}
      </span>
    }
    description={queue.description}
    className="h-full"
  >
    {/* mt-auto pins every footer to the bottom of its card, so the row of
        "Open" buttons lines up even though the descriptions differ in length.
        Without it the buttons stagger and the grid reads as broken. */}
    <div className="mt-auto flex items-center justify-between gap-4 pt-2">
      <div>
        {/*
          A count only appears once the cycle behind it can produce a real one.
          Until then no number is shown at all — not even "0", which would claim
          the queue was checked and found empty. `undefined` is "still counting",
          `null` is "the count could not be read", and neither may render as 0.
        */}
        {count === undefined ? (
          <p className="m-0 text-14 text-fg-muted">Arrives in {queue.module}.</p>
        ) : count === null ? (
          <p className="m-0 text-14 text-fg-muted">Count unavailable.</p>
        ) : (
          <p className="m-0 text-14 text-fg">
            <span className="tabular text-20 font-semibold">{count}</span>{' '}
            <span className="text-fg-muted">waiting for you</span>
          </p>
        )}
      </div>
      <Link to={queue.path}>
        <Button variant="secondary" size="small">
          Open
        </Button>
      </Link>
    </div>
  </Card>
);

/**
 * The queue board is switched off at the client's request. Flip this to `true`
 * to bring the whole design back — the banner, the queue cards and the
 * permissions footnote.
 *
 * A flag rather than a block comment, for two reasons: the design keeps
 * type-checking and linting as the app changes around it, so it does not rot
 * while it is off; and every hook and helper it uses stays referenced, which a
 * commented-out block would turn into a file full of unused-variable errors.
 *
 * The subtitle went with it — it described the board.
 */
const SHOW_QUEUE_BOARD: boolean = true;

export const Dashboard = () => {
  const { canAny, isSuperAdmin, permissions } = usePermissions();
  const profile = useAppSelector((state) => state.auth.profile);

  const visible = QUEUES.filter((queue) => canAny(...queue.anyOf));
  const firstName = profile?.fullName?.split(' ')[0];

  /**
   * `undefined` = not counted yet · `null` = the count failed · number = real.
   *
   * All three are distinct on screen, and collapsing any two of them is how a
   * work queue starts lying: a failed count rendered as `0` reads as "nothing to
   * do", and a not-yet-loaded one rendered as `0` reads the same way a second
   * before the real figure replaces it.
   */
  const [summary, setSummary] = useState<DashboardSummary | null | undefined>(undefined);

  useEffect(() => {
    /*
      One request for the whole board, not one per card.

      The server already knows which queues this admin may act on and returns
      only those, so the counts and the cards are decided by the same permission
      check rather than by two that can drift. It also means six tiles cost one
      round trip on the most-hit screen in the app.
    */
    DashboardService.summary()
      .then((res) => setSummary(res.data))
      // A board that will not load must not become six zeroes.
      .catch(() => setSummary(null));
  }, []);

  /** What one card should show, in the three states above. */
  const countFor = (queue: QueueDefinition): number | null | undefined => {
    if (summary === undefined) return undefined;
    if (summary === null) return null;

    // Absent from the response means the server did not offer this queue at all,
    // which the card renders as "arrives with its cycle" rather than as zero.
    return summary[queue.field] ?? undefined;
  };

  return (
    <div className="flex flex-col">
      {/*
        The title stays. It is visually hidden either way — the app header draws
        the page name from the nav config — so keeping it costs nothing on screen
        and keeps the route's `h1` in the heading outline for screen readers and
        keyboard navigation. Removing it would leave the page with no accessible
        name at all.
      */}
      <PageHeader title={firstName ? `Work Queue — ${firstName}` : 'Work Queue'} />

      {SHOW_QUEUE_BOARD ? (
        <>
          {visible.length === 0 ? (
            <Card flush>
              <EmptyState
                icon={<SafetyOutlined />}
                title="No queues are assigned to your role"
                description="Your account is active but its role does not include any of the work queues. A super admin can change that under Configure → Staff accounts."
              />
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 [&>*]:h-full">
              {visible.map((queue) => (
                <QueueCard key={queue.key} queue={queue} count={countFor(queue)} />
              ))}
            </div>
          )}

          <p className="m-0 mt-6 text-12 text-fg-subtle">
            {isSuperAdmin
              ? 'Signed in as a super admin — every permission check is bypassed and each bypass is recorded in the audit log.'
              : `${permissions.length} permissions held.`}
          </p>
        </>
      ) : null}
    </div>
  );
};

export default Dashboard;
