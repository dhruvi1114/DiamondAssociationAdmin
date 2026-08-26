import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Popover, Tooltip } from 'antd';
import { Bell, ChevronDown, ChevronLeft, LogOut, Moon, Search, Sun, User } from 'lucide-react';
import BrandMark, { BrandGlyph } from '@/components/brand/BrandMark';
import { PanelToggleIcon } from '@/components/brand/PanelToggleIcon';
import { CommandPalette, StatusChip, type CommandItem } from '@/components/ui';
import { NAV_GROUPS, type NavGroup, type NavItem } from '@/constant/navigation';
import { PageTitleContext } from '@/hooks/usePageTitle';
import { usePermissions } from '@/hooks/usePermissions';
import { authService } from '@/services/authService';
import { useAppDispatch, useAppSelector } from '@/store';
import { signedOut } from '@/store/authSlice';
import { navCollapsedChanged, navGroupToggled, themeToggled } from '@/store/uiSlice';
import { isMac } from '@/utils/platform';

const { Header, Content } = Layout;

/**
 * One stroke weight and one glyph size for the whole rail.
 *
 * 16, not 18: the labels are 14px, and a glyph a third taller than the text it
 * sits beside is what makes a nav read as a toolbar. At 16 the icon is a mark
 * against the word rather than a button in front of it.
 */
const ICON = { size: 16, strokeWidth: 1.5 } as const;

/**
 * The header's right-hand controls.
 *
 * Bordered, unlike the panel toggle on the left — that glyph is already a frame
 * and a second one around it reads as a box in a box. These are bare marks and
 * need the frame to register as pressable at all.
 *
 * `border-strong` rather than `border`: the hairline role is tuned for dividers
 * that should recede, and at 36px square it left these reading as ghosts of
 * buttons. An outline that IS the affordance has to hold its own edge.
 *
 * The glyph sits at full `fg` — the top of the scale, same ink as the page
 * title. Deliberate: these are the only two controls on the right of the bar,
 * so nothing around them competes, and the border already keeps them reading as
 * chrome rather than content.
 *
 * The `!` prefixes exist because one of the two is an `<a>`, and AntD's cssinjs
 * reset paints every anchor at class-plus-element specificity — without them the
 * link and the button would quietly disagree on fill and text colour.
 */
const HEADER_BUTTON =
  'grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-lg border border-border-strong !bg-surface p-0 !text-fg no-underline transition-colors duration-100 hover:!bg-surface-hover hover:!text-fg';

/**
 * Admin shell: fixed left nav, thin header, dense content area.
 *
 * The nav is hand-rolled rather than an AntD `Menu`. A menu component owns its
 * own row height, indent and selected-state paint, and fighting those with
 * overrides is how a sidebar ends up almost-but-not-quite on the grid. Sixty
 * lines of markup buys exact control of the two states that matter: the
 * labelled column and the icon-only rail.
 *
 * The nav is permission-aware — an item the admin cannot use is absent, not
 * greyed out, and a group whose every item is hidden disappears with it. That is
 * a UX decision, not a security one; the backend re-checks every call.
 */
