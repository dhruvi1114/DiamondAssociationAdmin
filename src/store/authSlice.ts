import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Admin session state.
 *
 * `permissions` is mirrored from the token purely so the UI can hide actions the
 * user cannot perform (rbac.md §7). It is **never** an authorization decision —
 * the backend re-reads the permission set from the database on every admin
 * request, so a stale or tampered client list grants nothing.
 */
export interface AdminProfile {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  /** Role codes — what permission checks and audit records speak in. */
  roles: string[];
  /**
   * The same roles as their display names. Kept alongside the codes rather than
   * derived from them: a code is an identifier, and prettifying `ACCOUNTS_OFC`
   * into something to show a human is guesswork that goes stale the moment
   * someone renames a role in the database.
   */
  roleNames: string[];
  permissions: string[];
}

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  profile: AdminProfile | null;
  locale: string;
}

const initialState: AuthState = {
  accessToken: null,
  refreshToken: null,
  profile: null,
  locale: 'en',
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signedIn: (
      state,
      action: PayloadAction<{ accessToken: string; refreshToken: string; profile: AdminProfile }>,
    ) => {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.profile = action.payload.profile;
    },
    tokenRefreshed: (
      state,
      action: PayloadAction<{ accessToken: string; refreshToken?: string }>,
    ) => {
      state.accessToken = action.payload.accessToken;

      if (action.payload.refreshToken) {
        state.refreshToken = action.payload.refreshToken;
      }
    },
    profileLoaded: (state, action: PayloadAction<AdminProfile>) => {
      state.profile = action.payload;
    },
    localeChanged: (state, action: PayloadAction<string>) => {
      state.locale = action.payload;
    },
    /** Clears everything. Triggered by explicit logout AND by any 401. */
    signedOut: (state) => {
      state.accessToken = null;
      state.refreshToken = null;
      state.profile = null;
    },
  },
});

export const { signedIn, tokenRefreshed, profileLoaded, localeChanged, signedOut } =
  authSlice.actions;

export default authSlice.reducer;
