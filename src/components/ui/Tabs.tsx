import { type ReactNode } from 'react';
import { SEGMENT_ITEM, SEGMENT_TRACK } from './Segmented';
import { Tabs as AntTabs, type TabsProps as AntTabsProps } from 'antd';
import { useSearchParams } from 'react-router-dom';

export type TabsVariant =
  /** AntD's underline tabs. The default, and what most screens use. */
  | 'line'
  /**
   * One control: a sunken track with the active tab raised out of it, and the
   * rest of the row free for a screen's primary action.
   *
   * Reads differently from `line` on purpose. Underlines say "separate places";
   * a track says "views of one thing", which is what Categories and Tiers are.
   * It is also compact enough to leave the rest of the row to the action.
   */
  | 'pill';

export interface TabsProps extends Omit<AntTabsProps, 'activeKey' | 'onChange'> {
  /**
   * Query-string key holding the active tab. Deep-linkable by contract
   * (design-system.md §2): an admin must be able to send a colleague a link to
   * the Documents tab of a member, not "open the member then click Documents".
   */
  queryParam?: string;
  defaultTab?: string;
  variant?: TabsVariant;
  /**
   * Rendered at the right of the tab row. `pill` only — that variant lays the
   * row out itself, so it has somewhere to put them.
   */
  actions?: ReactNode;
}

/**
 * Radii are concentric and borrowed, not invented: the raised tab takes the 8px
 * (`radius.md`) every button and input in the app uses, and the track takes that
 * plus its own 3px of padding. A track and a tab at the SAME radius look wrong at
 * the corners — the inner curve has to be tighter by exactly the padding between
 * them.
 */
/* The pill chrome is shared with the `Segmented` form control — one definition,
   so a change to the track or the raised tab reaches both. */
const TRACK = SEGMENT_TRACK;
const TAB = `${SEGMENT_ITEM} py-1`;

export const Tabs = ({
  queryParam = 'tab',
  defaultTab,
  items,
  variant = 'line',
  actions,
  ...rest
}: TabsProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeKey = searchParams.get(queryParam) ?? defaultTab ?? items?.[0]?.key;

  const select = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(queryParam, key);
    // replace: tab switches should not fill the back stack.
    setSearchParams(next, { replace: true });
  };

  if (variant === 'pill') {
    /*
      Built here rather than handed to AntD, for one reason that matters: this
      renders ONLY the active pane. AntD keeps every pane it has ever shown
      mounted, which is invisible until a pane wants to put something outside
      itself — a screen's primary action on the tab row, say — and then two
      hidden panes are fighting over one slot. One pane mounted at a time makes
      that a non-question.

      The trade is that switching tabs unmounts the pane and its state. For the
      list screens this variant is meant for, that state is a fetch that reruns
      anyway.
    */
    const active = items?.find((item) => item.key === activeKey) ?? items?.[0];

    return (
      <div
        /*
          8px, tighter than the page's own 12px frame. The tab row and the table
          are one object — the tabs choose what the table shows — so the gap
          between them should read as smaller than the gap around the pair. At
          16px, and even at 12, the table looked pushed away from its own
          switcher.
        */
        className="flex h-full min-h-0 flex-col gap-2"
      >
        <div className="flex flex-none items-center justify-between gap-3">
          <div role="tablist" className={TRACK}>
            {(items ?? []).map((item) => {
              const selected = item.key === active?.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  id={`tab-${item.key}`}
                  aria-selected={selected}
                  aria-controls={`tabpanel-${item.key}`}
                  disabled={item.disabled}
                  onClick={() => select(item.key)}
                  /*
                    Hover moves colour and nothing else. Filling an inactive tab
                    reads as a second raised tab — two apparently active at once,
                    and "which view am I looking at" briefly ambiguous. The cursor
                    is already on the thing; colour is affordance enough.
                  */
                  className={[
                    TAB,
                    'cursor-pointer border-0 disabled:cursor-not-allowed disabled:opacity-40',
                    selected
                      ? 'bg-surface font-medium text-fg shadow-card'
                      : 'bg-transparent text-fg-muted hover:text-fg',
                  ].join(' ')}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {actions ? <div className="flex flex-none items-center gap-2">{actions}</div> : null}
        </div>

        <div
          role="tabpanel"
          id={`tabpanel-${active?.key}`}
          aria-labelledby={`tab-${active?.key}`}
          /*
            A flex COLUMN, not a plain block. The panel took the leftover height
            itself, but a plain block gives its children no flex context — so a
            `<Card flush className="flex-1">` handed straight to a tab sized to
            its own content and left the rest of the card's height as empty page,
            while a tab whose child happened to be a component with its own
            `flex h-full flex-col` root filled correctly. Two tabbed pages, two
            different-looking tables, and nothing wrong with either page.

            As a column, the panel's child fills whether it is a bare Card or a
            wrapper of its own.
          */
          className="flex min-h-0 flex-1 flex-col"
        >
          {active?.children}
        </div>
      </div>
    );
  }

  return <AntTabs items={items} activeKey={activeKey} onChange={select} {...rest} />;
};

export default Tabs;
