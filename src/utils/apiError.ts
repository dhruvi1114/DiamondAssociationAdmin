import { ApiError, type ApiErrorCode } from '@/services/BaseService';

/**
 * The shape an `ErrorState`, an `Alert` or a toast can actually render.
 *
 * Screens catch `unknown` — that is what a `catch` block gives you — and every
 * one of them needs the same three things out of it: a sentence to show, the
 * request id to quote to support, and the code, because a 409 on a status change
 * is a message the operator must read rather than a failure to retry.
 */
export interface DisplayError {
  message: string;
  requestId?: string;
  code?: ApiErrorCode;
}

export const asDisplayError = (error: unknown): DisplayError => {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      ...(error.requestId ? { requestId: error.requestId } : {}),
      code: error.code,
    };
  }

  const loose = error as { message?: string; requestId?: string };

  return {
    message: loose?.message ?? 'Something went wrong. Please try again.',
    ...(loose?.requestId ? { requestId: loose.requestId } : {}),
  };
};

/** Field-level messages from a 422, keyed by field name (api-conventions.md §5). */
export const fieldErrors = (error: unknown): Record<string, string> =>
  error instanceof ApiError ? (error.fields ?? {}) : {};
