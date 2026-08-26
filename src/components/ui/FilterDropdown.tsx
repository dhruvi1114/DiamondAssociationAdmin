import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { Popover } from 'antd';
import { SlidersHorizontal } from 'lucide-react';
import Button from './Button';

export interface FilterDropdownProps<T> {
  /** The filters the list is currently showing. */
  value: T;
  /** What "no filters" means. Clear resets to this. */
  emptyValue: T;
  /** Commit the staged draft. Called on Apply only. */
  onApply: (draft: T) => void;
  /** Drop every applied filter. Takes effect immediately. */
  onClear: () => void;
  /** How many filters are set, for the trigger's badge. */
  activeCount: number;
  /** The panel body, given the draft and a setter for it. */
  children: (draft: T, setDraft: Dispatch<SetStateAction<T>>) => ReactNode;
  /** Fixed panel width. Wide enough for a date range by default. */
  width?: number;
}

/**
 * A filter panel behind a single button.
 *
 * The point of the component is the two copies of the filter state. `value` is
 * what the list is showing; `draft` is what the user is editing. Nothing the
 * user touches reaches the list until Apply, so a five-field panel costs one
 * request instead of five, and a half-finished combination — a date range with
 * only its start filled in — never hits the server at all.
 *
 * The draft is re-staged from `value` every time the panel opens, so abandoning
 * a panel by clicking away discards the edit rather than leaving it to reappear
 * later.
 *
 * Clear and Apply are deliberately asymmetric. Apply commits and closes: the
 * user has said what they want and wants to see it. Clear commits immediately
 * but leaves the panel open, because "clear" is almost always the first half of
 * "clear, then pick something else" — closing would make them re-open it.
 */
export const FilterDropdown = <T,>({
  value,
  emptyValue,
  onApply,
  onClear,
  activeCount,
  children,
  width = 288,
}: FilterDropdownProps<T>) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<T>(value);

  /*
    Re-stage on open, and also whenever the applied value changes underneath an
    open panel — a saved view or a reset elsewhere would otherwise leave the
    panel showing filters the list is no longer using.
  */
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (open) {
      setDraft(valueRef.current);
    }
  }, [open]);

  const panel = (
    /*
      The panel draws its own surface. AntD's inner shell is zeroed out below so
      the two do not stack into a doubled border — which means every part of the
      chrome has to be here instead, background included. Without it the popover
      is transparent and the table reads straight through it.
    */
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-overlay"
      style={{ width }}
    >
      <div className="flex flex-col gap-3 p-3">{children(draft, setDraft)}</div>

      <div className="flex items-center justify-between gap-2 border-t border-border p-2">
        <Button
          variant="ghost"
          onClick={() => {
            setDraft(emptyValue);
            onClear();
          }}
        >
          Clear
        </Button>

        <Button
          variant="primary"
          onClick={() => {
            onApply(draft);
            setOpen(false);
          }}
        >
          Apply
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      arrow={false}
      content={panel}
      // The card below draws the border, radius and shadow; AntD's own inner
      // shell would stack a second one around it.
      styles={{
        body: { padding: 0, background: 'transparent', boxShadow: 'none', border: 'none' },
      }}
    >
      {/*
        Styled as a control, not as a Button variant. The shared `secondary`
        now draws its outline in the primary ink — right for an action sitting
        beside a filled one, too loud for something that has to sit quietly next
        to the search box. So this matches the search box exactly at rest
        (1px `border`, 8px radius, 32px tall) and steps up to the primary ink
        once a filter is on.

        That step IS the active state; a number badge was tried here and
        removed. On a two-field panel "Filters 1" is noise, and the count is
        visible the moment the panel opens. `activeCount` stays as the input to
        the decision.
      */}
      <button
        type="button"
        className={[
          'flex h-8 flex-none cursor-pointer items-center gap-2 rounded-md border px-3',
          'text-supporting transition-colors duration-100 hover:!bg-surface-hover',
          '!bg-surface',
          activeCount > 0 ? 'border-primary font-medium !text-fg' : 'border-border !text-fg-muted',
        ].join(' ')}
      >
        <SlidersHorizontal size={16} strokeWidth={1.5} aria-hidden />
        Filters
      </button>
    </Popover>
  );
};

export interface FilterGroupProps {
  label: string;
  children: ReactNode;
}

/** One labelled row inside the panel, so every filter is spaced the same. */
export const FilterGroup = ({ label, children }: FilterGroupProps) => (
  <div className="flex flex-col gap-1">
    <span className="text-13 font-medium text-fg">{label}</span>
    {children}
  </div>
);

export default FilterDropdown;
