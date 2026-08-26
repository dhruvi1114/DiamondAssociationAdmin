import type { StatusVariant } from '@/theme/tokens';

/**
 * Domain status → visual variant + label (design-system.md §3).
 *
 * The single source of truth, shared by copy with the customer app. Two rules it
 * exists to enforce:
 *  1. One status never renders two different ways on two different screens.
 *  2. Members never see a raw enum. `RETURNED_FOR_CORRECTION` is "Action needed",
 *     because the label has to say what the reader must DO.
 *
 * Since the reject/resubmit spec there is one Reject button with two endings, so
 * the two statuses it produces have to read differently or the map hides the
 * only distinction that matters: whether the applicant still has a move.
 */
export interface StatusPresentation {
  variant: StatusVariant;
  label: string;
}

const map: Record<string, StatusPresentation> = {
  // --- Generic (M5 masters): plain active/inactive, no domain-specific wording -
  'generic.ACTIVE': { variant: 'success', label: 'Active' },
  'generic.INACTIVE': { variant: 'neutral', label: 'Inactive' },

  // --- Catalogue (M2): whether a category/tier/document type is offered -------
  'catalogue.ACTIVE': { variant: 'success', label: 'Offered' },
  'catalogue.INACTIVE': { variant: 'neutral', label: 'Not offered' },
  'catalogue.REQUIRED': { variant: 'info', label: 'Required' },
  'catalogue.OPTIONAL': { variant: 'neutral', label: 'Optional' },

  // --- Fee (M2) --------------------------------------------------------------
  'fee.ACTIVE': { variant: 'success', label: 'Live' },
  'fee.SCHEDULED': { variant: 'info', label: 'Scheduled' },
  'fee.CLOSED': { variant: 'neutral', label: 'Closed' },
  'fee.INACTIVE': { variant: 'neutral', label: 'Retired' },

  // --- Application -----------------------------------------------------------
  'application.DRAFT': { variant: 'neutral', label: 'Draft' },
  'application.SUBMITTED': { variant: 'info', label: 'New' },
  'application.UNDER_REVIEW': { variant: 'info', label: 'Under review' },
  // The two endings of one Reject button, and they must not read the same
  // (spec item 18). `RETURNED_FOR_CORRECTION` is a rejection the applicant can
  // still answer — warning, and the label names the move that is theirs.
  // `REJECTED` is the one that closed the application, and "Rejected — closed"
  // says so on a queue row where nothing else will.
  'application.RETURNED_FOR_CORRECTION': { variant: 'warning', label: 'Action needed' },
  'application.APPROVED': { variant: 'success', label: 'Approved' },
  'application.REJECTED': { variant: 'danger', label: 'Rejected — closed' },
  'application.WITHDRAWN': { variant: 'neutral', label: 'Withdrawn' },

  // --- Member ----------------------------------------------------------------
  'member.DRAFT': { variant: 'neutral', label: 'Draft' },
  'member.PENDING': { variant: 'info', label: 'Awaiting payment' },
  'member.ACTIVE': { variant: 'success', label: 'Active' },
  'member.SUSPENDED': { variant: 'warning', label: 'Suspended' },
  'member.EXPIRED': { variant: 'danger', label: 'Expired' },
  'member.TERMINATED': { variant: 'danger', label: 'Terminated' },

  // --- Approval request — one review attempt on one application (M4) ---------
  // A returned application closes its request and opens a fresh one on
  // resubmission, so a single application can own several of these. "In
  // progress" rather than "Open" because the reader wants the state of the
  // work, not the state of the row.
  'approvalRequest.OPEN': { variant: 'info', label: 'In progress' },
  'approvalRequest.APPROVED': { variant: 'success', label: 'Approved' },
  'approvalRequest.REJECTED': { variant: 'danger', label: 'Rejected — closed' },
  'approvalRequest.RETURNED': { variant: 'warning', label: 'Rejected — sent back' },
  'approvalRequest.WITHDRAWN': { variant: 'neutral', label: 'Withdrawn' },

  // --- Approval action — one entry in the timeline (M4) ----------------------
  // Past tense throughout: every one of these is a thing that already happened,
  // and a timeline written in the present tense reads like a pending job.
  // REJECT and RETURN are both written by the Reject button now — which one
  // depends on whether corrections remained — so the timeline labels have to
  // carry the difference the action names no longer do.
  'approvalAction.APPROVE': { variant: 'success', label: 'Approved' },
  'approvalAction.REJECT': { variant: 'danger', label: 'Rejected — application closed' },
  'approvalAction.RETURN': { variant: 'warning', label: 'Rejected — sent back to correct' },
  'approvalAction.REASSIGN': { variant: 'info', label: 'Moved to another stage' },
  'approvalAction.COMMENT': { variant: 'neutral', label: 'Commented' },

  // --- Member profile change request (M3 raises them, M4 decides them) -------
  'changeRequest.PENDING': { variant: 'info', label: 'Awaiting approval' },
  'changeRequest.APPROVED': { variant: 'success', label: 'Approved' },
  'changeRequest.REJECTED': { variant: 'danger', label: 'Rejected' },

  // --- Invoice ---------------------------------------------------------------
  'invoice.DRAFT': { variant: 'neutral', label: 'Draft' },
  'invoice.ISSUED': { variant: 'info', label: 'Unpaid' },
  'invoice.PARTIALLY_PAID': { variant: 'warning', label: 'Partly paid' },
  'invoice.PAID': { variant: 'success', label: 'Paid' },
  'invoice.OVERDUE': { variant: 'danger', label: 'Overdue' },
  'invoice.CANCELLED': { variant: 'neutral', label: 'Cancelled' },

  // --- Payment ---------------------------------------------------------------
  'payment.INITIATED': { variant: 'info', label: 'Initiated' },
  'payment.PENDING': { variant: 'info', label: 'Pending' },
  'payment.SUCCESS': { variant: 'success', label: 'Paid' },
  'payment.FAILED': { variant: 'danger', label: 'Failed' },
  'payment.CANCELLED': { variant: 'neutral', label: 'Cancelled' },
  'payment.REFUNDED': { variant: 'warning', label: 'Refunded' },
  'payment.PARTIALLY_REFUNDED': { variant: 'warning', label: 'Partly refunded' },

  // --- Document --------------------------------------------------------------
  'document.PENDING': { variant: 'info', label: 'Awaiting verification' },
  'document.VERIFIED': { variant: 'success', label: 'Verified' },
  'document.REJECTED': { variant: 'danger', label: 'Rejected' },

  // --- Event -----------------------------------------------------------------
  'event.DRAFT': { variant: 'neutral', label: 'Draft' },
  'event.PUBLISHED': { variant: 'success', label: 'Published' },
  'event.CANCELLED': { variant: 'danger', label: 'Cancelled' },
  'event.COMPLETED': { variant: 'neutral', label: 'Completed' },

  // --- Notification outbox ---------------------------------------------------
  'notification.QUEUED': { variant: 'info', label: 'Queued' },
  'notification.SENDING': { variant: 'info', label: 'Sending' },
  'notification.SENT': { variant: 'success', label: 'Sent' },
  'notification.FAILED': { variant: 'danger', label: 'Failed' },
  'notification.CANCELLED': { variant: 'neutral', label: 'Cancelled' },

  // --- Job runs --------------------------------------------------------------
  'job.RUNNING': { variant: 'info', label: 'Running' },
  'job.SUCCESS': { variant: 'success', label: 'Succeeded' },
  'job.FAILED': { variant: 'danger', label: 'Failed' },
};

/**
 * Resolve a domain status. An unmapped value renders neutral with the raw code
 * rather than throwing — a new backend enum should look unstyled, not crash the
 * queue that displays it.
 */
export const resolveStatus = (domain: string, status: string): StatusPresentation =>
  map[`${domain}.${status}`] ?? { variant: 'neutral', label: status };
