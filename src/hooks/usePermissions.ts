import { useMemo } from 'react';
import { useAppSelector } from '@/store';

/**
 * Reads the permission set mirrored from the admin's token.
 *
 * **UX only.** Hiding a button the user cannot use is courtesy; it is not
 * security. Every corresponding backend route enforces the same permission
 * independently and re-reads it from the database on each request, so a tampered
 * client list grants exactly nothing (rbac.md §7).
 */
export interface PermissionApi {
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  permissions: string[];
  /**
   * Role codes held, e.g. `['APPROVER']`.
   *
   * A separate question from `permissions`, and M4 is where the difference bites:
   * `application.approve` says *what* this admin may do, while the approval
   * stage's `approver_role_id` says *whose queue* an application is in
   * (rbac.md §4). A screen needs both to explain itself before the click — and
   * the backend still answers both independently.
   */
  roles: string[];
  /** Holds this exact permission code, e.g. `application.approve`. */
  can: (permission: string) => boolean;
  /** Holds at least one of these. */
  canAny: (...permissions: string[]) => boolean;
  /** Holds all of these. */
  canAll: (...permissions: string[]) => boolean;
}

export const usePermissions = (): PermissionApi => {
  const profile = useAppSelector((state) => state.auth.profile);
  const accessToken = useAppSelector((state) => state.auth.accessToken);

  return useMemo(() => {
    const permissions = profile?.permissions ?? [];
    const isSuperAdmin = Boolean(profile?.isSuperAdmin);
    const granted = new Set(permissions);

    // Mirrors the backend: is_super_admin bypasses the permission check
    // entirely (rbac.md §2), and that bypass is itself auditable server-side.
    const can = (permission: string) => isSuperAdmin || granted.has(permission);

    return {
      isAuthenticated: Boolean(accessToken),
      isSuperAdmin,
      permissions,
      roles: profile?.roles ?? [],
      can,
      canAny: (...codes: string[]) => codes.some(can),
      canAll: (...codes: string[]) => codes.every(can),
    };
  }, [profile, accessToken]);
};
