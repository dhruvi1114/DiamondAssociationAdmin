import { Form, Input } from 'antd';
import { Ban, Check, CircleSlash, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Card,
  ConfirmDialog,
  DataTable,
  DateCell,
  FilterDropdown,
  FilterGroup,
  Dialog,
  Highlight,
  MoneyText,
  MultiSelect,
  NotAvailable,
  PageHeader,
  RowActions,
  SearchInput,
  StatusChip,
  TextCell,
  toast,
} from '@/components/ui';
import { useConfirm } from '@/hooks/useConfirm';
import { usePermissions } from '@/hooks/usePermissions';
import RefundsService, {
  REFUND_STATUS,
  REFUND_STATUS_NAME,
  type RefundRow,
} from '@/services/refundsService';
import type { PaginationMeta } from '@/services/BaseService';

/**
 * A-5 — the refund queue.
 *
 * Nothing is raised here. A refund exists only because an event was cancelled,
 * and this screen is where somebody decides what happens to it next:
 *
 *     Requested ──approve──► Approved, not sent ──sent──► Sent
 *         │                          │
 *         └──reject──► Rejected      └──failed──► Failed
 *
 * Which actions a row offers comes from where it has got to, not from a menu of
 * everything the API can do. A refund already sent cannot be approved again, so
 * that row simply has no buttons — a disabled control the user has to hover to
 * understand is worse than nothing on a row that is finished.
 *
 * Amounts are never editable. The association refunds what it took, in full,
 * because a member whose event was cancelled did nothing to earn a deduction.
 */

interface ApiError {
  message: string;
  requestId?: string;
}

const asError = (err: unknown): ApiError =>
  typeof err === 'object' && err !== null && 'message' in err
    ? (err as ApiError)
    : { message: 'Something went wrong' };

const STATUS_OPTIONS = [
  { value: String(REFUND_STATUS.REQUESTED), label: 'Requested' },
  { value: String(REFUND_STATUS.PROCESSING), label: 'Approved, not sent' },
  { value: String(REFUND_STATUS.COMPLETED), label: 'Sent' },
  { value: String(REFUND_STATUS.FAILED), label: 'Failed' },
  { value: String(REFUND_STATUS.REJECTED), label: 'Rejected' },
];

interface RefundFilters {
  status: string[];
}

const EMPTY_FILTERS: RefundFilters = { status: [] };

/** Which of the four text-capturing decisions a drawer is currently asking about. */
type Prompt = { kind: 'reject' | 'complete' | 'fail'; refund: RefundRow } | null;

const PROMPTS = {
  reject: {
    title: 'Do not refund this',
    description:
      'The payer is told this reason. The payment goes back to Paid, because no money is leaving after all.',
    confirmLabel: 'Reject the refund',
    field: 'reason' as const,
    label: 'Reason',
    placeholder: 'They attended day one, which was delivered',
    required: 'Say why, so the payer knows where they stand',
    multiline: true,
  },
  complete: {
    title: 'Mark this refund as sent',
    description:
      'Only after the transfer has actually been made. The payer is emailed this reference to quote at their bank.',
    confirmLabel: 'Mark as sent',
    field: 'reference' as const,
    label: 'Bank Reference',
    placeholder: 'UTR123456789',
    required: 'The reference is what makes this checkable against a statement',
    // A reference is a code, not a sentence: one line, and no resize handle
    // inviting somebody to paste a paragraph into it.
    multiline: false,
  },
  fail: {
    title: 'Mark this refund as failed',
    description:
      'The transfer did not go through. The refund stays in the queue so somebody picks it up; the payer is not written to.',
    confirmLabel: 'Mark as failed',
    field: 'reason' as const,
    label: 'Failure Reason',
    placeholder: 'Account number rejected by the bank',
    required: 'Say what happened, so the next person knows what to fix',
    multiline: true,
  },
};

/**
 * The staff columns a page of refunds actually needs.
 *
 * `finalised_by` is one field holding whoever ended the refund; `status` says
 * whether that was a rejection, a send or a failure. Split into three columns
 * here so the header reads as the thing that happened — "Sent By" over a name
 * says more than "Finalised By" ever could — and each is offered only when a
 * row on this page has one, so a queue of fresh requests is not four columns of
 * N/A wide.
 */
