import { Tooltip } from 'antd';
import dayjs from 'dayjs';
import { ChevronDown, ChevronRight, Lock, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  DateCell,
  Drawer,
  MoneyText,
  NotAvailable,
  StackedCell,
  StatusChip,
  TextCell,
} from '@/components/ui';
import { CYCLES, type FeePlan, type FeeStructure } from '@/services/feePlansService';

/**
 * A price list, read.
 *
 * Nothing here changes anything. That is the point: this is the surface someone
 * opens to answer "what does membership cost, and what will it cost that member
 * next year", and a screen full of per-row Edit buttons invites a change to be
 * made while the question is still being asked. One Edit, in the footer, opens
 * the form.
 *
 * The four cycles always occupy their rows whether published or not. A gap you
 * can see is a gap someone fills; a gap you cannot see is why this application
 * currently has three joining prices and no live renewal price at all.
 */

export interface StructureDetailDrawerProps {
  open: boolean;
  structure: FeeStructure | null;
  onClose: () => void;
  onEdit: () => void;
  canManage: boolean;
}

/** Live today, scheduled, closed by its own end date, or retired by an admin. */
const planState = (plan: FeePlan): string => {
  if (!plan.is_active) return 'INACTIVE';
  const today = dayjs().startOf('day');
  /*
    Compared as calendar days, not instants. The API sends a DATE as
    "2026-09-11T00:00:00.000Z"; dayjs reads that in the browser's zone (IST),
    i.e. 05:30 on the 11th — after today's midnight — so a plan starting TODAY
    showed as Scheduled all day.
  */
  const day = today.format('YYYY-MM-DD');
  if (plan.effective_from.slice(0, 10) > day) return 'SCHEDULED';
  if (plan.effective_to && plan.effective_to.slice(0, 10) < day) return 'CLOSED';

  return 'ACTIVE';
};

/** One of the four cycles, with the price live on it and whatever it replaced. */
interface CycleRow {
  cycle: (typeof CYCLES)[number];
  current: FeePlan | null;
  history: FeePlan[];
}

const withTax = (net: string, taxRate: string): string =>
  (Number(net) * (1 + Number(taxRate) / 100)).toFixed(2);

