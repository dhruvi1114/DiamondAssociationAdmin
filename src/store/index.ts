import { combineReducers, configureStore } from '@reduxjs/toolkit';
import {
  FLUSH,
  PAUSE,
  PERSIST,
  persistReducer,
  persistStore,
  PURGE,
  REGISTER,
  REHYDRATE,
} from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import authReducer, { signedOut, tokenRefreshed } from './authSlice';
import uiReducer from './uiSlice';
import { configureSession } from '@/services/BaseService';

const rootReducer = combineReducers({
  auth: authReducer,
  ui: uiReducer,
});

/**
 * Only `auth` and `ui` are persisted, and nothing else ever should be: server
 * data in localStorage goes stale silently and is the usual cause of "it shows
 * the old status until I hard-refresh".
 *
 * The access token lives in localStorage rather than an httpOnly cookie. That is
 * the consequence of Bearer-token auth (security.md §2 — CSRF is not applicable,
 * XSS is the trade-off accepted in exchange). It is worth revisiting if cookie
 * auth is ever adopted.
 */
const persistedReducer = persistReducer(
  {
    key: 'association-admin',
    version: 1,
    storage,
    whitelist: ['auth', 'ui'],
  },
  rootReducer,
);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

/**
 * Wire the HTTP layer to the store here rather than importing the store inside
 * `BaseService` — that direction would be a cycle, and the auth slice is exactly
 * the module that needs to stay importable from everywhere.
 */
configureSession({
  getAccessToken: () => store.getState().auth.accessToken,
  getRefreshToken: () => store.getState().auth.refreshToken,
  getLocale: () => store.getState().auth.locale,
  // Refresh tokens rotate server-side, so the NEW pair must replace the old one
  // immediately — keeping the spent refresh token would sign the user out at the
  // next expiry.
  onTokensRefreshed: ({ accessToken, refreshToken }) => {
    store.dispatch(tokenRefreshed({ accessToken, refreshToken }));
  },
  onUnauthorized: () => {
    // Clear first, then let the route guard redirect. Redirecting from here
    // would fight React Router during render.
    if (store.getState().auth.accessToken) {
      store.dispatch(signedOut());
    }
  },
});
