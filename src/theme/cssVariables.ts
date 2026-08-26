import {
  brand,
  elevation,
  layout,
  neutral,
  semantic,
  status,
  typography,
  type ThemeMode,
} from './tokens';

/**
 * Projects the TypeScript tokens into CSS custom properties.
 *
 * Generated rather than hand-written so `tokens.ts` stays the single source of
 * truth: a value can never drift between the Tailwind layer, the AntD layer and
 * the raw-CSS layer, because all three read the same variables.
 *
 * Dark mode is an attribute on <html> (`data-theme="dark"`). The MVP ships
 * light-first; dark is wired now because the token layer already supports it.
 */

const varsFor = (mode: ThemeMode): string => {
  const n = neutral[mode];
  const s = semantic[mode];
  const st = status[mode];

  return [
    ...Object.entries(n).map(([step, value]) => `--n-${step}: ${value};`),

    `--bg: ${s.bg};`,
    `--surface: ${s.surface};`,
    `--surface-subtle: ${s.surfaceSubtle};`,
    `--fg: ${s.fg};`,
    `--fg-muted: ${s.fgMuted};`,
    `--fg-subtle: ${s.fgSubtle};`,
    `--border: ${s.border};`,
    `--border-strong: ${s.borderStrong};`,
    `--primary: ${s.primary};`,
    `--primary-fg: ${s.primaryFg};`,
    `--primary-hover: ${s.primaryHover};`,
    `--primary-active: ${s.primaryActive};`,
    `--sidebar: ${s.sidebar};`,
    `--raised: ${s.raised};`,
    `--sunken: ${s.sunken};`,
    `--zebra: ${s.zebra};`,
    `--highlight: ${s.highlight};`,
    `--highlight-fg: ${s.highlightFg};`,
    `--surface-hover: ${s.hover};`,
    `--surface-selected: ${s.selected};`,
    `--focus-ring: ${s.focusRing};`,

    ...Object.entries(st).flatMap(([name, value]) => [
      `--status-${name}-fg: ${value.fg};`,
      `--status-${name}-bg: ${value.bg};`,
    ]),

    `--elevation-card: ${elevation.card};`,
    `--elevation-overlay: ${elevation.overlay};`,
  ].join('\n    ');
};

/**
 * Brand variables are emitted per theme alongside everything else. They used to
 * be declared once in `:root` and never redeclared for dark, which left the
 * sign-in screen's near-black headline invisible on a near-black ground — see
 * the note in `tokens.ts` §brand.
 */
const brandVars = (mode: ThemeMode): string =>
  Object.entries(brand[mode])
    .map(
      ([name, value]) =>
        `--brand-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value};`,
    )
    .join('\n    ');

export const buildThemeCss = (): string => `
  :root {
    ${varsFor('light')}

    ${brandVars('light')}

    --font-sans: ${typography.fontFamily};
    --font-feature-settings: ${typography.fontFeatureSettings};
    --sidebar-width: ${layout.sidebarWidth}px;
    --sidebar-collapsed-width: ${layout.sidebarCollapsedWidth}px;
    --header-height: ${layout.headerHeight}px;
    --content-max-width: ${layout.contentMaxWidth}px;

    color-scheme: light;
  }

  :root[data-theme='dark'] {
    ${varsFor('dark')}

    ${brandVars('dark')}

    color-scheme: dark;
  }
`;

const STYLE_ELEMENT_ID = 'design-tokens';

/**
 * Injects the token stylesheet before first paint. Called from `main.tsx`
 * ahead of `createRoot`, so no frame is ever rendered with unresolved variables.
 */
export const installThemeVariables = (): void => {
  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = buildThemeCss();
  document.head.prepend(style);
};

export const applyThemeMode = (mode: ThemeMode): void => {
  document.documentElement.setAttribute('data-theme', mode);
};
