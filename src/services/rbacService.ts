import { ENDPOINTS } from '@/constant/endpoints';
import { BaseService, type ApiResult } from '@/services/BaseService';

/**
 * Staff accounts and roles (M1 backend, A-31/A-32 screens).
 *
 * Mirrors `backend/src/modules/rbac` exactly. Every endpoint here is
 * `rbac.manage` **and** super admin — the server checks both, so a screen that
 * gates on the permission alone is still refused, correctly, for anyone else.
 *
 * `id` crosses the wire as a **string**, not a number: the column is a bigint,
 * and JSON numbers lose precision past 2^53.
 */

/** Mirrors Prisma's `UserStatus`, narrowed to what this screen can set. */
export type AdminUserStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'PENDING_VERIFICATION';

export interface AdminUserRole {
  code: string;
  name: string;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: AdminUserStatus;
  /**
   * The flag that bypasses every permission check. Read-only by design — the
   * API refuses to set it, so the drawer shows it and never offers to change it
   * (rbac.md §8: minting a super admin stays a seed/DBA action).
   */
  is_super_admin: boolean;
  last_login_at: string | null;
  created_at: string;
  roles: AdminUserRole[];
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  /** A seeded role the app itself depends on. */
  is_system: boolean;
  /** Permission codes, already sorted by the server. */
  permissions: string[];
}

export interface ListAdminUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  /**
   * Single-valued, unlike the masters list filters: the server's schema takes
   * one `UserStatus`, not a comma-separated list. Sending two would be silently
   * rejected as an invalid enum.
   */
  status?: AdminUserStatus;
}

export interface CreateAdminUserBody {
  email: string;
  full_name: string;
  phone?: string;
  password: string;
  role_codes?: string[];
}

export interface UpdateAdminUserBody {
  full_name?: string;
  phone?: string | null;
  /** Only these two are settable here; BLOCKED belongs to the member flow. */
  status?: 'ACTIVE' | 'INACTIVE';
}

const query = (params: ListAdminUsersParams = {}): string => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });

  const qs = search.toString();

  return qs ? `?${qs}` : '';
};

/** One permission the platform defines. */
export interface Permission {
  code: string;
  description: string | null;
}

export const RbacService = {
  listRoles: (): Promise<ApiResult<Role[]>> => BaseService.get(ENDPOINTS.RBAC.ROLES),

  /**
   * Every permission, not only the granted ones.
   *
   * The matrix's rows come from here rather than from the union of what the
   * roles hold: a permission nothing has been granted yet would otherwise be
   * missing from the grid entirely, and an admin cannot tick a box that is not
   * drawn.
   */
  listPermissions: (): Promise<ApiResult<Permission[]>> =>
    BaseService.get(ENDPOINTS.RBAC.PERMISSIONS),

  /**
   * Replace a role's permissions with exactly this set.
   *
   * A replace, not a diff: the screen is a grid of tick boxes, and sending the
   * state the admin is looking at cannot drift from it the way a sequence of
   * add/remove calls can.
   */
  setRolePermissions: (
    roleCode: string,
    codes: string[],
  ): Promise<ApiResult<{ code: string; permissions: string[] }>> =>
    BaseService.patch(ENDPOINTS.RBAC.rolePermissions(roleCode), { permission_codes: codes }),

  listAdminUsers: (params?: ListAdminUsersParams): Promise<ApiResult<AdminUser[]>> =>
    BaseService.get(`${ENDPOINTS.RBAC.ADMIN_USERS}${query(params)}`),

  getAdminUser: (id: string): Promise<ApiResult<AdminUser>> =>
    BaseService.get(ENDPOINTS.RBAC.adminUser(id)),

  createAdminUser: (body: CreateAdminUserBody): Promise<ApiResult<AdminUser>> =>
    BaseService.post(ENDPOINTS.RBAC.ADMIN_USERS, body),

  updateAdminUser: (id: string, body: UpdateAdminUserBody): Promise<ApiResult<AdminUser>> =>
    BaseService.patch(ENDPOINTS.RBAC.adminUser(id), body),

  /**
   * Roles are granted and withdrawn one at a time — there is no "set the roles
   * to this list" endpoint. The drawer therefore diffs what the admin chose
   * against what the account already held and sends only the difference.
   */
  assignRole: (id: string, roleCode: string): Promise<ApiResult<AdminUser>> =>
    BaseService.post(ENDPOINTS.RBAC.adminUserRoles(id), { role_code: roleCode }),

  revokeRole: (id: string, roleCode: string): Promise<ApiResult<AdminUser>> =>
    BaseService.delete(ENDPOINTS.RBAC.adminUserRole(id, roleCode)),
};

export default RbacService;
