/**
 * Design tokens — the ONLY file in this app allowed to contain a colour literal
 * (design-system.md §1/§5). A raw hex anywhere else fails review.
 *
 * The system is monochrome by direction: chrome is greyscale, and colour appears
 * only where it carries meaning. Hierarchy comes from weight, size, spacing and
 * hairline borders — not from hue.
 *
 * Everything downstream reads from here:
 *   cssVariables.ts  →  :root / [data-theme="dark"] custom properties
 *   tailwind.config  →  utility classes resolve to var(--…)
 *   antdTheme.ts     →  ConfigProvider token overrides
 */

/** Neutral scale — effectively the whole design system. */
export const neutral = {
  light: {
    0: '#FFFFFF', // page background
    50: '#FAFAFA', // subtle fill, table header, hover row
    100: '#F5F5F5', // input background, disabled fill
    200: '#E5E5E5', // hairline borders, dividers
    300: '#D4D4D4', // input border, focus ring base
    400: '#A3A3A3', // placeholder, disabled text
    500: '#737373', // secondary text, captions
    700: '#404040', // body text on subtle surfaces
    900: '#171717', // headings, primary text
    1000: '#0A0A0A', // primary action fill, max-contrast text
  },
  dark: {
    0: '#0A0A0A',
    50: '#111111',
    100: '#171717',
    200: '#262626',
    300: '#333333',
    400: '#525252',
    500: '#737373',
    700: '#A3A3A3',
    900: '#EDEDED',
    1000: '#FFFFFF',
  },
} as const;

/** Semantic roles. Components reference these, never the numeric scale directly. */
export const semantic = {
  light: {
    bg: neutral.light[0],
    surface: '#FFFFFF',
    surfaceSubtle: neutral.light[50],
    fg: neutral.light[900],
    fgMuted: neutral.light[500],
    fgSubtle: neutral.light[400],
    border: neutral.light[200],
    borderStrong: neutral.light[300],
    // Subtle ink, not pitch black. #0a0a0a is reserved for a CTA that genuinely
    // fails contrast on #fafafa — a large near-black surface is a visual trap in
    // an otherwise light tool (theming skill, palette.md "pitch-black rule").
    primary: '#262626',
    primaryFg: '#FFFFFF',
    primaryHover: '#404040',
    primaryActive: neutral.light[900],
    /** Sidebar is separated from the content by a hairline, not by hue. */
    sidebar: neutral.light[50],
    raised: neutral.light[100],
    /**
     * One step below `raised`: a track something else sits ON TOP of, rather
     * than a panel that sits on the page. The segmented tab switcher is the
     * case — at `raised` the track and the raised tab were two whites a shade
     * apart and the control read as flat.
     *
     * Between `raised` (#F5F5F5) and `border` (#E5E5E5), so it is off the
     * neutral ramp on purpose. At the border value the track read as a filled
     * box in its own right and pulled attention off the tab standing in it; at
     * the raised value it barely existed. The job of this colour is to be seen
     * without being looked at.
     */
    sunken: '#EDEDED',
    /**
     * The zebra band. Lighter than `surface-subtle`, which is the header: the
     * band has to separate two rows without ever being mistaken for the header
     * or for a hover, and it is drawn hundreds of times down a long list where
     * anything stronger turns into stripes you read instead of data.
     */
    zebra: '#FCFCFC',
    /**
     * Search-match wash. The one hue in the system that is not a status.
     *
     * Yellow is what a highlighter means, and a reader who has just typed a
     * query reads it as "here" rather than as "warning" — the ambiguity a status
     * colour would normally cause does not arise, because the mark only appears
     * while a search is active and only inside the run that matched.
     */
    highlight: '#FDE68A',
    highlightFg: '#3F2D0B',
    hover: '#F0F0F0',
    selected: '#ECECEC',
    focusRing: 'rgb(23 23 23 / 0.10)',
  },
  /*
    Dark is a LADDER, not an inversion of light.

    Light mode separates surfaces by making each one darker than white; dark
    mode has to make each one lighter than the page, because in the dark a
    surface that recedes reads as a hole punched in the one behind it. Two
    tokens were doing exactly that — the table header (#111111) and the zebra
    band (#101010) both sat DARKER than the card they were drawn on, so the
    header looked like a gap above the rows and the banding like missing paint.

    Every step below is lighter than the one before it, and each is 4–7 points
    of hex from its neighbour: enough to separate two adjacent surfaces on a
    laptop screen at an angle, not enough to read as a colour of its own.
  */
  dark: {
    bg: '#0A0A0A',
    /** The rail is barely lifted off the page — separated by its hairline, not by hue. */
    sidebar: '#0F0F0F',
    surface: '#161616',
    zebra: '#1A1A1A',
    surfaceSubtle: '#1E1E1E',
    raised: '#232323',
    hover: '#262626',
    sunken: '#2A2A2A',
    selected: '#2E2E2E',
    /*
      Text. `fgMuted` was #737373 and `fgSubtle` #525252 — 3.9:1 and 2.4:1 on the
      card, both under the 4.5:1 that WCAG asks of body text. They are not
      decorative: `fgMuted` carries every secondary line in the app and
      `fgSubtle` carries "N/A" and every placeholder. Both now clear 4.5 on the
      card AND on the lighter table header, which is the harder of the two.
    */
    fg: '#EDEDED',
    fgMuted: '#A3A3A3',
    fgSubtle: '#8A8A8A',
    border: '#2A2A2A',
    borderStrong: '#3D3D3D',
    /*
      White on near-black. It reads as the one deliberate high-contrast element
      on a low-contrast screen, which is what a primary action should be — and
      `primaryHover` DIMS rather than brightens, because there is nowhere above
      white to go.
    */
    primary: '#FFFFFF',
    primaryFg: '#0A0A0A',
    primaryHover: '#D4D4D4',
    primaryActive: '#FFFFFF',
    /* Inverted from light: a pale wash would flare against a dark row. */
    highlight: '#5B4708',
    highlightFg: '#FDE68A',
    focusRing: 'rgb(255 255 255 / 0.24)',
  },
} as const;

