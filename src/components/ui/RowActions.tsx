import { Tooltip } from 'antd';
import type { ReactNode } from 'react';

export interface RowAction {
  key: string;
  /** Icon only — the tooltip and aria-label carry the words. */
  icon: ReactNode;
  /** Verb. Used for both the tooltip and the accessible name. */
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** Positive-consequence action, e.g. reactivating a row — the green counterpart to `danger`. */
  success?: boolean;
  /** Hidden entirely rather than disabled when the actor lacks the permission. */
  hidden?: boolean;
  disabled?: boolean;
  /** Why it is disabled. A dead control with no explanation is a dead end. */
  disabledReason?: string;
}

/**
 * Icon buttons for a table row (tables.md), aligned with the column like every
 * other cell — the Actions column has a heading now, and icons drifting to the
 * right of it read as belonging to the column after.
 *
 * Text actions in every row put two link-coloured words on each line and turn a
 * 40-row table into a wall of repeated verbs; the eye has to skip them to read
 * the data. Icons at 24px keep the row scannable, and the tooltip plus
 * `aria-label` mean nothing is lost for a keyboard or screen-reader user.
 *
 * 24px, not 28: in a row holding nothing but text and a 24px status chip, the
 * button is the tallest thing in it and therefore the thing setting the row
 * height. Matched to the chip, the row is as short as its content allows.
 *
 * A destructive icon carries its colour at rest, not only on hover. It costs a
 * little calm in a long list, and buys the thing that matters more: on a row of
 * otherwise identical grey glyphs the dangerous one is the only one you can pick
 * out before you click it. Touch and keyboard users never see a hover state at
 * all, so a colour that only appears under a pointer is a warning half the
 * audience is never shown.
 */
export const RowActions = ({ actions }: { actions: RowAction[] }) => {
  const visible = actions.filter((action) => !action.hidden);

  if (visible.length === 0) return null;

  return (
    <div className="flex items-center justify-start gap-1">
      {visible.map((action) => {
        const button = (
          <button
            key={action.key}
            type="button"
            aria-label={action.label}
            disabled={action.disabled ?? false}
            onClick={(event) => {
              // Rows may be clickable; an action must not also navigate.
              event.stopPropagation();
              action.onClick();
            }}
            className={[
              'grid h-6 w-6 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-14',
              'transition-colors hover:bg-surface-hover',
              'disabled:cursor-not-allowed disabled:text-fg-subtle disabled:hover:bg-transparent',
              action.danger
                ? 'text-status-danger-fg hover:text-status-danger-fg'
                : action.success
                  ? 'text-status-success-fg hover:text-status-success-fg'
                  : 'text-fg-muted hover:text-fg',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {action.icon}
          </button>
        );

        return (
          <Tooltip key={action.key} title={action.disabledReason ?? action.label}>
            {button}
          </Tooltip>
        );
      })}
    </div>
  );
};

export default RowActions;
