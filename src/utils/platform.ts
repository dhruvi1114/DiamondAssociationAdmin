/**
 * Which modifier key to *show* in shortcut hints.
 *
 * Display only. The handlers accept both Meta and Control everywhere, so a Mac
 * user on an external PC keyboard is never locked out of a shortcut because the
 * app guessed their hardware wrong.
 */
export const isMac = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
