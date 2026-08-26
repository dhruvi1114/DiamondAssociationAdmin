/**
 * The sign-in artwork.
 *
 * **Placeholder, hand-built.** The reference composition (an isometric kiosk
 * flanked by a padlock and a key) was supplied as a raster mock, not as an
 * asset, so this is a vector stand-in drawn to the same idea: an authentication
 * terminal, the thing it protects, and the thing that opens it.
 *
 * Vector rather than an exported PNG for three reasons — it stays sharp on a
 * 2× display, it costs no network request, and every colour resolves through
 * `--brand-*`, so replacing the palette replaces the artwork too. Swap it for
 * the real illustration by returning an `<img>` from this component; the login
 * page imports nothing else from here.
 *
 * Entirely decorative: `aria-hidden`, no text, nothing announced.
 */
export const LoginIllustration = ({ className = '' }: { className?: string }) => (
  <svg
    viewBox="0 0 640 470"
    fill="none"
    role="presentation"
    aria-hidden="true"
    focusable="false"
    className={className}
  >
    <defs>
      <linearGradient id="brand-screen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="var(--brand-bright)" stopOpacity="0.22" />
        <stop offset="100%" stopColor="var(--brand-base)" stopOpacity="0.10" />
      </linearGradient>
      <linearGradient id="brand-solid" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="var(--brand-base)" />
        <stop offset="100%" stopColor="var(--brand-bright)" />
      </linearGradient>
      <linearGradient id="brand-face" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--brand-card)" />
        <stop offset="100%" stopColor="var(--brand-panel-to)" />
      </linearGradient>
    </defs>

    {/* --- ground ---------------------------------------------------------- */}
    <ellipse cx="320" cy="418" rx="252" ry="46" fill="var(--brand-base)" opacity="0.07" />
    <g stroke="var(--brand-base)" strokeWidth="1" opacity="0.13">
      <path d="M120 400 320 330l200 70" />
      <path d="M150 430 320 366l170 64" />
    </g>

    {/* --- padlock --------------------------------------------------------- */}
    <g>
      <path
        d="M96 288v-22a34 34 0 0 1 68 0v22"
        stroke="var(--brand-base)"
        strokeWidth="13"
        strokeLinecap="round"
        opacity="0.55"
      />
      <rect
        x="66"
        y="286"
        width="128"
        height="104"
        rx="20"
        fill="url(#brand-face)"
        stroke="var(--brand-base)"
        strokeWidth="2.5"
      />
      <circle cx="130" cy="326" r="11" fill="var(--brand-base)" opacity="0.75" />
      <path d="M130 336l7 22h-14l7-22Z" fill="var(--brand-base)" opacity="0.75" />
    </g>

    {/* --- kiosk ----------------------------------------------------------- */}
    <g>
      {/* pedestal — three isometric faces */}
      <path d="M320 300 400 340 320 380 240 340 320 300Z" fill="var(--brand-panel-to)" />
      <path d="M240 340 320 380v40l-80-40v-40Z" fill="var(--brand-base)" opacity="0.16" />
      <path d="M400 340 320 380v40l80-40v-40Z" fill="var(--brand-base)" opacity="0.10" />

      {/* stem */}
      <rect x="309" y="288" width="22" height="30" rx="6" fill="var(--brand-base)" opacity="0.35" />

      {/* screen */}
      <g transform="rotate(-5 320 200)">
        <rect
          x="242"
          y="104"
          width="156"
          height="188"
          rx="22"
          fill="url(#brand-screen)"
          stroke="var(--brand-base)"
          strokeWidth="2.5"
        />

        {/* avatar */}
        <circle cx="320" cy="163" r="17" stroke="var(--brand-base)" strokeWidth="2.5" />
        <path
          d="M296 200a24 24 0 0 1 48 0"
          stroke="var(--brand-base)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* the password being typed */}
        <g fill="var(--brand-base)" opacity="0.6">
          <circle cx="286" cy="228" r="5" />
          <circle cx="303" cy="228" r="5" />
          <circle cx="320" cy="228" r="5" />
          <circle cx="337" cy="228" r="5" />
          <circle cx="354" cy="228" r="5" />
        </g>

        {/* the button under it */}
        <rect x="280" y="252" width="80" height="18" rx="9" fill="url(#brand-solid)" />
      </g>
    </g>

    {/* --- key ------------------------------------------------------------- */}
    <g stroke="var(--brand-base)" strokeWidth="9" strokeLinecap="round" opacity="0.55">
      <circle cx="452" cy="392" r="19" fill="none" />
      <path d="M471 392h84" />
      <path d="M539 392v16M556 392v12" strokeWidth="8" />
    </g>

    {/* --- floating chips -------------------------------------------------- */}
    <g opacity="0.9">
      <rect
        x="446"
        y="130"
        width="118"
        height="46"
        rx="12"
        fill="var(--brand-card)"
        stroke="var(--brand-card-border)"
        strokeWidth="2"
        transform="rotate(7 505 153)"
      />
      <g transform="rotate(7 505 153)" fill="var(--brand-base)" opacity="0.35">
        <rect x="462" y="144" width="46" height="6" rx="3" />
        <rect x="462" y="157" width="78" height="6" rx="3" />
      </g>

      <rect
        x="466"
        y="216"
        width="86"
        height="38"
        rx="12"
        fill="var(--brand-card)"
        stroke="var(--brand-card-border)"
        strokeWidth="2"
        transform="rotate(-6 509 235)"
      />
      <g transform="rotate(-6 509 235)">
        <circle cx="488" cy="235" r="9" fill="url(#brand-solid)" />
        <rect
          x="506"
          y="232"
          width="32"
          height="6"
          rx="3"
          fill="var(--brand-base)"
          opacity="0.35"
        />
      </g>
    </g>
  </svg>
);

export default LoginIllustration;