const actorColumns = (rows: RefundRow[]) => {
  const finalisedIn = (status: number, title: string) =>
    rows.some((row) => row.status === status && row.finalised_by)
      ? [
          {
            title,
            dataIndex: 'finalised_by',
            width: 170,
            render: (_: unknown, row: RefundRow) =>
              row.status === status && row.finalised_by ? (
                <TextCell value={row.finalised_by} />
              ) : (
                <NotAvailable />
              ),
          },
        ]
      : [];

  return [
    ...(rows.some((row) => row.approved_by)
      ? [
          {
            title: 'Approved By',
            dataIndex: 'approved_by',
            width: 170,
            render: (value: string | null) =>
              value ? <TextCell value={value} /> : <NotAvailable />,
          },
        ]
      : []),
    ...finalisedIn(REFUND_STATUS.REJECTED, 'Rejected By'),
    ...finalisedIn(REFUND_STATUS.COMPLETED, 'Sent By'),
    ...finalisedIn(REFUND_STATUS.FAILED, 'Failed By'),
  ];
};

export const Refunds = () => {
  const { can } = usePermissions();
  const canManage = can('refund.manage');

  const [rows, setRows] = useState<RefundRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<RefundFilters>(EMPTY_FILTERS);

  const [prompt, setPrompt] = useState<Prompt>(null);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();

  const approval = useConfirm<RefundRow>();

  /*
    Read as a joined string, not an array. The array is a new object on every
    render, so a dependency on it re-runs the effect forever.
  */
  const statusKey = filters.status.join(',');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await RefundsService.list({
        page,
        limit: 20,
        // Server-side. A client filter over the fetched twenty cannot see the
        // refund on page four, which is exactly the one being looked for.
        ...(search ? { search } : {}),
        /*
          One status only. The API filters on a single code because a refund is
          looked for by exactly where it has got to — and the filter control is a
          MultiSelect so the question can widen later without the toolbar
          changing shape.
        */
        ...(statusKey ? { status: Number(statusKey.split(',')[0]) } : {}),
      });
      setRows(res.data);
      setPagination(res.pagination);
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, statusKey]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    A new query starts at page one. Staying on page four while the search cuts
    the list to two rows shows an empty table, which reads as "no matches".
  */
  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);

  const applyFilters = useCallback((next: RefundFilters) => {
    setFilters(next);
    // A new query starts at page one, or the filter empties a table the user is
    // sitting four pages into and it reads as "nothing matched".
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const activeFilterCount = useMemo(() => (filters.status.length > 0 ? 1 : 0), [filters]);

  const approve = useCallback(
    async (refund: RefundRow) => {
      try {
        await RefundsService.approve(refund.id);
        toast.success(`${refund.refund_number} approved`, {
          description: 'The payer has been told. Send the money, then mark it as sent.',
        });
        await load();
      } catch (err) {
        toast.error(asError(err).message);
      }
    },
    [load],
  );

  const submitPrompt = useCallback(async () => {
    if (!prompt) return;

    const values = (await form.validateFields()) as { reason?: string; reference?: string };

    setBusy(true);
    try {
      if (prompt.kind === 'reject') {
        await RefundsService.reject(prompt.refund.id, values.reason ?? '');
        toast.success(`${prompt.refund.refund_number} rejected`, {
          description: 'The payer has been told, with the reason.',
        });
      } else if (prompt.kind === 'complete') {
        await RefundsService.complete(prompt.refund.id, values.reference ?? '');
        toast.success(`${prompt.refund.refund_number} marked as sent`, {
          description: 'The payer has the reference to quote at their bank.',
        });
      } else {
        await RefundsService.fail(prompt.refund.id, values.reason ?? '');
        toast.success(`${prompt.refund.refund_number} marked as failed`);
      }

      setPrompt(null);
      form.resetFields();
      await load();
    } catch (err) {
      toast.error(asError(err).message);
    } finally {
      setBusy(false);
    }
  }, [prompt, form, load]);

  const openPrompt = useCallback(
    (kind: 'reject' | 'complete' | 'fail', refund: RefundRow) => {
      form.resetFields();
      setPrompt({ kind, refund });
    },
    [form],
  );

  const config = prompt ? PROMPTS[prompt.kind] : null;

  return (
    /*
      A full-height column, like every other list screen. Content-height, the
      card ends under the last row and the pagination floats there with it; the
      table only pins its footer to the bottom edge when it has a height to
      fill.
    */
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Refunds"
        actions={
          <>
            {/* Search first, then filters — narrow-the-list, reading left to right. */}
            <SearchInput
              value={search}
              onChange={onSearch}
              placeholder="Refund number, invoice number or payer"
            />

            <FilterDropdown<RefundFilters>
              value={filters}
              emptyValue={EMPTY_FILTERS}
              onApply={applyFilters}
              onClear={clearFilters}
              activeCount={activeFilterCount}
            >
              {(draft, setDraft) => (
                <FilterGroup label="Status">
                  <MultiSelect
                    value={draft.status}
                    placeholder="All statuses"
                    options={STATUS_OPTIONS}
                    onChange={(next) => setDraft((d) => ({ ...d, status: next.map(String) }))}
                  />
                </FilterGroup>
              )}
            </FilterDropdown>
          </>
        }
      />

      <Card flush className="min-h-0 flex-1">
        <DataTable<RefundRow>
          unit="refunds"
          serial
          rowKey="id"
          loading={loading}
          error={error}
          onRetry={() => void load()}
          pagination={pagination}
          onPageChange={setPage}
          dataSource={rows}
          filtered={Boolean(search) || activeFilterCount > 0}
          /* Clears both, or the button leaves the user staring at the same empty table. */
          onClearFilter={() => {
            onSearch('');
            clearFilters();
          }}
          emptyTitle="No refunds"
          emptyDescription="A refund appears here when an event is cancelled and somebody had already paid for a seat. Nothing is raised from this screen."
          columns={[
            /*
              One fact per column. Two facts stacked in a cell save width and
              cost the thing a table is for: you cannot sort, scan or compare
              down a column that holds two different kinds of value.
            */
            {
              title: 'Refund',
              dataIndex: 'refund_number',
              width: 150,
              render: (value: string) => (
                <span className="font-mono text-supporting text-fg">
                  <Highlight text={value} query={search} />
                </span>
              ),
            },
            {
              title: 'Invoice',
              dataIndex: ['payment', 'invoice_number'],
              width: 150,
              render: (_: unknown, row: RefundRow) => (
                <span className="font-mono text-supporting text-fg-muted">
                  <Highlight text={row.payment.invoice_number} query={search} />
                </span>
              ),
            },
            {
              title: 'Payer',
              dataIndex: ['payer', 'name'],
              width: 200,
              render: (_: unknown, row: RefundRow) => (
                <Highlight text={row.payer.name} query={search} />
              ),
            },
            {
              title: 'Payer Type',
              dataIndex: ['payer', 'kind'],
              width: 120,
              render: (_: unknown, row: RefundRow) => (
                <TextCell value={row.payer.kind === 'GUEST' ? 'Guest' : 'Member'} />
              ),
            },
            {
              title: 'Amount',
              dataIndex: 'amount',
              width: 140,
              align: 'right' as const,
              render: (value: string) => <MoneyText amount={value} />,
            },
            {
              title: 'Raised',
              dataIndex: 'createdAt',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              title: 'Sent',
              dataIndex: 'processed_at',
              width: 130,
              render: (value: string | null) =>
                value ? <DateCell value={value} /> : <NotAvailable />,
            },
            {
              title: 'Bank Reference',
              dataIndex: 'provider_refund_id',
              width: 170,
              render: (value: string | null) =>
                value ? (
                  <span className="font-mono text-supporting text-fg-muted">{value}</span>
                ) : (
                  <NotAvailable />
                ),
            },
            {
              title: 'Reason',
              dataIndex: 'reason',
              width: 240,
              render: (value: string | null) =>
                value ? <TextCell value={value} /> : <NotAvailable />,
            },
            ...actorColumns(rows),
            {
              /* No width: this column absorbs the slack. */
              title: 'Status',
              dataIndex: 'status',
              render: (value: number) => (
                <StatusChip domain="refund" status={REFUND_STATUS_NAME[value] ?? 'REQUESTED'} />
              ),
            },
            {
              title: 'Actions',
              // Four controls now show on every row, not one or two.
              width: 150,
              fixed: 'right' as const,
              render: (_: unknown, row: RefundRow) => (
                <RowActions
                  /*
                    Disabled, not hidden, when the refund is past that step. An
                    action that vanishes leaves the reader wondering whether it
                    exists at all; one that is visibly off says the control is
                    real and this row is simply past it. `hidden` stays for the
                    permission case — an action you may never take is not yours
                    to be told about.
                  */
                  actions={[
                    {
                      key: 'approve',
                      icon: <Check size={16} />,
                      label: 'Approve',
                      success: true,
                      hidden: !canManage,
                      disabled: row.status !== REFUND_STATUS.REQUESTED,
                      disabledReason: 'Only a refund still waiting on a decision can be approved.',
                      onClick: () => approval.ask(row),
                    },
                    {
                      key: 'reject',
                      icon: <Ban size={16} />,
                      label: 'Reject',
                      danger: true,
                      hidden: !canManage,
                      disabled: row.status !== REFUND_STATUS.REQUESTED,
                      disabledReason: 'Only a refund still waiting on a decision can be rejected.',
                      onClick: () => openPrompt('reject', row),
                    },
                    {
                      key: 'complete',
                      icon: <Send size={16} />,
                      label: 'Mark as sent',
                      success: true,
                      hidden: !canManage,
                      disabled: row.status !== REFUND_STATUS.PROCESSING,
                      disabledReason:
                        'Money can only be marked sent once the refund has been approved.',
                      onClick: () => openPrompt('complete', row),
                    },
                    {
                      key: 'fail',
                      icon: <CircleSlash size={16} />,
                      label: 'Mark as failed',
                      danger: true,
                      hidden: !canManage,
                      disabled: row.status !== REFUND_STATUS.PROCESSING,
                      disabledReason: 'Only an approved refund can have its transfer fail.',
                      onClick: () => openPrompt('fail', row),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      {/*
        Approving needs no text, so it is a confirmation rather than a form. It
        still asks: it emails the payer, and it is the step that says the money
        is going.
      */}
      <ConfirmDialog
        open={approval.target !== null}
        title={`Approve ${approval.target?.refund_number ?? 'this refund'}?`}
        description={`${approval.target?.payer.name ?? 'The payer'} is told the refund is approved and on its way. Send the money, then come back and mark it as sent.`}
        confirmLabel="Approve"
        loading={approval.busy}
        onCancel={approval.cancel}
        onConfirm={() => void approval.confirm(approve)}
      />

      {/*
        A dialog, not a drawer. Each of these asks for one line before an
        irreversible decision — that is a confirmation with a field in it, and a
        full-height drawer for a single input leaves most of the screen empty
        while hiding the row the decision is about.

        Reject, sent and failed share it: three near-identical dialogs would be
        three places for the same wording to drift.
      */}
      {config ? (
        <Dialog
          open
          title={config.title}
          description={config.description}
          /*
            Folded into the `?` beside the title. The sentence orients somebody
            doing this for the first time — it is not the thing being agreed to,
            and the dialog's own field is what the reader is here to fill in.
          */
          describeInTitle
          confirmLabel={config.confirmLabel}
          danger={prompt?.kind !== 'complete'}
          loading={busy}
          width={460}
          onConfirm={() => void submitPrompt()}
          onCancel={() => {
            setPrompt(null);
            form.resetFields();
          }}
        >
          <Form form={form} layout="vertical" requiredMark={false}>
            <Form.Item
              name={config.field}
              label={config.label}
              rules={[{ required: true, message: config.required }]}
            >
              {config.multiline ? (
                <Input.TextArea rows={3} placeholder={config.placeholder} />
              ) : (
                <Input placeholder={config.placeholder} />
              )}
            </Form.Item>
          </Form>
        </Dialog>
      ) : null}
    </div>
  );
};

export default Refunds;
