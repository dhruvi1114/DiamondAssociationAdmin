import { DatePicker, Form, Input, Switch } from 'antd';
import dayjs from 'dayjs';
import { Lock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  ConfirmDialog,
  Drawer,
  FieldLabel,
  FormSelect,
  MoneyText,
  NumberInput,
} from '@/components/ui';
import {
  CYCLES,
  cycleMonths,
  type BillingCycle,
  type CreateStructureBody,
  type FeePlan,
  type FeeStructure,
  type PriceScope,
} from '@/services/feePlansService';

/**
 * One grid, for both publishing a price list and changing one.
 *
 * Create and edit were briefly two screens, and they should not be: the thing
 * being edited is the same four rows, and an admin who has published once
 * already knows this layout. Splitting them also split the completeness rule,
 * which is the rule this whole redesign exists to enforce — a switched-on cycle
 * cannot be saved without a name, a joining price and a renewal price, and that
 * has to be true the second time as much as the first.
 *
 * It also removes the need for a separate "add plan" affordance. An unpublished
 * cycle is a row with its switch off; publishing it is turning the switch on.
 *
 * The footer is the versioning rule (spec §7) expressed as which buttons exist:
 *
 *   no amount changed, or nothing billed  ->  [ Save ]
 *   an amount changed on a billed plan    ->  [ New members only ] [ Apply to everyone ]
 *
 * A price somebody has paid is the record of what they were charged, so it is
 * never written over — it is closed, and a new row takes its place. The two
 * buttons are the only thing the admin has to decide: whether the members on the
 * old price come with it.
 */

interface RowDraft {
  cycle: BillingCycle;
  months: number;
  label: string;
  live: boolean;
  name: string;
  amount: number | null;
  renewal_amount: number | null;
  tax_rate: number;
  /** The live plan this row started from, when editing. Null for a new cycle. */
  source: FeePlan | null;
}

const money = (v: number | null): string => Number(v ?? 0).toFixed(2);

const blankRows = (): RowDraft[] =>
  CYCLES.map((c) => ({
    cycle: c.value,
    months: c.months,
    label: c.label,
    live: false,
    name: '',
    amount: null,
    renewal_amount: null,
    tax_rate: 18,
    source: null,
  }));

const rowsFrom = (structure: FeeStructure): RowDraft[] =>
  blankRows().map((row) => {
    const plan = structure.plans.find((p) => p.billing_cycle === row.cycle && p.is_active);
    if (!plan) return row;

    return {
      ...row,
      live: true,
      name: plan.name,
      amount: Number(plan.amount),
      renewal_amount: Number(plan.renewal_amount),
      tax_rate: Number(plan.tax_rate),
      source: plan,
    };
  });

export interface StructureFormDrawerProps {
  open: boolean;
  /** Null creates; a structure edits it. */
  structure: FeeStructure | null;
  onCancel: () => void;
  onSubmit: (body: CreateStructureBody, scope?: PriceScope) => Promise<void>;
  /** Every structure, for "Copy from" and for the live-cycle clash guard. */
  structures: FeeStructure[];
  saving: boolean;
}

