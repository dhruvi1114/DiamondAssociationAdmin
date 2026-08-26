import { ENDPOINTS } from '@/constant/endpoints';
import { BaseService, http, type ApiResult } from '@/services/BaseService';

/**
 * Membership applications — the reviewer queue and the decisions (M4).
 *
 * Mirrors `backend/src/modules/application` exactly. Four contract details shape
 * every type below, and getting any of them wrong is a silent bug:
 *
 *  1. **Every id is a string.** They are Postgres bigints, and the controller
 *     serialises them with a replacer because `JSON.stringify` throws on a
 *     BigInt. Typing one as `number` works until it passes 2^53 and then rounds.
 *  2. **`count(*)` columns are strings too**, for the same reason — the queue's
 *     `document_count` and `pending_documents` come from a bigint aggregate.
 *  3. **Money is a string.** `total_amount` is a `Decimal(14,2)`; parsing it into
 *     a float to do arithmetic is exactly what that column type exists to stop.
 *  4. **`sortBy` is allowlisted server-side.** Anything outside
 *     `APPLICATION_SORT_COLUMNS` is a 422, not a fallback.
 */

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'RETURNED_FOR_CORRECTION'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type DocumentVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export type ApprovalActionType = 'APPROVE' | 'REJECT' | 'RETURN' | 'REASSIGN' | 'COMMENT';

export type ApprovalRequestStatus = 'OPEN' | 'APPROVED' | 'REJECTED' | 'RETURNED' | 'WITHDRAWN';

/** Columns the backend will sort the queue by. Anything else is a 422. */
export type ApplicationSortBy = 'submitted_at' | 'company_name' | 'status' | 'createdAt';

export const APPLICATION_SORT_COLUMNS: readonly ApplicationSortBy[] = [
  'submitted_at',
  'company_name',
  'status',
  'createdAt',
];

/**
 * Statuses a reviewer can still act on. `RETURNED_FOR_CORRECTION` is absent on
 * purpose: the ball is with the applicant, and the application is out of every
 * queue until they resubmit (approval-workflow.md §3).
 */
export const ACTIONABLE_STATUSES: readonly ApplicationStatus[] = ['SUBMITTED', 'UNDER_REVIEW'];

/** Statuses with no outgoing transition at all. */
export const TERMINAL_STATUSES: readonly ApplicationStatus[] = [
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
];

export const isActionable = (status: ApplicationStatus): boolean =>
  ACTIONABLE_STATUSES.includes(status);

export const isTerminal = (status: ApplicationStatus): boolean =>
  TERMINAL_STATUSES.includes(status);

/* -------------------------------------------------------------------------- */
/* Queue                                                                       */
/* -------------------------------------------------------------------------- */

export interface ApplicationQueueRow {
  id: string;
  /** Allocated at first submission, so a draft-turned-submitted always has one. */
  application_number: string | null;
  company_name: string;
  status: ApplicationStatus;
  category_name: string;
  tier_name: string | null;
  /** Null once the application is decided or returned — it sits in no queue. */
  stage_id: string | null;
  stage_name: string | null;
  stage_sequence: number | null;
  /** The role that owns this stage. Holding `application.approve` is not enough. */
  approver_role_code: string | null;
  /** The stage's target turnaround. Drives the overdue badge; never enforced. */
  sla_hours: number | null;
  submitted_at: string | null;
  /** Set only once a final decision — approve or reject — lands. */
  decided_at: string | null;
  resubmission_count: number;
  document_count: string;
  pending_documents: string;
  createdAt: string;
  updatedAt: string;
  gst_number: string | null;
  pan_number: string;
  applicant_email: string;
  applicant_phone: string | null;
  company_type_name: string | null;
  /** Always the applicant — registration is self-serve. */
  created_by: string;
  /** Whoever recorded the most recent decision, if any yet. */
  updated_by: string | null;
  /** Only the FINAL approval sets this — an intermediate stage clearing does not. */
  approved_by: string | null;
  /**
   * `count(*) OVER ()` from the queue query. The envelope's `pagination.total`
   * is derived from it and is what screens should read; it is typed here only
   * because it genuinely arrives on the wire.
   */
  total?: string;
}

