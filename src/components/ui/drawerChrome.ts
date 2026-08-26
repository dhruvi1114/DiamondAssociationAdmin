import type { CSSProperties } from 'react';

/**
 * Shared drawer chrome.
 *
 * The header matches the app header exactly — same `--header-height` token, so
 * the two can never drift apart when one of them is retuned. A drawer whose bar
 * is a few pixels off the one behind it reads as a misalignment, not a surface.
 *
 * `minHeight` rather than `height`: the bar is 56px for a bare title, and grows
 * for a drawer that also carries a description line rather than clipping it.
 */
export const DRAWER_HEADER_STYLE: CSSProperties = {
  /*
    `flex: 0 0 auto` is the load-bearing line, not the `minHeight`.

    AntD makes the header a flex item at `0 1 0%` — grow 0, basis 0 — inside the
    drawer's column. Its height therefore resolves from `min-height` alone and
    content cannot push it: a drawer carrying a description rendered a 70px title
    block inside a 56px header and spilled 7px past the divider, over the first
    field. Restoring `auto` basis lets the box size to what is in it.
  */
  flex: '0 0 auto',
  minHeight: 'var(--header-height)',
  padding: '8px 16px',
};

export const DRAWER_BODY_STYLE: CSSProperties = { padding: 16 };

export const DRAWER_FOOTER_STYLE: CSSProperties = { padding: '12px 16px' };