export const StructureFormDrawer = ({
  open,
  structure,
  onCancel,
  onSubmit,
  structures,
  saving,
}: StructureFormDrawerProps) => {
  const editing = structure !== null;

  const [name, setName] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(dayjs());
  const [copyFrom, setCopyFrom] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState<RowDraft[]>(blankRows);
  /** Which button was pressed, held while the confirmation is on screen. */
  const [pendingScope, setPendingScope] = useState<PriceScope | null>(null);

  useEffect(() => {
    if (!open) return;
    setCopyFrom(undefined);
    setPendingScope(null);
    if (structure) {
      setName(structure.name);
      setRows(rowsFrom(structure));
    } else {
      setName('');
      setRows(blankRows());
    }
    setEffectiveFrom(dayjs());
  }, [open, structure]);

  const applyCopy = (structureId: string) => {
    setCopyFrom(structureId);
    const source = structures.find((s) => s.id === structureId);
    if (!source) return;
    setRows(rowsFrom({ ...source, plans: source.plans.map((p) => ({ ...p, is_active: true })) }));
  };

  const patch = (cycle: BillingCycle, next: Partial<RowDraft>) =>
    setRows((prev) => prev.map((r) => (r.cycle === cycle ? { ...r, ...next } : r)));

  const liveRows = rows.filter((r) => r.live);

  /*
    Which cycles another LIVE structure already holds. Only relevant when
    creating: editing a structure cannot clash with itself.
  */
  const occupied = useMemo(() => {
    const map = new Map<BillingCycle, string>();
    structures
      .filter((s) => s.is_active && s.id !== structure?.id)
      .forEach((s) =>
        s.plans
          .filter((p) => p.is_active)
          .forEach((p) => {
            if (!map.has(p.billing_cycle)) map.set(p.billing_cycle, s.name);
          }),
      );

    return map;
  }, [structures, structure]);

  const clashes = liveRows
    .filter((r) => occupied.has(r.cycle))
    .map((r) => ({ label: r.label, structure: occupied.get(r.cycle)! }));

  /**
   * Rows whose amount moved on a plan somebody has already paid. These are the
   * rows that will fork rather than be written over, and they are the reason
   * the footer changes shape.
   */
  const forking = rows.filter(
    (r) =>
      r.live &&
      r.source !== null &&
      r.source.is_billed &&
      (money(r.amount) !== Number(r.source.amount).toFixed(2) ||
        money(r.renewal_amount) !== Number(r.source.renewal_amount).toFixed(2)),
  );

  /**
   * Everyone whose renewal price this save would change, in either mode.
   *
   * Editing catches it through `forking` — a billed plan whose amount moved.
   * Creating catches it a different way and it is the case that was missed: after
   * D-3 an admin changes prices by retiring the old list and publishing a new
   * one, and at that moment nobody has been asked whether the members left on
   * the retired list come along. Without this they would sit in limbo, priced by
   * a rule nobody chose.
   */
  const moving = useMemo(
    () =>
      liveRows.flatMap((row) => {
        let holders: FeePlan[];
        if (editing) {
          const src = row.source;
          holders = src && src.is_billed && src.member_count > 0 ? [src] : [];
        } else {
          /* Creating, so there is no structure of our own to exclude: every plan
             anywhere that still holds members on this cycle is superseded. */
          holders = structures
            .flatMap((other) => other.plans)
            .filter((p) => p.billing_cycle === row.cycle && p.member_count > 0);
        }

        if (holders.length === 0) return [];

        const to = money(row.renewal_amount);
        /* The price they are on today is the most recent one that still holds members. */
        const [latest] = [...holders]
          .sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1))
          .reverse();
        const from = Number(latest!.renewal_amount).toFixed(2);
        if (from === to) return [];

        return [
          {
            cycle: row.cycle,
            label: row.label,
            members: holders.reduce((n, p) => n + p.member_count, 0),
            from,
            to,
          },
        ];
      }),
    [liveRows, editing, structures],
  );

  /**
   * Annualised, because the cycles are not comparable otherwise: ₹300 more per
   * month and ₹300 more per year are not the same decision, and a total that
   * added them would say nothing.
   */
  const annualDelta = moving.reduce(
    (sum, m) => sum + m.members * (Number(m.to) - Number(m.from)) * (12 / cycleMonths(m.cycle)),
    0,
  );

  const affected = moving.reduce((sum, m) => sum + m.members, 0);

  /*
    Cycles being switched OFF that members are sitting on. Unpublishing stops the
    plan being SOLD; it does not stop it billing, and the difference is not
    obvious from a switch. Saying so here is cheaper than explaining it to a
    member who was told the plan no longer exists.
  */
  const unpublishing = rows.filter(
    (r) => !r.live && r.source !== null && r.source.member_count > 0,
  );

  const stranded = unpublishing.reduce((sum, r) => sum + (r.source?.member_count ?? 0), 0);

  /*
    Copying only makes sense when there is something to copy and this is a new
    list. Both the field and the column it occupies hang off this one answer.
  */
  const showCopyFrom = !editing && structures.length > 0;

  const blockedReason = useMemo(() => {
    if (!name.trim()) return 'Give the structure a name.';
    if (liveRows.length === 0) return 'Switch on at least one cycle.';
    if (clashes.length > 0) {
      const [first] = clashes;

      return `${first!.structure} is already live for ${first!.label}. Close or retire it before publishing another price for that cycle.`;
    }
    const incomplete = liveRows.find(
      (r) => !r.name.trim() || r.amount === null || r.renewal_amount === null,
    );
    if (incomplete) {
      return `${incomplete.label} is switched on but is missing a name, a join fee or a renewal fee.`;
    }

    return null;
  }, [name, liveRows, clashes]);

  const submit = async (scope?: PriceScope) => {
    if (blockedReason) return;
    await onSubmit(
      {
        name: name.trim(),
        effective_from: effectiveFrom.format('YYYY-MM-DD'),
        plans: liveRows.map((r) => ({
          billing_cycle: r.cycle,
          name: r.name.trim(),
          amount: money(r.amount),
          renewal_amount: money(r.renewal_amount),
          tax_rate: money(r.tax_rate),
        })),
      },
      scope,
    );
  };

  return (
    <Drawer
      open={open}
      onClose={onCancel}
      width={820}
      /*
        No close glyph. Cancel is a labelled button in the footer, and on a form
        an unlabelled X in the corner reads as "discard" to some and "close, keep
        my draft" to others. Esc and the mask still close it.
      */
      closable={false}
      title={
        <span className="text-title-primary text-fg">
          {editing ? `Edit ${structure.name}` : 'New fee structure'}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          {unpublishing.length > 0 ? (
            <Alert
              variant="warning"
              message={`${stranded} member${stranded === 1 ? '' : 's'} are on a cycle you are switching off`}
              description={
                <>
                  {unpublishing.map((r) => `${r.label} — ${r.source?.member_count}`).join(' · ')}.
                  Switching a cycle off removes it from the website and refuses new applications. It
                  does <strong>not</strong> stop billing: these members keep renewing from the same
                  price until a price change moves them.
                </>
              }
            />
          ) : null}

          {moving.length > 0 ? (
            <>
              <Button
                variant="secondary"
                disabled={blockedReason !== null || saving}
                {...(blockedReason ? { disabledReason: blockedReason } : {})}
                onClick={() => setPendingScope('NEW_MEMBERS_ONLY')}
              >
                New members only
              </Button>
              <Button
                variant="primary"
                disabled={blockedReason !== null || saving}
                {...(blockedReason ? { disabledReason: blockedReason } : {})}
                onClick={() => setPendingScope('ALL_MEMBERS')}
              >
                Apply to everyone
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              loading={saving}
              disabled={blockedReason !== null}
              {...(blockedReason ? { disabledReason: blockedReason } : {})}
              onClick={() => submit()}
            >
              {editing ? 'Save' : 'Publish'}
            </Button>
          )}
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        <Form layout="vertical" requiredMark={false}>
          {/*
            Name, source and start date on one line: three short fields that are
            all answered before the grid below is touched.

            Two columns when "Copy From" is not offered — editing a structure, or
            publishing the very first one. Held at three, that row rendered the
            two remaining fields at the far edges with a field's worth of nothing
            between them.
          */}
          <div
            className={`grid grid-cols-1 gap-x-4 ${
              showCopyFrom ? 'md:grid-cols-3' : 'md:grid-cols-2'
            }`}
          >
            <Form.Item label="Structure Name" className="min-w-0">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Membership 2026"
              />
            </Form.Item>

            {showCopyFrom ? (
              <Form.Item
                label={
                  <FieldLabel
                    label="Copy From"
                    help="Fills the grid from an existing list, so only the prices that moved need retyping."
                  />
                }
                className="min-w-0"
              >
                <FormSelect
                  value={copyFrom}
                  placeholder="Start from scratch"
                  allowClear
                  onChange={(v) => (v ? applyCopy(String(v)) : setRows(blankRows()))}
                  options={structures.map((s) => ({ value: s.id, label: s.name }))}
                />
              </Form.Item>
            ) : null}

            <Form.Item
              label={
                <FieldLabel
                  label={moving.length > 0 ? 'New Price Applies From' : 'Effective From'}
                  help={
                    moving.length > 0
                      ? 'The current price is closed the day before this date. Nothing already invoiced changes.'
                      : 'The date these prices start applying. A future date schedules them.'
                  }
                />
              }
              className="min-w-0"
            >
              <DatePicker
                className="w-full"
                value={effectiveFrom}
                allowClear={false}
                /* Today or later. A price list cannot start before today without
                   backdating what the website already showed and already billed. */
                disabledDate={(date) => date.isBefore(dayjs().startOf('day'))}
                onChange={(d) => setEffectiveFrom(d ?? dayjs())}
              />
            </Form.Item>
          </div>
        </Form>

        {/*
          The instruction rides in a `?` beside the heading rather than standing
          beside it. It is read once, on a first visit, and then skipped forever
          — and as standing prose it pushed the grid down on every open.
        */}
        <div className="mb-2">
          <FieldLabel
            label="Plans"
            help="Switch on a cycle to publish it. Name, join fee and renewal fee are then required."
            className="text-11 font-semibold uppercase tracking-[0.04em] text-fg-muted"
          />
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[112px_1fr_124px_124px_76px_56px] items-center gap-2 border-b border-border bg-surface-subtle px-3 py-2 text-11 font-semibold uppercase tracking-[0.04em] text-fg-muted">
            <span>Cycle</span>
            <span>Plan Name</span>
            <span>Join ₹</span>
            <span>Renewal ₹</span>
            <span>Tax %</span>
            <span>Live</span>
          </div>

          {rows.map((row) => {
            const willFork = forking.some((f) => f.cycle === row.cycle);

            return (
              <div
                key={row.cycle}
                className={`grid grid-cols-[112px_1fr_124px_124px_76px_56px] items-center gap-2 border-b border-border px-3 py-2 last:border-b-0 ${
                  row.live ? '' : 'bg-surface-subtle'
                }`}
              >
                <div>
                  <div className={row.live ? 'font-medium' : 'font-medium text-fg-muted'}>
                    {row.label}
                  </div>
                  <div className="flex items-center gap-1 text-12 text-fg-subtle">
                    {row.months} mo
                    {row.source?.is_billed ? (
                      <Lock size={11} strokeWidth={1.5} aria-label="Has been billed" />
                    ) : null}
                  </div>
                </div>

                <Input
                  value={row.name}
                  disabled={!row.live}
                  placeholder={row.live ? 'e.g. Best Value' : 'Not publishing'}
                  onChange={(e) => patch(row.cycle, { name: e.target.value })}
                />

                <NumberInput
                  value={row.amount}
                  disabled={!row.live}
                  precision={2}
                  onChange={(v) => patch(row.cycle, { amount: v })}
                />

                <NumberInput
                  value={row.renewal_amount}
                  disabled={!row.live}
                  precision={2}
                  onChange={(v) => patch(row.cycle, { renewal_amount: v })}
                />

                <NumberInput
                  value={row.tax_rate}
                  disabled={!row.live}
                  precision={2}
                  max={100}
                  onChange={(v) => patch(row.cycle, { tax_rate: v ?? 0 })}
                />

                <div className="flex">
                  <Switch
                    size="small"
                    checked={row.live}
                    onChange={(live) => patch(row.cycle, { live })}
                  />
                </div>

                {willFork ? (
                  <div className="col-span-6 pt-1 text-12 text-status-warning-fg">
                    {row.source?.member_count} member
                    {row.source?.member_count === 1 ? '' : 's'} paid{' '}
                    <MoneyText amount={row.source!.amount} currency={row.source!.currency} /> for
                    this plan. The old price is kept as a version; their invoices do not change.
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/*
          Pushed to the bottom of the body, above the footer. These are a verdict
          on the whole grid rather than the next thing to read after it, and
          sitting directly under the rows they read as more rows.
        */}
        <div className="mt-auto flex flex-col gap-3 pt-4">
          {clashes.length > 0 ? (
            <Alert
              variant="danger"
              message={`${clashes.length} cycle${clashes.length === 1 ? '' : 's'} already live elsewhere`}
              /* Short on purpose: the reader needs which cycle and what to do,
                 not the reasoning behind a rule they cannot change here. */
              description={`${clashes
                .map((c) => `${c.label} — ${c.structure}`)
                .join(' · ')}. Retire it, or close its end date, then publish this one.`}
            />
          ) : null}

          {/*
            Only one verdict at a time, and a clash outranks the rest.

            A clash refuses the save outright, so "1 plan will be live" beneath it
            was describing an outcome that could not happen — the screen
            contradicting itself in two banners a centimetre apart.
          */}
          {clashes.length > 0 ? null : moving.length > 0 ? (
            <Alert
              variant="warning"
              message={`${affected} member${affected === 1 ? '' : 's'} on a price this replaces`}
              description={
                <>
                  New price applies from {effectiveFrom.format('DD MMM YYYY')}.{' '}
                  <strong>Apply to everyone</strong> moves them onto it;{' '}
                  <strong>New members only</strong> leaves them where they are. Issued invoices
                  never change.
                </>
              }
            />
          ) : liveRows.length === 0 ? (
            <Alert
              variant="warning"
              message="Nothing will be published"
              description="Switch on at least one cycle, or nothing reaches the website."
            />
          ) : (
            <Alert
              variant="info"
              message={`${liveRows.length} plan${liveRows.length === 1 ? '' : 's'} will be live`}
              description={
                <>
                  {liveRows
                    .map((r) => `${r.label}${r.name.trim() ? ` · ${r.name.trim()}` : ''}`)
                    .join('  ·  ')}
                  {rows.length - liveRows.length > 0 ? (
                    <>
                      {'. '}
                      {rows
                        .filter((r) => !r.live)
                        .map((r) => r.label)
                        .join(', ')}{' '}
                      stays unpublished.
                    </>
                  ) : null}
                </>
              }
            />
          )}
        </div>
      </div>
      <ConfirmDialog
        open={pendingScope !== null}
        loading={saving}
        title={pendingScope === 'ALL_MEMBERS' ? 'Apply to everyone?' : 'New members only?'}
        confirmLabel={pendingScope === 'ALL_MEMBERS' ? 'Yes, apply to all' : 'Yes, freeze them'}
        onCancel={() => setPendingScope(null)}
        onConfirm={async () => {
          const scope = pendingScope;
          setPendingScope(null);
          if (scope) await submit(scope);
        }}
        description={
          <div className="flex flex-col gap-3">
            <p className="m-0">
              {pendingScope === 'ALL_MEMBERS' ? (
                <>
                  {affected} member{affected === 1 ? '' : 's'} move to the new renewal prices, from
                  their next renewal:
                </>
              ) : (
                <>
                  {affected} member{affected === 1 ? '' : 's'} stay on the price they are on. Only
                  new applicants see the new prices:
                </>
              )}
            </p>

            <div className="flex flex-col gap-1">
              {moving.map((m) => (
                <div key={m.cycle} className="flex items-baseline justify-between gap-4">
                  <span>
                    {m.label}
                    <span className="ml-2 text-fg-muted">
                      {m.members} member{m.members === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span
                    className={
                      pendingScope === 'ALL_MEMBERS' ? 'tabular-nums' : 'tabular-nums text-fg-muted'
                    }
                  >
                    <MoneyText amount={m.from} currency="INR" />
                    {pendingScope === 'ALL_MEMBERS' ? (
                      <>
                        {' → '}
                        <MoneyText amount={m.to} currency="INR" />
                      </>
                    ) : (
                      ' · unchanged'
                    )}
                  </span>
                </div>
              ))}
            </div>

            {pendingScope === 'ALL_MEMBERS' && annualDelta !== 0 ? (
              <p className="m-0 border-t border-border pt-2">
                {annualDelta > 0 ? 'Extra' : 'Reduced'} renewal revenue per year:{' '}
                <strong>
                  <MoneyText amount={Math.abs(annualDelta).toFixed(2)} currency="INR" />
                </strong>
              </p>
            ) : null}

            <p className="m-0 text-fg-muted">
              {pendingScope === 'ALL_MEMBERS'
                ? 'Nobody is charged today. Invoices already issued do not change, and nobody is back-charged the difference.'
                : 'This creates a second price list running alongside the new one. Reports will show who is on which.'}
            </p>
          </div>
        }
      />
    </Drawer>
  );
};

export default StructureFormDrawer;
