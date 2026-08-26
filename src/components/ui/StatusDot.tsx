import { resolveStatus } from '@/constant/status';
import type { StatusVariant } from '@/theme/tokens';

const DOTS: Record<StatusVariant, string> = {
  success: 'bg-status-success-fg',
  warning: 'bg-status-warning-fg',
  danger: 'bg-status-danger-fg',
  info: 'bg-status-info-fg',
  neutral: 'bg-status-neutral-fg',
};

export interface StatusDotProps {
  /** Domain namespace from `constant/status.ts`, e.g. `document`. */
  domain: string;
  /** Raw backend enum value, e.g. `PENDING`. */
  status: string;
}

/**
 * The quiet form of `StatusChip`: a 6px dot and the same label, no pill.
 *
 * It exists for a **dense list inside a card** — the Documents Summary in the
 * right-hand column of A-04 — where a stack of filled pills reads as a stack of
 * buttons and the eye stops on the chips instead of on the document names they
 * are qualifying. A dot carries the same hue at a fraction of the ink.
 *
 * It resolves through `resolveStatus`, exactly as `StatusChip` does, so the two
 * can never end up saying different words about the same enum: one status, one
 * label, whichever shape the screen needed. The dot is never alone — the label
 * is always beside it, which is what keeps this clear of WCAG 1.4.1 without the
 * icon a chip carries.
 *
 * Use `StatusChip` anywhere the status is the thing being read (a table column,
 * a page header). Use this where the status is the *fourth* thing on a row and
 * a chip would out-shout the first three.
 */
export const StatusDot = ({ domain, status }: StatusDotProps) => {
  const { variant, label } = resolveStatus(domain, status);

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-12 text-fg-muted">
      <span className={`h-[6px] w-[6px] flex-none rounded-full ${DOTS[variant]}`} aria-hidden />
      {label}
    </span>
  );
};

export default StatusDot;
