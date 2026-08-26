import type { Config } from 'tailwindcss';
import { breakpoints, elevation, radius, typography } from './src/theme/tokens';

/**
 * Tailwind reads the SAME tokens as AntD, via the CSS custom properties
 * installed by `src/theme/cssVariables.ts`. Utilities therefore resolve to
 * `var(--…)` rather than baked hex, which is what makes `data-theme="dark"` a
 * one-attribute flip with no duplicate class set.
 *
 * `preflight` is disabled: AntD 5 ships its own reset (`antd/dist/reset.css`),
 * and running both means Tailwind's base rules fight AntD's component styles
 * over buttons, headings and background colours. Pairing that with
 * `@ant-design/cssinjs` `hashPriority="high"` in `main.tsx` is the documented
 * combination — it lowers AntD's selector specificity to a single class, so a
 * Tailwind utility placed on an AntD component wins predictably.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    screens: Object.fromEntries(
      Object.entries(breakpoints).map(([name, value]) => [name, `${value}px`]),
    ),
    extend: {
      colors: {
        n: {
          0: 'var(--n-0)',
          50: 'var(--n-50)',
          100: 'var(--n-100)',
          200: 'var(--n-200)',
          300: 'var(--n-300)',
          400: 'var(--n-400)',
          500: 'var(--n-500)',
          700: 'var(--n-700)',
          900: 'var(--n-900)',
          1000: 'var(--n-1000)',
        },
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-subtle': 'var(--surface-subtle)',
        /* Chrome roles from the theming skill: sidebar is separated by a hairline,
           not a hue; raised is table headers and inset wells. */
        sidebar: 'var(--sidebar)',
        raised: 'var(--raised)',
        sunken: 'var(--sunken)',
        zebra: 'var(--zebra)',
        highlight: 'var(--highlight)',
        'highlight-fg': 'var(--highlight-fg)',
        'surface-hover': 'var(--surface-hover)',
        'surface-selected': 'var(--surface-selected)',
        fg: 'var(--fg)',
        'fg-muted': 'var(--fg-muted)',
        'fg-subtle': 'var(--fg-subtle)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        primary: 'var(--primary)',
        'primary-fg': 'var(--primary-fg)',
        'primary-hover': 'var(--primary-hover)',
        status: {
          'success-fg': 'var(--status-success-fg)',
          'success-bg': 'var(--status-success-bg)',
          'warning-fg': 'var(--status-warning-fg)',
          'warning-bg': 'var(--status-warning-bg)',
          'danger-fg': 'var(--status-danger-fg)',
          'danger-bg': 'var(--status-danger-bg)',
          'info-fg': 'var(--status-info-fg)',
          'info-bg': 'var(--status-info-bg)',
          'neutral-fg': 'var(--status-neutral-fg)',
          'neutral-bg': 'var(--status-neutral-bg)',
        },
      },
      borderColor: { DEFAULT: 'var(--border)' },
      fontFamily: { sans: ['var(--font-sans)'] },
      fontSize: {
        // The numeric scale — `text-13`, `text-18`, and so on.
        ...Object.fromEntries(
          typography.sizes.map((size) => [String(size), [`${size}px`, { lineHeight: '1.5' }]]),
        ),
        /*
          The brand type roles, as named utilities: `text-title-primary`,
          `text-title-secondary`, `text-supporting`.

          Each carries its own weight, so the class is the whole instruction and
          a caller cannot set a 24px title at 400 by forgetting `font-semibold`.
          Derived from `typography.roles` rather than restated here, so the spec
          lives in one file.
        */
        'title-primary': [
          `${typography.roles.titlePrimary.size}px`,
          {
            lineHeight: String(typography.roles.titlePrimary.lineHeight),
            fontWeight: String(typography.roles.titlePrimary.weight),
          },
        ],
        'title-secondary': [
          `${typography.roles.titleSecondary.size}px`,
          {
            lineHeight: String(typography.roles.titleSecondary.lineHeight),
            fontWeight: String(typography.roles.titleSecondary.weight),
          },
        ],
        supporting: [
          `${typography.roles.supporting.size}px`,
          {
            lineHeight: String(typography.roles.supporting.lineHeight),
            fontWeight: String(typography.roles.supporting.weight),
          },
        ],
      },
      fontWeight: {
        normal: String(typography.weights.regular),
        medium: String(typography.weights.medium),
        semibold: String(typography.weights.semibold),
      },
      borderRadius: {
        sm: `${radius.sm}px`,
        md: `${radius.md}px`,
        lg: `${radius.lg}px`,
      },
      boxShadow: {
        card: elevation.card,
        overlay: elevation.overlay,
      },
      spacing: {
        sidebar: 'var(--sidebar-width)',
        'sidebar-collapsed': 'var(--sidebar-collapsed-width)',
        header: 'var(--header-height)',
      },
      maxWidth: {
        content: 'var(--content-max-width)',
      },
    },
  },
  plugins: [],
} satisfies Config;
