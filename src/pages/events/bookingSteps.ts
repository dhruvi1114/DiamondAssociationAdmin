import type { Step } from '@/components/ui';
import { REGISTRATION_STATUS, type RegistrationDetail } from '@/services/eventService';
import { formatDate } from '@/utils/format';

/**
 * A booking's journey, as steps.
 *
 * Its own module, not a helper inside the page: this is the one place that
 * decides what a booking's flow looks like, and it is pure — a record in, a list
 * of steps out — so the shape can be reasoned about without a screen.
 *
 * The sequence is not fixed. Two facts change it:
 *
 *  · **Approval.** Only events with "Registrations Need My Approval" have that
 *    step. Drawing it on every booking would tell most of them they are waiting
 *    on a decision nobody has to make.
 *  · **Money.** A free booking confirms on the spot and never raises an invoice,
 *    so a Paid step would be a stage it can never reach.
 *
 * A booking that ENDED — refused, cancelled, expired, refunded — has its trail
 * TRUNCATED at the point it ended, and that point is drawn as stopped. The
 * alternative, greying out the steps it never reached, says "not yet" about
 * things that will never happen; and leaving a stopped step in the middle with
 * pale circles after it reads as a trail still in progress. What ended, ended
 * there, and the drawing stops there too.
 */

type Ending = { at: 'approval' | 'payment' | 'confirmed'; label: string; caption: string };

/** Where a booking's journey stopped, and what to call the stop. Null if live. */
const endingFor = (booking: RegistrationDetail): Ending | null => {
  switch (booking.status) {
    case REGISTRATION_STATUS.REJECTED:
      return {
        at: 'approval',
        label: 'Not accepted',
        caption: booking.rejected_at
          ? `${formatDate(booking.rejected_at)}${booking.rejected_by ? ` by ${booking.rejected_by}` : ''}`
          : 'The request was refused',
      };
    case REGISTRATION_STATUS.EXPIRED:
      return {
        at: 'payment',
        label: 'Seats released',
        caption: booking.cancelled_at
          ? `The payment window closed on ${formatDate(booking.cancelled_at)}`
          : 'The payment window closed',
      };
    case REGISTRATION_STATUS.CANCELLED:
      return {
        at: 'payment',
        label: 'Cancelled',
        caption: booking.cancelled_at ? formatDate(booking.cancelled_at) : 'The booking was ended',
      };
    /*
      Refunded is the one ending that got all the way through: the seats were
      confirmed and paid for, and then the association cancelled the event. Its
      trail therefore keeps Paid as a completed step and stops at the end.
    */
    case REGISTRATION_STATUS.REFUNDED:
      return {
        at: 'confirmed',
        label: 'Refunded',
        caption: 'The event was cancelled and the money returned in full',
      };
    default:
      return null;
  }
};

export const bookingSteps = (booking: RegistrationDetail): Step[] => {
  const { status } = booking;
  const ending = endingFor(booking);

  /*
    An event that no longer requires approval can still hold bookings that went
    through it, so the booking's own approval stamp counts as well as the
    event's current setting. Its history does not change when the event's
    settings do.
  */
  const hasApproval = booking.event_requires_approval || booking.approved_at !== null;
  /*
    Free is judged by the money, not by the absence of an invoice: an
    approval-gated booking has no invoice yet either, and calling that free would
    drop the step it is on its way to.
  */
  const hasPayment = Number(booking.total_amount) > 0;

  const order: ('booked' | 'approval' | 'payment' | 'confirmed')[] = [
    'booked',
    ...(hasApproval ? (['approval'] as const) : []),
    ...(hasPayment ? (['payment'] as const) : []),
    'confirmed',
  ];

  /** Which step the booking is standing on right now. */
  const at = (() => {
    if (ending) return ending.at;

    switch (status) {
      case REGISTRATION_STATUS.PENDING_APPROVAL:
        return 'approval';
      case REGISTRATION_STATUS.PENDING_PAYMENT:
      case REGISTRATION_STATUS.PAYMENT_UNDER_VERIFICATION:
        return 'payment';
      default:
        return 'confirmed';
    }
  })();

  const currentIndex = Math.max(order.indexOf(at), 0);

  const label: Record<string, string> = {
    booked: 'Booked',
    approval: 'Approved',
    payment: 'Paid',
    confirmed: 'Confirmed',
  };

  const caption = (key: string): string => {
    switch (key) {
      case 'booked':
        return `${formatDate(booking.registered_at)} · ${booking.attendee_count} seat(s)`;
      case 'approval':
        return booking.approved_at
          ? `${formatDate(booking.approved_at)}${booking.approved_by ? ` by ${booking.approved_by}` : ''}`
          : 'Waiting on a decision — nothing is invoiced yet';
      case 'payment':
        if (status === REGISTRATION_STATUS.PAYMENT_UNDER_VERIFICATION) {
          return 'Payment claimed — being checked against the bank';
        }

        if (booking.invoice_status === 'PAID') {
          return `Invoice ${booking.invoice_number ?? ''} settled`;
        }

        return booking.expires_at
          ? `Seats held until ${formatDate(booking.expires_at)}`
          : 'Awaiting payment';
      default:
        return status === REGISTRATION_STATUS.CONFIRMED
          ? 'Seats held. Each attendee has their own code.'
          : 'Seats are held for good once this is reached';
    }
  };

  const steps = order.map((key, index): Step => {
    if (ending && key === ending.at) {
      return { key, label: ending.label, caption: ending.caption, state: 'stopped' };
    }

    return {
      key,
      label: label[key] ?? key,
      caption: caption(key),
      state:
        index < currentIndex
          ? 'done'
          : index > currentIndex
            ? 'todo'
            : status === REGISTRATION_STATUS.CONFIRMED
              ? 'done'
              : 'current',
    };
  });

  /* Nothing after the ending: those steps are not "not yet", they never happen. */
  return ending ? steps.slice(0, order.indexOf(ending.at) + 1) : steps;
};

/** The sentence a screen reader hears instead of the circles. */
export const bookingStepLabel = (steps: Step[]): string => {
  const index = steps.findIndex((step) => step.state === 'current' || step.state === 'stopped');
  const active = index === -1 ? steps[steps.length - 1] : steps[index];
  const position = index === -1 ? steps.length : index + 1;

  return `Step ${position} of ${steps.length}: ${active?.label ?? ''}`;
};
