import type { ThemeConfig } from 'antd';
import { theme as antdTheme } from 'antd';
import { neutral, radius, semantic, status, typography, type ThemeMode } from './tokens';

/**
 * AntD 5 `ConfigProvider` mapping (design-system.md §5).
 *
 * The job here is not "add a brand colour" — it is to **remove** one. AntD's
 * default blue leaks into links, switches, checkboxes, focus rings, active menu
 * items, spinners and primary buttons; in a monochrome system each of those is a
 * visible defect. Every blue-carrying token below is therefore overridden with a
 * neutral, and `colorPrimary` becomes near-black (white in dark mode).
 *
 * Literals come from `tokens.ts` only — this file adds no colours of its own.
 */
export const buildAntdTheme = (mode: ThemeMode): ThemeConfig => {
  const n = neutral[mode];
  const s = semantic[mode];
  const st = status[mode];

  return {
    algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      // --- the blue removal -------------------------------------------------
      colorPrimary: s.primary,
      colorPrimaryHover: s.primaryHover,
      colorPrimaryActive: s.primaryActive,
      colorPrimaryBg: s.raised,
      colorLink: s.fg,
      colorLinkHover: s.primaryHover,
      colorLinkActive: s.fg,
      colorInfo: st.info.fg,

      // --- surfaces and text ------------------------------------------------
      colorBgBase: s.bg,
      colorBgContainer: s.surface,
      colorBgElevated: s.surface,
      colorBgLayout: s.bg,
      colorText: s.fg,
      colorTextSecondary: s.fgMuted,
      colorTextTertiary: s.fgSubtle,
      colorTextPlaceholder: s.fgSubtle,
      colorTextDisabled: s.fgSubtle,

      // --- hairlines --------------------------------------------------------
      colorBorder: s.border,
      colorBorderSecondary: s.border,
      colorSplit: s.border,

      // --- status (desaturated, meaning-only) --------------------------------
      colorSuccess: st.success.fg,
      colorWarning: st.warning.fg,
      colorError: st.danger.fg,

      // --- shape and type ----------------------------------------------------
      // Controls 8, containers 10 — the skill's radius pair.
      borderRadius: radius.md,
      borderRadiusLG: radius.lg,
      borderRadiusSM: radius.sm,
      controlHeight: 32,
      controlHeightSM: 28,
      controlOutline: s.focusRing,
      fontFamily: typography.fontFamily,
      fontSize: typography.bodySize,
      lineHeight: typography.lineHeightBody,
      wireframe: false,

      // Borders do the work, not shadows.
      boxShadow: '0 1px 2px rgb(0 0 0 / 0.04)',
      boxShadowSecondary: '0 8px 24px rgb(0 0 0 / 0.12)',
    },
    components: {
      Button: {
        primaryShadow: 'none',
        defaultShadow: 'none',
        dangerShadow: 'none',
        borderRadius: radius.md,
        /*
          Pinned, not inherited. `darkAlgorithm` derives a whole palette from
          `colorPrimary`, and derivation from white can only go downwards — so a
          white primary came out as mid-grey, indistinguishable from a disabled
          control. Restating the three here overrides the derived ramp.

          `colorTextLightSolid` is the label on a filled button. It defaults to
          white, which on a white button is nothing at all.
        */
        colorPrimary: s.primary,
        colorPrimaryHover: s.primaryHover,
        colorPrimaryActive: s.primaryActive,
        colorTextLightSolid: s.primaryFg,
        fontWeight: typography.weights.medium,
        /*
          The `supporting` role, not the 13px operator body size: an action reads
          at the same size as the sentence that explains it. Set here rather than
          per screen so every button in the app agrees — this is the one place
          that is true of.
        */
        fontSize: typography.roles.supporting.size,
        /*
          A secondary button is outlined where the primary is filled, so the
          outline is doing the same job the fill does — it has to carry the same
          ink. Drawn in `border` or even `border-strong` it read as a disabled
          control sitting next to a live one; at `primary` the pair reads as two
          real choices, one recommended.
        */
        defaultBorderColor: s.primary,
      },
      Input: { borderRadius: radius.md, activeShadow: `0 0 0 3px ${s.focusRing}` },
      InputNumber: { borderRadius: radius.md },
      Select: {
        borderRadius: radius.md,
        optionSelectedBg: n[100],
        /*
          AntD reads the size-suffixed tokens for `size="small"`, so the radius
          above never reached the inline selects in toolbars and pagination bars
          — they rendered at AntD's 4px against 8px buttons on the same row.
          Height matches the 28px icon buttons for the same reason.
        */
        borderRadiusSM: radius.md,
        controlHeightSM: 28,
      },
      DatePicker: { borderRadius: radius.md },
      /**
       * The data table is the product surface (tables.md). Hairline row rules,
       * split lines between header cells, and a hover lighter than the header so
       * the two never read as the same band.
       *
       * Cells are the `supporting` role (14px), not the 13px operator body size,
       * and the header is `fg` rather than `fgMuted`. The header used to be 11px
       * uppercase muted — a caption ABOVE the data. It is now the same size as
       * the data and darker than it, which makes it a heading FOR the data: the
       * column name is the first thing you read down a table, and it was the
       * quietest thing on the row.
       *
       * `label-caps` in `index.css` still holds the 11px uppercase treatment for
       * the group labels that genuinely are captions.
       */
      Table: {
        headerBg: s.surfaceSubtle,
        headerColor: s.fg,
        /*
          A short bar floating at the cell edge, not a full-height rule. The
          header is the only row that needs vertical separation — the body reads
          down the rows, and ruling every cell there boxes the data in.
        */
        headerSplitColor: s.borderStrong,
        /*
          Square. The header used to round its own top corners to 10px inside a
          card that was already rounded to 10px — two arcs struck from different
          centres, a millimetre apart, with the header's grey showing in the gap.
          The card clips its flush body now, so the corner belongs to the card
          alone.
        */
        headerBorderRadius: 0,
        /*
          Hover has to clear the zebra stripe without becoming a block of colour.
          `surface-hover` (#F0F0F0) did the first and failed the second — against
          a #FCFCFC stripe it read as a selected row rather than a pointer
          following the eye. `raised` sits between the two: unmistakable on the
          row under the cursor, invisible from across the table.
        */
        rowHoverBg: s.raised,
        rowSelectedBg: s.raised,
        rowSelectedHoverBg: s.selected,
        borderColor: s.border,
        cellPaddingBlock: 8,
        cellPaddingInline: 12,
        /*
          The `MD` pair is the one that actually applies. `DataTable` renders at
          `size="middle"`, and AntD reads the size-suffixed tokens for anything
          but the default size — so the two above were being set and ignored, and
          every row was padded with AntD's own 12px. Rows measured 53px against a
          target of ~40.
        */
        cellPaddingBlockMD: 8,
        cellPaddingInlineMD: 12,
        cellFontSize: typography.roles.supporting.size,
        /*
          And the `MD` variant, for the same reason as `cellPaddingBlockMD` above:
          `size="middle"` reads the size-suffixed token, so the line above was
          being set and ignored and cells stayed at AntD's inherited 13px.
        */
        cellFontSizeMD: typography.roles.supporting.size,
        /*
          Sorting is shown by the caret alone. The shading these used to paint —
          header AND the whole column beneath it — turned the sorted column into
          a grey block running the height of the table, which read as a selected
          or disabled column rather than as an ordering. On a table where one
          column is ALWAYS sorted (a list has a default order), that block is
          permanent furniture.
        */
        headerSortActiveBg: 'transparent',
        headerSortHoverBg: s.hover,
        bodySortBg: 'transparent',
        footerBg: s.surface,
      },
      /**
       * Selected nav is a grey pill — no colored fill, no left accent bar
       * (layout.md). 36px items with a 4px gap: comfortable to click all day
       * without the sparse 48px rhythm of a consumer app.
       */
      Menu: {
        itemBg: 'transparent',
        itemSelectedBg: s.selected,
        itemSelectedColor: s.fg,
        itemActiveBg: s.selected,
        itemHoverBg: s.hover,
        itemHoverColor: s.fg,
        itemColor: s.fgMuted,
        itemBorderRadius: radius.md,
        itemHeight: 36,
        itemMarginBlock: 4,
        itemMarginInline: 8,
        itemPaddingInline: 10,
        iconSize: 16,
        iconMarginInlineEnd: 10,
        subMenuItemBg: 'transparent',
        activeBarBorderWidth: 0,
        groupTitleColor: s.fgSubtle,
        groupTitleFontSize: 11,
      },
      Tabs: {
        horizontalMargin: '0 0 12px 0',
        inkBarColor: s.fg,
        itemSelectedColor: s.fg,
        itemHoverColor: s.fg,
        itemColor: s.fgMuted,
      },
      Switch: { colorPrimary: s.primary, colorPrimaryHover: s.primaryHover },
      Checkbox: { colorPrimary: s.primary },
      Radio: { colorPrimary: s.primary },
      Slider: { trackBg: s.primary, handleColor: s.primary },
      Spin: { colorPrimary: s.fg },
      Progress: { defaultColor: s.fg },
      // Selected page is a near-black fill, never a coloured one (tables.md).
      Pagination: {
        itemActiveBg: s.primary,
        colorPrimary: s.primaryFg,
        colorPrimaryHover: s.primaryFg,
        itemBg: s.surface,
        itemSize: 28,
      },
      Modal: { borderRadiusLG: radius.lg },
      Drawer: { colorBgElevated: s.surface },
      /**
       * AntD's Layout defaults are `#001529` for both the header and the sider —
       * the dark navy that was showing as a "blue line" across the top of every
       * admin page. Tailwind classes on the element lose to `.ant-layout-header`,
       * so the fix belongs here, in the token layer, not in a specificity fight.
       *
       * Elvee's admin (the reference for this screen) uses a white header with a
       * hairline bottom border over a very light page background, which is also
       * what a monochrome system needs: the chrome recedes and the content is the
       * only thing with contrast.
       */
      Layout: {
        headerBg: s.surface,
        headerHeight: 56,
        headerPadding: '0 24px',
        siderBg: s.sidebar,
        bodyBg: s.bg,
        triggerBg: s.raised,
        triggerColor: s.fg,
        lightSiderBg: s.sidebar,
        lightTriggerBg: s.raised,
        lightTriggerColor: s.fg,
      },
      Card: { borderRadiusLG: radius.lg, paddingLG: 20, headerFontSize: 15 },
      /**
       * Alerts are information, not decoration. AntD fills them with a saturated
       * block by default, which in a monochrome system reads as a heavy grey slab
       * and out-shouts the content it is describing. Subtle tint + hairline border
       * instead — the icon and the words carry the meaning.
       */
      Alert: {
        colorInfoBg: s.surfaceSubtle,
        colorInfoBorder: s.border,
        colorSuccessBg: st.success.bg,
        colorSuccessBorder: s.border,
        colorWarningBg: st.warning.bg,
        colorWarningBorder: s.border,
        colorErrorBg: st.danger.bg,
        colorErrorBorder: s.border,
        borderRadiusLG: radius.md,
        withDescriptionPadding: '12px 16px',
        defaultPadding: '8px 12px',
      },
      /**
       * 10px — deliberately off the bottom of the type scale, which starts at
       * 11. A tooltip is an aside: it should read as a note about the thing
       * rather than as more of the thing.
       *
       * It is the only text in the app set this small, and some tooltips are the
       * only place their content appears at all — a truncated description, a
       * full timestamp, the reason a control is disabled. If any of those start
       * getting skipped, this is the number to raise.
       *
       * It was 10px, which is smaller than anything else in the system and was
       * chosen to keep a tooltip from competing with what it explains. In
       * practice it competed by being hard to read: a tooltip is the only place
       * some of this content appears at all — a truncated description, a full
       * timestamp, the reason a control is disabled — and content you have to
       * lean in for is content that gets skipped.
       *
       * Set as a component token rather than a CSS override so it travels with
       * the theme and flips with `data-theme` like every other value here.
       */
      Tooltip: {
        colorBgSpotlight: n[900],
        colorTextLightSolid: n[0],
        fontSize: 10,
        lineHeight: 1.4,
        /* Tighter than the 8px `radius.md` the controls use: a bubble this short
           looks like a pill at 8, and like a note at 6. */
        borderRadius: 6,
      },
      Segmented: { itemSelectedBg: s.surface, itemSelectedColor: s.fg },
    },
  };
};
