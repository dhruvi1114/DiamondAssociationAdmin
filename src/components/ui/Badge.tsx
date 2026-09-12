import { Tooltip } from 'antd';
import type { StatusVariant } from '@/theme/tokens';

const CLASSES: Record<StatusVariant, string> = {
  success: 'bg-status-success-bg text-status-success-fg',
  warning: 'bg-status-warning-bg text-status-warning-fg',
  danger: 'bg-status-danger-bg text-status-danger-fg',
  info: 'bg-status-info-bg text-status-info-fg',
  neutral: 'bg-status-neutral-bg text-status-neutral-fg',
};

export interface BadgeProps {
  children: string;
  /** Which meaning this carries. `neutral` for a plain count. */
  tone?: StatusVariant;
  /** Why it is here. A badge that abbreviates should always explain on hover. */
  tooltip?: string;
  /**
   * `compact` is the count style for tight rows — the sidebar's work-queue
   * number, where the table-cell pill (≈30px for a single digit) took the room
   * the label needed and cut "Member Requests" to "Member Requ…". A fixed-height
   * 18px capsule, centred, 11px type: a single digit is a circle, two digits a
   * short capsule. Use the default everywhere else — a qualifier like
   * "Awaiting payment" needs the table pill's padding to read as a label.
   */
  size?: 'default' | 'compact';
}

const SIZE_CLASSES: Record<NonNullable<BadgeProps['size']>, string> = {
  default: 'px-[10px] py-[3px] text-12',
  compact: 'h-[18px] min-w-[18px] justify-center px-[5px] text-11 leading-none',
};

/**
 * A small pill for a count or a qualifier inside a table cell.
 *
 * `StatusChip` is for a record's STATE — it resolves a backend enum through the
 * status table and always carries an icon, because status must never be colour
 * alone. This is the other thing tables need: "3 to verify", "Overdue", "New" —
 * facts about a row that are not its status and have no enum behind them.
 *
 * It exists because five screens had each hand-written the same span —
 * `rounded-full bg-status-info-bg px-[10px] py-[3px] text-12 font-medium` — with
 * three different paddings and two different text sizes between them.
 *
 * No icon, deliberately. A count is legible without one, and an icon beside a
 * StatusChip in the same cell reads as a second status.
 */
export const Badge = ({ children, tone = 'neutral', tooltip, size = 'default' }: BadgeProps) => {
  const badge = (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-medium ${SIZE_CLASSES[size]} ${CLASSES[tone]}`}
    >
      {children}
    </span>
  );

  return tooltip ? <Tooltip title={tooltip}>{badge}</Tooltip> : badge;
};

export default Badge;
