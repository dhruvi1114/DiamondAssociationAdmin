/**
 * Display formatting (design-system.md §4).
 *
 * One implementation each, so "12 Aug 2026" does not become "12/08/2026" on the
 * next screen somebody builds. Every function tolerates null: an admin list is
 * full of fields that are legitimately not filled in yet, and a crash on a null
 * date is a worse answer than an em dash.
 */

/** What an empty value looks like. Never a blank cell — that reads as a bug. */
export const EMPTY = '—';

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/*
  12-hour with am/pm, not 24-hour. The federation's staff read and write times
  that way — an invoice due "5 pm", an event at "10:30 am" — and 17:00 in the UI
  against 5 pm everywhere else is a translation the reader has to do every time.

  `hour: 'numeric'` rather than `'2-digit'` because a leading zero is a 24-hour
  habit: "02:05 pm" reads as a timestamp, "2:05 pm" reads as a time.
*/
const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const parse = (value: string | null | undefined): Date | null => {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

/** "12 Aug 2026". */
export const formatDate = (value: string | null | undefined): string => {
  const date = parse(value);

  return date ? DATE.format(date) : EMPTY;
};

/** "12 Aug 2026, 2:05 pm" — used where the ordering of two events matters. */
export const formatDateTime = (value: string | null | undefined): string => {
  const date = parse(value);

  return date ? DATE_TIME.format(date) : EMPTY;
};

/**
 * Each step says how many of the current unit fit in the next one, so the loop
 * divides its way up the scale instead of carrying a table of magic seconds.
 */
const DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/**
 * "2 days ago". Queues need age, not a timestamp: "how long has this been
 * waiting" is the question a work queue exists to answer (ux-principles.md §3).
 */
export const formatRelative = (value: string | null | undefined): string => {
  const date = parse(value);

  if (!date) return EMPTY;

  let duration = (date.getTime() - Date.now()) / 1000;

  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return RELATIVE.format(Math.round(duration), division.unit);
    }

    duration /= division.amount;
  }

  return EMPTY;
};

/**
 * Whole hours since a timestamp, or `null` when there is no timestamp.
 *
 * The queue's overdue badge is a comparison against `ApprovalStages.sla_hours`,
 * and that comparison has to happen on a number rather than on the relative
 * string — "2 days ago" cannot be compared to 48.
 */
export const hoursSince = (value: string | null | undefined): number | null => {
  const date = parse(value);

  return date ? (Date.now() - date.getTime()) / 3_600_000 : null;
};

/**
 * "3 days" — a duration, not a point in time.
 *
 * `formatRelative` answers "when did this happen"; a queue asks "how long has
 * this been waiting", and "2 days ago" in a column headed *Waiting* makes the
 * reader do the translation. Deliberately coarse: nobody triages on minutes, and
 * an age that ticks in a table only tells you the clock works.
 */
export const formatAge = (hours: number | null): string => {
  if (hours === null) return EMPTY;
  if (hours < 1) return 'under an hour';
  if (hours < 48) {
    const whole = Math.floor(hours);

    return `${whole} ${whole === 1 ? 'hour' : 'hours'}`;
  }

  const days = Math.floor(hours / 24);

  return `${days} days`;
};

const SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

/**
 * "₹29,500.00" — the string form of `MoneyText`, for the places that cannot
 * render a node: a toast, a confirmation sentence, an `aria-label`.
 *
 * Takes a STRING because that is what the API sends (api-conventions.md §1).
 * Parsing it into a float to format it is safe; storing or arithmetic on that
 * float is not, which is why nothing here adds anything up.
 */
export const formatMoney = (
  amount: string | null | undefined,
  currency: string = 'INR',
): string => {
  if (amount === null || amount === undefined || amount === '') return EMPTY;

  const numeric = Number(amount);
  const formatted = Number.isFinite(numeric)
    ? numeric.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : amount;

  return `${SYMBOLS[currency] ?? `${currency} `}${formatted}`;
};

const SIZES = ['B', 'KB', 'MB', 'GB'];

/**
 * "1.4 MB". Takes a string because the API sends `size_bytes` as one — it is a
 * Postgres bigint, and a bigint cannot survive `JSON.stringify` as a number.
 */
export const formatBytes = (value: string | number | null | undefined): string => {
  const bytes = typeof value === 'string' ? Number(value) : value;

  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return EMPTY;
  if (bytes === 0) return '0 B';

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), SIZES.length - 1);
  const scaled = bytes / 1024 ** exponent;

  return `${exponent === 0 ? scaled : scaled.toFixed(1)} ${SIZES[exponent]}`;
};

/** Falls back to an em dash so an empty cell always looks deliberate. */
export const orEmpty = (value: string | null | undefined): string =>
  value && value.trim().length > 0 ? value : EMPTY;
