import { useRef, type MouseEvent, type ReactNode } from 'react';
import BrandLockup from './BrandLockup';
import DiamondScene from './DiamondScene';

export interface AuthShellProps {
  /** The card's heading — and the page's `h1`. */
  title: string;
  /** One sentence under the title. The "why am I here" line. */
  intro?: ReactNode;
  /**
   * Fired when a click lands on the backdrop rather than inside the card.
   * Optional: a screen with nothing to reset simply omits it and the backdrop
   * stays inert.
   */
  onDismiss?: () => void;
  children: ReactNode;
}

/**
 * The sign-in shell: brand panel on the left, card on the right.
 *
 * This is the only pre-authentication surface in the admin app, and the only one
 * that is not a working tool — which is why it is the one place allowed to spend
 * space on artwork and to step outside the 11–30px operator type scale. Every
 * screen behind the login stays dense and greyscale.
 *
 * The panel's lockup — mark, tagline, rule, strapline — is one block, centred on
 * the panel's vertical axis and flush left against a single margin, on the same
 * line as the card. Both halves share that axis: anchoring either one off it
 * makes them read as two unrelated things that happen to be side by side. The
 * mark and the text share a left edge (`flush` strips the asset's own padding),
 * so nothing in the panel is optically indented.
 *
 * Three layouts, not two:
 *
 *  - **`lg` and up** — the split above. Panel left, card right, artwork behind
 *    both with the stone aimed at the gap between them.
 *  - **`sm` to `lg`** — tablets. The panel cannot survive the split (a 34rem card
 *    column leaves it barely 200px), so the lockup moves above the card, centred,
 *    and the artwork becomes a band across the foot of the page. This used to be
 *    the phone layout, which on a 768px tablet meant a small mark on a blank
 *    page.
 *  - **below `sm`** — phones. Same stack, but the lockup drops its rule and
 *    strapline and the artwork is gone entirely: a 3:2 render cropped into a
 *    portrait viewport is a meaningless slice of floor, and the vertical space
 *    belongs to the fields.
 *
 * There is deliberately no tab strip. The approved comp draws Sign In · Sign Up ·
 * Password recovery, but the admin portal has neither of the other two — staff
 * accounts are issued by a super admin and no staff reset flow exists in M1
 * (see `pages/Login.tsx`). Two tabs that lead nowhere would be worse than the
 * comp's silhouette is valuable.
 */
/** The page wash. Warm along the foot, where the render's own lit floor is. */
const WASH =
  'linear-gradient(180deg, var(--brand-panel-from) 0%, var(--bg) 52%, var(--brand-panel-to) 100%)';