export interface ListApplicationsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ApplicationStatus | '' | string;
  stage_id?: string;
  category_id?: string;
  /**
   * `true` narrows the queue to stages the caller's own roles own — the default
   * view for a reviewer, who wants their work rather than everyone's. A super
   * admin owns every stage, so for them it narrows nothing.
   */
  mine?: boolean;
  /** Narrows to applications carrying at least one PENDING document — the Verification tab. */
  has_pending_documents?: boolean;
  sortBy?: ApplicationSortBy;
  sortOrder?: 'asc' | 'desc';
}

/* -------------------------------------------------------------------------- */
/* Workflow (A-33)                                                             */
/* -------------------------------------------------------------------------- */

export interface ApprovalStage {
  id: string;
  workflow_id: string;
  sequence: number;
  name: string;
  approver_role_id: string;
  is_final: boolean;
  sla_hours: number | null;
  approver_role: { id: string; code: string; name: string };
}

export interface ApprovalWorkflow {
  id: string;
  code: string;
  name: string;
  subject_type: 'MEMBERSHIP_APPLICATION' | 'PROFILE_CHANGE_REQUEST';
  is_active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Ordered by sequence, ascending — the server sorts, the screen does not. */
  stages: ApprovalStage[];
  /**
   * `application.max_resubmissions` — how many corrections an applicant gets
   * before a rejection closes the application for good. `0` means unlimited.
   *
   * It rides on the workflow because it is read by reviewers who cannot read
   * `SystemSettings` (super-admin only) and yet must be told, before they press
   * Reject, which of the two rejections they are about to make.
   */
  max_resubmissions: number;
}

/* -------------------------------------------------------------------------- */
/* Detail (A-04, A-05)                                                         */
/* -------------------------------------------------------------------------- */

/** Which face of a document an uploaded file is. */
export type DocumentSide = 'SINGLE' | 'FRONT' | 'BACK' | 'COMBINED';

/**
 * How a face is named beside the document's own name.
 *
 * Empty for a single-file type, so the qualifier can be appended unconditionally.
 * The document's NAME is not here: it comes from the master with the API
 * response, because an admin who renames a type expects the review screen to say
 * the new name.
 */
export const DOCUMENT_SIDE_LABELS: Record<DocumentSide, string> = {
  SINGLE: '',
  FRONT: 'Front',
  BACK: 'Back',
  COMBINED: 'Both sides',
};

export interface ApplicationDocument {
  id: string;
  application_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: string;
  checksum_sha256: string;
  version: number;
  verification_status: DocumentVerificationStatus;
  verified_at: string | null;
  remarks: string | null;
  /**
   * Set by the reject transaction: this is one of the files the applicant still
   * owes. A VERIFIED document survives a rejection and is never asked for again.
   */
  requires_reupload: boolean;
  createdAt: string;
  /**
   * Resolved from the master, so a renamed type reads correctly here too.
   *
   * `is_required` is optional here and not in the wire contract: the API has
   * always sent it (`application.repository.ts` selects it), this type simply
   * never asked for it until a screen needed to say "Required" or "Optional"
   * beside a file instead of asserting "Required" about every one of them.
   * Optional so that a caller reading it treats "the field is absent" the way
   * the screens treated it before — as required — rather than as optional.
   */
  document_type: {
    code: string;
    name: string;
    sides: 'SINGLE' | 'FRONT_AND_BACK';
    is_required?: boolean;
  };
  /** Which face of the document this file is. */
  side: DocumentSide;
  verified_by: { id: string; full_name: string } | null;
}

