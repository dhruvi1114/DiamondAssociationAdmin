import { Ban, CheckCircle2 } from 'lucide-react';
import { Form, Input } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  ConfirmDialog,
  DataTable,
  DateCell,
  FormDrawer,
  MoneyText,
  PageHeader,
  RowActions,
  StackedCell,
  StatusChip,
  Tabs,
  TextCell,
  toast,
} from '@/components/ui';
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

const ClaimsTable = ({ pendingOnly }: { pendingOnly: boolean }) => {
  const { can } = usePermissions();
  const canDecide = can('payment.record');

  const [rows, setRows] = useState<PaymentSubmissionRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);

  const verify = useConfirm<PaymentSubmissionRow>();
  const [rejecting, setRejecting] = useState<PaymentSubmissionRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await EventService.listPaymentSubmissions({
        page,
        limit: 20,
        status: pendingOnly
          ? String(SUBMISSION_STATUS.PENDING)
          : `${SUBMISSION_STATUS.PENDING},${SUBMISSION_STATUS.VERIFIED},${SUBMISSION_STATUS.REJECTED}`,
      });

      setRows(res.data.rows ?? []);
      setPagination(res.pagination);
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, [page, pendingOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitRejection = useCallback(async () => {
    const values = await form.validateFields();

    if (!rejecting) return;

    setSaving(true);
    try {
      await EventService.rejectPayment(rejecting.id, values.reason);
      toast.success('Marked as not traced. The payer has been told, and their seats stay held.');
      setRejecting(null);
      form.resetFields();
      await load();
    } catch (err) {
      toast.error(asError(err).message);
    } finally {
      setSaving(false);
    }
  }, [form, load, rejecting]);

  return (
    <>
      <Card flush>
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
              width: 200,
              render: (value: string | null, row) => (
                <StackedCell primary={value ?? 'Unknown'} secondary={row.invoice_number} mono />
              ),
            },
            {
              title: 'For',
              dataIndex: 'event_title',
              width: 220,
              render: (value: string | null, row) =>
                value ? (
                  <StackedCell primary={value} secondary={row.registration_code ?? undefined} />
                ) : (
                  <TextCell value="Membership" />
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
              render: (value: string, row) => (
                <StackedCell primary={value} secondary={SUBMISSION_METHOD[row.method]} mono />
              ),
            },
            {
              title: 'Amount',
              dataIndex: 'amount',
              width: 120,
              align: 'right' as const,
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
              render: (_: unknown, row: PaymentSubmissionRow) => (
                <RowActions
                  actions={[
                    {
                      key: 'verify',
                      icon: <CheckCircle2 size={16} strokeWidth={1.5} />,
                      label: 'Confirm this payment landed',
                      hidden: !canDecide || row.status !== SUBMISSION_STATUS.PENDING,
                      onClick: () => verify.ask(row),
                    },
                    {
                      key: 'reject',
                      icon: <Ban size={16} strokeWidth={1.5} />,
                      label: 'Could not find this payment',
                      danger: true,
                      hidden: !canDecide || row.status !== SUBMISSION_STATUS.PENDING,
                      onClick: () => setRejecting(row),
                    },
                  ]}
                />
              ),
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
    </>
  );
};

const PaymentQueue = () => (
  <>
    <PageHeader
      title="Payments"
      subtitle="Payments people say they have made. Check each against the bank statement, then confirm it or say you could not find it."
    />

    <Tabs
      variant="pill"
      queryParam="scope"
      defaultTab="pending"
      items={[
        { key: 'pending', label: 'Awaiting Check', children: <ClaimsTable pendingOnly /> },
        { key: 'all', label: 'All Claims', children: <ClaimsTable pendingOnly={false} /> },
      ]}
    />
  </>
);

export default PaymentQueue;
