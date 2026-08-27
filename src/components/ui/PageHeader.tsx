import type { ReactNode } from 'react';

export interface PageHeaderProps {
  /**
   * The screen's name. Rendered **visually hidden**: the app header already shows
   * it, and two titles competing on one screen is the defect this component used
   * to cause. It stays in the DOM as the page's `h1` so the heading outline and
   * screen-reader navigation are still correct.
   */
  title: string;
  /** One line of context, when the title alone is not enough. Optional by design. */
  subtitle?: ReactNode;
  /**
   * Right-aligned, on the title row. The search box always lives here, then one
   * primary action at most. One or two filters may join them while they fit.
   */
  actions?: ReactNode;
  /**
   * A left-aligned row of its own, below `actions`. For a page with more filters
   * than fit beside the search box — they read as a set, so they get a set's
   * worth of room. The search box does NOT move down with them.
   */
  filters?: ReactNode;
}

/**
 * The top of a page body: context and controls, not a title block.
 *
 * The scan path is sidebar (where am I) → header (what is this page) → filters →
 * table → pagination. Nothing here may jump in front of that, which is why the
 * title is hidden, the subtitle is 12px muted, and there is no rule underneath —
 * the app header already draws the only hairline the eye needs.
 *
 * The 8px below each row is the app's one measure for "these two things are the
 * same object": the controls and the table they operate on, tighter than the
 * 12px frame around the pair. `ui/Tabs` uses the same gap for the same reason,
 * which is what makes a tabbed list and a plain one sit identically — they were
 * 16 here against 8 there, and the two pages read as different layouts.
 */
export const PageHeader = ({ title, subtitle, actions, filters }: PageHeaderProps) => {
  const hasBar = Boolean(subtitle || actions);

  return (
    <>
      <h1 className="sr-only">{title}</h1>

      {hasBar ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {subtitle ? (
            <p className="m-0 min-w-0 max-w-[70ch] text-12 text-fg-muted">{subtitle}</p>
          ) : (
            <span className="hidden sm:block" />
          )}
          {actions ? (
            /*
              `min-w-0 max-w-full` lets the group shrink below its children's
              preferred widths on a phone; without it a fixed search box plus
              Add button overflowed the page instead of wrapping. `w-full` on
              small screens makes a lone actions row use the full toolbar so
              the search field can grow into the spare room.
            */
            <div className="flex min-w-0 w-full max-w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}

      {filters ? <div className="mb-2 flex flex-wrap items-center gap-2">{filters}</div> : null}
    </>
  );
};

export default PageHeader;