/**
 * The running score the Documents panel shows and the Actions card obeys.
 *
 * Counted over the LATEST version of each required type, which is what the
 * server counts too (`countUnverifiedRequiredDocuments`). A re-upload supersedes
 * what came before, so an application whose first GST scan was rejected and
 * whose second was accepted has nothing outstanding — even though the panel
 * still lists both rows, because the record of what a reviewer actually saw
 * outlives the file it was replaced by.
 *
 * `outstanding` is the number Approve is blocked on: everything not VERIFIED,
 * including a required type nobody uploaded at all.
 */
export interface DocumentScore {
  verified: number;
  rejected: number;
  pending: number;
  /** Required types with no upload at all — a stronger reason to refuse, not a weaker one. */
  missing: number;
  /** verified + rejected + pending + missing, i.e. every required face. */
  total: number;
  /** Everything not VERIFIED. Approve is blocked while this is above zero. */
  outstanding: number;
}

/**
 * Newest file per (type, face).
 *
 * Keyed on the face as well as the type: a two-sided document has a newest front
 * AND a newest back, and collapsing them would score half a document as whole. A
 * COMBINED PDF is its own key and stands for both faces on its own.
 */
const latestByFace = (documents: ApplicationDocument[]): Map<string, ApplicationDocument> => {
  const latest = new Map<string, ApplicationDocument>();

  for (const document of documents) {
    const key = `${document.document_type.code}:${document.side}`;
    const held = latest.get(key);

    if (!held || document.version > held.version) latest.set(key, document);
  }

  return latest;
};

/**
 * How the checklist stands.
 *
 * Counted over the files the API actually returned rather than against a fixed
 * list of three: which documents an application needs is the association's
 * configuration now, and the server has already resolved it.
 */
export const scoreDocuments = (documents: ApplicationDocument[]): DocumentScore => {
  const latest = latestByFace(documents);

  const score: DocumentScore = {
    verified: 0,
    rejected: 0,
    pending: 0,
    missing: 0,
    total: latest.size,
    outstanding: 0,
  };

  for (const document of latest.values()) {
    if (document.verification_status === 'VERIFIED') score.verified += 1;
    else if (document.verification_status === 'REJECTED') score.rejected += 1;
    else score.pending += 1;
  }

  score.outstanding = score.total - score.verified;

  return score;
};

/**
 * The checklist as a LIST rather than as a score — newest version per face, in
 * the order the API returned them.
 *
 * `scoreDocuments` already counts exactly these rows; a summary that lists them
 * has to walk the same set or the count above the list and the list below it
 * disagree the moment somebody re-uploads. Deriving both from `latestByFace`
 * makes that impossible rather than merely unlikely.
 */
export const latestDocuments = (documents: ApplicationDocument[]): ApplicationDocument[] => [
  ...latestByFace(documents).values(),
];

/**
 * The ✗ marks, newest version per type, for the reject dialog.
 *
 * The dialog pre-fills from these (spec D-8): the reviewer already wrote a
 * reason per document in the panel, and asking them to write it again in the
 * dialog is how the two end up disagreeing.
 */
export const rejectedDocuments = (documents: ApplicationDocument[]): ApplicationDocument[] =>
  [...latestByFace(documents).values()].filter(
    (document) => document.verification_status === 'REJECTED',
  );

/** One entry in the append-only history. These rows are never updated. */
export interface ApprovalAction {
  id: string;
  approval_request_id: string;
  stage_id: string;
  admin_user_id: string;
  action: ApprovalActionType;
  from_status: ApplicationStatus | null;
  to_status: ApplicationStatus | null;
  remarks: string | null;
  acted_at: string;
  stage: { id: string; name: string; sequence: number };
  admin_user: { id: string; full_name: string };
}

/**
 * One review round. A returned application closes its request and opens a fresh
 * one on resubmission, so a single application can own several of these — which
 * is exactly what the history timeline groups by.
 */
