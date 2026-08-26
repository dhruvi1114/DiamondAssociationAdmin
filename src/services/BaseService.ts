import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { ENCRYPTION_BYPASS_PREFIXES, ENDPOINTS } from '@/constant/endpoints';
import { decrypt, encrypt, isCryptoConfigured } from '@/utils/enc-dec';

/** The token pair the API returns from login and refresh (auth.types.ts). */
export interface SessionTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

/**
 * The single HTTP entry point for the admin app.
 *
 * Interceptors, in order:
 *   request  → attach JWT · attach `lan` · attach `x-request-id`
 *            · encrypt the body into `{ data: "<ciphertext>" }`
 *   response → decrypt `data` back into a plain object
 *            · 401 → sign out (once, not once per in-flight request)
 *
 * Screens never see ciphertext and never see the envelope: they get the payload
 * or a typed `ApiError`.
 */

/** The success envelope (api-conventions.md §2). */
export interface ApiEnvelope<T = unknown> {
  success: true;
  statusCode: number;
  message: string;
  /** Ciphertext on the wire; replaced with the decrypted value by the interceptor. */
  data?: T;
  pagination?: PaginationMeta;
  /** Present only when the API runs with APP_ENV=local. Never relied upon. */
  decrypted_data?: T;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** The error envelope (api-conventions.md §5). */
export interface ApiErrorBody {
  success: false;
  statusCode: number;
  message: string;
  code: ApiErrorCode;
  error?: { fields?: Record<string, string> } & Record<string, unknown>;
  requestId?: string;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_STATE_TRANSITION'
  | 'PAYMENT_FAILED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';

/**
 * What every screen catches. Carries `requestId` so an ErrorState can show a
 * reference the user can quote to support (observability.md §2/§8).
 */
export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly fields?: Record<string, string>,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export interface ApiResult<T> {
  data: T;
  message: string;
  pagination?: PaginationMeta;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

/**
 * The API's origin, for the handful of URLs a browser fetches itself rather
 * than through axios — an `<img src>`, a download link. Exported so those call
 * sites cannot drift from the base every other request uses.
 */
export const API_ORIGIN = BASE_URL;
const REQUEST_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Session hand-off
// ---------------------------------------------------------------------------

/**
 * The store registers its token getter and its sign-out action here, so this
 * module stays free of a Redux import. Without that, `store → BaseService →
 * store` is a cycle, and the auth slice is the thing that most needs to be
 * importable from anywhere.
 */
type SessionBridge = {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  getLocale: () => string;
  /** Called with the rotated pair after a successful silent refresh. */
  onTokensRefreshed: (tokens: { accessToken: string; refreshToken: string }) => void;
  onUnauthorized: () => void;
};

let session: SessionBridge = {
  getAccessToken: () => null,
  getRefreshToken: () => null,
  getLocale: () => 'en',
  onTokensRefreshed: () => undefined,
  onUnauthorized: () => undefined,
};

export const configureSession = (bridge: Partial<SessionBridge>): void => {
  session = { ...session, ...bridge };
};

// ---------------------------------------------------------------------------
// Instance
// ---------------------------------------------------------------------------

const shouldSkipEncryption = (config: InternalAxiosRequestConfig): boolean => {
  const url = config.url ?? '';

  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    return true;
  }

  return ENCRYPTION_BYPASS_PREFIXES.some((prefix) => url.startsWith(prefix));
};

export const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = session.getAccessToken();

  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }

  config.headers.set('lan', session.getLocale());
  config.headers.set('x-request-id', crypto.randomUUID());

  /*
    A file upload has to go up as multipart, and multipart is only parseable if
    the header carries the boundary the browser generated. The instance default
    is `application/json`, so leaving it in place sends a body multer cannot
    read — the request arrives with no file and the endpoint rejects it as if
    the admin had picked nothing. Clearing it lets the browser write the real
    header, boundary and all.
  */
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    config.headers.delete('Content-Type');
  }

  // GET/DELETE query strings are deliberately NOT encrypted — they must stay
  // cacheable and loggable, which is also why a secret never goes in one.
  const hasBody = config.data !== undefined && config.data !== null;

  if (hasBody && !shouldSkipEncryption(config) && isCryptoConfigured()) {
    config.data = { data: encrypt(config.data) };
  }

  return config;
});

// ---------------------------------------------------------------------------
// Silent refresh
// ---------------------------------------------------------------------------

interface RetriableRequest extends InternalAxiosRequestConfig {
  /** Set once a request has already been replayed after a refresh. */
  _retried?: boolean;
}

/** Auth endpoints must never trigger a refresh — that is what recursion is. */
const isAuthEndpoint = (url?: string): boolean =>
  Boolean(url && (url.startsWith(ENDPOINTS.AUTH.REFRESH) || url.startsWith(ENDPOINTS.AUTH.LOGIN)));

