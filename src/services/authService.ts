import { ENDPOINTS } from '@/constant/endpoints';
import { BaseService, type SessionTokens } from '@/services/BaseService';
import type { AdminProfile } from '@/store/authSlice';

/**
 * Typed calls to the staff auth endpoints (api-specification.md §M1).
 *
 * The wire uses `snake_case` (the API's convention, ADR-003) and the store uses
 * `camelCase` (the app's). The translation happens here, once, so no screen ever
 * has to know both.
 */

interface AdminLoginPayload extends SessionTokens {
  admin: {
    id: string;
    email: string;
    full_name: string;
    phone: string | null;
    status: string;
    is_super_admin: boolean;
    last_login_at: string | null;
  };
  roles: { code: string; name: string }[];
  permissions: string[];
}

interface AdminMePayload {
  admin: AdminLoginPayload['admin'];
  roles: { code: string; name: string }[];
  permissions: string[];
}

const toProfile = (payload: AdminMePayload | AdminLoginPayload): AdminProfile => ({
  id: payload.admin.id,
  email: payload.admin.email,
  fullName: payload.admin.full_name,
  isSuperAdmin: payload.admin.is_super_admin,
  roles: payload.roles.map((role) => role.code),
  roleNames: payload.roles.map((role) => role.name),
  permissions: payload.permissions,
});

export interface SignInResult {
  accessToken: string;
  refreshToken: string;
  profile: AdminProfile;
}

export const authService = {
  signIn: async (email: string, password: string): Promise<SignInResult> => {
    const { data } = await BaseService.post<AdminLoginPayload>(ENDPOINTS.AUTH.LOGIN, {
      email,
      password,
    });

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      profile: toProfile(data),
    };
  },

  /**
   * Re-reads roles and permissions from the server.
   *
   * Called on every app boot rather than trusting the persisted profile: the
   * backend re-reads the permission set on each request anyway, so a stale
   * localStorage copy would only ever produce a nav full of buttons that 403 —
   * the exact confusion permission-aware navigation exists to avoid.
   */
  me: async (): Promise<AdminProfile> => {
    const { data } = await BaseService.get<AdminMePayload>(ENDPOINTS.AUTH.ME);

    return toProfile(data);
  },

  /**
   * Revoke the session server-side. `all: true` revokes every device.
   * Deliberately allowed to fail quietly at the call site — the client clears
   * its own state regardless, because a sign-out button that can leave the user
   * signed in is worse than one that leaves a stale row for the prune job.
   */
  signOut: (refreshToken: string | null, all = false): Promise<unknown> =>
    BaseService.post(ENDPOINTS.AUTH.LOGOUT, { refresh_token: refreshToken ?? undefined, all }),
};

export default authService;
