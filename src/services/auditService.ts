import { ENDPOINTS } from '@/constant/endpoints';
import { BaseService, type ApiResult } from '@/services/BaseService';

/**
 * The audit trail (M10, screen A-35, and the History tab on member, application
 * and invoice detail).
 *
 * Read-only, and there is nothing to add later: the table has no update or
 * delete path anywhere in the platform, so this service has no write method by
 * construction rather than by omission.
 */

export type ActorType = 'MEMBER' | 'ADMIN' | 'SYSTEM';

export interface AuditActor {
  type: ActorType;
  /** NULL for SYSTEM, and for a row whose actor was never recorded. */
  id: string | null;
  /**
   * NULL when the account no longer exists. That is a normal outcome, not an
   * error: the audit row deliberately outlives its actor, so the screen words
   * the absence rather than hiding the row.
   */
  name: string | null;
  email: string | null;
}

export interface AuditLog {
  id: string;
  actor: AuditActor;
  /** `<entity>.<past-tense-verb>`, e.g. `application.approved`. */
  action: string;
  entity_name: string;
  entity_id: string | null;
  /** Only the fields that changed. NULL for a create. */
  before: unknown;
  /** Only the fields that changed. NULL for a delete. */
  after: unknown;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  createdAt: string;
}

export interface AuditFacets {
  /** The whole action vocabulary, including actions that have never fired. */
  actions: string[];
  /** Table names that actually appear in the log. */
  entities: string[];
}

export interface ListAuditParams {
  page?: number;
  limit?: number;
  entity_name?: string;
  entity_id?: string;
  /** Comma-separated lists — the controls are multi-selects. */
  actor_type?: string;
  actor_id?: string;
  action?: string;
  /** `YYYY-MM-DD`. Both bounds are inclusive whole days. */
  from?: string;
  to?: string;
}

const query = (params: ListAuditParams = {}): string => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });

  const qs = search.toString();

  return qs ? `?${qs}` : '';
};

export const AuditService = {
  list: (params?: ListAuditParams): Promise<ApiResult<AuditLog[]>> =>
    BaseService.get(`${ENDPOINTS.AUDIT.LIST}${query(params)}`),

  facets: (): Promise<ApiResult<AuditFacets>> => BaseService.get(ENDPOINTS.AUDIT.FACETS),
};

export default AuditService;
