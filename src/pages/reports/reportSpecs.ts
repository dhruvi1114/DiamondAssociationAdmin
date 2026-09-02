import type { ReportType } from '@/services/reportsService';

/**
 * What each report is and what it can be narrowed by (screen A-29).
 *
 * The filter KEYS here must match the server's `REPORT_FILTER_KEYS` exactly: the
 * generate endpoint rejects a filter the report does not read, on purpose, so
 * that a stored filter always describes a narrowing that actually happened.
 */

/** Where a filter's option list comes from. */
export type FilterSource =
  | 'memberStatus'
  | 'termStatus'
  | 'invoiceType'
  | 'category'
  /** Searched server-side — the list is too long to cap. */
  | 'member'
  | 'event';

export interface FilterField {
  /** The key the API stores this selection under. */
  key: string;
  label: string;
  source: FilterSource;
}

export interface ReportSpec {
  key: ReportType;
  title: string;
  /** What the report answers, in the office's language. */
  description: string;
  filterFields: FilterField[];
  /** What a date range means here — it is a different date on every report. */
  dateLabel?: string;
  /** Plural noun for the row count in the list. */
  unit: string;
}

export const REPORT_SPECS: ReportSpec[] = [
  {
    key: 'members',
    title: 'Members',
    description: 'Who our members are, by category, status and location.',
    unit: 'members',
    filterFields: [
      { key: 'status', label: 'Membership Status', source: 'memberStatus' },
      { key: 'category_id', label: 'Category', source: 'category' },
      { key: 'member_id', label: 'Member', source: 'member' },
    ],
  },
  {
    key: 'revenue',
    title: 'Revenue',
    description:
      'What we billed and collected, month by month. Drafts and cancelled invoices are excluded.',
    unit: 'months',
    filterFields: [
      { key: 'invoice_type', label: 'Invoice Type', source: 'invoiceType' },
      { key: 'member_id', label: 'Member', source: 'member' },
    ],
    dateLabel: 'Invoice issued',
  },
  {
    key: 'renewals',
    title: 'Renewals Due',
    description: 'Memberships by expiry date, soonest first. A negative days-left has lapsed.',
    unit: 'terms',
    filterFields: [
      { key: 'status', label: 'Cover Status', source: 'termStatus' },
      { key: 'member_id', label: 'Member', source: 'member' },
    ],
    dateLabel: 'Expires between',
  },
  {
    key: 'events',
    title: 'Event Attendance',
    description: 'Bookings, attendees and revenue for each event. Confirmed bookings only.',
    unit: 'events',
    /*
      An event filter, not a member one: "which events did this member attend"
      is a different report from "how did these events do", and offering the
      filter would promise the first while running the second.
    */
    filterFields: [{ key: 'event_id', label: 'Event', source: 'event' }],
    dateLabel: 'Event date',
  },
  {
    key: 'statement',
    title: 'Member Statement',
    description:
      "One company's whole billing history — what they were invoiced, what they paid, what is still due.",
    unit: 'invoices',
    /*
      One member, and only one. A statement is a document ABOUT a company — the
      thing the office sends when they query their dues — and two companies in
      one statement is two documents that can be sent to neither of them.
    */
    filterFields: [{ key: 'member_id', label: 'Member', source: 'member' }],
    dateLabel: 'Invoice issued',
  },
];

/**
 * Filters a report cannot run without, and which take only one value.
 *
 * Mirrors the server's `REQUIRED_FILTERS` / `SINGLE_VALUE_FILTERS`. The server
 * refuses either way; this is what stops the drawer offering a Generate button
 * that is going to be rejected.
 */
export const REQUIRED_FILTERS: Partial<Record<ReportType, readonly string[]>> = {
  statement: ['member_id'],
};

export const SINGLE_VALUE_FILTERS: Partial<Record<ReportType, readonly string[]>> = {
  statement: ['member_id'],
};

export const specFor = (type: ReportType): ReportSpec =>
  REPORT_SPECS.find((spec) => spec.key === type) ?? REPORT_SPECS[0];

/**
 * Fixed option lists.
 *
 * These are enums, so they need no request — and hard-coding them here is not a
 * duplicate of the server's list in the way a hard-coded member list would be:
 * an enum changes with a migration, and a migration changes this file too.
 */
export const STATIC_OPTIONS: Record<string, { id: string; name: string }[]> = {
  memberStatus: [
    { id: 'DRAFT', name: 'Draft' },
    { id: 'PENDING', name: 'Awaiting payment' },
    { id: 'ACTIVE', name: 'Active' },
    { id: 'SUSPENDED', name: 'Suspended' },
    { id: 'EXPIRED', name: 'Expired' },
    { id: 'TERMINATED', name: 'Terminated' },
  ],
  termStatus: [
    { id: 'PENDING_PAYMENT', name: 'Awaiting payment' },
    { id: 'ACTIVE', name: 'Covered' },
    { id: 'EXPIRED', name: 'Lapsed' },
    { id: 'CANCELLED', name: 'Cancelled' },
  ],
  invoiceType: [
    { id: 'MEMBERSHIP', name: 'New membership' },
    { id: 'RENEWAL', name: 'Renewal' },
    { id: 'EVENT', name: 'Event' },
    { id: 'OTHER', name: 'Other' },
  ],
};
