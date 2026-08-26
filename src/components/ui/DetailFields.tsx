import type { ReactNode } from 'react';
import NotAvailable from './NotAvailable';

/**
 * The label/value pair and section grouping a detail page (an application, a
 * member) uses for every read-only group on screen — icon, title, a 4-column
 * grid of fields. One definition so two detail pages cannot drift into a
 * different "empty" treatment, a different grid, or a different icon size.
 *
 * Empty fields render the shared `NotAvailable` rather than an em dash or
 * blank space — a review screen is partly a decision made *on* an absence,
 * and it has to read as "left blank" rather than "the platform lost it".
 * `label="Not provided"` says which of those this is.
 */

const Value = ({ children }: { children: ReactNode }) => (
  <dd className="m-0 break-words text-supporting text-fg">{children}</dd>
);

export interface FieldProps {
  label: string;
  value: string | null | undefined;
  /** Identity numbers are read character by character; give them a mono face. */
  mono?: boolean;
  /** Rendered instead of the plain value — a link, a chip. */
  children?: ReactNode;
}

export const Field = ({ label, value, mono = false, children }: FieldProps) => {
  const filled = children ?? (value && value.trim().length > 0 ? value : null);

  return (
    <div className="flex min-w-0 flex-col gap-[2px]">
      <dt className="m-0 text-11 font-medium uppercase tracking-[0.04em] text-fg-muted">{label}</dt>
      {filled ? (
        <Value>{mono ? <span className="font-mono text-12">{filled}</span> : filled}</Value>
      ) : (
        <dd className="m-0">
          <NotAvailable label="Not provided" />
        </dd>
      )}
    </div>
  );
};

export const Group = ({
  icon,
  title,
  description,
  actions,
  children,
}: {
  /** A small glyph naming the kind of thing the group holds — Company vs
   *  Identity read faster with one than with text alone at this size.
   *  Muted, like every icon in this app that is not itself a status. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /**
   * Right-aligned slot on the heading row — the control that edits THIS group.
   *
   * A button floating above the card cannot say which of four groups it acts on;
   * on the heading it is unambiguous, and it stops the page opening with a row
   * of chrome before any of the record it is showing.
   */
  actions?: ReactNode;
  children: ReactNode;
}) => (
  <section className="border-t border-border pt-4 first:border-t-0 first:pt-0">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {icon ? (
          <span className="flex-none text-fg-muted" aria-hidden>
            {icon}
          </span>
        ) : null}
        <h3 className="m-0 text-title-secondary text-fg">{title}</h3>
      </div>
      {actions ? <div className="flex flex-none items-center gap-2">{actions}</div> : null}
    </div>
    {description ? <p className="m-0 mb-3 mt-[2px] text-12 text-fg-muted">{description}</p> : null}
    {/*
      Four columns at rest: a group here runs the full width of its column
      rather than sharing it with two more, and a 2-column grid across that
      width left every value a metre from its own label.
    */}
    <dl className="m-0 mt-3 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 lg:grid-cols-4">
      {children}
    </dl>
  </section>
);
