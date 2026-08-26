/**
 * The sign-in artwork — the supplied render, behind the shell.
 *
 * This was a hand-built vector stand-in until the real file arrived. It is now
 * `public/brand/diamond.png`, and the vector version is gone: the render carries
 * refraction, caustics and a floor reflection that no reasonable amount of SVG
 * reproduces.
 *
 * Deliberately NOT cut out to a transparent background. The lit floor, the
 * reflection under the stone and the light spreading from its base are part of
 * the picture, not backdrop — masking them away would leave a gem floating in
 * space.
 *
 * The glints and the sheen live INSIDE `__stage`, which is the element carrying
 * the framing transform. That is the whole reason the stage exists: they are
 * positioned as percentages of it, so re-aiming the stone moves the highlights
 * with it instead of stranding them over empty floor. Everything visual is in
 * `styles/index.css` (`.auth-art*`) — the offset and the drift are one
 * `transform`, so they have to be authored together.
 *
 * Entirely decorative: empty `alt` plus `aria-hidden`, so it is announced nowhere.
 */

/** Intrinsic size of `public/brand/diamond.png`. */
const ASSET = { width: 1535, height: 1025 } as const;

export type DiamondSceneVariant =
  /** Full height behind the `lg` split layout. The stone lands between the columns. */
  | 'full'
  /**
   * Inside the brand panel of the split layout — the artwork is the panel's own
   * ground rather than a backdrop shared with the form. The box is roughly half
   * as wide as it is tall, so the render is cropped hard horizontally instead of
   * vertically; see `.auth-art--panel` for what that costs and how it is aimed.
   */
  | 'panel'
  /**
   * A band across the foot of the stacked layout, below `lg`. The framing is a
   * different problem there — see `.auth-art--band` — and the stone sits low and
   * left rather than centred, because the card is what owns the middle.
   */
  | 'band';

export interface DiamondSceneProps {
  variant?: DiamondSceneVariant;
  className?: string;
}

const VARIANT_CLASS: Record<DiamondSceneVariant, string> = {
  full: '',
  panel: 'auth-art--panel',
  band: 'auth-art--band',
};

export const DiamondScene = ({ variant = 'full', className = '' }: DiamondSceneProps) => (
  <div
    /*
      `full` is the unmodified base, so it adds nothing; every other variant
      carries its own modifier. Spelled as a lookup rather than a chain of
      ternaries so adding a variant to the union without a class here is a type
      error rather than a scene that silently renders with the default framing.
    */
    className={`auth-art ${VARIANT_CLASS[variant]} ${className}`.replace(/\s+/g, ' ').trim()}
    aria-hidden="true"
  >
    <div className="auth-art__stage">
      <img
        src="/brand/diamond.png"
        alt=""
        width={ASSET.width}
        height={ASSET.height}
        className="auth-art__img select-none"
        draggable={false}
      />

      {/*
        Highlights are for the two variants that show the whole stone. They are
        aimed by percentage of the stage, and the band re-frames the stage hard
        enough that the same percentages would land them on bare floor. A
        backdrop that twinkles in the wrong place is worse than one that does
        not twinkle.
      */}
      {variant !== 'band' ? (
        <>
          {/* A light travelling across the crown. Boxed to the stone so the sweep
              reads as the gem catching it, not as a band crossing the whole room. */}
          <span className="auth-art__sheen" />

          {/* Specular twinkles, on staggered clocks. */}
          <span className="auth-art__glint auth-art__glint--a" />
          <span className="auth-art__glint auth-art__glint--b" />
          <span className="auth-art__glint auth-art__glint--c" />
        </>
      ) : null}
    </div>
  </div>
);

export default DiamondScene;
