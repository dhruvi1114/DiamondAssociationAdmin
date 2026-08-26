import { createContext, useContext, useEffect } from 'react';

/**
 * Lets a detail page swap the shell's header for the specific record it is
 * showing — "Virali & Sons" instead of "Applications" — and put a back arrow
 * in front of it, for as long as it is mounted. Both revert automatically on
 * unmount or navigation.
 *
 * `AppShell` is normally the only thing that names the header: "Derived from
 * the same nav table the sidebar uses, so the two can never disagree — and so
 * a page never has to remember to announce itself." That still holds for
 * every page that does not call `usePageTitle` — this is an opt-in override
 * for the handful of detail screens (an application, eventually a member)
 * whose own record is more useful in the header than the section name is,
 * especially once that page's own heading has scrolled out of view — which is
 * also why the back arrow belongs here rather than in the page's own content:
 * a control the page's own scroll can carry off screen is not a back button
 * any more, it is a paragraph.
 */

export interface PageTitleApi {
  override: string | null;
  /**
   * A short identifier shown quietly BESIDE the title — an application number,
   * an invoice number. Deliberately not part of `override`: concatenating it
   * into the title would render a reference code at 24/600 alongside the name,
   * and the two are not equally important. The header styles it as the record's
   * reference, the way the record itself would print it.
   */
  meta: string | null;
  /**
   * The record's status, as `domain.value` — e.g. `application.SUBMITTED`.
   *
   * Two plain strings joined rather than a `<StatusChip>` element, deliberately.
   * A ReactNode is a new object on every render, so it can never be a stable
   * effect dependency: the override would re-register in a loop. A string
   * compares by value, and `AppShell` builds the chip from it.
   */
  status: string | null;
  onBack: (() => void) | null;
  setOverride: (title: string | null) => void;
  setMeta: (meta: string | null) => void;
  setStatus: (status: string | null) => void;
  setOnBack: (handler: (() => void) | null) => void;
}

/**
 * `AppShell` owns the state (its own `useState`) and provides it directly —
 * `<PageTitleContext.Provider value={{ ... }}>` around the `Outlet` — rather
 * than wrapping itself in a provider component, since the header reading
 * these values and the `Outlet` writing them are siblings in the same render,
 * not parent and child.
 */
export const PageTitleContext = createContext<PageTitleApi | null>(null);

/**
 * Any page calls this to become that override while it is on screen.
 * `onBack` is optional — most pages that override the title still want the
 * shell's own generic navigation left alone; only a true drill-down page
 * (one record, reached from exactly one list) wants a back arrow next to it.
 */
export const usePageTitle = (
  title: string | null,
  options?: {
    onBack?: () => void;
    meta?: string | null;
    /** `domain` and the raw enum value, e.g. `('application', 'SUBMITTED')`. */
    status?: { domain: string; value: string } | null;
  },
): void => {
  const ctx = useContext(PageTitleContext);
  const onBack = options?.onBack ?? null;
  const meta = options?.meta ?? null;
  const status = options?.status ? `${options.status.domain}.${options.status.value}` : null;

  useEffect(() => {
    if (!ctx) return undefined;

    ctx.setOverride(title);
    ctx.setMeta(meta);
    ctx.setStatus(status);
    // The updater-function form, or `useState` would call `onBack` itself
    // trying to lazily compute the next state instead of storing it.
    ctx.setOnBack(() => onBack);

    return () => {
      ctx.setOverride(null);
      ctx.setMeta(null);
      ctx.setStatus(null);
      ctx.setOnBack(null);
    };
  }, [ctx, title, meta, status, onBack]);
};
