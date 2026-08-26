import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Modal } from 'antd';
import { CornerDownLeft, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface CommandItem {
  key: string;
  /** What the user is looking for — the page's own name. */
  label: string;
  path: string;
  icon: LucideIcon;
  /** Where it lives, shown under the label so two similar names stay tellable apart. */
  group: string;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelect: (item: CommandItem) => void;
  items: CommandItem[];
}

const ICON = { size: 18, strokeWidth: 1.5 } as const;

/**
 * Jump-to-page search.
 *
 * Scope is deliberately every destination the signed-in admin may open — the
 * same permission-filtered table the sidebar draws from, so the palette can
 * never offer a page the nav hides or a page the backend would 403. It does NOT
 * search records (a member, an invoice); there is no endpoint for that yet, and
 * a search box that silently covers only half of what the user typed is worse
 * than one whose scope is obvious.
 *
 * Matching is a plain substring over the page name and its group, so "cat"
 * finds Categories & tiers and "money" finds everything filed under Money.
 */
export const CommandPalette = ({ open, onClose, onSelect, items }: CommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      return items;
    }

    return items.filter(
      (item) => item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q),
    );
  }, [items, query]);

  // A filtered list whose highlight stayed on row 7 would fire the wrong page on
  // Enter. Any change to the result set puts it back on the first row.
  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  // Keep the highlighted row on screen when it moves by keyboard rather than by
  // pointer — otherwise arrowing past the fold looks like the list stopped.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, results.length]);

  const choose = (item: CommandItem | undefined) => {
    if (!item) {
      return;
    }

    onSelect(item);
    onClose();
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (results.length ? (index + 1) % results.length : 0));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (results.length ? (index - 1 + results.length) % results.length : 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[active]);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      closable={false}
      width={640}
      style={{ top: 96 }}
      // Unmount the body when hidden so a half-typed query never reappears.
      destroyOnHidden
      /*
        AntD parks focus on the Modal's own wrapper div, which beats the input's
        `autoFocus` — the palette opened onto a box you could not type into, and
        arrow keys and Enter went nowhere because the handler below never saw
        them. Claim focus once the open transition has actually finished.
      */
      afterOpenChange={(isOpen) => {
        if (isOpen) {
          inputRef.current?.focus();
        }
      }}
      styles={{ content: { padding: 0, overflow: 'hidden', borderRadius: 10 } }}
    >
      <div onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search {...ICON} className="shrink-0 text-fg-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search modules, pages and actions…"
            aria-label="Search modules, pages and actions"
            role="combobox"
            aria-expanded
            aria-controls="command-results"
            /*
              The app-wide focus ring is right almost everywhere and wrong here.
              This field is the only thing the palette focuses, it is focused the
              instant the dialog opens, and the dialog is already a frame — so a
              2px ink outline inside a bordered row reads as a rendering fault
              rather than as focus. The caret carries the indicator instead.

              `focus-visible:` is what makes this stick: the global rule is
              `:where(…):focus-visible`, and although `:where()` contributes
              nothing, `:focus-visible` still counts as a class — so a bare
              `outline-none` merely ties and loses on order.
            */
            className="h-14 min-w-0 flex-1 border-0 bg-transparent text-16 text-fg outline-none placeholder:text-fg-subtle focus-visible:outline-none"
          />
          <kbd className="shrink-0 rounded-md border border-border px-2 py-1 text-11 font-medium text-fg-muted">
            Esc
          </kbd>
        </div>

        {results.length ? (
          <ul
            id="command-results"
            ref={listRef}
            role="listbox"
            className="m-0 max-h-[52vh] list-none overflow-y-auto p-2"
          >
            {results.map((item, index) => {
              const Icon = item.icon;
              const isActive = index === active;

              return (
                <li key={item.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-active={isActive}
                    onMouseMove={() => setActive(index)}
                    onClick={() => choose(item)}
                    className={[
                      'flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 px-2.5 py-2 text-left transition-colors duration-75',
                      isActive ? 'bg-surface-selected' : 'bg-transparent',
                    ].join(' ')}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-raised text-fg-muted">
                      <Icon {...ICON} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-supporting font-medium text-fg">
                        {item.label}
                      </span>
                      <span className="block truncate text-13 text-fg-muted">{item.group}</span>
                    </span>
                    {isActive ? (
                      <CornerDownLeft
                        size={16}
                        strokeWidth={1.5}
                        className="shrink-0 text-fg-muted"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-4 py-10 text-center text-supporting text-fg-muted">
            Nothing matches “{query}”.
          </div>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2.5 text-11 text-fg-muted">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border px-1.5 py-0.5">↑</kbd>
              <kbd className="rounded border border-border px-1.5 py-0.5">↓</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border px-1.5 py-0.5">↵</kbd>
              to open
            </span>
          </span>
          <span>
            {results.length} result{results.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </Modal>
  );
};

export default CommandPalette;
