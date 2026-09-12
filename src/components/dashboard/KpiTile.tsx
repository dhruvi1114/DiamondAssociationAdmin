import { Tooltip } from 'antd';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, Skeleton } from '@/components/ui';
import type { KpiValue } from '@/services/dashboardService';

/**
 * One headline figure.
 *
 * Three rules, each of them a way a dashboard otherwise lies:
 *
 *  - **A null delta draws no chip.** No previous period, or comparison switched
 *    off, means there is no honest percentage — and "0%" would read as "flat",
 *    which is a claim the data does not support.
 *  - **A failed fetch says so.** A quiet dash where a figure belongs reads as
 *    "business is quiet", which is the opposite of "we could not load it".
 *  - **Every tile links somewhere.** `href` is required rather than optional:
 *    a figure you cannot open is a figure you cannot act on, and the type system
 *    makes that unbuildable rather than merely discouraged.
 */

export interface KpiTileProps {
  label: string;
  /** Pre-formatted — the caller knows whether this is money, a count or a date. */
  value: string;
  /** Null hides the chip entirely. */
  delta?: KpiValue['delta_pct'];
  /**
   * True where a RISE is bad news — money overdue, days outstanding. The arrow
   * still follows the number; only the colour carries whether the movement was
   * wanted.
   */
  invertDelta?: boolean;
  /** A second line under the figure — "12 invoices", "5 waiting a long time". */
  hint?: string;
  /** Where the figure opens. Required, deliberately. */
  href: string;
  icon?: ReactNode;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

const TONE = {
  good: 'text-status-success-fg',
  bad: 'text-status-danger-fg',
  flat: 'text-fg-muted',
} as const;

export const KpiTile = ({
  label,
  value,
  delta,
  invertDelta = false,
  hint,
  href,
  icon,
  loading = false,
  error = false,
  onRetry,
}: KpiTileProps) => {
  const rising = (delta ?? 0) > 0;
  const flat = delta === 0;
  const tone = flat ? 'flat' : rising !== invertDelta ? 'good' : 'bad';
  const Arrow = flat ? Minus : rising ? ArrowUp : ArrowDown;

  return (
    /* `dense` — 12px padding, not 16. Six tiles in a row are read at a glance
       rather than studied, and the extra padding was buying nothing but height. */
    <Card dense className="h-full min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        {icon ? (
          <span className="shrink-0 text-fg-muted" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {/* Same clip as `TextCell`: a flex item will not shrink below its
            text unless the truncated node is block-level inside a `min-w-0`
            wrapper, and Ant Design's Tooltip must wrap that node or the
            hover target is the unclipped full string. */}
        <div className="min-w-0 flex-1">
          <Tooltip title={label}>
            <span className="block truncate text-supporting text-fg-muted">{label}</span>
          </Tooltip>
        </div>
      </div>

      {loading ? (
        <Skeleton variant="list" rows={1} />
      ) : error ? (
        <div className="mt-1 flex flex-col gap-1">
          {/* Never a dash here: an unreadable figure and a genuinely empty one
              must not look the same. */}
          <span className="text-supporting text-status-danger-fg">Could not load</span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="w-fit cursor-pointer border-0 bg-transparent p-0 text-12 text-fg-muted underline"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <Link
            to={href}
            /* 24, not 30. At 30 the figure was the tallest thing on the page and
               the row of six needed two lines of vertical space it did not earn. */
            className="block w-fit text-24 font-semibold tabular text-fg no-underline hover:underline"
          >
            {value}
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            {delta !== null && delta !== undefined ? (
              <span className={`inline-flex items-center gap-1 text-12 ${TONE[tone]}`}>
                <Arrow size={13} strokeWidth={2} />
                {Math.abs(delta)}%
              </span>
            ) : null}
            {hint ? <span className="text-12 text-fg-subtle">{hint}</span> : null}
          </div>
        </>
      )}
    </Card>
  );
};

export default KpiTile;
