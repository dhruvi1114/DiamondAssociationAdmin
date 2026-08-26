import BrandMark from './BrandMark';

/**
 * The association's identity block — mark, tagline, rule, strapline — in the two
 * cuts the sign-in screen needs.
 *
 * It exists because the screen shows this content twice: flush left on the wide
 * brand panel, and centred above the card once that panel is hidden. Those were
 * separate pieces of markup, which meant the tagline could be edited in one and
 * not the other. One component, two variants, no drift.
 *
 * The entrance classes live here too, so both cuts get the same stagger — mark
 * first, then the text — without every caller having to remember them.
 */

export type BrandLockupVariant =
  /** Flush left on the `lg` brand panel. Display type, off the operator scale. */
  | 'panel'
  /** Centred above the card below `lg`. Smaller, and it drops copy on phones. */
  | 'stacked';

export interface BrandLockupProps {
  variant?: BrandLockupVariant;
  /** Layout classes for the wrapper — margins, and the breakpoint that hides it. */
  className?: string;
}

const TAGLINE = (
  <>
    Stronger Together,
    <br />
    Brighter Tomorrow.
  </>
);

const STRAPLINE = 'Building trust. Growing the lab-grown diamond industry.';

export const BrandLockup = ({ variant = 'panel', className = '' }: BrandLockupProps) => {
  const stacked = variant === 'stacked';

  return (
    <div
      className={`${stacked ? 'flex flex-col items-center text-center' : ''} ${className}`.trim()}
    >
      {/*
        `flush` only on the panel cut. It cancels the transparent margin baked
        into the asset so the mark's ink lines up with the text's left edge —
        which matters when both are flush left, and does nothing useful when the
        lockup is centred (the asset's horizontal padding is near-symmetric).
      */}
      <BrandMark
        width={stacked ? 200 : 272}
        flush={!stacked}
        className="auth-enter auth-enter--1"
      />

      <div
        className={
          stacked
            ? 'auth-enter auth-enter--2 mt-6 sm:mt-7'
            : 'auth-enter auth-enter--2 mt-10 max-w-[34rem] xl:mt-12'
        }
      >
        {/*
          A tagline, not the page heading — the card's title is the `h1`, and it
          is the one that survives to the phone layout.

          The `<br>` is deliberate here and deliberately absent from the
          strapline: this is a two-line lockup that should always break in the
          same place, while that is a sentence that should reflow.
        */}
        <p
          className={
            stacked
              ? 'm-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[26px]'
              : 'm-0 text-[28px] font-semibold leading-[1.12] tracking-[-0.025em] xl:text-[36px]'
          }
          style={{ color: 'var(--brand-ink)' }}
        >
          {TAGLINE}
        </p>

        {/*
          Rule and strapline are the first things to go on a phone: the mark and
          the tagline carry the identity, and everything below them is pushing
          the actual sign-in fields off a 667px-tall screen.
        */}
        <span
          aria-hidden="true"
          className={
            stacked
              ? 'mx-auto mt-5 hidden h-[3px] w-12 rounded-full sm:block'
              : 'mt-7 block h-[3px] w-16 rounded-full'
          }
          style={{ background: 'var(--brand-base)' }}
        />

        <p
          className={
            stacked
              ? 'm-0 mt-4 hidden text-14 leading-[1.6] sm:block'
              : 'm-0 mt-6 max-w-[22rem] text-16 leading-[1.65] xl:max-w-[26rem]'
          }
          style={{ color: 'var(--brand-muted)' }}
        >
          {STRAPLINE}
        </p>
      </div>
    </div>
  );
};

export default BrandLockup;
