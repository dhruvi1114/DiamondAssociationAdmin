import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Ban, Building2, CalendarDays, CheckCircle2 } from 'lucide-react';
import { Form, Input } from 'antd';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
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

/**
 * One line of the money card: what it is on the left, the figure on the right.
 *
 * A two-column grid rather than `justify-between`, so the figures line up down a
 * single edge whatever the labels are. Money read in a column is compared; money
 * that zig-zags because one label is longer is read one row at a time.
 */
const MoneyRow = ({
  label,
  amount,
  tone = 'normal',
}: {
  label: string;
  amount: string;
  tone?: 'normal' | 'paid' | 'owed';
}) => (
  <div className="flex items-baseline justify-between gap-3">
    <span
      className={`text-supporting ${tone === 'owed' ? 'text-status-danger-fg' : 'text-fg-muted'}`}
    >
      {label}
    </span>
    <span
      className={[
        'tabular text-supporting font-medium',
        tone === 'paid' ? 'text-status-success-fg' : '',
        tone === 'owed' ? 'text-status-danger-fg' : 'text-fg',
      ].join(' ')}
    >
      <MoneyText amount={amount} />
    </span>
  </div>
);

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

  /*
    A cancelled invoice keeps its balance — voiding it does not zero the columns,
    it stops them mattering. Read from the balance alone, a cancelled booking
    showed a red "Outstanding ₹1,000" against a bill nobody will ever pay and
    nobody should chase.
  */
  const voided = booking.invoice_status === 'CANCELLED';
  const owes = !voided && Number(booking.invoice_balance_due ?? 0) > 0;
  const summaryTone = booking.invoice_number
    ? voided
      ? `Invoice ${booking.invoice_number} · cancelled`
      : owes
        ? `Invoice ${booking.invoice_number} · due ${booking.invoice_due_date ? formatDate(booking.invoice_due_date) : 'on booking'}`
        : `Invoice ${booking.invoice_number} · settled in full`
    : undefined;
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
                /*
                  Standing description hidden at the client's request. Kept as
                  source, not deleted: it is the sentence that explains why a
                  booking can show an email the member record does not, and if
                  that question comes back this is what answered it.

                  description={
                    isMember
                      ? 'A member company. The contact is the one given for THIS booking; where that differs from the company account, both are shown.'
                      : 'A guest. Nothing here is on file elsewhere — it is what they typed at booking.'
                  }
                */
              >
                {/*
                  Two different records, so two different field sets — not one
                  set with half of it reading "Not provided".

                  A member booking is a company the association already holds:
                  a code, a membership status, a class, a joining date. A guest
                  is a person who typed their details once and has no account,
                  no code and no status. Rendering the member shape for a guest
                  filled the group with blanks that read as a company whose
                  details are missing, when in truth there was never a company.
                */}
                {isMember ? (
                  <>
                    <Field label="Name" value={booking.booked_by} />
                    {/*
                      Its own field rather than a badge beside the name, at the
                      client's request. Every other fact in this group is a
                      label above a value, and one of them being a coloured pill
                      inside another field's value made it read as decoration on
                      the name rather than as an answer of its own.
                    */}
                    <Field label="Type" value="Member" />
                    <Field label="Member Code" value={booking.member_code} mono />
                    {/* Contact hidden at the client's request:
                        <Field label="Contact" value={booking.contact_name} /> */}
                    <Field label="Email" value={booking.contact_email} />
                    <Field label="Phone" value={booking.contact_phone} />
                    <Field label="City" value={booking.city} />
                    {/* From the company's registered address, the same row the
                        City above comes off. */}
                    <Field label="State" value={booking.company_state} />
                    <Field label="Country" value={booking.company_country} />
                    {/*
                      Shown only when the booking gave an address of its own that
                      is not the company's. Otherwise the two fields repeat each
                      other and the reader has to compare two identical strings to
                      learn nothing. When they DO differ this is the whole answer
                      to "why does this booking say a different email from the
                      member record".
                    */}
                    {booking.account_email && booking.account_email !== booking.contact_email ? (
                      <Field label="Company Account Email" value={booking.account_email} />
                    ) : null}
                    {booking.account_phone && booking.account_phone !== booking.contact_phone ? (
                      <Field label="Company Account Phone" value={booking.account_phone} />
                    ) : null}
                    <Field label="Membership Status" value={booking.company_status}>
                      {booking.company_status ? (
                        <StatusChip domain="member" status={booking.company_status} />
                      ) : null}
                    </Field>
                    <Field label="Company Type" value={booking.company_type} />
                    <Field label="Company Category" value={booking.company_category} />
                    {/*
                      GSTIN Holder hidden at the client's request. Whether they
                      hold one is answered by the GST number itself, two groups
                      down — a yes/no beside the number it describes is a second
                      way to say the same thing.

                      <Field
                        label="GSTIN Holder"
                        value={booking.company_gstin_holder === null ? null
                          : booking.company_gstin_holder ? 'Yes' : 'No'}
                      />
                    */}
                    <Field label="Landline" value={booking.company_landline} />
                    <Field label="Website" value={booking.company_website} />
                    <Field
                      label="Member Since"
                      value={
                        booking.company_joined_on ? formatDate(booking.company_joined_on) : null
                      }
                    />
                    {/*
                      Consent Accepted hidden at the client's request. It is when
                      the company accepted the platform's terms on joining, which
                      is a membership fact rather than a booking one — the
                      booking's own consent is Terms Accepted, further down.

                      <Field
                        label="Consent Accepted"
                        value={
                          booking.company_consent_accepted_at
                            ? formatDate(booking.company_consent_accepted_at)
                            : null
                        }
                      />
                    */}
                    {/*
                      The identity numbers, in this group rather than a
                      "Registration & Identity" section of their own (client
                      request). They sit with the other company facts and just
                      before the bill, which is what they are quoted on.

                      Monospaced, like everywhere else on the platform: these are
                      read character by character when they are checked against a
                      certificate, and a proportional face makes 0/O and 1/l the
                      reader's problem.

                      The guest branch below carries its own GST and PAN inline
                      for the same reason — a guest has two of these four, and
                      never a code or a licence.
                    */}
                    <Field label="GST Number" value={booking.company_gst_number} mono />
                    <Field label="PAN" value={booking.company_pan_number} mono />
                    <Field label="IEC Code" value={booking.company_iec_code} mono />
                    <Field
                      label="Trade Licence No."
                      value={booking.company_trade_license_no}
                      mono
                    />
                  </>
                ) : (
                  <>
                    <Field label="Name" value={booking.guest_full_name ?? booking.booked_by} />
                    <Field label="Type" value="Non-member" />
                    <Field label="Designation" value={booking.guest_designation} />
                    {/* Their firm, if they gave one. A guest may book personally,
                        which is why this is a field and not the name above. */}
                    <Field label="Company" value={booking.guest_company_name} />
                    <Field label="Email" value={booking.contact_email} />
                    <Field label="Phone" value={booking.contact_phone} />
                    <Field label="City" value={booking.city} />
                    <Field label="State" value={booking.guest_state} />
                    <Field label="Pincode" value={booking.guest_pincode} />
                    <Field label="Country" value={booking.guest_country} />
                    <Field label="GST Number" value={booking.guest_gst_number} mono />
                    <Field label="PAN" value={booking.guest_pan_number} mono />
                  </>
                )}

                {/* The bill, the same on both — a guest is invoiced like anyone else. */}
                <Field label="Invoice" value={booking.invoice_number} mono />
                {/*
                  Invoice Status hidden at the client's request. The same chip is
                  beside the Money card's title in the sidebar, where it sits
                  above the figures it is a verdict on.

                  <Field label="Invoice Status" value={booking.invoice_status}>
                    {booking.invoice_status ? (
                      <StatusChip domain="invoice" status={booking.invoice_status} />
                    ) : null}
                  </Field>
                */}
                {/*
                  Due hidden at the client's request. The Money card's subtitle
                  in the sidebar already carries it — "Invoice IN… · due 01 Sept
                  2026" — beside the balance it is the deadline for.

                  <Field
                    label="Due"
                    value={booking.invoice_due_date ? formatDate(booking.invoice_due_date) : null}
                  />
                */}
                <Field
                  label="Terms Accepted"
                  value={`${formatDate(booking.terms_accepted_at)} (${booking.terms_version})`}
                />
                <Field label="Photography Consent" value={booking.media_consent ? 'Yes' : 'No'} />

                {/*
                  Legal Name, Address and About The Company end the group
                  together, at the client's request.

                  All three are long-form: a legal name runs past its column, an
                  address wraps to two lines, and a description can be a
                  paragraph. Set among the short fields they broke the grid's
                  rows; at the end they wrap into the space below without pushing
                  anything sideways.
                */}
                {/*
                  Legal Name hidden at the client's request. It is blank on every
                  member checked — the registration form does not ask for it
                  separately from the trading name — so it was a column of
                  "Not provided" on the widest row of the group.

                  {isMember ? (
                    <Field label="Legal Name" value={booking.company_legal_name} />
                  ) : null}
                */}
                <Field label="Address" value={addressLine(booking)} />
                {/*
                  About The Company hidden at the client's request. It is the
                  member's own marketing prose, written for the directory, and
                  nothing on a booking screen is decided by it.

                  {isMember ? (
                    <Field label="About The Company" value={booking.company_about} />
                  ) : null}
                */}
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
            The wide claims table used to sit here. It is a narrow card in the
            sidebar now, under the money it explains — a claim is only ever read
            to answer "has this been paid, and by what", and that question is
            asked of the money card, not of the record.
          */}
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

          {/*
            Money, directly under the decision that creates it.

            Three figures, in the order the question is asked: what it comes to,
            what has arrived, what is still owed. The outstanding line is the one
            anybody is really looking for, so it is the one that carries colour —
            red while anything is owed, and nothing at all once it is settled.

            The invoice's OWN running totals, not a sum over the claims below. A
            claim is an assertion until somebody checks it against the bank
            statement; `amount_paid` moves only when one is verified, which is
            what makes it money rather than a hope.
          */}
          <Card
            dense
            title="Money"
            description={summaryTone}
            /*
              The invoice's own chip, beside the title. It answers the card's
              headline question — is this settled — before any of the figures are
              read, and it is the same chip the record below carries, so the two
              cannot say different things.
            */
            actions={
              booking.invoice_status ? (
                <StatusChip domain="invoice" status={booking.invoice_status} />
              ) : null
            }
          >
            {booking.invoice_number ? (
              <div className="flex flex-col gap-2">
                {/*
                  The bill built up before what was paid against it: subtotal,
                  the tax on it, then the total those two make. All three used to
                  be fields in the record below, where they sat a long way from
                  the only figures that matter beside them — what has arrived and
                  what is still owed.
                */}
                <MoneyRow label="Subtotal" amount={booking.subtotal} />
                <MoneyRow label="Tax" amount={booking.tax_amount} />
                <div className="mt-1 border-t border-border pt-2">
                  <MoneyRow label="Booking total" amount={booking.total_amount} />
                </div>
                <MoneyRow
                  label="Paid"
                  amount={booking.invoice_amount_paid ?? '0'}
                  tone={Number(booking.invoice_amount_paid ?? 0) > 0 ? 'paid' : 'normal'}
                />
                <div className="mt-1 border-t border-border pt-2">
                  {voided ? (
                    /*
                      Not "Outstanding ₹0" either. The bill was withdrawn, which
                      is a different fact from a bill that was paid off, and the
                      two must not read the same on a refund enquiry.
                    */
                    <p className="m-0 text-supporting text-fg-subtle">
                      The invoice was cancelled. Nothing is owed on this booking.
                    </p>
                  ) : (
                    <MoneyRow
                      label="Outstanding"
                      amount={booking.invoice_balance_due ?? '0'}
                      tone={owes ? 'owed' : 'normal'}
                    />
                  )}
                </div>
              </div>
            ) : (
              /*
                No invoice is a real state, not a gap: a free booking never
                raises one, and an approval-gated booking has not reached the
                point of raising one. Saying which of the two it is beats three
                zero rows that read as a billing failure.
              */
              <p className="m-0 text-supporting text-fg-subtle">
                {Number(booking.total_amount) === 0
                  ? 'This booking is free. No invoice was raised.'
                  : 'No invoice yet — one is raised when the booking is approved.'}
              </p>
            )}
          </Card>

          {/*
            The claims, under the money they are claims against. Narrow rows
            rather than the wide table this used to be: the only question asked
            of a claim here is "what was sent, and was it found", and a six
            column grid spent the reading column on the four answers nobody came
            for.
          */}
          {booking.payments.length > 0 ? (
            <Card
              dense
              title="Payments Claimed"
              description={`${booking.payments.length} claim(s) against this invoice`}
            >
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {booking.payments.map((claim) => (
                  <li key={claim.id} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-mono text-12 text-fg">
                        {claim.reference_no}
                      </span>
                      <span className="tabular flex-none text-supporting font-medium text-fg">
                        <MoneyText amount={claim.amount} />
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-12 text-fg-muted">
                        {SUBMISSION_METHOD[claim.method]} · {formatDate(claim.paid_on)}
                      </span>
                      <StatusChip
                        domain="paymentSubmission"
                        status={SUBMISSION_NAME[claim.status] ?? 'PENDING'}
                      />
                    </div>
                    {/* Only on a refusal — it is the reason somebody has to act. */}
                    {claim.rejection_reason ? (
                      <p className="m-0 text-12 text-status-danger-fg">{claim.rejection_reason}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/*
            "Where It Stands" is hidden at the client's request. Kept as source
            rather than deleted: every date it carried — booked, held until,
            approved, refused and why, cancelled — is now either on the stepper's
            captions or in the record itself, so restoring it would mean deciding
            what it says that they do not.
          */}
          {/*
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
          */}
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
