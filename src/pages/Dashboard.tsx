import { Link } from 'react-router-dom';
import {
  CheckCircleOutlined,
  FileSyncOutlined,
  FileTextOutlined,
  SafetyOutlined,
  SolutionOutlined,
  TeamOutlined,
  // UserSwitchOutlined, (belongs to the commented-out Change Requests tile)
} from '@ant-design/icons';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { usePermissions } from '@/hooks/usePermissions';
import DashboardService, {
  type DashboardCharts,
  type DashboardKpis,
  type DashboardSummary,
} from '@/services/dashboardService';
import {
  ChartCard,
  DashboardFilterBar,
  KpiTile,
  MembershipTrendChart,
  RevenueChart,
  TopMembersDonut,
} from '@/components/dashboard';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { formatDate, formatMoney } from '@/utils/format';
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
  /**
   * What being in this queue means, in the approver's language.
   *
   * A few words, not a sentence: these render as the tile's second line beside
   * the figure, and the long form that used to sit under a card title pushed
   * every tile to a different height.
   */
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
  /*
    "Applications at your stage" removed: the Open Applications tile above runs
    the identical predicate (SUBMITTED + UNDER_REVIEW), so the two were the same
    number twice under two names — and a reader seeing 5 in both places has to
    work out whether they are looking at one queue or two.

    The tile that survived is the KPI one, because it sits with the figures the
    period filter applies to.
  */
  {
    key: 'documents',
    field: 'documents',
    /*
      Short enough for one line at a sixth of the row. The hint under the figure
      already says what "awaiting" meant, so the label does not have to — and a
      two-line label made this tile taller than the five beside it.

      "KYC Documents", not "Documents": these are identity papers, and the
      office calls them that.
    */
    label: 'KYC Documents',
    description: 'not yet checked',
    icon: <CheckCircleOutlined />,
    anyOf: ['document.verify'],
    module: 'M3',
    /*
      Membership requests carrying at least one PENDING document. `?pending=true`
      is the queue's own Documents filter — it read `?scope=verification` while
      that page was tabbed, which matched no tab key and so quietly landed on the
      unfiltered queue.
    */
    path: '/applications?pending=true',
  },
  {
    key: 'member-documents',
    field: 'memberDocuments',
    /*
      Its own tile rather than folded into KYC Documents: these sit on Member
      Companies, not Member Requests, and one tile can only open one page.
    */
    label: 'Replaced Documents',
    description: 'awaiting verification',
    icon: <FileSyncOutlined />,
    anyOf: ['document.verify'],
    module: 'M3',
    path: '/members?documents=pending',
  },
  /*
    Change Requests tile hidden with its nav item (client decision, 2026-09-11):
    profile edits save directly now, so the queue stays empty.

  {
    key: 'change-requests',
    field: 'changeRequests',
    label: 'Change Requests',
    description: 'awaiting approval',
    icon: <UserSwitchOutlined />,
    anyOf: ['member.approve_change'],
    module: 'M3',
    path: '/members/change-requests',
  },
  */
  /*
    "Overdue invoices" removed for the same reason: the Overdue Invoices tile
    above counts the same invoices and additionally says what they are worth,
    which is the more useful of the two.
  */
  /*
    Renewals card hidden at the client's request.

    Commented rather than deleted: the count behind it is live and correct — the
    server still returns `renewals`, and `/renewals` is still in the nav — so
    restoring the card is uncommenting this block and nothing else.

    {
      key: 'renewals',
      field: 'renewals',
      label: 'Renewals due in 30 days',
      description: 'expiring or in grace',
      icon: <FileTextOutlined />, // was ReloadOutlined; re-add the import when restoring
      anyOf: ['renewal.view'],
      module: 'M6',
      path: '/renewals',
    },
  */
  /*
    Failed notifications tile hidden at the client's request.

    Commented rather than deleted: the count behind it is live and correct — the
    server still returns `notifications` on the summary, and the Outbox screen
    still lists them — so restoring the tile is uncommenting this block and
    re-adding the BellOutlined import.

    {
      key: 'notifications',
      field: 'notifications',
      label: 'Failed notifications',
      description: 'undelivered after 5 tries',
      icon: <BellOutlined />, // re-add the import when restoring
      anyOf: ['notification.view'],
      module: 'M8',
      path: '/communication/outbox',
    },
  */
];

