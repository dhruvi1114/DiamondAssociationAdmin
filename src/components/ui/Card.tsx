import type { ReactNode } from 'react';

export interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Right-aligned header slot — usually one primary action. */
  actions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Removes body padding for a card whose body is a full-bleed table. */
  flush?: boolean;
  /**
   * Tighter chrome — 12px instead of 16px, on the header, the body and the
   * footer alike.
   *
   * For a card in a narrow sidebar column whose body is a short stack of
   * controls or rows rather than prose. At the standard padding the header's
   * 12px bottom and the body's 16px top add up to 28px of nothing between a
   * title and the buttons it introduces, which reads as two objects when they
   * are one. Not a general-purpose "make it smaller": a card holding a form or
   * a table keeps the standard frame.
   */
  dense?: boolean;
}

/**
 * Surface container. A hairline border and one flat elevation — borders do the
 * work in this system, not shadows (design-system.md §1).
 *
 * `flush` also turns on clipping, and only `flush` does. A body that runs to the
 * card's edge has square corners of its own — a table header, most often — and
 * they sat over the card's 10px radius, showing as a grey wedge in each top
 * corner. Clipping is deliberately NOT the default: a padded card holds inputs
 * whose focus ring is a 3px `box-shadow`, and `overflow-hidden` would cut it off
 * anywhere a control sits near the edge.
 */
export const Card = ({
  title,
  description,
  actions,
  footer,
  children,
  className = '',
  flush = false,
  dense = false,
}: CardProps) => (
  <section
    className={`flex flex-col rounded-lg border border-border bg-surface shadow-card ${
      flush ? 'overflow-hidden' : ''
    } ${className}`.trim()}
  >
    {(title || actions || description) && (
      <header
        className={`flex items-start justify-between gap-4 border-b border-border ${
          dense ? 'px-3 pb-[6px] pt-2' : 'px-4 py-3'
        }`}
      >
        <div className="min-w-0">
          {/* The named role, not a size+weight pair that happens to match it —
              a card title and a section heading must move together when the
              type spec is retuned. */}
          {title ? <h2 className="m-0 text-title-secondary text-fg">{title}</h2> : null}
          {/* A dense card's description is a count or a one-line status under a
              16px title, not reading matter — at the supporting size it competes with
              the title it sits beneath. */}
          {description ? (
            <p className={`m-0 mt-[2px] text-fg-muted ${dense ? 'text-12' : 'text-supporting'}`}>
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
    )}

    {/* flex-1 + column so a child can use `mt-auto` to pin itself to the bottom;
        that is what keeps action rows aligned across cards of unequal height.
        `min-h-0` too — a flex item's automatic minimum size is its content size
        unless told otherwise, so without it this div refused to shrink below a
        full, unpaginated-looking table and pushed the whole page into scrolling
        instead of the table's own internal body. */}
    <div className={`flex min-h-0 flex-1 flex-col ${flush ? '' : dense ? 'p-3' : 'p-4'}`.trim()}>
      {children}
    </div>

    {footer ? (
      <footer
        className={`border-t border-border text-supporting text-fg-muted ${
          dense ? 'px-3 py-2' : 'px-4 py-3'
        }`}
      >
        {footer}
      </footer>
    ) : null}
  </section>
);

export default Card;
