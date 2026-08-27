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
  NotAvailable,
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
import EventService, { REGISTRATION_STATUS, type RegistrationRow } from '@/services/eventService';
import type { PaginationMeta } from '@/services/BaseService';

/**
 * A-23 — bookings, and the queue of those waiting on a decision.
 *
 * Two tabs rather than a filter: "waiting on me" and "everything" are different
 * questions, and the first is the reason anyone opens this screen. A filter would
 * hide that behind a button.
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
  [REGISTRATION_STATUS.PENDING_APPROVAL]: 'PENDING_APPROVAL',
  [REGISTRATION_STATUS.PENDING_PAYMENT]: 'PENDING_PAYMENT',
  [REGISTRATION_STATUS.PAYMENT_UNDER_VERIFICATION]: 'PAYMENT_UNDER_VERIFICATION',
  [REGISTRATION_STATUS.CONFIRMED]: 'CONFIRMED',
  [REGISTRATION_STATUS.EXPIRED]: 'EXPIRED',
  [REGISTRATION_STATUS.CANCELLED]: 'CANCELLED',
  [REGISTRATION_STATUS.REJECTED]: 'REJECTED',
  [REGISTRATION_STATUS.REFUNDED]: 'REFUNDED',
};

/**
 * One tab body.
 *
 * Each tab fetches its own rows rather than sharing one loader, because they are
 * different questions — "what is waiting on me" and "everything" — and a shared
 * loader would refetch both every time somebody switches.
 */
const BookingsTable = ({ queueOnly }: { queueOnly: boolean }) => {
  const { can } = usePermissions();
  const canDecide = can('event.manage');

  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);

  const approve = useConfirm<RegistrationRow>();
  const [rejecting, setRejecting] = useState<RegistrationRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await EventService.listRegistrations({
        page,
        limit: 20,
        // The queue is exactly the bookings a decision is owed on.
        ...(queueOnly ? { status: String(REGISTRATION_STATUS.PENDING_APPROVAL) } : {}),
      });

      setRows(res.data.rows ?? []);
      setPagination(res.pagination);
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, [page, queueOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitRejection = useCallback(async () => {
    const values = await form.validateFields();

    if (!rejecting) return;

    setSaving(true);
    try {
      await EventService.rejectRegistration(rejecting.id, values.reason);
      toast.success('Request not accepted. The applicant has been told, with the reason.');
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
        <DataTable<RegistrationRow>
          unit="bookings"
          serial
          rowKey="id"
          loading={loading}
          error={error}
          onRetry={() => void load()}
          pagination={pagination}
          onPageChange={setPage}
          dataSource={rows}
          emptyTitle={queueOnly ? 'Nothing waiting on you' : 'No bookings yet'}
          emptyDescription={
            queueOnly
              ? 'Bookings appear here only for events set to need your approval before payment. Everything else confirms on payment without you.'
              : 'Bookings appear here as soon as members or guests register for a published event.'
          }
          columns={[
            {
              title: 'Booked By',
              dataIndex: 'booked_by',
              width: 220,
              render: (value: string | null, row) => (
                <StackedCell
                  primary={value ?? 'Guest'}
                  secondary={row.registrant_type === 0 ? 'Member' : 'Non-member'}
                />
              ),
            },
            {
              title: 'Event',
              dataIndex: 'event_title',
              width: 240,
              render: (value: string, row) => (
                <StackedCell primary={value} secondary={row.registration_code} mono />
              ),
            },
            {
              title: 'Seats',
              dataIndex: 'attendee_count',
              width: 80,
              align: 'right' as const,
              render: (value: number) => <TextCell value={String(value)} />,
            },
            {
              title: 'Amount',
              dataIndex: 'total_amount',
              width: 120,
              align: 'right' as const,
              render: (value: string) => <MoneyText amount={value} />,
            },
            {
              title: 'Requested',
              dataIndex: 'registered_at',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              /*
              The date the seats go back. It is the only thing on this row that
              is a deadline for the association rather than for the booker, which
              is why it is worth a column of its own.
            */
              title: 'Held Until',
              dataIndex: 'expires_at',
              width: 130,
              render: (value: string | null) =>
                value ? <DateCell value={value} /> : <NotAvailable />,
            },
            {
              title: 'Status',
              dataIndex: 'status',
              render: (value: number) => (
                <StatusChip domain="eventRegistration" status={STATUS_NAME[value] ?? 'CONFIRMED'} />
              ),
            },
            {
              title: 'Actions',
              width: 80,
              fixed: 'right' as const,
              render: (_: unknown, row: RegistrationRow) => (
                <RowActions
                  actions={[
                    {
                      key: 'approve',
                      icon: <CheckCircle2 size={16} strokeWidth={1.5} />,
                      label: 'Approve this request',
                      hidden: !canDecide || row.status !== REGISTRATION_STATUS.PENDING_APPROVAL,
                      onClick: () => approve.ask(row),
                    },
                    {
                      key: 'reject',
                      icon: <Ban size={16} strokeWidth={1.5} />,
                      label: 'Do not accept this request',
                      danger: true,
                      hidden: !canDecide || row.status !== REGISTRATION_STATUS.PENDING_APPROVAL,
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
        open={approve.target !== null}
        title="Approve this request?"
        confirmLabel="Approve"
        loading={approve.busy}
        description={
          approve.target
            ? `${approve.target.booked_by ?? 'The applicant'} asked for ${approve.target.attendee_count} seat(s) at ${approve.target.event_title}. Approving raises the invoice now and starts their payment window from today — the price they were quoted does not change.`
            : ''
        }
        onCancel={approve.cancel}
        onConfirm={() =>
          approve.confirm(async (row) => {
            await EventService.approveRegistration(row.id);
            toast.success(
              'Approved. The invoice has been sent and their payment window starts now.',
            );
            await load();
          })
        }
      />

      {/*
        A reason is mandatory, so this is a form rather than a confirm dialog:
        the text is what the applicant is told, and a refusal with no explanation
        is a phone call to the office.
      */}
      <FormDrawer
        open={rejecting !== null}
        title="Do not accept this request"
        description="The applicant is told this reason. Nothing has been charged and no invoice exists, so nothing needs reversing."
        confirmLabel="Send the refusal"
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
            rules={[{ required: true, message: 'Say why, so the applicant knows what to do next' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="This AGM is for Executive Committee members only"
            />
          </Form.Item>
        </Form>
      </FormDrawer>
    </>
  );
};

/** A-23 — the page itself is just the two tabs. */
const Registrations = () => (
  <>
    <PageHeader
      title="Registrations"
      subtitle="Approve the requests waiting on you, and see every booking across all events."
    />

    <Tabs
      variant="pill"
      queryParam="scope"
      defaultTab="queue"
      items={[
        { key: 'queue', label: 'Awaiting My Approval', children: <BookingsTable queueOnly /> },
        { key: 'all', label: 'All Bookings', children: <BookingsTable queueOnly={false} /> },
      ]}
    />
  </>
);

export default Registrations;