/**
 * One work queue, rendered as a KPI tile.
 *
 * The same tile the figures above use, deliberately: a queue count and a
 * headline figure are both "a number worth acting on", and two card shapes on
 * one screen made the queues read as a different kind of thing from the figures
 * they sit under.
 *
 * The three count states map onto the tile's own three:
 *   `undefined` → loading   · the request has not answered yet
 *   `null`      → error     · it answered badly, and the tile says so
 *   a number    → the value · including 0, which genuinely means nothing waiting
 *
 * A failed count must never render as `0`: that reads as "nothing to do", which
 * is the one lie a work queue cannot tell.
 */
const QueueCard = ({ queue, count }: { queue: QueueDefinition; count?: number | null }) => (
  <KpiTile
    label={queue.label}
    icon={queue.icon}
    // The figure itself is the link, as it is on every other tile.
    href={queue.path}
    value={count === undefined || count === null ? '—' : String(count)}
    hint={queue.description}
    loading={count === undefined}
    error={count === null}
  />
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

/**
 * The Next Event tile is switched off at the client's request. Flip to `true`
 * to bring it back.
 *
 * The data behind it is untouched — `next_event` is still on the KPI response,
 * and the Upcoming Events panel lower down reads the same rows.
 */
const SHOW_NEXT_EVENT: boolean = false;

export const Dashboard = () => {
  /* `isSuperAdmin` and `permissions` went with the footnote below — restore them
     here when that block comes back. */
  const { canAny } = usePermissions();
  const profile = useAppSelector((state) => state.auth.profile);
  const { filters, setFilters } = useDashboardFilters();

  const visible = QUEUES.filter((queue) => canAny(...queue.anyOf));
  const firstName = profile?.fullName?.split(' ')[0];
  const kpiTileCount = 4 + (SHOW_NEXT_EVENT ? 1 : 0) + (SHOW_QUEUE_BOARD ? visible.length : 0);

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

  /* The two heavier halves of the screen, fetched separately so the tiles paint
     while a twelve-month aggregate is still running. */
  const [kpis, setKpis] = useState<DashboardKpis | null | undefined>(undefined);
  const [charts, setCharts] = useState<DashboardCharts | null | undefined>(undefined);

  const loadFigures = useCallback(() => {
    setKpis(undefined);
    setCharts(undefined);

    DashboardService.kpis(filters)
      .then((res) => setKpis(res.data))
      .catch(() => setKpis(null));

    DashboardService.charts(filters)
      .then((res) => setCharts(res.data))
      .catch(() => setCharts(null));
  }, [filters]);

  useEffect(loadFigures, [loadFigures]);

  const nextEvent = kpis?.next_event ?? null;

  return (
    /* One rhythm for the whole page: 12px, the same gap the cards sit at.
       Owned by this column rather than by each band's own margin — margins on
       siblings collapse, double and drift as blocks are added, and the gap
       between the figures and the charts had grown to 24px that way, which made
       the two read as separate screens rather than one dashboard. */
    <div className="flex flex-col gap-3">
      {/*
        The title stays. It is visually hidden either way — the app header draws
        the page name from the nav config — so keeping it costs nothing on screen
        and keeps the route's `h1` in the heading outline for screen readers and
        keyboard navigation. Removing it would leave the page with no accessible
        name at all.
      */}
      <PageHeader
        /* Matches the nav label exactly — AppShell draws the h1 from there, and
           the greeting rides after it rather than replacing it. */
        title={firstName ? `Dashboard — ${firstName}` : 'Dashboard'}
        actions={<DashboardFilterBar value={filters} onChange={setFilters} />}
      />

      {/*
        The figures, then the queues, then the charts.

        Deliberate order: the figures say how the association is doing, the
        queues say what needs doing about it, and the charts explain both. A
        reader who stops after the first row has still read the useful part.
      */}
      {/*
        One row, not two.

        The queue tiles were a second band under the figures, which read as a
        different kind of thing — but a queue count and a headline figure are
        both "a number worth acting on", and two of them were literally the same
        number under two names. One grid, and the permission-scoped queue tiles
        simply take the places after the figures.
      */}
      {/*
        Column count matches the tiles that are actually on, so a hidden Next
        Event does not leave an empty seventh slot (and squeeze the rest).

        Full class names in the ternary so Tailwind's scanner keeps every
        `xl:grid-cols-*` it needs — a concatenated string would be purged.
      */}
      <div
        className={`grid grid-cols-2 gap-3 md:grid-cols-3 [&>*]:h-full ${
          kpiTileCount <= 4
            ? 'xl:grid-cols-4'
            : kpiTileCount === 5
              ? 'xl:grid-cols-5'
              : kpiTileCount === 6
                ? 'xl:grid-cols-6'
                : 'xl:grid-cols-7'
        }`}
      >
        <KpiTile
          label="Active Members"
          icon={<TeamOutlined />}
          value={kpis ? kpis.active_members.value.toLocaleString('en-IN') : '—'}
          delta={kpis?.active_members.delta_pct}
          href="/members?status=ACTIVE"
          loading={kpis === undefined}
          error={kpis === null}
          onRetry={loadFigures}
        />

        <KpiTile
          label="Overdue Invoices"
          icon={<FileTextOutlined />}
          value={kpis ? formatMoney(String(kpis.overdue_amount.value)) : '—'}
          delta={kpis?.overdue_amount.delta_pct}
          /* A rise in money owed is bad news, so the colour flips while the
             arrow still follows the number. */
          invertDelta
          hint={
            kpis
              ? `${kpis.overdue_invoice_count} ${kpis.overdue_invoice_count === 1 ? 'invoice' : 'invoices'}`
              : undefined
          }
          href="/billing/invoices"
          loading={kpis === undefined}
          error={kpis === null}
          onRetry={loadFigures}
        />

        <KpiTile
          label="Collected"
          icon={<FileTextOutlined />}
          value={kpis ? formatMoney(String(kpis.collected.value)) : '—'}
          delta={kpis?.collected.delta_pct}
          href="/billing/payments"
          loading={kpis === undefined}
          error={kpis === null}
          onRetry={loadFigures}
        />

        <KpiTile
          label="Open Applications"
          icon={<SolutionOutlined />}
          value={kpis ? String(kpis.open_applications.value) : '—'}
          /* No delta ever on this one: it is a queue as it stands, and last
             month's queue tells nobody anything they can act on. */
          hint={
            kpis && kpis.stale_applications > 0
              ? `${kpis.stale_applications} waiting over 14 days`
              : undefined
          }
          href="/applications"
          loading={kpis === undefined}
          error={kpis === null}
          onRetry={loadFigures}
        />

        {/* Next Event tile hidden at the client's request. A flag rather than a
            comment block: the card carries a JSX comment of its own, and one
            comment inside another closes the outer one early. The flag also keeps
            the markup type-checking while it is off. */}
        {SHOW_NEXT_EVENT ? (
          <Card className="h-full">
            <span className="text-supporting text-fg-muted">Next Event</span>
            {nextEvent ? (
              <>
                <Link
                  to={`/events/${nextEvent.id}`}
                  className="mt-1 block text-title-secondary text-fg no-underline hover:underline"
                >
                  {nextEvent.title}
                </Link>
                <p className="m-0 mt-1 text-12 text-fg-muted">
                  {formatDate(nextEvent.start_at)}
                  {nextEvent.city ? ` · ${nextEvent.city}` : ''}
                </p>
                <p className="m-0 mt-1 text-12 text-fg">
                  {/* Seats LEFT, not seats taken: the number anybody asks about is
          how many are still available. Unlimited says so rather than
          showing a misleading figure. */}
                  {nextEvent.capacity === null
                    ? `${nextEvent.booked} booked · no seat limit`
                    : `${Math.max(0, nextEvent.capacity - nextEvent.booked)} / ${nextEvent.capacity} seats left`}
                </p>
              </>
            ) : (
              <p className="m-0 mt-2 text-supporting text-fg-muted">
                {kpis === undefined ? 'Loading…' : 'Nothing scheduled.'}
              </p>
            )}
          </Card>
        ) : null}

        {/* The queues this admin may act on, in the same row as the figures.
            The server returns only the tiles their permissions allow, so the
            row is shorter for a narrower role rather than showing dead cards. */}
        {SHOW_QUEUE_BOARD
          ? visible.map((queue) => (
              <QueueCard key={queue.key} queue={queue} count={countFor(queue)} />
            ))
          : null}
      </div>

      {SHOW_QUEUE_BOARD ? (
        <>
          {/* Said once, and only when there is genuinely nothing: the figures
              above still render, so this explains the missing queues rather
              than standing in for an empty screen. */}
          {visible.length === 0 ? (
            <Card flush>
              <EmptyState
                icon={<SafetyOutlined />}
                title="No queues are assigned to your role"
                description="Your account is active but its role does not include any of the work queues. A super admin can change that under Configure → Staff accounts."
              />
            </Card>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-3 [&>*]:h-full">
            <div className="xl:col-span-2">
              <ChartCard
                title="Membership Trend"
                description="Headcount at each month end, with joins and lapses — last 12 months"
                loading={charts === undefined}
                error={charts === null}
                onRetry={loadFigures}
                empty={charts?.membership_trend.length === 0}
              >
                {charts ? <MembershipTrendChart data={charts.membership_trend} /> : null}
              </ChartCard>
            </div>

            <ChartCard
              title="Top Members"
              description="Share of total membership tenure"
              loading={charts === undefined}
              error={charts === null}
              onRetry={loadFigures}
              empty={charts?.top_members.length === 0}
              emptyMessage="No membership terms have run yet, so there is no tenure to divide."
            >
              {charts ? (
                <TopMembersDonut
                  members={charts.top_members}
                  otherSharePct={charts.other_share_pct}
                />
              ) : null}
            </ChartCard>

            <ChartCard
              title="Upcoming Events"
              description="The next few published events"
              loading={charts === undefined}
              error={charts === null}
              onRetry={loadFigures}
              empty={charts?.upcoming_events.length === 0}
              emptyMessage="Nothing is scheduled. A published event appears here as soon as it has a date."
            >
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {(charts?.upcoming_events ?? []).map((event) => (
                  <li key={event.id} className="flex min-w-0 flex-col">
                    <Link
                      to={`/events/${event.id}`}
                      className="truncate text-supporting text-fg no-underline hover:underline"
                    >
                      {event.title}
                    </Link>
                    <span className="text-12 text-fg-muted">
                      {formatDate(event.start_at)}
                      {event.city ? ` · ${event.city}` : ''}
                      {event.capacity === null
                        ? ` · ${event.booked} booked`
                        : ` · ${Math.max(0, event.capacity - event.booked)} / ${event.capacity} seats left`}
                    </span>
                  </li>
                ))}
              </ul>
            </ChartCard>
            <div className="xl:col-span-2">
              <ChartCard
                title="Revenue Overview"
                description="Invoiced against received, for the selected period"
                loading={charts === undefined}
                error={charts === null}
                onRetry={loadFigures}
                empty={charts?.revenue.buckets.every(
                  (b) => b.billed === '0' && b.collected === '0',
                )}
                emptyMessage="No invoices were raised and no payments landed in this period."
              >
                {charts ? (
                  <>
                    {/* The four figures the chart is a picture of. Above it, so a
                        reader who wants the number does not have to read a bar. */}
                    <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        ['Total Billed', charts.revenue.billed],
                        ['Total Collected', charts.revenue.collected],
                        ['Pending', charts.revenue.pending],
                        ['Refunded', charts.revenue.refunded],
                      ].map(([label, amount]) => (
                        <div key={label} className="flex flex-col">
                          <span className="text-11 uppercase tracking-[0.04em] text-fg-muted">
                            {label}
                          </span>
                          <span className="tabular text-supporting font-medium text-fg">
                            {formatMoney(String(amount))}
                          </span>
                        </div>
                      ))}
                    </div>
                    <RevenueChart buckets={charts.revenue.buckets} grain={charts.revenue.grain} />
                  </>
                ) : null}
              </ChartCard>
            </div>
          </div>

          {/*
            Permissions footnote hidden at the client's request.

            It said, for a super admin, that every check is bypassed and each
            bypass is recorded — true, and still true: the bypass is still
            audited. Only the line is gone.

            <p className="m-0 mt-3 text-12 text-fg-subtle">
            {isSuperAdmin
            ? 'Signed in as a super admin — every permission check is bypassed and each bypass is recorded in the audit log.'
            : `${permissions.length} permissions held.`}
            </p>
          */}
        </>
      ) : null}
    </div>
  );
};

export default Dashboard;
