/**
 * Chart colours, read from the theme at render time.
 *
 * Never a hex code in a chart. The palette lives in `theme/tokens.ts` and
 * reaches CSS as custom properties (`theme/cssVariables.ts`); reading them here
 * means a chart is the same colour as the status chip beside it, and stays that
 * way through a dark-mode switch or a palette change without a chart file being
 * touched.
 *
 * Called during render rather than captured at module load: the variables change
 * when the theme attribute on <html> does, and a value read once at import time
 * would keep the light palette on a dark page.
 */
import { chart } from '@/theme/tokens';

/**
 * What a chart uses before the document exists — tests, first paint.
 *
 * The light values, from the token file. A chart rendered without a theme should
 * look like the app rather than like nothing.
 */
const FALLBACK: Record<string, string> = {
  '--primary': chart.fallback.primary,
  '--status-success-fg': chart.fallback.success,
  '--status-warning-fg': chart.fallback.warning,
  '--status-danger-fg': chart.fallback.danger,
  '--status-info-fg': chart.fallback.info,
  '--fg-muted': chart.fallback.muted,
  '--border': chart.fallback.border,
  '--surface': chart.fallback.surface,
};

const read = (name: string): string => {
  if (typeof document === 'undefined') return FALLBACK[name] ?? chart.fallback.muted;

  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  return value || FALLBACK[name] || chart.fallback.muted;
};

export interface ChartColors {
  /** The main series — one per chart, never more than one thing at a time. */
  primary: string;
  /** Good news: money collected, members joined. */
  success: string;
  /** Bad news: money owed, members lapsed. */
  danger: string;
  warning: string;
  info: string;
  /** Axis labels and legends — present, not competing with the data. */
  muted: string;
  /** Grid lines. Faint enough to read against, not through. */
  grid: string;
  surface: string;
}

export const getChartColors = (): ChartColors => ({
  primary: read('--primary'),
  success: read('--status-success-fg'),
  danger: read('--status-danger-fg'),
  warning: read('--status-warning-fg'),
  info: read('--status-info-fg'),
  muted: read('--fg-muted'),
  grid: read('--border'),
  surface: read('--surface'),
});

/**
 * The donut's slice order.
 *
 * Deliberately NOT the status palette: a share of tenure is not good news or bad
 * news, and colouring the largest member green would say something about them
 * that is not true. These are the neutral ramp, darkest first, so the biggest
 * slice reads as the most prominent without implying a judgement.
 */
export const donutSlice = (index: number): string =>
  chart.donut[Math.min(index, chart.donut.length - 1)] ?? chart.fallback.muted;

/** Plot heights. Two sizes, so a row of charts lines up without per-chart tuning. */
export const CHART_HEIGHT = 240;
export const CHART_HEIGHT_SM = 200;

export const CHART_MARGIN = { top: 8, right: 12, bottom: 4, left: -8 };

/** Axis ticks: small, muted, and tabular so the digits do not jitter. */
export const axisTick = { fontSize: 11, fill: 'currentColor' } as const;
