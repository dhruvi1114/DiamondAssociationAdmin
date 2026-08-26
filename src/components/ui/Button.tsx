import { Button as AntButton, Tooltip, type ButtonProps as AntButtonProps } from 'antd';
import type { ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning';

/**
 * AntD 5 has its own `variant` prop (`solid | outlined | text | …`). Ours is the
 * semantic one the design system speaks in, so AntD's is omitted rather than
 * merged — two props with the same name and different vocabularies is the kind
 * of ambiguity that produces a "why is this button transparent" bug later.
 */
export interface ButtonProps extends Omit<
  AntButtonProps,
  'type' | 'danger' | 'title' | 'variant' | 'color'
> {
  variant?: ButtonVariant;
  /**
   * Why the button is disabled. A disabled control with no explanation is the
   * most common dead end in an admin UI — the user cannot tell whether they lack
   * a permission, the record is in the wrong state, or the app is broken.
   */
  disabledReason?: string;
  children?: ReactNode;
}

const VARIANT_PROPS: Record<ButtonVariant, Pick<AntButtonProps, 'type' | 'danger'>> = {
  primary: { type: 'primary' },
  secondary: { type: 'default' },
  ghost: { type: 'text' },
  danger: { type: 'primary', danger: true },
  // `type: 'primary'` for the base AntD shape (solid, white text); the actual
  // green is `.btn-success` in `styles/index.css` — no `success` slot exists
  // on AntD's own `type`/`danger` pair, so a class is the only way in.
  success: { type: 'primary' },
  // Outlined, not solid: a warning button marks work still to do, and next to a
  // solid Approve and a solid Reject a third filled control would read as a
  // third decision. The amber is `.btn-warning` in `styles/index.css`, for the
  // same reason `.btn-success` is a class — AntD has no slot for it.
  warning: { type: 'default' },
};

/**
 * Buttons are verbs (design-system.md §4): "Submit application", not "Submit".
 *
 * `loading` implies `disabled` in AntD, so a double submit is impossible without
 * extra state at the call site.
 */
export const Button = ({ variant = 'secondary', disabledReason, ...rest }: ButtonProps) => {
  const button = (
    <AntButton
      {...VARIANT_PROPS[variant]}
      {...rest}
      className={[
        variant === 'success' ? 'btn-success' : '',
        variant === 'warning' ? 'btn-warning' : '',
        rest.className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );

  if (rest.disabled && disabledReason) {
    return (
      <Tooltip title={disabledReason}>
        {/* A disabled button emits no pointer events, so the tooltip needs a live wrapper. */}
        <span className="inline-block">{button}</span>
      </Tooltip>
    );
  }

  return button;
};

export default Button;