export interface ApprovalRequest {
  id: string;
  workflow_id: string;
  application_id: string;
  current_stage_id: string | null;
  status: ApprovalRequestStatus;
  opened_at: string;
  closed_at: string | null;
  createdAt: string;
  workflow: { id: string; code: string; name: string };
  current_stage: { id: string; name: string; sequence: number } | null;
  /** Newest first. */
  actions: ApprovalAction[];
}

export interface ApplicationDetail {
  id: string;
  application_number: string | null;
  user_id: string;
  member_id: string;
  category_id: string;
  tier_id: string | null;
  status: ApplicationStatus;
  current_stage_id: string | null;

  /* The snapshot, in the order the applicant filled it in. */
  company_name: string;
  legal_name: string | null;
  business_type: string | null;
  iec_code: string | null;
  gst_number: string | null;
  pan_number: string | null;
  trade_license_no: string | null;
  website: string | null;
  about: string | null;

  submitted_at: string | null;
  decided_at: string | null;
  resubmission_count: number;
  createdAt: string;
  updatedAt: string;

  category: { id: string; code: string; name: string } | null;
  tier: { id: string; code: string; name: string } | null;
  /** The DRAFT member row created when the journey started (ADR-016). */
  member: {
    id: string;
    member_code: string | null;
    company_name: string;
    status: string;
    gstin_holder?: boolean;
    company_category?: boolean | null;
    landline?: string | null;
    consent_accepted_at?: string | null;
    company_type?: { id: string; code: string; name: string } | null;
    categories?: { category: { id: string; code: string; name: string } }[];
    addresses?: {
      id: string;
      address_type: 'REGISTERED' | 'FACTORY' | 'CORRESPONDENCE';
      line1: string;
      line2: string | null;
      city: string;
      state: string;
      country: string;
      pincode: string;
      is_primary: boolean;
    }[];
  } | null;
  user: { id: string; email: string; full_name: string; phone: string | null } | null;
  current_stage: {
    id: string;
    name: string;
    sequence: number;
    is_final: boolean;
    approver_role: { id: string; code: string; name: string };
  } | null;
  documents: ApplicationDocument[];
  /** Newest round first. */
  approval_requests: ApprovalRequest[];
}

/* -------------------------------------------------------------------------- */
/* Decisions                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * What a final approval produced, in one atomic transaction
 * (`approval-workflow.md` §5). Present only on the approval of the final stage;
 * `null` on every other decision.
 */
export interface ActivationResult {
  memberCode: string;
  termId: string;
  invoiceId: string;
  invoiceNumber: string;
  /** Decimal string, e.g. `"29500.00"`. Format it; never add it up. */
  totalAmount: string;
}

export interface DecisionResult {
  application: {
    id: string;
    status: ApplicationStatus;
    current_stage_id: string | null;
    decided_at: string | null;
  };
  activation: ActivationResult | null;
}

/**
 * What a reopen answers with (spec D-18).
 *
 * Read as a receipt, not as state: the screen reloads the application from the
 * detail endpoint straight afterwards. Typed narrowly on purpose — three facts
 * the caller could conceivably quote back to the reviewer, and nothing that
 * would tempt a screen into rendering a half-refreshed application from it.
 */
export interface ReopenResult {
  id: string;
  status: ApplicationStatus;
  resubmission_count: number;
}

const query = (params: ListApplicationsParams = {}): string => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    // `false` must survive — `mine=false` is a real, meaningful value, and the
    // server reads the *string* 'true'/'false' rather than the parameter's
    // presence.
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });

  const qs = search.toString();

  return qs ? `?${qs}` : '';
};

