import type { ReactNode } from 'react';
import { usePermissions } from '@/hooks/usePermissions';

export interface PermissionGateProps {
  /** Single permission code, e.g. `invoice.manage`. */
  permission?: string;
  /** Renders when the user holds ANY of these. */
  anyOf?: string[];
  /** Renders when the user holds ALL of these. */
  allOf?: string[];
  /** Rendered instead when the check fails. Usually nothing. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renders children only when the permission check passes.
 *
 * **UX only** — the backend enforces the same permission on every call
 * (rbac.md §7, master instructions §16). Never use this as the only thing
 * standing between a user and an action.
 *
 * Prefer hiding an action over disabling it: a disabled control the user can
 * never enable is noise. Disable (with `disabledReason`) when the action is
 * available in principle but blocked by the record's current state.
 */
export const PermissionGate = ({
  permission,
  anyOf,
  allOf,
  fallback = null,
  children,
}: PermissionGateProps) => {
  const { can, canAny, canAll } = usePermissions();

  const allowed =
    (permission ? can(permission) : true) &&
    (anyOf ? canAny(...anyOf) : true) &&
    (allOf ? canAll(...allOf) : true);

  return <>{allowed ? children : fallback}</>;
};

export default PermissionGate;