export const AuthShell = ({ title, intro, onDismiss, children }: AuthShellProps) => {
  const cardRef = useRef<HTMLDivElement>(null);

  /**
   * `contains` on the card rather than an `event.target === event.currentTarget`
   * check: the backdrop is not one element but a stack of them (the wash, the
   * artwork, the grid, the aside), so comparing against the root would miss a
   * click on any of the layers in between.
   */
  const onBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onDismiss) return;
    if (cardRef.current?.contains(event.target as Node)) return;
    onDismiss();
  };

  return (
    <div className="auth-scope relative min-h-screen bg-bg" onClick={onBackdropClick}>
      {/*
        Everything decorative — the wash and the render — lives in here, edge to
        edge. Nothing on this screen is capped: the grid below fills the window
        too, so the two always agree about where the middle is.

        There WAS a 1600px cap on both, and it was the wrong answer to a real
        problem. Capping the artwork stopped `cover` blowing the stone up on an
        ultrawide, but it also left bare margins either side of the band — and
        the wash was still full-bleed and painting them with its warm end, which
        is where the cream cast down the right of a wide screen came from. The
        margins were the bug, not the fix. With everything uncapped there are no
        margins to paint, no band edges to feather, and no second coordinate
        system to keep in sync.

        The stone growing with the window is fine, as it turns out, because the
        gap it sits in grows too: it is ~18% of the width against a card that
        stays 28rem, so at 2560px it is a little wider than the card with roughly
        1100px of clear space around it.

        The gradient runs top-to-bottom rather than corner-to-corner: the warmth
        belongs along the foot of the page, where the render's own lit floor is,
        not up the right-hand side behind the card.

        `pointer-events-none` throughout — a click anywhere on this stack has to
        reach the backdrop handler on the root.
      */}
      {/*
        The stacked layout's backdrop, and only its own. At `lg` the decoration
        moves inside the brand panel, where it belongs to one column rather than
        washing under both — that is the whole difference between a split and a
        card floating on a picture.

        The variant clips itself rather than the page clipping it. A root
        `overflow-hidden` would trap a card taller than the viewport — on a short
        laptop or a phone in landscape the sign-in button simply could not be
        scrolled to.
      */}
      <div className="pointer-events-none absolute inset-0 lg:hidden">
        <div aria-hidden="true" className="absolute inset-0" style={{ background: WASH }} />

        <DiamondScene
          variant="band"
          className="absolute inset-x-0 bottom-0 hidden h-[46vh] overflow-hidden sm:block"
        />
      </div>

      <div className="relative grid min-h-screen w-full grid-cols-1 lg:grid-cols-2">
        {/*
          Two equal halves of the whole window. The card column used to be pinned
          at 34rem against a `1fr` panel, so the split moved with every width and
          at the old 1600px cap came out 1056 against 544 — the two sides of a
          deliberately symmetrical composition, visibly unequal.

          Within the panel, the left margin is deliberately deeper than the
          right: the panel's
          right edge is open — it runs into the artwork and then the card — so
          the only thing giving the lockup a frame is the gutter on its closed
          side. `xl:pl-36` is that frame. It steps back to `lg:pl-16` below
          1280px, where the half-column is only ~512px wide and a 144px gutter
          would be most of the space the tagline has to break in.
        */}
        <aside className="relative hidden overflow-hidden border-r border-border lg:flex lg:flex-col lg:justify-center lg:py-12 lg:pl-16 lg:pr-10 xl:pl-36 xl:pr-20">
          <div className="pointer-events-none absolute inset-0">
            <div aria-hidden="true" className="absolute inset-0" style={{ background: WASH }} />
            {/*
              Sized by the render's own aspect ratio and pinned to the foot,
              rather than stretched over the whole panel. `cover` on a tall
              narrow box scales the image by height, so the stone grew every time
              the window narrowed — biggest exactly where there was least room
              for it. Locked to 1535:1025 the render is never cropped and the
              stone stays the same fraction of the panel's width at every size.

              140% of that width, anchored left, for two reasons at once. It sets
              how big the stone reads — one number, no crop maths — and it walks
              the stone inward: it sits 31% into the render, which is 43% across
              the panel at this width instead of stranded at the edge. The
              overspill leaves to the right, where the panel's own `overflow`
              takes it.

              Hung below the panel's foot to sit the stone lower. What that clips
              is the far end of the floor and the tail of the reflection — the
              cheapest part of the render to lose, and the reason the drop goes
              here rather than into a transform, which would pull a bare edge in
              at the top instead.

              Doubled at `2xl` because the drop has to fight a moving target. The
              block's height comes from the panel's WIDTH, so a wider window
              makes it proportionally taller and it creeps up the panel: 83% of
              the panel's height at 1920 against 75% at 1440. A single offset
              therefore lands the stone in a different place on a large monitor
              than on a laptop. The second value puts the artwork's top back on
              ~31% either side of the breakpoint.
            */}
            <DiamondScene
              variant="panel"
              className="absolute -bottom-[7%] left-0 w-[140%] aspect-[1535/1025] overflow-hidden 2xl:-bottom-[14%]"
            />
          </div>

          {/*
            Centred on the panel's own axis — the same axis the card sits on in
            the other half — then nudged 40px up off it.

            The nudge is a `translate`, not padding, and that distinction is the
            point. Padding would re-centre the block inside a shorter box, which
            is how this went wrong before: a deep `pb` lifted the lockup but also
            untethered it from the panel's centre line, and the two halves of a
            deliberately symmetrical composition stopped lining up. A transform
            leaves the centring intact and moves the painted result, so the offset
            stays a small deliberate deviation from a known axis rather than a
            different axis.
          */}
          <div className="relative lg:-translate-y-10">
            <BrandLockup variant="panel" />
          </div>
        </aside>

        {/*
          The card is centred in its half, with no nudge in either direction. It
          used to be pulled 32px left to compensate for a lopsided split; with two
          equal columns there is nothing to compensate for, and an offset would
          only break the symmetry the even split just bought.

          The horizontal padding is symmetric for the same reason —
          `justify-center` centres within the content box, so a heavier gutter on
          one side would quietly slide the card off its column's axis.
        */}
        <main className="flex items-center justify-center px-5 py-10 sm:px-8 sm:py-12 lg:bg-surface-subtle lg:px-10 lg:py-14 xl:px-14">
          <div className="flex w-full max-w-[26rem] flex-col items-center sm:max-w-[28rem]">
            {/*
              The brand panel is hidden below `lg`, so the identity rides here
              instead. Without it a phone got a sign-in form belonging to no
              visible organisation — the card's own lockup was removed because it
              duplicated the panel's, which is only true on a wide screen.
            */}
            <BrandLockup variant="stacked" className="mb-8 w-full sm:mb-10 lg:hidden" />

            {/*
              A card below `lg`, a bare column at and above it. In the stacked
              layout the form sits on the artwork and needs an edge to separate
              it; in the split it sits on its own half, where a bordered card
              inside a bordered column is a box drawn around a box.
            */}
            <div
              ref={cardRef}
              className="auth-enter auth-enter--3 w-full overflow-hidden rounded-[20px] border border-border bg-surface shadow-overlay lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none"
            >
              <div className="px-5 py-6 sm:px-8 sm:py-7">
                {/*
                  Both roles come from the type spec (`typography.roles`) rather
                  than from the comp's own numbers: `title-primary` for the
                  heading, `supporting` for every line of explanatory copy in the
                  card. The comp drew 20px and 13px, which matched nothing else
                  in the system.

                  The rules that flanked the heading are gone. They were the
                  comp's way of implying a tab strip that this screen does not
                  have (see the note above), so they were decoration standing in
                  for navigation that was never coming.
                */}
                <header>
                  <h1 className="m-0 text-center text-title-primary tracking-[-0.01em] text-fg">
                    {title}
                  </h1>

                  {intro ? (
                    <p className="m-0 mx-auto mt-2 max-w-sm text-center text-supporting text-fg-muted">
                      {intro}
                    </p>
                  ) : null}
                </header>

                <div className="mt-5">{children}</div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AuthShell;