export const AppShell = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { canAny } = usePermissions();

  const collapsed = useAppSelector((state) => state.ui.navCollapsed);
  /*
    `?? []` is load-bearing. redux-persist reconciles at the top level, so a
    session that stored `ui` before this field existed rehydrates the slice
    WITHOUT it — `initialState` does not fill the gap — and reading `.includes`
    off `undefined` threw during render, which with no error boundary above the
    shell is a blank page. Any field added to a persisted slice needs this.
  */
  const foldedGroups = useAppSelector((state) => state.ui.navGroupsCollapsed) ?? [];
  const themeMode = useAppSelector((state) => state.ui.themeMode);
  const profile = useAppSelector((state) => state.auth.profile);
  const refreshToken = useAppSelector((state) => state.auth.refreshToken);

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => canAny(...item.anyOf) && !item.hidden),
      })).filter((group) => group.items.length > 0),
    [canAny],
  );

  const [paletteOpen, setPaletteOpen] = useState(false);

  /**
   * Everything this admin may open, flattened for search. Built from the same
   * permission-filtered groups the sidebar renders, so the palette cannot offer
   * a page the nav hides.
   */
  const commandItems = useMemo<CommandItem[]>(
    () =>
      groups.flatMap((group) =>
        group.items.map((item) => ({
          key: item.key,
          label: item.label,
          path: item.path,
          icon: item.icon,
          group: group.label,
        })),
      ),
    [groups],
  );

  /*
    ⌘K / Ctrl+K, captured on the window so it works from any screen. Bound in the
    capture phase and `preventDefault`-ed, otherwise Firefox hands ⌘K to its own
    address bar before the app ever sees it.
  */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((wasOpen) => !wasOpen);
      }
    };

    window.addEventListener('keydown', onKey, true);

    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Longest matching prefix, so /members/change-requests does not also light up /members.
  const selectedKey = useMemo(() => {
    const paths = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.path));
    const matches = paths
      .filter((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))
      .sort((a, b) => b.length - a.length);

    return matches[0] ?? '/';
  }, [location.pathname]);

  /**
   * The header answers "which page is this". Derived from the same nav table the
   * sidebar uses, so the two can never disagree — and so a page never has to
   * remember to announce itself.
   *
   * `titleOverride` is the one opt-in exception (`hooks/usePageTitle.tsx`): a
   * detail page — an application, say — can swap this for the record it is
   * showing, because that name matters more there than the section it lives
   * in, and once the page's own heading has scrolled away it is the only
   * place left saying which record this is.
   */
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  /** The record's reference code, shown beside the title rather than inside it. */
  const [titleMeta, setTitleMeta] = useState<string | null>(null);
  /** `domain.STATUS` for the chip beside it; see `usePageTitle` for why a string. */
  const [titleStatus, setTitleStatus] = useState<string | null>(null);
  const [titleOnBack, setTitleOnBack] = useState<(() => void) | null>(null);

  const pageTitle = useMemo(() => {
    if (titleOverride) return titleOverride;

    const item = NAV_GROUPS.flatMap((group) => group.items).find(
      (candidate) => candidate.path === selectedKey,
    );

    return item?.label ?? 'Work Queue';
  }, [selectedKey, titleOverride]);

  const pageTitleContextValue = useMemo(
    () => ({
      override: titleOverride,
      meta: titleMeta,
      status: titleStatus,
      onBack: titleOnBack,
      setOverride: setTitleOverride,
      setMeta: setTitleMeta,
      setStatus: setTitleStatus,
      setOnBack: setTitleOnBack,
    }),
    [titleOverride, titleMeta, titleStatus, titleOnBack],
  );

  /**
   * Revoke the refresh token server-side, then clear locally.
   *
   * The local clear happens whatever the server says. A sign-out button that can
   * fail — leaving the user apparently still signed in on a shared machine — is
   * a worse outcome than a session row the prune job cleans up later. The access
   * token is dead in 30 minutes regardless.
   */
  const signOut = () => {
    void authService.signOut(refreshToken).catch(() => undefined);
    dispatch(signedOut());
    navigate('/login', { replace: true });
  };

  /**
   * One row, two shapes. Expanded it is a full-width pill with a label;
   * collapsed it is a 40px square with the label moved into a tooltip — the same
   * element, so the selected paint and hover cannot drift apart between states.
   *
   * Selected is a raised card, not a darker fill: `surface` white against the
   * `sidebar` off-white, with the hairline and the card shadow. The rail is the
   * one surface in the app that is NOT white, so lifting the current row off it
   * separates it by depth rather than by yet another grey — and it can never be
   * confused with `surface-hover`, which stays a fill. Every row carries a
   * transparent border so the selected one does not grow by 2px when it gains
   * a visible one.
   *
   * The `!` prefixes are not laziness. AntD's cssinjs reset emits
   * `.css-<hash> a { color: …; background-color: transparent }` — class PLUS
   * element, so it outranks a single utility class and silently wiped both the
   * selected fill and the muted label colour off every row. `hashPriority:
   * 'high'` only flattens AntD's *component* selectors; its reset is not
   * covered. Anything that paints an `<a>` in this app needs to out-rank it.
   */
  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = selectedKey === item.path;

    const row = (
      <Link
        to={item.path}
        aria-current={active ? 'page' : undefined}
        className={[
          'group flex h-9 items-center rounded-lg border border-transparent text-supporting no-underline transition-colors duration-100',
          collapsed ? 'w-9 justify-center' : 'w-full gap-2.5 px-2.5',
          active
            ? '!border-border !bg-surface font-medium !text-fg shadow-card'
            : '!text-fg-muted hover:!bg-surface-hover hover:!text-fg',
        ].join(' ')}
      >
        <Icon {...ICON} className="shrink-0" aria-hidden />
        {!collapsed ? <span className="truncate">{item.label}</span> : null}
      </Link>
    );

    return (
      <li key={item.key} className={collapsed ? 'flex justify-center' : undefined}>
        {collapsed ? (
          <Tooltip title={item.label} placement="right" mouseEnterDelay={0.2}>
            {row}
          </Tooltip>
        ) : (
          row
        )}
      </li>
    );
  };

  /**
   * Who is signed in, in full — name, address and the role that decides what the
   * rest of the shell shows. The trigger in the rail can only afford two lines
   * and truncates both; this is where a user actually reads them, and where an
   * admin who holds two roles can see that they hold two.
   */
  const roleLabel = profile?.isSuperAdmin
    ? 'Super admin'
    : (profile?.roleNames?.filter(Boolean).join(', ') ?? '');

  /*
    The signed-in person's initial, in place of a generic person glyph.

    The same anonymous outline on every account says only "an account"; the
    letter says WHICH one, which is the single question this control exists to
    answer on a shared machine. Falls back to the glyph when there is no name to
    take a letter from — signed out, or a profile still loading.
  */
  const initial = profile?.fullName?.trim().charAt(0).toUpperCase() ?? '';

  const avatar = (size: 'sm' | 'md') => (
    <span
      className={[
        'grid shrink-0 place-items-center rounded-full bg-raised font-medium text-fg-muted',
        size === 'sm' ? 'h-7 w-7 text-12' : 'h-8 w-8 text-13',
      ].join(' ')}
      aria-hidden
    >
      {initial || <User size={size === 'sm' ? 15 : 16} strokeWidth={1.5} />}
    </span>
  );

  const accountCard = (
    <div className="w-[272px] rounded-lg border border-border bg-surface p-1 shadow-overlay">
      <div className="flex items-start gap-2.5 px-2.5 py-2.5">
        {avatar('md')}
        <div className="min-w-0 flex-1">
          <div className="truncate text-supporting font-medium text-fg">
            {profile?.fullName ?? 'Signed out'}
          </div>
          <div className="truncate text-13 text-fg-muted">{profile?.email ?? '\u2014'}</div>
          {/*
            No role is a real state, not a bug: a super admin holds every
            permission without holding a named role. Saying so beats an empty
            gap the reader has to interpret.
          */}
          <span className="mt-1.5 inline-flex max-w-full items-center rounded-full bg-raised px-2 py-0.5 text-11 font-medium text-fg-muted">
            <span className="truncate">{roleLabel || 'No role assigned'}</span>
          </span>
        </div>
      </div>

      <div className="mx-1 border-t border-border" />

      <button
        type="button"
        onClick={signOut}
        className="mt-1 flex w-full cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent px-2.5 py-2 text-left text-supporting text-fg transition-colors duration-100 hover:bg-surface-hover"
      >
        <LogOut {...ICON} className="shrink-0 text-fg-muted" aria-hidden />
        Sign out
      </button>
    </div>
  );

  return (
    <Layout
      /*
        Not decoration. AntD `Layout` only lays its children out in a row when it
        finds a `Sider` among them, and this shell renders a plain `<aside>`
        instead — without the flag the nav and the content stack vertically and
        the page is pushed off the bottom of the viewport.
      */
      hasSider
      className="h-screen flex-row overflow-hidden bg-bg"
    >
      {/*
        No hairline under the wordmark and none above the account row: the rail
        reads as one continuous column, and the only vertical rule in the shell
        is the one that separates nav from content. Groups are separated by
        space, not by lines — which is what keeps the collapsed rail legible
        once the captions are gone.
      */}
      <aside
        className={[
          'flex h-screen flex-none flex-col overflow-hidden border-r border-border bg-sidebar',
          'transition-[width] duration-200 ease-out',
          collapsed ? 'w-sidebar-collapsed' : 'w-sidebar',
        ].join(' ')}
      >
        {/*
          The brand, in the two cuts the rail has room for: the full lockup while
          the panel is open, the diamond alone once it collapses to 64px. Same
          asset both times — `BrandGlyph` crops the wordmark off the lockup
          rather than loading a second file, so the two can never fall out of
          register.

          This replaced a placeholder: a square with an "A" in it, next to the
          words "Association Admin". The square stood in for a logo that has
          since arrived, and the caption was carrying identity the mark can now
          carry itself.
        */}
        {/*
          Same height and the same closing rule as the page header beside it, so
          the hairline runs unbroken across the shell instead of stopping at the
          rail and restarting. Two surfaces, one horizon.
        */}
        <div
          className={[
            'flex h-header flex-none items-center gap-2 border-b border-border',
            collapsed ? 'justify-center px-0' : 'justify-between px-4',
          ].join(' ')}
        >
          {!collapsed ? <BrandMark width={120} /> : null}

          {/*
            One control, in the panel it controls. It used to live in the page
            header, which put the handle for a thing on a different surface from
            the thing — and left the collapsed rail with a logo that looked
            clickable, was not, and had no visible way back.

            Collapsed, the mark IS the control: it is the only thing left in the
            rail's header, and a 40px target is worth more there than a decal.
            The mark stays put on hover — swapping it for the panel glyph made
            the brand appear to vanish under the cursor, which is a bigger
            surprise than the one it was trying to prevent. The hover background
            and the tooltip say it is a control without moving anything.

            One glyph for both directions, expanded. Swapping to a "close"
            variant makes the control describe the sidebar's current state, but a
            toggle should describe the *thing it toggles* — a panel — and stay
            put while doing it. `aria-expanded` carries the state for screen
            readers, and the tooltip names the direction for everyone else.

            No border: the glyph is itself a frame, and a second frame around it
            reads as a box in a box.
          */}
          <Tooltip title={collapsed ? 'Open navigation' : 'Collapse navigation'} placement="right">
            <button
              type="button"
              aria-label={collapsed ? 'Open navigation' : 'Collapse navigation'}
              aria-expanded={!collapsed}
              className="grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-lg border-0 bg-transparent p-0 text-fg-muted transition-colors duration-100 hover:bg-surface-hover hover:text-fg"
              onClick={() => dispatch(navCollapsedChanged(!collapsed))}
            >
              {collapsed ? <BrandGlyph width={24} /> : <PanelToggleIcon />}
            </button>
          </Tooltip>
        </div>

        {/* Only the nav scrolls; the account row never scrolls away. */}
        <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
          {groups.map((group, index) => {
            /*
              Only foldable while the rail is open. Collapsed, the captions are
              gone and the chevrons with them — a group shut in that state would
              have no visible handle to open it again.
            */
            const isFolded = (candidate: NavGroup) =>
              !collapsed && foldedGroups.includes(candidate.key);
            const folded = isFolded(group);

            /*
              The space above a heading answers to what is directly above it.

              Under an open group it separates a heading from the previous
              group's ITEMS, and needs the full step or the sections run
              together. Under a folded one it separates two headings, and the
              same step leaves a ladder of captions floating in white — which is
              what the rail looked like with every group shut.
            */
            const previous = groups[index - 1];
            const gap = !previous ? 'pt-2' : isFolded(previous) ? 'pt-1' : 'pt-5';

            return (
              <div key={group.key} className={gap}>
                {/*
                  A caption, not a row. At the same 14px as the items it heads it
                  competes with them and the rail reads as one long list; at 11px
                  uppercase and letterspaced it is unmistakably a label ON the
                  group rather than an entry IN it, and the eye can skip a whole
                  section without reading it.

                  The whole caption is the control, not just the chevron: a 12px
                  glyph is a poor target, and someone who wants to fold "Money"
                  aims at the word "Money". The chevron is the affordance that
                  says the word can be pressed at all.
                */}
                {!collapsed ? (
                  <button
                    type="button"
                    aria-expanded={!folded}
                    aria-controls={`nav-group-${group.key}`}
                    onClick={() => dispatch(navGroupToggled(group.key))}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border-0 bg-transparent px-2.5 py-1 text-left text-11 font-medium uppercase tracking-wider text-fg-muted transition-colors duration-100 hover:text-fg"
                  >
                    <span className="truncate">{group.label}</span>
                    {/* Rotated, not swapped: the glyph turns towards what a press will do. */}
                    <ChevronDown
                      size={14}
                      strokeWidth={1.5}
                      aria-hidden
                      className={[
                        'shrink-0 transition-transform duration-150',
                        folded ? '-rotate-90' : '',
                      ].join(' ')}
                    />
                  </button>
                ) : null}
                {!folded ? (
                  <ul
                    id={`nav-group-${group.key}`}
                    className="m-0 flex list-none flex-col gap-0.5 p-0"
                  >
                    {group.items.map(renderItem)}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </nav>

        {/*
          Identity lives in the sidebar, not the header (layout.md). One home for
          "who am I", so the header is free to answer "which page is this".
        */}
        <div className="flex-none border-t border-border px-3 pb-3 pt-3">
          {/*
            Opens to the SIDE, not upward. A menu anchored `topLeft` unfurls over
            the nav it was launched from — you lose sight of where you are while
            deciding whether to leave. `rightBottom` puts the card in the content
            gutter beside the rail, with its lower edge on the trigger, so the
            sidebar stays whole behind it.

            `Popover` rather than `Dropdown` because Dropdown has no right-hand
            placement at all. Its own inner shell is zeroed out below: the card
            already draws the border, radius and shadow, and leaving AntD's
            would stack a second one around it.
          */}
          <div
            className={collapsed ? 'flex flex-col items-center gap-1' : 'flex items-center gap-1'}
          >
            <Popover
              trigger="click"
              placement="rightBottom"
              arrow={false}
              /*
              With no arrow, AntD's default offset tucks the card ~8px back over
              the sidebar's right edge. Push it clear so the hairline reads as an
              unbroken line and the card sits in the gutter, not on the rail.
            */
              align={{ offset: [20, 0] }}
              content={accountCard}
              styles={{
                body: {
                  padding: 0,
                  background: 'transparent',
                  boxShadow: 'none',
                  border: 'none',
                },
              }}
            >
              <button
                type="button"
                aria-label="Account menu"
                className={[
                  'flex cursor-pointer items-center rounded-lg border-0 bg-transparent text-left transition-colors duration-100 hover:bg-surface-hover',
                  collapsed ? 'h-9 w-9 justify-center p-0' : 'min-w-0 flex-1 gap-2 p-2',
                ].join(' ')}
              >
                {avatar('sm')}
                {!collapsed ? (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-13 text-fg">
                      {profile?.fullName ?? 'Signed out'}
                    </span>
                    {/*
                      The role, not the address. Two lines of identity in a 216px
                      rail should answer two different questions — who am I
                      signed in as, and what can I do — and the second is the one
                      that explains why a screen is empty or an action missing.
                      The address is one click away in the card, where it is not
                      truncated to "superadmin@associa…".
                    */}
                    <span className="block truncate text-11 text-fg-muted">
                      {roleLabel || 'No role assigned'}
                    </span>
                  </span>
                ) : null}
              </button>
            </Popover>

            {/*
            Sign out, on the rail rather than only inside the card. It is the one
            action here that someone arrives already intending to take, and
            making them open a menu to find it is a click spent on nothing.

            A sibling of the trigger, not a child of it: the trigger is a
            `<button>`, and a button inside a button is invalid and unreachable
            by keyboard.

            The card keeps its own labelled "Sign out" — this is an icon, and an
            icon alone is a guess until you have made it once.
          */}
            <Tooltip title="Sign out" placement={collapsed ? 'right' : 'top'}>
              <button
                type="button"
                aria-label="Sign out"
                onClick={signOut}
                className="grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-lg border-0 bg-transparent p-0 text-fg-muted transition-colors duration-100 hover:bg-surface-hover hover:text-fg"
              >
                <LogOut {...ICON} aria-hidden />
              </button>
            </Tooltip>
          </div>
        </div>
      </aside>

      <Layout className="flex min-w-0 flex-1 flex-col bg-bg">
        <Header className="flex h-header flex-none items-center justify-between gap-3 border-b border-border bg-surface px-6 leading-none shadow-none">
          {/* Which page am I on — the header's actual job (layout.md). The nav
              toggle used to sit to the left of this; it now lives in the panel
              it toggles. The back arrow is the other opt-in exception
              (`hooks/usePageTitle.tsx`): only a true drill-down page sets it,
              and it travels with the title override rather than living in the
              page's own scrolling content, or it stops being a back button
              the moment that content scrolls. */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {titleOnBack ? (
              <button
                type="button"
                onClick={titleOnBack}
                aria-label="Go back"
                className="grid h-8 w-8 flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-fg-muted transition-colors duration-100 hover:bg-surface-hover hover:text-fg"
              >
                <ChevronLeft size={20} strokeWidth={1.75} aria-hidden />
              </button>
            ) : null}
            <h1 className="m-0 min-w-0 truncate text-title-primary text-fg">{pageTitle}</h1>
            {/*
              The record's own reference, beside the name that means something to
              a person. Only a page that sets a title override ever sets this, so
              a section header is unaffected.
            */}
            {titleMeta ? (
              <span className="flex-none rounded-md bg-raised px-[6px] py-[2px] font-mono text-11 text-fg-muted">
                {titleMeta}
              </span>
            ) : null}
            {/*
              Split on the FIRST dot only: a domain never contains one, and an
              enum value could — `application.RETURNED_FOR_CORRECTION` must not
              become three pieces.
            */}
            {titleStatus ? (
              <span className="flex-none">
                <StatusChip
                  domain={titleStatus.slice(0, titleStatus.indexOf('.'))}
                  status={titleStatus.slice(titleStatus.indexOf('.') + 1)}
                />
              </span>
            ) : null}
            <div className="min-w-0 flex-1" />
          </div>

          <div className="flex flex-none items-center gap-2">
            {/*
              A button dressed as a field, not a field. Typing happens in the
              palette, so a real input here would need its own value, its own
              results and its own focus story — two search boxes that must agree.
              This one only has to open the one that works.
            */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex h-9 min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-border-strong !bg-surface py-0 pl-3 pr-1.5 !text-fg-muted transition-colors duration-100 hover:!bg-surface-hover md:w-[340px]"
            >
              <Search size={16} strokeWidth={1.5} className="shrink-0" aria-hidden />
              <span className="hidden flex-1 truncate text-left text-13 md:inline">Search…</span>
              <kbd className="hidden shrink-0 rounded-md border border-border px-1.5 py-0.5 text-11 font-medium md:inline">
                {isMac() ? '⌘' : 'Ctrl'} K
              </kbd>
            </button>

            {canAny('notification.view') ? (
              <Tooltip title="Notifications">
                <Link
                  to="/communication/outbox"
                  aria-label="Notifications"
                  className={HEADER_BUTTON}
                >
                  <Bell {...ICON} aria-hidden />
                </Link>
              </Tooltip>
            ) : null}

            <Tooltip title={themeMode === 'light' ? 'Switch to dark' : 'Switch to light'}>
              <button
                type="button"
                aria-label="Toggle colour theme"
                className={HEADER_BUTTON}
                onClick={() => dispatch(themeToggled())}
              >
                {themeMode === 'light' ? <Moon {...ICON} /> : <Sun {...ICON} />}
              </button>
            </Tooltip>
          </div>
        </Header>

        {/*
          One scroll region, one background. Pages must not re-paint their own
          canvas or invent a min-height — that double background is what makes a
          shell look patchy (layout.md).
        */}
        <Content className="min-h-0 w-full flex-1 overflow-y-auto p-3">
          {/*
            Full width, deliberately.

            This was briefly capped at `contentMaxWidth` and centred, which fixed
            the symptom — a metre-wide row — by shrinking the page. The cause was
            the table dumping every spare pixel into one column, and that is now
            fixed in `DataTable` itself: columns hold their proportions and grow
            together. With that in place a wide monitor buys more room for the
            data rather than more empty margin, which is the point of having one.
          */}
          <PageTitleContext.Provider value={pageTitleContextValue}>
            <Outlet />
          </PageTitleContext.Provider>
        </Content>
      </Layout>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={(item) => navigate(item.path)}
        items={commandItems}
      />
    </Layout>
  );
};

export default AppShell;
