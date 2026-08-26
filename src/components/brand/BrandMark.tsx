import { useBrandingImage } from '@/hooks/useBranding';

/**
 * The association's lockup — mark and wordmark, as one supplied asset.
 *
 * This used to be a hand-drawn SVG stand-in, built because no logo file had been
 * supplied. `public/brand/logo.png` is the real thing, so the drawing is gone.
 *
 * The asset is black artwork on transparency, which is why dark mode inverts it
 * rather than swapping in a second file (`.brand-logo` in `styles/index.css`).
 * If a light-on-dark variant ever arrives, drop the invert and switch on the
 * theme here instead.
 *
 * `width` drives everything; height follows from the asset's own 3:1 ratio, so
 * the lockup can never be stretched by a caller.
 */

export const BRAND = {
  short: 'ILGDA',
  full: 'Lab-Grown Diamond Association',
  legal: 'Indian Lab-Grown Diamond Association',
} as const;

/** Intrinsic size of `public/brand/logo.png` — used to reserve space and stop layout shift. */
const ASSET = { width: 2172, height: 724 } as const;

/**
 * Transparent margin baked into the asset, measured off its alpha channel
 * (ink occupies x 58–2103 of 2172, y 97–635 of 724).
 *
 * It matters because the file's box is not its ink: left-aligning the element
 * leaves the mark visibly indented against text below it, and the 13%/12% of
 * dead space above and below silently inflates every gap measured from it.
 * `flush` cancels all four so the element's box IS the artwork, and a margin set
 * by a caller means what it says.
 */
const DEAD_SPACE = { left: 0.0267, right: 0.0313, top: 0.134, bottom: 0.1215 } as const;

/**
 * Ink bounds of the diamond alone, in the asset's own pixels.
 *
 * There is no mark-only file, so `BrandGlyph` crops one out of the lockup. The
 * split is measured, not eyeballed: the widest run of fully transparent columns
 * inside the artwork is x 568–613, a 46px gutter, and it is the gap between the
 * diamond and the "I" of ILGDA. Every other internal gap is under 18px.
 *
 * If a mark-only asset ever arrives, point `BrandGlyph` at it and delete this.
 */
const MARK = { left: 58, right: 567, top: 98, bottom: 635 } as const;

export interface BrandMarkProps {
  /** Rendered width in px. Height is derived from the asset ratio. */
  width?: number;
  /**
   * Pull the asset's transparent margin so the ink sits flush to the element
   * box. Use where the lockup is aligned against other content; leave off where
   * it is centred, since the padding is near-symmetric horizontally anyway.
   */
  flush?: boolean;
  className?: string;
}

export const BrandMark = ({ width = 300, flush = false, className = '' }: BrandMarkProps) => {
  const height = (width * ASSET.height) / ASSET.width;
  const uploaded = useBrandingImage('logo');

  /*
    An uploaded logo wins over the bundled one, and is drawn by different rules:
    its ratio is whatever the association's file happens to be, so it is fitted
    inside the box the bundled lockup would have occupied rather than forced to
    3:1. `flush` and `.brand-logo` are both dropped — the dead-space figures are
    measured off THIS asset and mean nothing for another, and the dark-mode
    invert exists because the shipped artwork is black on transparency, which a
    colour logo is not.
  */
  if (uploaded) {
    return (
      <img
        src={uploaded}
        alt={BRAND.legal}
        className={`block ${className}`.trim()}
        style={{
          width: 'auto',
          height: 'auto',
          maxWidth: width,
          maxHeight: Math.round(height),
          objectFit: 'contain',
        }}
      />
    );
  }

  return (
    <img
      src="/brand/logo.png"
      alt={BRAND.legal}
      width={width}
      height={Math.round(height)}
      className={`brand-logo block h-auto max-w-full ${className}`.trim()}
      style={{
        width,
        aspectRatio: `${ASSET.width} / ${ASSET.height}`,
        ...(flush
          ? {
              marginLeft: -(width * DEAD_SPACE.left),
              marginRight: -(width * DEAD_SPACE.right),
              marginTop: -(height * DEAD_SPACE.top),
              marginBottom: -(height * DEAD_SPACE.bottom),
            }
          : {}),
      }}
    />
  );
};

export interface BrandGlyphProps {
  /** Rendered width in px. Height follows from the mark's own ratio. */
  width?: number;
  className?: string;
}

/**
 * The diamond on its own — the lockup with the wordmark cropped off.
 *
 * For places too narrow to hold the full lockup and too important to hold
 * nothing: the collapsed nav rail, at 64px, is the reason it exists.
 *
 * It is the same file, scaled up inside a window the size of the mark and
 * nudged so the mark is what shows through. That is deliberately not a second
 * asset: two files drift, and the crop is derived from measured ink bounds, so
 * it cannot slide out of register with the lockup it came from.
 */
export const BrandGlyph = ({ width = 24, className = '' }: BrandGlyphProps) => {
  const uploaded = useBrandingImage('logo-mark');

  /*
    The uploaded mark needs no cropping — it IS the mark-only asset the comment
    above wishes for — so it is simply fitted into a square of the requested
    width. Any ratio survives that: `contain` letterboxes rather than distorts.
  */
  if (uploaded) {
    return (
      <img
        src={uploaded}
        alt={BRAND.legal}
        className={`block shrink-0 select-none ${className}`.trim()}
        draggable={false}
        style={{ width, height: width, objectFit: 'contain' }}
      />
    );
  }

  const inkWidth = MARK.right - MARK.left + 1;
  const inkHeight = MARK.bottom - MARK.top + 1;
  /** Asset pixels per rendered pixel — everything below is this times a bound. */
  const scale = width / inkWidth;

  return (
    <span
      className={`relative block shrink-0 overflow-hidden ${className}`.trim()}
      style={{ width, height: inkHeight * scale }}
    >
      <img
        src="/brand/logo.png"
        alt={BRAND.legal}
        width={ASSET.width}
        height={ASSET.height}
        className="brand-logo block select-none"
        draggable={false}
        style={{
          width: ASSET.width * scale,
          height: ASSET.height * scale,
          /* `max-w-full` would fight the scale-up; the wrapper does the clipping. */
          maxWidth: 'none',
          marginLeft: -MARK.left * scale,
          marginTop: -MARK.top * scale,
        }}
      />
    </span>
  );
};

export default BrandMark;
