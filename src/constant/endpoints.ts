/**
 * API endpoint constants (api-conventions.md §1).
 *
 * Shared-by-copy with `customer/src/constant/endpoints.ts` rather than extracted
 * into a package, so the two apps stay independently deployable.
 */
export const API_BASE = '/api/v1';

export const ENDPOINTS = {
  HEALTH: `${API_BASE}/health`,
  HEALTH_READY: `${API_BASE}/health/ready`,

  /**
   * Staff auth. Every path is the `/auth/admin/*` audience — the admin app must
   * never call a member endpoint, and a member token would fail on `aud`
   * anyway (ADR-002).
   */
  AUTH: {
    LOGIN: `${API_BASE}/auth/admin/login`,
    LOGOUT: `${API_BASE}/auth/admin/logout`,
    REFRESH: `${API_BASE}/auth/admin/refresh`,
    ME: `${API_BASE}/auth/admin/me`,
  },

  /** RBAC administration — `rbac.manage`, super admin only (M1). */
  RBAC: {
    ROLES: `${API_BASE}/admin/roles`,
    ADMIN_USERS: `${API_BASE}/admin/admin-users`,
    adminUser: (id: string) => `${API_BASE}/admin/admin-users/${id}`,
    adminUserRoles: (id: string) => `${API_BASE}/admin/admin-users/${id}/roles`,
    adminUserRole: (id: string, roleCode: string) =>
      `${API_BASE}/admin/admin-users/${id}/roles/${roleCode}`,
    /** Every permission the platform defines — the matrix's rows. */
    PERMISSIONS: `${API_BASE}/admin/permissions`,
    rolePermissions: (roleCode: string) => `${API_BASE}/admin/roles/${roleCode}/permissions`,
  },

  /**
   * Membership applications — the reviewer queue and the decisions (M4,
   * A-03…A-05, A-33).
   *
   * `workflow` sits above `detail` here for the same reason it is registered
   * first on the server: `/applications/workflow` and `/applications/:id` are
   * the same shape, and whichever is declared first wins.
   */
  APPLICATIONS: {
    LIST: `${API_BASE}/admin/applications`,
    WORKFLOW: `${API_BASE}/admin/applications/workflow`,
    detail: (id: string) => `${API_BASE}/admin/applications/${id}`,
    approve: (id: string) => `${API_BASE}/admin/applications/${id}/approve`,
    /**
     * The only way back to the applicant. `/return` retired with the two-action
     * model — what this does now depends on the resubmission count, not on which
     * of two buttons was pressed.
     */
    reject: (id: string) => `${API_BASE}/admin/applications/${id}/reject`,
    reassign: (id: string) => `${API_BASE}/admin/applications/${id}/reassign`,
    /**
     * Undo a closed application (spec D-18). Super admin only, server-side.
     *
     * Not part of the reviewer's decision set and deliberately not next to it:
     * approve, reject and reassign move an application through the workflow,
     * while this one overrides the association's own limit after the workflow
     * has finished with it. Same authority as editing
     * `application.max_resubmissions`, which is why the server guards it with
     * `settings.manage` plus the super-admin floor rather than with
     * `application.reject`.
     */
    reopen: (id: string) => `${API_BASE}/admin/applications/${id}/reopen`,
    /**
     * Application files are their own table (`ApplicationDocuments`), which is
     * why this is nested under the application rather than reusing the M3
     * `/documents/:id/verify` route — that one addresses `MemberDocuments`, and
     * the two id spaces overlap.
     */
    verifyDocument: (id: string, documentId: string) =>
      `${API_BASE}/admin/applications/${id}/documents/${documentId}/verify`,
    /** Nested for the same reason: the id is only meaningful inside its application. */
    downloadDocument: (id: string, documentId: string) =>
      `${API_BASE}/admin/applications/${id}/documents/${documentId}/download`,
  },

  /** Member records, KYC documents and status changes (M3, A-07…A-09, A-13). */
  MEMBERS: {
    LIST: `${API_BASE}/admin/members`,
    detail: (id: string) => `${API_BASE}/admin/members/${id}`,
    category: (id: string) => `${API_BASE}/admin/members/${id}/category`,
    suspend: (id: string) => `${API_BASE}/admin/members/${id}/suspend`,
    reactivate: (id: string) => `${API_BASE}/admin/members/${id}/reactivate`,
    terminate: (id: string) => `${API_BASE}/admin/members/${id}/terminate`,
    documents: (id: string) => `${API_BASE}/admin/members/${id}/documents`,
    markInvoicePaid: (id: string, invoiceId: string) =>
      `${API_BASE}/admin/members/${id}/invoices/${invoiceId}/mark-paid`,
  },

  DOCUMENTS: {
    verify: (id: string) => `${API_BASE}/admin/documents/${id}/verify`,
    /**
     * Shared by both audiences — the caller declares which one it is with
     * `x-audience: admin`, and the service decides entitlement (rbac.md §6).
     */
    download: (id: string) => `${API_BASE}/documents/${id}/download`,
  },

  /** Every invoice, org-wide (M5, A-14). */
  /** The refund queue — `refund.manage`, ACCOUNTS and super admin only (M5). */
  REFUNDS: {
    LIST: `${API_BASE}/admin/refunds`,
    approve: (id: string) => `${API_BASE}/admin/refunds/${id}/approve`,
    reject: (id: string) => `${API_BASE}/admin/refunds/${id}/reject`,
    complete: (id: string) => `${API_BASE}/admin/refunds/${id}/complete`,
    fail: (id: string) => `${API_BASE}/admin/refunds/${id}/fail`,
  },

  INVOICES: {
    LIST: `${API_BASE}/admin/invoices`,
    /** Shared by both audiences, same pattern as DOCUMENTS.download. */
    pdf: (id: string) => `${API_BASE}/invoices/${id}/pdf`,
    receiptPdf: (id: string) => `${API_BASE}/invoices/${id}/receipt/pdf`,
  },

  /** Events and their price tiers (M7). */
  EVENTS: {
    LIST: `${API_BASE}/admin/events`,
    detail: (id: string) => `${API_BASE}/admin/events/${id}`,
    publish: (id: string) => `${API_BASE}/admin/events/${id}/publish`,
    cancel: (id: string) => `${API_BASE}/admin/events/${id}/cancel`,
    banner: (id: string) => `${API_BASE}/admin/events/${id}/banner`,
    attendees: (id: string) => `${API_BASE}/admin/events/${id}/attendees`,
    attendeesExport: (id: string) => `${API_BASE}/admin/events/${id}/attendees/export`,
    REGISTRATIONS: `${API_BASE}/admin/event-registrations`,
    registration: (id: string) => `${API_BASE}/admin/event-registrations/${id}`,
    approve: (id: string) => `${API_BASE}/admin/event-registrations/${id}/approve`,
    reject: (id: string) => `${API_BASE}/admin/event-registrations/${id}/reject`,
    PAYMENT_SUBMISSIONS: `${API_BASE}/admin/payment-submissions`,
    verifyPayment: (id: string) => `${API_BASE}/admin/payment-submissions/${id}/verify`,
    rejectPayment: (id: string) => `${API_BASE}/admin/payment-submissions/${id}/reject`,
  },

  /**
   * News — the association's own writing on the public website (M9).
   *
   * Not `/communication/notices`: a notice is pushed to chosen members and
   * tracked per recipient, news is a page anyone can read and Google indexes.
   * Different audience, different table, different endpoint tree.
   */
  NEWS: {
    LIST: `${API_BASE}/admin/news`,
    detail: (id: string) => `${API_BASE}/admin/news/${id}`,
    publish: (id: string) => `${API_BASE}/admin/news/${id}/publish`,
    unpublish: (id: string) => `${API_BASE}/admin/news/${id}/unpublish`,
    archive: (id: string) => `${API_BASE}/admin/news/${id}/archive`,
    cover: (id: string) => `${API_BASE}/admin/news/${id}/cover`,
    attachments: (id: string) => `${API_BASE}/admin/news/${id}/attachments`,
    attachment: (id: string, attachmentId: string) =>
      `${API_BASE}/admin/news/${id}/attachments/${attachmentId}`,
    images: (id: string) => `${API_BASE}/admin/news/${id}/images`,
    image: (id: string, imageId: string) => `${API_BASE}/admin/news/${id}/images/${imageId}`,
    CATEGORIES: `${API_BASE}/admin/news-categories`,
    category: (id: string) => `${API_BASE}/admin/news-categories/${id}`,
  },

  /** Membership catalogue — categories, tiers, fees, document types (M2). */
  MASTERS: {
    CATEGORIES: `${API_BASE}/admin/membership-categories`,
    category: (id: string) => `${API_BASE}/admin/membership-categories/${id}`,
    TIERS: `${API_BASE}/admin/membership-tiers`,
    tier: (id: string) => `${API_BASE}/admin/membership-tiers/${id}`,
    FEES: `${API_BASE}/admin/fee-structures`,
    fee: (id: string) => `${API_BASE}/admin/fee-structures/${id}`,
    FEE_RESOLVE: `${API_BASE}/admin/fee-structures/resolve`,
    COMPANY_TYPES: `${API_BASE}/admin/company-types`,
    companyType: (id: string) => `${API_BASE}/admin/company-types/${id}`,
    /* M7 — the kinds of event the association runs. Staff-maintained. */
    EVENT_TYPES: `${API_BASE}/admin/event-types`,
    eventType: (id: string) => `${API_BASE}/admin/event-types/${id}`,
    COUNTRIES: `${API_BASE}/admin/countries`,
    country: (id: string) => `${API_BASE}/admin/countries/${id}`,
    STATES: `${API_BASE}/admin/states`,
    state: (id: string) => `${API_BASE}/admin/states/${id}`,
    CITIES: `${API_BASE}/admin/cities`,
    city: (id: string) => `${API_BASE}/admin/cities/${id}`,
    DOCUMENT_TYPES: `${API_BASE}/admin/document-types`,
    documentType: (id: string) => `${API_BASE}/admin/document-types/${id}`,
  },

  /** Runtime configuration a super admin may change without a deploy (M10, A-34). */
  /** The work-queue counts on the landing page — `dashboard.view` (M10, A-02). */
  DASHBOARD: {
    SUMMARY: `${API_BASE}/admin/dashboard/summary`,
  },

  /**
   * Reports (M10, screen A-29). `report.view` reads one, `report.export`
   * downloads it — two permissions, because taking data out of the building is
   * a different decision from reading it on screen.
   */
  REPORTS: {
    LIST: `${API_BASE}/admin/reports`,
    detail: (id: string) => `${API_BASE}/admin/reports/${id}`,
    export: (id: string) => `${API_BASE}/admin/reports/${id}/export`,
  },

  /** The audit trail — `audit.view` (M10, screen A-35). Read-only by design. */
  AUDIT: {
    LIST: `${API_BASE}/admin/audit`,
    FACETS: `${API_BASE}/admin/audit/facets`,
  },

  SETTINGS: `${API_BASE}/admin/settings`,
  /**
   * The `is_public` settings, unauthenticated — the association's display name,
   * which names the browser tab on every screen including sign-in.
   */
  PUBLIC_SETTINGS: `${API_BASE}/public/settings`,
  /** Upload or clear a branding image. `slot` is `logo` or `logo-mark`. */
  brandingUpload: (slot: string) => `${API_BASE}/admin/settings/branding/${slot}`,
  /**
   * The image itself — unauthenticated, because the login screen and the invoice
   * header both need it and neither has a session.
   */
  brandingImage: (slot: string) => `${API_BASE}/public/branding/${slot}`,
} as const;

/**
 * Requests that exchange plaintext bodies (api-conventions.md §2). Kept in step
 * with `backend/src/middleware/decryption.ts` — if the two lists disagree, the
 * failure is a 400 on a route that looks fine in isolation.
 */
export const ENCRYPTION_BYPASS_PREFIXES = [`${API_BASE}/health`, `${API_BASE}/webhooks`];