export const ApplicationsService = {
  list: (params?: ListApplicationsParams): Promise<ApiResult<ApplicationQueueRow[]>> =>
    BaseService.get(`${ENDPOINTS.APPLICATIONS.LIST}${query(params)}`),

  detail: (id: string): Promise<ApiResult<ApplicationDetail>> =>
    BaseService.get(ENDPOINTS.APPLICATIONS.detail(id)),

  /** The configured stages and their owning roles (A-33). Needs `workflow.view`. */
  workflow: (): Promise<ApiResult<ApprovalWorkflow>> =>
    BaseService.get(ENDPOINTS.APPLICATIONS.WORKFLOW),

  /**
   * Clear this stage. On the final stage this is the activation transaction —
   * member code, term and invoice, all or nothing — and `activation` comes back
   * populated. Remarks are optional here and mandatory everywhere else.
   */
  approve: (id: string, remarks?: string): Promise<ApiResult<DecisionResult>> =>
    BaseService.post(ENDPOINTS.APPLICATIONS.approve(id), remarks ? { remarks } : {}),

  /**
   * The only decision that goes back to the applicant.
   *
   * Not necessarily terminal: while the applicant has corrections left it sends
   * the application back with the reviewer's note and a login-free link, and
   * only at the cap does it close the application for good. Which of the two
   * happened is in the returned `status` — the client does not decide it and
   * must not predict it.
   *
   * `remarks` is required — 422 without it, by schema and by CHECK. `documents`
   * carries the ✗ marks from the Documents panel so the whole judgement commits
   * in one transaction and reaches the applicant as one email.
   */
  reject: (
    id: string,
    remarks: string,
    documents?: { id: string; remarks: string }[],
  ): Promise<ApiResult<DecisionResult>> =>
    BaseService.post(ENDPOINTS.APPLICATIONS.reject(id), {
      remarks,
      ...(documents && documents.length > 0 ? { documents } : {}),
    }),

  /** Move the application to another stage without deciding it. */
  reassign: (id: string, stageId: string, remarks: string): Promise<ApiResult<DecisionResult>> =>
    BaseService.post(ENDPOINTS.APPLICATIONS.reassign(id), { stage_id: stageId, remarks }),

  /**
   * Put a closed application back in the applicant's hands (spec D-18).
   *
   * The one action on this screen that undoes a decision rather than making one,
   * and the only one a reviewer may not take: the server requires
   * `settings.manage` *and* super admin, because reopening overrides the
   * association's own resubmission cap for one company.
   *
   * `reason` is mandatory — 422 without it. The whole justification for the
   * endpoint is "a genuine case", and an audit row that records who reopened an
   * application but not why answers half the question that made it worth
   * auditing.
   *
   * The caller re-reads the application afterwards rather than trusting this
   * response: reopening changes the status, the counter and the live token
   * together, and the detail endpoint is the one place all three are consistent.
   */
  reopen: (id: string, reason: string): Promise<ApiResult<ReopenResult>> =>
    BaseService.post(ENDPOINTS.APPLICATIONS.reopen(id), { reason }),

  /**
   * Verify or reject one uploaded file.
   *
   * Nested under the application rather than reusing the M3
   * `/documents/:id/verify` route: that one addresses `MemberDocuments`, this
   * one `ApplicationDocuments`, and the two id spaces overlap.
   */
  /**
   * Fetch the bytes and drive the save from an object URL.
   *
   * Same reason as the member-document download: the request needs an
   * `Authorization` header, so the browser cannot simply navigate to the URL.
   * The filename comes from the row we already hold — `Content-Disposition` is
   * not exposed to cross-origin readers.
   */
  downloadDocument: async (
    applicationId: string,
    documentId: string,
    filename: string,
  ): Promise<void> => {
    const response = await http.get<Blob>(
      ENDPOINTS.APPLICATIONS.downloadDocument(applicationId, documentId),
      { responseType: 'blob' },
    );

    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  verifyDocument: (
    applicationId: string,
    documentId: string,
    body: { status: 'VERIFIED' | 'REJECTED'; remarks?: string },
  ): Promise<ApiResult<ApplicationDocument>> =>
    BaseService.patch(ENDPOINTS.APPLICATIONS.verifyDocument(applicationId, documentId), body),
};

export default ApplicationsService;
