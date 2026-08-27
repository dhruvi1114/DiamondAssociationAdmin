import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Ban, Building2, CalendarDays, CheckCircle2, Receipt } from 'lucide-react';
import { Form, Input } from 'antd';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  DateCell,
  ErrorState,
  FormDrawer,
  MoneyText,
  NotAvailable,
  PageHeader,
  Skeleton,
  StatusChip,
  Stepper,
  TextCell,
  toast,
} from '@/components/ui';
import { Field, Group } from '@/components/ui/DetailFields';
import { bookingSteps, bookingStepLabel } from '@/pages/events/bookingSteps';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePermissions } from '@/hooks/usePermissions';
import EventService, {
  REGISTRATION_STATUS,
  SUBMISSION_METHOD,
  SUBMISSION_STATUS,
  type RegistrationAttendee,
  type RegistrationDetail as RegistrationRecord,
  type RegistrationPayment,
} from '@/services/eventService';
import { asDisplayError, type DisplayError } from '@/utils/apiError';
import { formatDate } from '@/utils/format';

/**
 * A-23 · one booking, everything about it.
 *
 * The same shell as the member and application detail pages: the app header
 * becomes this booking's reference with a back arrow in front of it, the record
 * itself reads down the left column, and the decision sits in a sticky card on
 * the right so approving never means scrolling back up.
 *
 * A page rather than a drawer, unlike the attendee list. This is read *instead*
 * of the queue rather than beside it — you come here to settle one booking, and
 * everything on it (who booked, who is coming, what was billed, what was paid)
 * is more than a panel can hold without becoming its own scroll.
 */

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

const SUBMISSION_NAME: Record<number, string> = {
  [SUBMISSION_STATUS.PENDING]: 'PENDING',
  [SUBMISSION_STATUS.VERIFIED]: 'VERIFIED',
  [SUBMISSION_STATUS.REJECTED]: 'REJECTED',
};

/** Codes on the wire; words on the screen. "1" is not a dietary requirement. */
const FOOD_LABEL: Record<number, string> = { 0: 'Veg', 1: 'Non-veg', 2: 'Jain' };

/**
 * The banner for a state that changes what the rest of the page means.
 *
 * Only for the states that do. A confirmed booking needs no banner — the status
 * chip in the header already says so, and a page that opens with a coloured bar
 * every time teaches the reader to skip the bar.
 */
const BANNER: Partial<Record<number, { variant: 'warning' | 'danger' | 'info'; message: string }>> =
  {
    [REGISTRATION_STATUS.PENDING_APPROVAL]: {
      variant: 'info',
      message:
        'This booking is waiting on your decision. Nothing has been invoiced yet, so refusing it costs nothing to reverse.',
    },
    [REGISTRATION_STATUS.EXPIRED]: {
      variant: 'warning',
      message:
        'The payment window closed and these seats went back into the pool. The booking is a record now, not a hold.',
    },
    [REGISTRATION_STATUS.REJECTED]: {
      variant: 'danger',
      message: 'This request was not accepted. The applicant was told, with the reason below.',
    },
    [REGISTRATION_STATUS.REFUNDED]: {
      variant: 'info',
      message: 'The event was cancelled and this booking was refunded in full.',
    },
  };

const addressLine = (record: RegistrationRecord): string | null =>
  [
    record.billing_line1,
    record.billing_line2,
    record.billing_city,
    record.billing_state,
    record.billing_pincode,
    record.billing_country,
  ]
    .filter((part) => part && part.trim().length > 0)
    .join(', ') || null;

