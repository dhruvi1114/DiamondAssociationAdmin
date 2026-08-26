import type { SVGProps } from 'react';

/**
 * The sidebar toggle glyph.
 *
 * Hand-drawn rather than taken from Lucide: `PanelLeft` divides one rectangle
 * with a straight line, so its left "panel" inherits the outer square's rounded
 * corners on one side and hard corners on the other. The reference mark is two
 * separate rounded rectangles — an outer frame with a smaller panel floating
 * inside it — and that inset is the whole character of the icon.
 *
 * Drawn on the same 24px / 1.5-stroke grid as the Lucide set around it so it
 * sits in the header without announcing that it came from somewhere else.
 */
export const PanelToggleIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    width={20}
    height={20}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    focusable="false"
    {...props}
  >
    <rect x="2.5" y="5" width="19" height="14" rx="3.5" />
    <rect x="5" y="8" width="5" height="8" rx="1.5" />
  </svg>
);

export default PanelToggleIcon;