/**
 * At most one refresh in flight.
 *
 * Without this, a screen that fires five parallel requests on mount answers five
 * 401s and starts five refreshes. Refresh tokens ROTATE server-side, so the
 * first would succeed and the other four would present an already-revoked token
 * — signing the user out for the crime of loading a dashboard. Every caller
 * awaits the same promise instead.
 */
let refreshInFlight: Promise<string | null> | null = null;

const refreshAccessToken = (): Promise<string | null> => {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  const refreshToken = session.getRefreshToken();

  if (!refreshToken) {
    return Promise.resolve(null);
  }

  refreshInFlight = (async () => {
    try {
      // A bare axios instance: the shared one would re-enter this interceptor.
      const body = isCryptoConfigured()
        ? { data: encrypt({ refresh_token: refreshToken }) }
        : { refresh_token: refreshToken };

      const response = await axios.post<ApiEnvelope<SessionTokens>>(
        `${BASE_URL}${ENDPOINTS.AUTH.REFRESH}`,
        body,
        { headers: { 'Content-Type': 'application/json', lan: session.getLocale() } },
      );

      const envelope = response.data;
      const payload =
        typeof envelope.data === 'string' ? decrypt<SessionTokens>(envelope.data) : envelope.data;

      if (!payload?.access_token) {
        return null;
      }

      session.onTokensRefreshed({
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
      });

      return payload.access_token;
    } catch {
      // Refresh token expired or revoked: this session is genuinely over.
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

http.interceptors.response.use(
  (response) => {
    const envelope = response.data as ApiEnvelope<unknown> | undefined;

    if (envelope && typeof envelope.data === 'string') {
      const decrypted = decrypt(envelope.data);

      // A payload we cannot read is a broken contract, not an empty result.
      if (decrypted === null) {
        return Promise.reject(
          new ApiError(
            'INVALID_REQUEST',
            'The server response could not be read.',
            response.status,
            undefined,
            response.headers['x-request-id'] as string | undefined,
          ),
        );
      }

      envelope.data = decrypted;
    }

    // `decrypted_data` exists only in local and must never be depended upon:
    // reading it would make the app work locally and fail everywhere else.
    delete envelope?.decrypted_data;

    return response;
  },
  async (error: AxiosError<ApiErrorBody>) => {
    if (!error.response) {
      return Promise.reject(
        new ApiError('NETWORK_ERROR', 'Could not reach the server. Check your connection.', 0),
      );
    }

    const { status, data, headers } = error.response;
    const original = error.config as RetriableRequest | undefined;

    // A 401 on a normal call means the 30-minute access token expired. Rotate
    // once, transparently, and replay the request — the user should not be
    // signed out every half hour while actively working.
    //
    // `_retried` bounds it to a single attempt per request, so a refresh that
    // itself 401s cannot loop.
    if (status === 401 && original && !original._retried && !isAuthEndpoint(original.url)) {
      original._retried = true;

      const rotated = await refreshAccessToken();

      if (rotated) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${rotated}`;

        return http.request(original);
      }
    }

    if (status === 401) {
      session.onUnauthorized();
    }

    return Promise.reject(
      new ApiError(
        data?.code ?? 'INTERNAL_ERROR',
        data?.message ?? 'Something went wrong. Please try again.',
        status,
        data?.error?.fields,
        data?.requestId ?? (headers?.['x-request-id'] as string | undefined),
      ),
    );
  },
);

// ---------------------------------------------------------------------------
// Typed helpers — what screens actually call
// ---------------------------------------------------------------------------

const unwrap = <T>(envelope: ApiEnvelope<T>): ApiResult<T> => ({
  data: envelope.data as T,
  message: envelope.message,
  pagination: envelope.pagination,
});

export const BaseService = {
  get: async <T>(url: string, config?: AxiosRequestConfig): Promise<ApiResult<T>> =>
    unwrap<T>((await http.get<ApiEnvelope<T>>(url, config)).data),

  post: async <T>(
    url: string,
    body?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<ApiResult<T>> => unwrap<T>((await http.post<ApiEnvelope<T>>(url, body, config)).data),

  put: async <T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<ApiResult<T>> =>
    unwrap<T>((await http.put<ApiEnvelope<T>>(url, body, config)).data),

  patch: async <T>(
    url: string,
    body?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<ApiResult<T>> => unwrap<T>((await http.patch<ApiEnvelope<T>>(url, body, config)).data),

  delete: async <T>(url: string, config?: AxiosRequestConfig): Promise<ApiResult<T>> =>
    unwrap<T>((await http.delete<ApiEnvelope<T>>(url, config)).data),
};

export default BaseService;
