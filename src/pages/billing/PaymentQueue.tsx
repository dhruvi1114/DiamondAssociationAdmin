import { Ban, CheckCircle2, Eye, Paperclip } from 'lucide-react';
import { Form, Input } from 'antd';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  DateCell,
  FilterDropdown,
  FilterGroup,
  FormDrawer,
  MoneyText,
  MultiSelect,
  NotAvailable,
  PageHeader,
  RowActions,
  SearchInput,
  StatusChip,
  Tabs,
  TextCell,
  toast,
} from '@/components/ui';
import DocumentPreviewDialog from '@/components/DocumentPreviewDialog';
import { useConfirm } from '@/hooks/useConfirm';
import { usePermissions } from '@/hooks/usePermissions';
import EventService, {
  SUBMISSION_METHOD,
  SUBMISSION_STATUS,
  type PaymentSubmissionRow,
} from '@/services/eventService';
import type { PaginationMeta } from '@/services/BaseService';

/**
 * A-25 — payments people say they have made, waiting to be checked.
 *
 * This screen stands in for a payment gateway. Until one exists, somebody has to
 * look at the bank statement and say yes or no, and this is where that happens.
 *
 * Oldest first, because it is a work queue: newest-first buries the claim that
 * has been waiting longest, which is the one somebody is chasing.
 */

interface ApiError {
  message: string;
  requestId?: string;
}

const asError = (err: unknown): ApiError => {
  const e = err as { message?: string; requestId?: string };

  return { message: e?.message ?? 'Something went wrong', requestId: e?.requestId };
};

const STATUS_NAME: Record<number, string> = {
  [SUBMISSION_STATUS.PENDING]: 'PENDING',
  [SUBMISSION_STATUS.VERIFIED]: 'VERIFIED',
  [SUBMISSION_STATUS.REJECTED]: 'REJECTED',
};

const STATUS_OPTIONS = [
  { value: String(SUBMISSION_STATUS.PENDING), label: 'Waiting to be checked' },
  { value: String(SUBMISSION_STATUS.VERIFIED), label: 'Confirmed' },
  { value: String(SUBMISSION_STATUS.REJECTED), label: 'Could not be found' },
];

/* Built from the label map, so a method added there cannot be missed here. */
const METHOD_OPTIONS = Object.entries(SUBMISSION_METHOD).map(([value, label]) => ({
  value,
  label,
}));

interface ClaimFilters {
  status: string[];
  method: string[];
}

const EMPTY_FILTERS: ClaimFilters = { status: [], method: [] };