/**
 * Status colours — the only hues in the system, deliberately desaturated so they
 * read as information rather than decoration. ALWAYS paired with an icon and a
 * text label: colour alone fails WCAG 1.4.1 and these screens get printed and
 * photographed.
 *
 * These are the universal pairs from the theming skill (palette.md): the same
 * five meanings, the same values, everywhere — lists, tags, alerts and charts.
 * Chrome never uses them; meaning always does.
 */
export const status = {
  light: {
    success: { fg: '#1D7A4A', bg: '#EAF5EF' },
    warning: { fg: '#9A6700', bg: '#FDF3E3' },
    danger: { fg: '#C0392B', bg: '#FCEBE9' },
    info: { fg: '#1A5E8A', bg: '#EBF4FB' },
    neutral: { fg: '#525252', bg: neutral.light[100] },
  },
  dark: {
    success: { fg: '#4ADE80', bg: '#0F1F14' },
    warning: { fg: '#FACC15', bg: '#1F1A08' },
    danger: { fg: '#F87171', bg: '#1F1010' },
    info: { fg: '#D4D4D4', bg: '#171717' },
    neutral: { fg: neutral.dark[500], bg: neutral.dark[100] },
  },
} as const;

export type StatusVariant = keyof typeof status.light;

/** Borders do the work, not shadows — one elevation for cards, one for overlays. */
export const elevation = {
  card: '0 1px 2px rgb(0 0 0 / 0.04)',
  overlay: '0 8px 24px rgb(0 0 0 / 0.12)',
} as const;

export const radius = {
  /** cards, tables, drawers */
  lg: 10,
  /** buttons, inputs, nav items */
  md: 8,
  /** checkboxes */
  sm: 4,
  /** status pills */
  full: 9999,
} as const;

/** 4px base scale. */
export const spacing = [4, 8, 12, 16, 24, 32, 48, 64] as const;

export const typography = {
  /**
   * Geist, self-hosted as a variable font — see the `@font-face` pair in
   * `styles/index.css` and `public/fonts/README.md`.
   *
   * The fallbacks are load-bearing, not decoration: until the two `.woff2` files
   * are present the browser falls straight through to them, which is also what
   * the app did for its whole life before this (it named Inter and never shipped
   * it, so the type was whatever each machine happened to have installed).
   */
  fontFamily:
    "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  /**
   * `normal`, deliberately. This used to read `'cv11', 'ss01'` — Inter's
   * single-storey `a` and alternate digits. Geist does not define those axes, so
   * against it they were instructions to nothing. Set real Geist features here
   * if the brand ever calls for them.
   */
  fontFeatureSettings: 'normal',
  /**
   * Operator density: 13px body, 11px table headers and group labels, 18px page
   * titles. This is a tool someone reads all day, not a marketing page — the
   * customer app keeps 16px body for the opposite reason.
   */
  bodySize: 13,
  sizes: [11, 12, 13, 14, 16, 18, 20, 24, 30] as const,
  /** Named roles, so a screen never guesses a size. */
  roles: {
    /**
     * The three roles below come straight from the brand type spec and are
     * exposed to Tailwind as `text-title-primary`, `text-title-secondary` and
     * `text-supporting` (see `tailwind.config.ts`).
     *
     * The spec gives size and weight but is silent on line-height, so these use
     * the scale's existing pair — 1.25 for headings, 1.5 for reading text.
     * Flagged rather than invented quietly; correct them if the spec says
     * otherwise.
     */
    titlePrimary: { size: 24, weight: 600, lineHeight: 1.25 },
    titleSecondary: { size: 16, weight: 600, lineHeight: 1.25 },
    supporting: { size: 14, weight: 400, lineHeight: 1.5 },

    pageTitle: { size: 18, weight: 600 },
    section: { size: 14, weight: 600 },
    body: { size: 13, weight: 400 },
    tableHeader: { size: 11, weight: 600, tracking: '0.04em', transform: 'uppercase' },
    meta: { size: 12, weight: 400 },
    groupLabel: { size: 11, weight: 600, tracking: '0.06em', transform: 'uppercase' },
  },
  lineHeightBody: 1.4,
  lineHeightHeading: 1.25,
  /** 400 / 500 / 600 only — in a colourless system, weight IS the hierarchy. */
  weights: { regular: 400, medium: 500, semibold: 600 },
} as const;