export const RegistrationDetail = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canDecide = can('event.manage');

  const [booking, setBooking] = useState<RegistrationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DisplayError | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await EventService.getRegistration(id);

      setBooking(res.data);
    } catch (caught) {
      setError(asDisplayError(caught));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Stable, or `usePageTitle` would re-register the back handler every render. */
  const goBack = useCallback(() => navigate(-1), [navigate]);

  /*
    The shell header names the booking while this page is open. Called before
    the early returns below — a hook cannot follow one.
  */
  usePageTitle(booking?.booked_by ?? 'Booking', {
    onBack: goBack,
    meta: booking?.registration_code ?? null,
    status: booking ? { domain: 'eventRegistration', value: STATUS_NAME[booking.status] } : null,
  });

  if (loading && !booking) {
    return <Skeleton variant="detail" />;
  }

  if (error || !booking) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <ErrorState
          title="This booking could not be loaded"
          description={error?.message ?? 'The record is not available.'}
          {...(error?.requestId ? { requestId: error.requestId } : {})}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  const banner = BANNER[booking.status];
  const steps = bookingSteps(booking);
  const awaitingDecision = booking.status === REGISTRATION_STATUS.PENDING_APPROVAL;
  const isMember = booking.registrant_type === 0;

  /* The one-line summary the Actions card carries, as the review page does. */
  const summary = [
    booking.registration_code,
    `${booking.attendee_count} seat(s)`,
    booking.tier_name ? `${booking.tier_name} rate` : null,
    `booked ${formatDate(booking.registered_at)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const submitRejection = async () => {
    const values = await form.validateFields();

    setBusy(true);
    try {
      await EventService.rejectRegistration(booking.id, values.reason);
      toast.success('Request not accepted. The applicant has been told, with the reason.');
      setRejecting(false);
      form.resetFields();
      await load();
    } catch (caught) {
      toast.error(asDisplayError(caught).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Contributes the hidden h1 only — the shell header carries the name and
          the back arrow (`hooks/usePageTitle.tsx`, called above). */}
      <PageHeader title={booking.booked_by ?? 'Booking'} />

      {banner ? <Alert className="mb-4" variant={banner.variant} message={banner.message} /> : null}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-4">
        <div className="flex flex-col gap-4 xl:col-span-3">
          {/*
            First in the reading column, level with the Actions card beside it —
            the same placement the application review page gives its stage trail,
            so the two detail screens open the same way.

            In the column rather than full width above the grid: the trail
            describes the record, and the record is what this column holds. Run
            across the whole page it stretched four steps over a metre and put
            the last one further from the first card than the sidebar is.

            Not inside the Actions card either. That column is for acting on the
            booking, and a description sitting among the controls makes the
            buttons read as steps.
          */}
          <div className="rounded-lg border border-border bg-surface px-4 py-3 shadow-card">
            <Stepper steps={steps} label={bookingStepLabel(steps)} />
          </div>

          <Card>
            <div className="flex flex-col gap-4">
              <Group icon={<CalendarDays size={16} strokeWidth={1.5} />} title="Event">
                <Field label="Event" value={booking.event_title} />
                <Field
                  label="Runs"
                  value={`${formatDate(booking.event_start_at)} – ${formatDate(booking.event_end_at)}`}
                />
                <Field label="Venue" value={booking.event_venue_name} />
                <Field label="City" value={booking.event_city} />
              </Group>

              <Group
                icon={<Building2 size={16} strokeWidth={1.5} />}
                title="Booked By"
                description={
                  isMember
                    ? 'A member company. The contact is the one given for THIS booking; where that differs from the company account, both are shown.'
                    : 'A guest. Nothing here is on file elsewhere — it is what they typed at booking.'
                }
              >
                <Field label="Name" value={booking.booked_by}>
                  <span className="flex items-center gap-2">
                    {booking.booked_by ?? 'Guest'}
                    <Badge tone={isMember ? 'info' : 'neutral'}>
                      {isMember ? 'Member' : 'Non-member'}
                    </Badge>
                  </span>
                </Field>
                <Field label="Member Code" value={booking.member_code} mono />
                <Field label="Contact" value={booking.contact_name} />
                <Field label="Email" value={booking.contact_email} />
                <Field label="Phone" value={booking.contact_phone} />
                <Field label="City" value={booking.city} />
                {/*
                  Shown only when the booking gave an address of its own that is
                  not the company's. Otherwise the two fields repeat each other
                  and the reader has to compare two identical strings to learn
                  nothing. When they DO differ this is the whole answer to "why
                  does this booking say a different email from the member record".
                */}
                {booking.account_email && booking.account_email !== booking.contact_email ? (
                  <Field label="Company Account Email" value={booking.account_email} />
                ) : null}
                {booking.account_phone && booking.account_phone !== booking.contact_phone ? (
                  <Field label="Company Account Phone" value={booking.account_phone} />
                ) : null}
              </Group>

              <Group
                icon={<Receipt size={16} strokeWidth={1.5} />}
                title="Billing"
                description="Frozen at booking, so a later profile edit cannot rewrite what the invoice said."
              >
                <Field label="Billed To" value={booking.billing_company_name} />
                <Field label="GSTIN" value={booking.gst_number} mono />
                <Field label="Address" value={addressLine(booking)} />
                <Field label="Subtotal" value={booking.subtotal}>
                  <MoneyText amount={booking.subtotal} />
                </Field>
                <Field label="Tax" value={booking.tax_amount}>
                  <MoneyText amount={booking.tax_amount} />
                </Field>
                <Field label="Total" value={booking.total_amount}>
                  <MoneyText amount={booking.total_amount} />
                </Field>
                <Field label="Invoice" value={booking.invoice_number} mono />
                <Field label="Invoice Status" value={booking.invoice_status}>
                  {booking.invoice_status ? (
                    <StatusChip domain="invoice" status={booking.invoice_status} />
                  ) : null}
                </Field>
                <Field
                  label="Due"
                  value={booking.invoice_due_date ? formatDate(booking.invoice_due_date) : null}
                />
                <Field
                  label="Terms Accepted"
                  value={`${formatDate(booking.terms_accepted_at)} (${booking.terms_version})`}
                />
                <Field label="Photography Consent" value={booking.media_consent ? 'Yes' : 'No'} />
              </Group>
            </div>
          </Card>

          {/*
            The people, not a count. A row reading "3 seats" cannot be turned
            into badges, a catering count or a door list, which is what this
            list is read for.
          */}
          <Card flush title="Who Is Attending">
            <DataTable<RegistrationAttendee>
              unit="people"
              serial
              rowKey="attendee_code"
              dataSource={booking.attendees}
              emptyTitle="Nobody is listed on this booking"
              emptyDescription="A booking always carries at least one attendee, so this is worth reporting if you see it."
              columns={[
                {
                  title: 'Name',
                  dataIndex: 'full_name',
                  width: 200,
                  render: (value: string) => <TextCell value={value} width={176} />,
                },
                {
                  title: 'Designation',
                  dataIndex: 'designation',
                  width: 170,
                  render: (value: string | null) => <TextCell value={value} width={146} />,
                },
                {
                  title: 'Email',
                  dataIndex: 'email',
                  width: 210,
                  render: (value: string | null) => <TextCell value={value} width={186} />,
                },
                {
                  title: 'Phone',
                  dataIndex: 'phone',
                  width: 150,
                  render: (value: string | null) => <TextCell value={value} width={126} />,
                },
                {
                  title: 'Fee',
                  dataIndex: 'unit_price',
                  width: 110,
                  render: (value: string) => <MoneyText amount={value} />,
                },
                {
                  title: 'Food',
                  dataIndex: 'food_preference',
                  width: 100,
                  render: (value: number | null) =>
                    value === null ? (
                      <NotAvailable />
                    ) : (
                      <TextCell value={FOOD_LABEL[value] ?? ''} />
                    ),
                },
                {
                  title: 'Code',
                  dataIndex: 'attendee_code',
                  render: (value: string) => <TextCell value={value} />,
                },
              ]}
            />
          </Card>

          {/*
            Only once something has been claimed. An empty payments table on a
            booking nobody has paid for reads as a fault rather than as a fact.
          */}
          {booking.payments.length > 0 ? (
            <Card flush title="Payments Claimed">
              <DataTable<RegistrationPayment>
                unit="claims"
                serial
                rowKey="id"
                dataSource={booking.payments}
                columns={[
                  {
                    title: 'Reference',
                    dataIndex: 'reference_no',
                    width: 190,
                    render: (value: string) => <TextCell value={value} width={166} />,
                  },
                  {
                    title: 'Method',
                    dataIndex: 'method',
                    width: 150,
                    render: (value: number) => (
                      <TextCell value={SUBMISSION_METHOD[value]} width={126} />
                    ),
                  },
                  {
                    title: 'Amount',
                    dataIndex: 'amount',
                    width: 120,
                    render: (value: string) => <MoneyText amount={value} />,
                  },
                  {
                    title: 'Paid On',
                    dataIndex: 'paid_on',
                    width: 130,
                    render: (value: string) => <DateCell value={value} />,
                  },
                  {
                    title: 'Claimed',
                    dataIndex: 'createdAt',
                    width: 130,
                    render: (value: string) => <DateCell value={value} />,
                  },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    render: (value: number) => (
                      <StatusChip
                        domain="paymentSubmission"
                        status={SUBMISSION_NAME[value] ?? 'PENDING'}
                      />
                    ),
                  },
                ]}
              />
            </Card>
          ) : null}
        </div>

        {/*
          Sticky, like the member page's Actions column: the decision travels
          with the reader instead of being something they scroll back up to.
        */}
        <div className="sticky top-0 flex max-h-[calc(100vh-var(--header-height)-24px)] flex-col gap-4 overflow-y-auto">
          <Card dense title="Actions" description={summary}>
            {canDecide ? (
              <div className="flex flex-col gap-2">
                {/*
                  Kept and disabled rather than hidden once decided. An empty
                  card where two buttons were reads as a rendering fault and says
                  nothing about why they are gone (ux-principles §4).
                */}
                <Button
                  block
                  variant="success"
                  icon={<CheckCircle2 size={16} strokeWidth={1.5} />}
                  disabled={!awaitingDecision}
                  {...(awaitingDecision
                    ? {}
                    : { disabledReason: 'This booking is no longer waiting on a decision.' })}
                  onClick={() => setApproving(true)}
                >
                  Approve
                </Button>
                <Button
                  block
                  variant="danger"
                  icon={<Ban size={16} strokeWidth={1.5} />}
                  disabled={!awaitingDecision}
                  {...(awaitingDecision
                    ? {}
                    : { disabledReason: 'This booking is no longer waiting on a decision.' })}
                  onClick={() => setRejecting(true)}
                >
                  Do not accept
                </Button>
              </div>
            ) : (
              <p className="m-0 text-supporting text-fg-subtle">
                Your role can view this booking but not decide it.
              </p>
            )}
          </Card>

          <Card dense title="Where It Stands">
            <dl className="m-0 grid grid-cols-1 gap-y-4">
              <Field label="Booked" value={formatDate(booking.registered_at)} />
              <Field
                label="Seats Held Until"
                value={booking.expires_at ? formatDate(booking.expires_at) : null}
              />
              <Field
                label="Approved"
                value={
                  booking.approved_at
                    ? `${formatDate(booking.approved_at)}${booking.approved_by ? ` by ${booking.approved_by}` : ''}`
                    : null
                }
              />
              <Field
                label="Not Accepted"
                value={
                  booking.rejected_at
                    ? `${formatDate(booking.rejected_at)}${booking.rejected_by ? ` by ${booking.rejected_by}` : ''}`
                    : null
                }
              />
              <Field label="Reason" value={booking.rejection_reason} />
              <Field
                label="Cancelled"
                value={booking.cancelled_at ? formatDate(booking.cancelled_at) : null}
              />
            </dl>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={approving}
        title="Approve this request?"
        confirmLabel="Approve"
        loading={busy}
        description={`${booking.booked_by ?? 'The applicant'} asked for ${booking.attendee_count} seat(s) at ${booking.event_title}. Approving raises the invoice now and starts their payment window from today — the price they were quoted does not change.`}
        onCancel={() => setApproving(false)}
        onConfirm={() => {
          setBusy(true);
          void EventService.approveRegistration(booking.id)
            .then(async () => {
              toast.success(
                'Approved. The invoice has been sent and their payment window starts now.',
              );
              setApproving(false);
              await load();
            })
            .catch((caught: unknown) => toast.error(asDisplayError(caught).message))
            .finally(() => setBusy(false));
        }}
      />

      {/*
        A reason is mandatory, so this is a form rather than a confirm dialog:
        the text is what the applicant is told, and a refusal with no explanation
        is a phone call to the office.
      */}
      <FormDrawer
        open={rejecting}
        title="Do not accept this request"
        description="The applicant is told this reason. Nothing has been charged and no invoice exists, so nothing needs reversing."
        confirmLabel="Send the refusal"
        loading={busy}
        onConfirm={() => void submitRejection()}
        onCancel={() => {
          setRejecting(false);
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
    </div>
  );
};

export default RegistrationDetail;