const ClaimsTable = ({
  pendingOnly,
  onRegisterSearch,
}: {
  pendingOnly: boolean;
  onRegisterSearch?: (node: ReactNode) => void;
}) => {
  const { can } = usePermissions();
  const canDecide = can('payment.record');

  const [rows, setRows] = useState<PaymentSubmissionRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ClaimFilters>(EMPTY_FILTERS);

  const verify = useConfirm<PaymentSubmissionRow>();
  const [rejecting, setRejecting] = useState<PaymentSubmissionRow | null>(null);
  /** Which receipt is being fetched, so only that row's button spins. */
  const [downloading, setDownloading] = useState<string | null>(null);
  /**
   * The claim whose receipt the eye opened. Reading it does not decide
   * anything — Approve/Reject inside the preview still go through the same
   * `verify`/`rejecting` flow the row actions use, so a decision made from in
   * here is indistinguishable from one made from the row.
   */
  const [preview, setPreview] = useState<PaymentSubmissionRow | null>(null);

  const openProof = useCallback(async (row: PaymentSubmissionRow) => {
    setDownloading(row.id);
    try {
      await EventService.downloadPaymentProof(row.id, row.reference_no);
    } catch {
      toast.error('Could not open that receipt');
    } finally {
      setDownloading(null);
    }
  }, []);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await EventService.listPaymentSubmissions({
        page,
        limit: 20,
        /*
          Matched by the server across every claim. The reference is the point:
          it is copied off a bank statement, and the claim it belongs to is
          rarely on the page you happen to be looking at.
        */
        ...(search ? { search } : {}),
        /*
          The pending tab IS the status filter, so the panel's status group is
          hidden there rather than merely ignored. On the all-claims tab an
          unset filter still has to name all three, because the API defaults a
          missing status to "pending only".
        */
        status: pendingOnly
          ? String(SUBMISSION_STATUS.PENDING)
          : filters.status.length > 0
            ? filters.status.join(',')
            : `${SUBMISSION_STATUS.PENDING},${SUBMISSION_STATUS.VERIFIED},${SUBMISSION_STATUS.REJECTED}`,
        ...(filters.method.length > 0 ? { method: filters.method.join(',') } : {}),
      });

      setRows(res.data.rows ?? []);
      setPagination(res.pagination);
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, [page, pendingOnly, search, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  /* A new query starts at page one, or the filter's three matches land on a page
     four that no longer exists and the table reads as "nothing matched". */
  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);

  const applyFilters = useCallback((next: ClaimFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const clearEverything = useCallback(() => {
    setSearch('');
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const activeFilterCount =
    (pendingOnly || filters.status.length === 0 ? 0 : 1) + (filters.method.length > 0 ? 1 : 0);

  const filtered = search.length > 0 || activeFilterCount > 0;

  useEffect(() => {
    onRegisterSearch?.(
      <>
        <SearchInput
          value={search}
          onChange={onSearch}
          label="Search payment claims"
          placeholder="Reference, invoice, booking ref or payer…"
          className="w-[280px]"
        />

        <FilterDropdown<ClaimFilters>
          value={filters}
          emptyValue={EMPTY_FILTERS}
          onApply={applyFilters}
          onClear={clearFilters}
          activeCount={activeFilterCount}
        >
          {(draft, setDraft) => (
            <>
              {pendingOnly ? null : (
                <FilterGroup label="Status">
                  <MultiSelect
                    value={draft.status}
                    placeholder="Any status"
                    options={STATUS_OPTIONS}
                    onChange={(next) => setDraft((d) => ({ ...d, status: next.map(String) }))}
                  />
                </FilterGroup>
              )}

              <FilterGroup label="Method">
                <MultiSelect
                  value={draft.method}
                  placeholder="Any method"
                  options={METHOD_OPTIONS}
                  onChange={(next) => setDraft((d) => ({ ...d, method: next.map(String) }))}
                />
              </FilterGroup>
            </>
          )}
        </FilterDropdown>
      </>,
    );

    return () => onRegisterSearch?.(null);
  }, [
    search,
    onSearch,
    onRegisterSearch,
    filters,
    applyFilters,
    clearFilters,
    activeFilterCount,
    pendingOnly,
  ]);

  const submitRejection = useCallback(async () => {
    const values = await form.validateFields();

    if (!rejecting) return;

    setSaving(true);
    try {
      await EventService.rejectPayment(rejecting.id, values.reason);
      toast.success('Marked as not traced. The payer has been told, and their seats stay held.');
      // Opened from the preview: the decision is made, so the preview closes
      // with it rather than sitting open on a claim that no longer needs one.
      if (preview && preview.id === rejecting.id) setPreview(null);
      setRejecting(null);
      form.resetFields();
      await load();
    } catch (err) {
      toast.error(asError(err).message);
    } finally {
      setSaving(false);
    }
  }, [form, load, preview, rejecting]);

  /*
    A decision column is only worth its width once something on the page has been
    decided. On the queue of unchecked claims all four read "N/A" in every row.
    Confirmed and not-traced are judged separately: a page can hold one without
    the other.
  */
  const showVerified = rows.some((row) => row.verified_at);
  const showRejected = rows.some((row) => row.rejected_at);

  return (
    <>
      <Card flush className="min-h-0 flex-1">
        <DataTable<PaymentSubmissionRow>
          unit="claims"
          serial
          rowKey="id"
          loading={loading}
          error={error}
          onRetry={() => void load()}
          pagination={pagination}
          onPageChange={setPage}
          dataSource={rows}
          /* "Nothing matched" and "there is nothing here" need different words
             and lead to different next steps. */
          filtered={filtered}
          onClearFilter={clearEverything}
          emptyTitle={pendingOnly ? 'Nothing waiting to be checked' : 'No payment claims yet'}
          emptyDescription={
            pendingOnly
              ? 'A claim appears here when somebody tells us they have paid. Check it against the bank statement, then confirm or say you could not find it.'
              : 'Claims appear here when somebody pays an invoice by transfer and tells us the reference.'
          }
          columns={[
            {
              title: 'Paid By',
              dataIndex: 'paid_by',
              width: 190,
              render: (value: string | null) => (
                <TextCell value={value ?? 'Unknown'} width={166} query={search} />
              ),
            },
            {
              /* The bill being settled — its own column, not a subtitle. */
              title: 'Invoice',
              dataIndex: 'invoice_number',
              width: 160,
              render: (value: string | null) => (
                <TextCell value={value} width={136} query={search} />
              ),
            },
            {
              title: 'For',
              dataIndex: 'event_title',
              width: 200,
              render: (value: string | null) => (
                <TextCell value={value ?? 'Membership'} width={176} query={search} />
              ),
            },
            {
              /* Empty on a membership payment: there is no booking behind one. */
              title: 'Booking Ref',
              dataIndex: 'registration_code',
              width: 170,
              render: (value: string | null) => (
                <TextCell value={value} width={146} query={search} />
              ),
            },
            {
              /*
                The reference is what the person checking types into the bank's
                own search, so it is the widest thing here and never truncated
                into uselessness.
              */
              title: 'Reference',
              dataIndex: 'reference_no',
              width: 180,
              render: (value: string) => <TextCell value={value} width={156} query={search} />,
            },
            {
              /*
                The evidence itself, next to the number it backs.

                A claim is an assertion until somebody checks it, and the whole
                point of this queue is deciding that. Opening the receipt here
                answers most claims without leaving the screen; the bank portal
                is for the ones that look wrong.
              */
              title: 'Receipt',
              dataIndex: 'proof_path',
              width: 110,
              /*
                Download only. Looking at the receipt is an ACTION and lives in
                the Actions column with the two decisions it informs — this
                column answers "is there a file, and can I keep a copy".
              */
              render: (value: string | null, row: PaymentSubmissionRow) =>
                value ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Paperclip size={15} strokeWidth={1.5} />}
                    loading={downloading === row.id}
                    onClick={() => void openProof(row)}
                  >
                    View
                  </Button>
                ) : (
                  /*
                    Claims filed before receipts were required have none, and
                    they are exactly the ones a verifier must not mistake for
                    "the file failed to load".
                  */
                  <NotAvailable />
                ),
            },
            {
              /* How it was sent — it decides which statement you go and look in. */
              title: 'Method',
              dataIndex: 'method',
              width: 140,
              render: (value: number) => <TextCell value={SUBMISSION_METHOD[value]} width={116} />,
            },
            {
              /*
                Left-aligned, like every other column here. Right-alignment is
                for a column you total down; this is a queue of individual claims
                checked one at a time against a statement, never summed.
              */
              title: 'Amount',
              dataIndex: 'amount',
              width: 120,
              render: (value: string) => <MoneyText amount={value} />,
            },
            {
              title: 'Paid On',
              dataIndex: 'paid_on',
              width: 120,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              title: 'Claimed',
              dataIndex: 'createdAt',
              width: 120,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              /*
                The person who filed it, not the company it is billed to — on a
                member with several team logins those are different people, and
                the one to ring about a mistyped reference is the one who typed it.
              */
              title: 'Claimed By',
              dataIndex: 'claimed_by',
              width: 180,
              render: (value: string | null) => <TextCell value={value} width={156} />,
            },
            ...(showVerified
              ? [
                  {
                    title: 'Verified By',
                    dataIndex: 'verified_by',
                    width: 180,
                    render: (value: string | null) => <TextCell value={value} width={156} />,
                  },
                  {
                    title: 'Verified At',
                    dataIndex: 'verified_at',
                    width: 130,
                    render: (value: string | null) =>
                      value ? <DateCell value={value} /> : <NotAvailable />,
                  },
                ]
              : []),
            ...(showRejected
              ? [
                  {
                    title: 'Rejected By',
                    dataIndex: 'rejected_by',
                    width: 180,
                    render: (value: string | null) => <TextCell value={value} width={156} />,
                  },
                  {
                    title: 'Rejected At',
                    dataIndex: 'rejected_at',
                    width: 130,
                    render: (value: string | null) =>
                      value ? <DateCell value={value} /> : <NotAvailable />,
                  },
                ]
              : []),
            {
              title: 'Status',
              dataIndex: 'status',
              render: (value: number, row) =>
                value === SUBMISSION_STATUS.REJECTED && row.rejection_reason ? (
                  <StatusChip
                    domain="paymentSubmission"
                    status={STATUS_NAME[value] ?? 'PENDING'}
                    tooltip={row.rejection_reason}
                  />
                ) : (
                  <StatusChip domain="paymentSubmission" status={STATUS_NAME[value] ?? 'PENDING'} />
                ),
            },
            {
              title: 'Actions',
              width: 80,
              fixed: 'right' as const,
              render: (_: unknown, row: PaymentSubmissionRow) => {
                /*
                  Two different "no" answers, shown two different ways. Lacking
                  the permission hides the action outright. A claim that has
                  already been checked keeps both icons, disabled: an empty cell
                  beside a live one reads as a rendering fault, and says nothing
                  about which of the two it is.
                */
                const checked = row.status !== SUBMISSION_STATUS.PENDING;
                const checkedReason = 'This claim has already been checked.';

                return (
                  <RowActions
                    actions={[
                      /*
                        The eye leads, as it does on the document verification
                        drawer: you look before you decide, so the action that
                        shows you the receipt sits ahead of the two that act on
                        it. Never disabled by `checked` — reading a claim that
                        has already been settled is exactly how somebody checks
                        what a colleague did.
                      */
                      {
                        key: 'preview',
                        icon: <Eye size={16} strokeWidth={1.5} />,
                        label: 'Look at the receipt',
                        disabled: !row.proof_path,
                        ...(row.proof_path ? {} : { disabledReason: 'This claim has no receipt.' }),
                        onClick: () => setPreview(row),
                      },
                      {
                        key: 'verify',
                        icon: <CheckCircle2 size={16} strokeWidth={1.5} />,
                        label: 'Confirm this payment landed',
                        hidden: !canDecide,
                        disabled: checked,
                        ...(checked ? { disabledReason: checkedReason } : {}),
                        onClick: () => verify.ask(row),
                      },
                      {
                        key: 'reject',
                        icon: <Ban size={16} strokeWidth={1.5} />,
                        label: 'Could not find this payment',
                        danger: true,
                        hidden: !canDecide,
                        disabled: checked,
                        ...(checked ? { disabledReason: checkedReason } : {}),
                        onClick: () => setRejecting(row),
                      },
                    ]}
                  />
                );
              },
            },
          ]}
        />
      </Card>

      <ConfirmDialog
        open={verify.target !== null}
        title="Confirm this payment?"
        confirmLabel="Confirm"
        loading={verify.busy}
        description={
          verify.target
            ? `Check ${verify.target.reference_no} against the bank statement first. Confirming marks invoice ${verify.target.invoice_number} paid, issues a receipt, and confirms the booking — each attendee is emailed their own code. It cannot be undone from here.`
            : ''
        }
        onCancel={verify.cancel}
        onConfirm={() =>
          verify.confirm(async (row) => {
            await EventService.verifyPayment(row.id);
            toast.success(
              'Payment confirmed. The booking is confirmed and everyone has been told.',
            );
            // Opened from the preview: close it along with the confirm dialog
            // rather than leaving it open on a claim that is now decided.
            if (preview && preview.id === row.id) setPreview(null);
            await load();
          })
        }
      />

      {/*
        A reason is mandatory, so this is a form rather than a confirm: "UTR not
        found in our statement" tells the payer what to do next, where a bare
        rejection tells them only to telephone.
      */}
      <FormDrawer
        open={rejecting !== null}
        title="Could not find this payment"
        description="The payer is told this reason. Their seats stay held and their payment window restarts, so a mistyped reference costs a correction rather than the booking."
        confirmLabel="Tell the payer"
        loading={saving}
        onConfirm={submitRejection}
        onCancel={() => {
          setRejecting(null);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="reason"
            label="Reason"
            rules={[
              { required: true, message: 'Say what you could not find, so they can correct it' },
            ]}
          >
            <Input.TextArea rows={3} placeholder="UTR not found in our statement for that date" />
          </Form.Item>
        </Form>
      </FormDrawer>

      {/*
        Reused, not rebuilt: the same dialog `DocumentVerificationDrawer` opens
        for an application document. A payment claim's receipt is a different
        file behind a different endpoint, but the shape — fetch a blob, show
        it, offer a download — is identical, which is exactly what `load` and
        `download` being passed in rather than baked in is for.
      */}
      <DocumentPreviewDialog
        documentId={preview?.id ?? null}
        label={preview ? `Payment proof — ${preview.reference_no}` : ''}
        {...(preview
          ? {
              description: `${preview.paid_by ?? 'Unknown payer'} · ${SUBMISSION_METHOD[preview.method]}`,
            }
          : {})}
        load={EventService.previewPaymentProof}
        revoke={EventService.revokePaymentProofPreview}
        download={() =>
          preview
            ? EventService.downloadPaymentProof(preview.id, preview.reference_no)
            : Promise.resolve()
        }
        onClose={() => setPreview(null)}
        /*
          Approve and Reject call the exact same functions the row's own icons
          do — `verify.ask` opens the same confirm dialog, `setRejecting` opens
          the same reason drawer — so there is one place that decides a claim,
          not two. Both close automatically once that decision succeeds (see
          `verify.confirm` and `submitRejection` above).
        */
        {...(preview && canDecide
          ? {
              actions: (
                <>
                  <Button
                    variant="success"
                    disabled={preview.status !== SUBMISSION_STATUS.PENDING}
                    {...(preview.status !== SUBMISSION_STATUS.PENDING
                      ? { disabledReason: 'This claim has already been checked.' }
                      : {})}
                    onClick={() => verify.ask(preview)}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    disabled={preview.status !== SUBMISSION_STATUS.PENDING}
                    {...(preview.status !== SUBMISSION_STATUS.PENDING
                      ? { disabledReason: 'This claim has already been checked.' }
                      : {})}
                    onClick={() => setRejecting(preview)}
                  >
                    Reject
                  </Button>
                </>
              ),
            }
          : {})}
      />
    </>
  );
};

const PaymentQueue = () => {
  /* The live tab registers its search box and filter panel up here, so the two
     share the tab row instead of each tab growing a toolbar of its own. */
  const [toolbar, setToolbar] = useState<ReactNode>(null);

  /* Stable, or the child's registering effect would re-run on every render. */
  const registerSearch = useCallback((node: ReactNode) => setToolbar(node), []);

  return (
    /*
      Full height, so the card fills what is left and the pagination bar sits on
      the bottom edge instead of hugging the last row.
    */
    <div className="flex h-full min-h-0 flex-col">
      {/* subtitle="Payments people say they have made. Check each against the bank statement, then confirm it or say you could not find it." */}
      <PageHeader title="Payments" />

      <Tabs
        variant="pill"
        queryParam="scope"
        defaultTab="pending"
        actions={toolbar}
        items={[
          {
            key: 'pending',
            label: 'Awaiting Check',
            children: <ClaimsTable pendingOnly onRegisterSearch={registerSearch} />,
          },
          {
            key: 'all',
            label: 'All Claims',
            children: <ClaimsTable pendingOnly={false} onRegisterSearch={registerSearch} />,
          },
        ]}
      />
    </div>
  );
};

export default PaymentQueue;
