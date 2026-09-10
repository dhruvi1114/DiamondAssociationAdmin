import { AlertCircle, Check, Clock, Minus, X } from 'lucide-react';
import { Tooltip } from 'antd';

import { resolveStatus } from '@/constant/status';
import type { StatusVariant } from '@/theme/tokens';

/**
 * The wordless form of `StatusChip`, for a column too narrow to spell it out.
 *
 * A **shape** per variant, never a colour alone. Three dots that differ only in
 * hue are the thing WCAG 1.4.1 forbids and the reason `StatusDot` refuses to
 * appear without its label; a tick, a cross and a clock are told apart with the
 * monitor in greyscale, so the colour is reinforcement rather than the message.
 *
 * The word is never lost — it moves to the tooltip and to the accessible name,
 * so a pointer or a screen reader still reads "Awaiting verification". Use this
 * only where the label genuinely cannot fit and the icon repeats on every row,
 * so the reader learns the three shapes once. Where the status is the thing
 * being read, use `StatusChip`; where it is one fact among several on a roomy
 * row, `StatusDot`.
 *
 * Resolves through `resolveStatus` exactly as the chip and the dot do, so the
 * three shapes of the same status can never end up saying different words.
 */

const ICONS: Record<StatusVariant, typeof Check> = {
  success: Check,
  danger: X,
  warning: AlertCircle,
  info: Clock,
  neutral: Minus,
};

const TONES: Record<StatusVariant, string> = {
  success: 'text-status-success-fg',
  danger: 'text-status-danger-fg',
  warning: 'text-status-warning-fg',
  info: 'text-status-info-fg',
  neutral: 'text-status-neutral-fg',
};

export interface StatusIconProps {
  /** Domain namespace from `constant/status.ts`, e.g. `document`. */
  domain: string;
  /** Raw backend enum value, e.g. `PENDING`. */
  status: string;
  /** 16 suits a dense card row; 18 reads better in a table cell. */
  size?: number;
}

export const StatusIcon = ({ domain, status, size = 16 }: StatusIconProps) => {
  const { variant, label } = resolveStatus(domain, status);
  const Icon = ICONS[variant];

  return (
    <Tooltip title={label}>
      {/*
        `role="img"` with the label as its name: the icon IS the content here, so
        a screen reader must read the status, not skip an unlabelled graphic.
        `tabIndex` so the tooltip is reachable without a pointer — the word is
        otherwise available only on hover.
      */}
      <span
        role="img"
        aria-label={label}
        tabIndex={0}
        className={`inline-flex flex-none items-center justify-center rounded-full ${TONES[variant]}`}
      >
        <Icon size={size} strokeWidth={2} aria-hidden />
      </span>
    </Tooltip>
  );
};

export default StatusIcon;