export const StructureDetailDrawer = ({
  open,
  structure,
  onClose,
  onEdit,
  canManage,
}: StructureDetailDrawerProps) => {
  const [historyOpen, setHistoryOpen] = useState<string[]>([]);

  const rows = useMemo(() => {
    const plans = structure?.plans ?? [];

    return CYCLES.map((cycle) => {
      const forCycle = plans.filter((p) => p.billing_cycle === cycle.value);
      const current = forCycle.find((p) => p.is_active) ?? null;
      const history = forCycle
        .filter((p) => p.id !== current?.id)
        .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));

      return { cycle, current, history };
    });
  }, [structure]);

  const missing = rows.filter((r) => !r.current).map((r) => r.cycle);

  const toggleHistory = (cycle: string) =>
    setHistoryOpen((prev) =>
      prev.includes(cycle) ? prev.filter((c) => c !== cycle) : [...prev, cycle],
    );

  if (!structure) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={900}
      /*
        No close glyph. Close is a labelled button in the footer, where the same
        decision is already offered — a bare X in the corner is a second way to
        do it that says less about what it does.
      */
      closable={false}
      title={
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate text-title-primary text-fg">{structure.name}</span>
          <StatusChip domain="fee" status={structure.is_active ? 'ACTIVE' : 'INACTIVE'} />
        </div>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            icon={<Pencil size={14} strokeWidth={1.5} />}
            onClick={onEdit}
            disabled={!canManage}
            disabledReason={canManage ? undefined : 'You do not have permission to change prices.'}
          >
            Edit
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {!structure.is_active ? (
          <Alert
            variant="info"
            message="This structure is retired"
            description="It is hidden from the website and rejected for new applications. Members already on these plans keep renewing from them until a price change moves them."
          />
        ) : null}

        {/*
          A real table, with the headers the columns need. It was a hand-built
          row layout, which meant four figures in a line and nothing above them
          saying which was the joining price and which the renewal — the one
          thing somebody opens this drawer to tell apart.
        */}
        {/*
          `Card flush` is what gives a table its border everywhere else in the
          app; without it this one floated on the drawer's own background.

          `h-auto` on the wrapper stops the table stretching: `DataTable` is
          built to fill a page and measures its container, so in a drawer body
          it grew a four-row table to the full height and left the empty space
          under Yearly.
        */}
        <Card flush className="flex-none">
          <DataTable<CycleRow>
            /*
              `scroll` overridden, and this is the whole reason the rows render.

              `DataTable` measures its container and hands AntD a fixed body
              height, which is what makes a full-page list scroll under a pinned
              header. In a drawer that container has no height to measure, the
              body came back as zero, and four rows rendered as none. Passing
              `x` alone leaves the height to the content — still enough for
              `fixed: 'right'` on Status, which only needs a horizontal scroll
              context.
            */
            scroll={{ x: 'max-content' }}
            rowKey={(row) => row.cycle.value}
            dataSource={rows}
            /*
              No `rowClassName` here to shade the unpublished rows: `DataTable`
              sets its own for the zebra banding, and passing one replaces it
              rather than adding to it. The chip and the "Not published" cells say
              the row is empty without needing a background to say it again.
            */
            columns={[
              {
                title: 'Cycle',
                key: 'cycle',
                width: 120,
                /*
                  The month count on hover, not under the name. "1 mo" beneath
                  "Monthly" restates it, and a second line in every row of the
                  first column set the height of the whole table for nothing.
                */
                render: (_: unknown, row: CycleRow) => (
                  <Tooltip title={`${row.cycle.months} month${row.cycle.months === 1 ? '' : 's'}`}>
                    <span className={row.current ? 'text-fg' : 'text-fg-muted'}>
                      {row.cycle.label}
                    </span>
                  </Tooltip>
                ),
              },
              {
                /* No width — this column absorbs the slack. Status cannot: a pinned
                   column needs a width for the table to reserve room for it. */
                title: 'Plan Name',
                key: 'name',
                render: (_: unknown, row: CycleRow) =>
                  row.current ? <TextCell value={row.current.name} /> : <NotAvailable />,
              },
              {
                title: 'Join Amount',
                key: 'join',
                width: 170,
                render: (_: unknown, row: CycleRow) =>
                  row.current ? (
                    <StackedCell
                      primary={
                        <MoneyText amount={row.current.amount} currency={row.current.currency} />
                      }
                      /* No "join ·" prefix — the column heading already says so. */
                      secondary={
                        <>
                          <MoneyText
                            amount={withTax(row.current.amount, row.current.tax_rate)}
                            currency={row.current.currency}
                          />{' '}
                          inc.
                        </>
                      }
                    />
                  ) : (
                    <NotAvailable />
                  ),
              },
              {
                title: 'Renewal Amount',
                key: 'renewal',
                width: 180,
                render: (_: unknown, row: CycleRow) =>
                  row.current ? (
                    <StackedCell
                      primary={
                        <MoneyText
                          amount={row.current.renewal_amount}
                          currency={row.current.currency}
                        />
                      }
                      secondary={
                        <>
                          <MoneyText
                            amount={withTax(row.current.renewal_amount, row.current.tax_rate)}
                            currency={row.current.currency}
                          />{' '}
                          inc.
                        </>
                      }
                    />
                  ) : (
                    <NotAvailable />
                  ),
              },
              {
                /* The rate itself, not the tax in rupees. The inclusive figure is
                   already under each amount; what this column adds is the rate
                   those were calculated at, which is the thing that changes. */
                title: 'Tax',
                key: 'tax',
                width: 90,
                render: (_: unknown, row: CycleRow) =>
                  row.current ? (
                    <TextCell value={`${Number(row.current.tax_rate)}%`} />
                  ) : (
                    <NotAvailable />
                  ),
              },
              {
                title: 'Status',
                key: 'status',
                width: 140,
                // Pinned: it is the column the whole table is read for, and it was
                // the first thing to slide out of view once Tax was added.
                fixed: 'right' as const,
                render: (_: unknown, row: CycleRow) =>
                  row.current ? (
                    <StatusChip domain="fee" status={planState(row.current)} />
                  ) : (
                    <StatusChip domain="fee" status="UNPUBLISHED" />
                  ),
              },
            ]}
          />
        </Card>

        {/*
          Superseded prices, per cycle. Kept out of the table: they answer a
          different question — what a member already on this list is paying —
          and folding them in would put two kinds of row under one set of
          headers.
        */}
        {rows.some((row) => row.history.length > 0) ? (
          <div className="flex flex-col gap-2">
            {rows
              .filter((row) => row.history.length > 0)
              .map(({ cycle, history }) => (
                <div key={cycle.value} className="rounded-lg border border-border px-3 py-2">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-12 text-fg-muted hover:text-fg"
                    onClick={() => toggleHistory(cycle.value)}
                  >
                    {historyOpen.includes(cycle.value) ? (
                      <ChevronDown size={14} strokeWidth={1.5} />
                    ) : (
                      <ChevronRight size={14} strokeWidth={1.5} />
                    )}
                    {cycle.label} price history
                    <Badge tone="neutral">{String(history.length)}</Badge>
                  </button>

                  {historyOpen.includes(cycle.value) ? (
                    <div className="mt-2 flex flex-col gap-2 pl-6">
                      {history.map((old) => (
                        <div key={old.id} className="flex flex-wrap items-center gap-3 text-12">
                          <Lock size={13} strokeWidth={1.5} className="text-fg-subtle" />
                          <span className="w-[170px]">
                            <MoneyText amount={old.amount} currency={old.currency} /> /{' '}
                            <MoneyText amount={old.renewal_amount} currency={old.currency} />
                          </span>
                          <span className="w-[180px] text-fg-muted">
                            <DateCell value={old.effective_from} /> →{' '}
                            <DateCell value={old.effective_to} />
                          </span>
                          <StatusChip domain="fee" status={planState(old)} />
                          <span className="text-fg-muted">
                            {old.member_count} member{old.member_count === 1 ? '' : 's'} still on
                            this price
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
          </div>
        ) : null}

        {/*
          Pushed to the bottom of the body, above the footer. It is a note about
          the whole list rather than the next thing to read after the table, and
          sitting directly under the rows it read as a fifth row.
        */}
        {missing.length > 0 ? (
          <Alert
            className="mt-auto"
            variant="warning"
            message={`${missing.length} cycle${missing.length === 1 ? '' : 's'} not published`}
            description={`${missing.map((c) => c.label).join(', ')} ${
              missing.length === 1 ? 'does' : 'do'
            } not appear on the website. Switch ${
              missing.length === 1 ? 'it' : 'them'
            } on from Edit, or leave ${
              missing.length === 1 ? 'it' : 'them'
            } unpublished on purpose.`}
          />
        ) : null}
      </div>
    </Drawer>
  );
};

export default StructureDetailDrawer;