export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

/** Admin targets ≥1280 with a usable ≥768 fallback. */
export const layout = {
  contentMaxWidth: 1600,
  /*
    216, down from 248 in two steps. Every nav label still fits on one line —
    the longest is "Roles & Permissions" at 19 characters, which needs about
    133px of the ~164px this leaves for text after the icon and the gutters. The
    width it gives up goes to the table beside it, which is the column that
    actually runs out of room. Measure the longest label before narrowing again.
  */
  sidebarWidth: 216,
  sidebarCollapsedWidth: 64,
  headerHeight: 56,
} as const;

export type ThemeMode = 'light' | 'dark';

/**
 * Brand palette — the ONE scoped exception to the monochrome rule above.
 *
 * The sign-in screen is a pre-authentication brand surface: it is the first
 * thing a member of staff sees and the only screen that is not a working tool.
 * Everything behind the login stays greyscale, so these values are consumed by
 * `pages/Login.tsx` and the `components/brand/*` SVGs and by nothing else.
 * A `--brand-*` variable appearing in a queue, table or form is a bug.
 *
 * Recorded as a deliberate departure in `docs/architecture-decisions.md`.
 *
 * **Retuned from blue to bronze** to match the approved ILGDA sign-in comp. The
 * earlier navy/blue set belonged to a superseded design and was never actually
 * rendered — `Login.tsx` used the plain theme tokens throughout — so nothing
 * changed appearance except the screen that now consumes these deliberately.
 *
 * **Now keyed by theme.** The previous set was declared once in `:root` and never
 * redeclared under `[data-theme="dark"]`, on the reasoning that the sign-in
 * screen should keep one appearance in both themes. That reasoning does not
 * survive contact with the screen: the card, the controls and the type resolve
 * through the ordinary `--fg` / `--surface` / `--border` roles, so under dark
 * mode a `#171717` headline landed on a `#0A0A0A` ground and disappeared. Either
 * the whole surface pins itself light — which puts a white card in a dark
 * viewport and reads as a rendering fault — or the brand layer flips with
 * everything else. It flips.
 */
export const brand: Record<
  ThemeMode,
  {
    ink: string;
    base: string;
    bright: string;
    muted: string;
    panelFrom: string;
    panelTo: string;
    card: string;
    cardBorder: string;
    fieldBorder: string;
    fieldBg: string;
    placeholder: string;
    ring: string;
    onBrand: string;
    facet: string;
  }
> = {
  light: {
    /** Wordmark and headline — the comp sets both in the app's near-black. */
    ink: '#171717',
    /** Bronze. The rule under the headline, the facet strokes, the ribbon. */
    base: '#B0834F',
    /** Gradient end and specular highlight on the stone. */
    bright: '#D9B98C',
    /** Body copy on the brand panel. */
    muted: '#737373',
    /** Panel wash, top-left to bottom-right. */
    panelFrom: '#FAFAFA',
    panelTo: '#F6EDE3',
    /** The card and its ground. */
    card: '#FFFFFF',
    cardBorder: '#E5E5E5',
    /** Input chrome inside the card. */
    fieldBorder: '#D4D4D4',
    fieldBg: '#FFFFFF',
    placeholder: '#A3A3A3',
    /** Focus ring on the brand surface — the one place the near-black ring is wrong. */
    ring: 'rgb(176 131 79 / 0.32)',
    onBrand: '#FFFFFF',
    /**
     * Crown facets and specular streaks on the stone. Kept light in BOTH themes
     * and deliberately separate from `card`: a diamond reads as a diamond because
     * its facets catch light, so tying them to the card surface would paint a
     * near-black gem on a near-black ground.
     */
    facet: '#FFFFFF',
  },
  dark: {
    ink: '#EDEDED',
    base: '#C9A176',
    bright: '#E0C4A0',
    muted: '#A3A3A3',
    panelFrom: '#111111',
    panelTo: '#241B12',
    card: '#141414',
    cardBorder: '#262626',
    fieldBorder: '#333333',
    fieldBg: '#141414',
    placeholder: '#525252',
    ring: 'rgb(201 161 118 / 0.36)',
    onBrand: '#0A0A0A',
    facet: '#F2EDE6',
  },
};
