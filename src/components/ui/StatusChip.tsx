import {
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  MinusCircleFilled,
} from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { ReactNode } from 'react';
import { resolveStatus } from '@/constant/status';
import type { StatusVariant } from '@/theme/tokens';

/**
 * Status is conveyed by **icon + label**, never by colour alone.
 *
 * Two reasons, both non-negotiable: WCAG 1.4.1, and the fact that these screens
 * get printed and photographed — a greyscale print of a colour-only chip carries
 * no information at all (design-system.md §1).
 */
const ICONS: Record<StatusVariant, ReactNode> = {
  success: <CheckCircleFilled aria-hidden="true" />,
  warning: <ExclamationCircleFilled aria-hidden="true" />,
  danger: <CloseCircleFilled aria-hidden="true" />,
  info: <ClockCircleFilled aria-hidden="true" />,
  neutral: <MinusCircleFilled aria-hidden="true" />,
};

const CLASSES: Record<StatusVariant, string> = {
  success: 'bg-status-success-bg text-status-success-fg',
  warning: 'bg-status-warning-bg text-status-warning-fg',
  danger: 'bg-status-danger-bg text-status-danger-fg',
  info: 'bg-status-info-bg text-status-info-fg',
  neutral: 'bg-status-neutral-bg text-status-neutral-fg',
};

export interface StatusChipProps {
  /** Domain namespace from `constant/status.ts`, e.g. `invoice`. */
  domain: string;
  /** Raw backend enum value, e.g. `PARTIALLY_PAID`. */
  status: string;
  /** Extra context on hover — typically the date and actor of the transition. */
  tooltip?: string;
}

export const StatusChip = ({ domain, status, tooltip }: StatusChipProps) => {
  const { variant, label } = resolveStatus(domain, status);

  const chip = (
    <span
      className={`inline-flex items-center gap-[6px] whitespace-nowrap rounded-full px-[10px] py-[3px] text-12 font-medium ${CLASSES[variant]}`}
    >
      {ICONS[variant]}
      {label}
    </span>
  );

  return tooltip ? <Tooltip title={tooltip}>{chip}</Tooltip> : chip;
};

export default StatusChip;
