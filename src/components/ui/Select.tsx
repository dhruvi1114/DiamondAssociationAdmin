import { useId, useMemo, useRef, useState } from 'react';
import {
  Checkbox as AntCheckbox,
  Input as AntInput,
  Select as AntSelect,
  type InputRef,
  type SelectProps as AntSelectProps,
} from 'antd';
import { ChevronDown } from 'lucide-react';
import Field from './Field';

/**
 * The arrow, on every select in the app.
 *
 * One glyph, not two: it points down when the menu is shut and rotates to point
 * up when it opens — `.ant-select-open` in `index.css` drives the rotation. A
 * pair of swapped icons would jump between two slightly different shapes at the
 * moment attention is on the menu; a rotation reads as the same mark turning
 * over.
 *
 * Lucide at 1.5, like every other icon in the shell. AntD's own caret comes from
 * a different family at a different weight, which showed next to the Lucide
 * icons in the toolbars these sit in.
 */
const ARROW = <ChevronDown size={16} strokeWidth={1.5} aria-hidden />;

export interface SelectProps<T = unknown> extends Omit<AntSelectProps<T>, 'status'> {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

/**
 * Select with the shared label/hint/error scaffold.
 *
 * Defaults chosen because they are right nearly every time in an admin UI:
 * searchable (lists here get long), label-substring filtering rather than
 * value-matching, and full-width so it lines up with the inputs above it.
 */
export const Select = <T,>({ label, hint, error, required, id, ...rest }: SelectProps<T>) => {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <Field label={label} htmlFor={selectId} hint={hint} error={error} required={required}>
      <AntSelect<T>
        suffixIcon={ARROW}
        showSearch
        optionFilterProp="label"
        className="w-full"
        {...rest}
        id={selectId}
        status={error ? 'error' : undefined}
      />
    </Field>
  );
};

export interface FormSelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface FormSelectProps extends Omit<
  AntSelectProps,
  'options' | 'showSearch' | 'searchValue' | 'filterOption'
> {
  options?: FormSelectOption[];
  /** Placeholder for the search box inside the panel. */
  searchPlaceholder?: string;
  /**
   * Hide the search box when there are fewer than this many options. Defaults
   * to 0 — always shown — so the control looks and behaves the same everywhere,
   * including on a list that is short today and long once the catalogue fills
   * up. Raise it per call site if a genuinely fixed two-value list looks noisy.
   */
  searchThreshold?: number;
}

/**
 * A searchable select for use INSIDE an AntD `Form.Item`.
 *
 * The third of three, and the distinction is about who owns the label:
 *
 *  - `Select` — a whole form field. Renders its own label, hint and error.
 *  - `FormSelect` — the control only. `Form.Item` above it already draws the
 *    label and the validation line, so a second label here would be a duplicate
 *    and a second error line would contradict the first.
 *  - `InlineSelect` — chrome. Toolbars and pagination bars, sized like a button.
 *
 * It exists because four screens had each hand-rolled a native `<select>` with
 * their own height, radius and text size. A native dropdown cannot be searched,
 * cannot be styled to match the inputs beside it, and renders as an OS menu that
 * looks nothing like the rest of the form on any platform.
 *
 * The search box lives INSIDE the panel rather than in the trigger, which is the
 * one thing AntD's own `showSearch` will not do: it turns the closed control
 * into a text input, so the selected value is replaced by a caret the moment you
 * open it and you lose sight of what is currently set while choosing its
 * replacement. Here the trigger keeps showing the selection and the panel owns
 * the query.
 *
 * Filtering is therefore ours too — `showSearch` is off, so AntD's own
 * `filterOption` never runs.
 */
export const FormSelect = ({
  options = [],
  searchPlaceholder = 'Search…',
  searchThreshold = 0,
  notFoundContent = 'No matches',
  onOpenChange,
  ...rest
}: FormSelectProps) => {
  const [query, setQuery] = useState('');
  const searchRef = useRef<InputRef>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return q ? options.filter((option) => option.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const searchable = options.length >= searchThreshold;

  return (
    <AntSelect
      suffixIcon={ARROW}
      className="w-full"
      options={filtered}
      notFoundContent={notFoundContent}
      onOpenChange={(open) => {
        // Drop the query on close. A panel that reopens still filtered by what
        // someone typed a minute ago looks like half the options have vanished.
        if (!open) {
          setQuery('');
        } else if (searchable) {
          // After the open transition, or the field is not in the DOM to focus.
          window.setTimeout(() => searchRef.current?.focus(), 0);
        }

        onOpenChange?.(open);
      }}
      popupRender={(menu) => (
        <>
          {searchable ? (
            <div className="border-b border-border px-3 py-2">
              {/*
                Borderless, and no focus ring. A bordered field inside a bordered
                panel is a box in a box, and the ring on top of that made the
                search look like the thing being edited rather than a way to sift
                the list below it. The divider under the row is what separates
                query from results — the panel already has an outline of its own.
              */}
              <AntInput
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                variant="borderless"
                className="!px-0 focus-visible:outline-none"
                /*
                  The panel sits inside the Select's own keyboard scope, which
                  treats printable keys as type-ahead and would steal every
                  character. Escape is deliberately let through so the panel can
                  still be closed from the search box.
                */
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') {
                    event.stopPropagation();
                  }
                }}
              />
            </div>
          ) : null}
          {menu}
        </>
      )}
      {...rest}
    />
  );
};

export type MultiValue = string | number;

export interface MultiSelectProps extends Omit<
  AntSelectProps<MultiValue[]>,
  'options' | 'mode' | 'showSearch' | 'filterOption' | 'value' | 'onChange'
> {
  options?: FormSelectOption[];
  value?: MultiValue[];
  onChange?: (value: MultiValue[]) => void;
  searchPlaceholder?: string;
  searchThreshold?: number;
  /** Label on the row that turns every visible option on. It flips to "Deselect
   *  all" once they all are — a control that says what it will DO next, rather
   *  than one that keeps its name and quietly changes meaning. */
  selectAllLabel?: string;
  deselectAllLabel?: string;
}

/**
 * A multi-select with a searchable, checkbox panel — `FormSelect`'s shape, for
 * a field that takes several answers.
 *
 * It replaces a row of loose checkboxes. A checkbox group is the honest control
 * for three or four fixed options, and the wrong one the moment the list can
 * grow or the form gets crowded: it cannot be searched, it takes a full row per
 * handful of options, and its selected state is spread across the whole row
 * rather than summarised in one place.
 *
 * Checkboxes stay — inside the panel, where they say "several of these" the way
 * a plain highlighted row would not — and the trigger carries the chosen values
 * as tags, so the answer is readable without opening anything.
 *
 * "Select all" acts on what is VISIBLE, not on everything. With a query typed,
 * the row the reader is looking at is a filtered list, and a control on top of
 * it that quietly also selected the hidden rows would be the last thing they
 * expect. "Clear all" in the footer is the one that ignores the filter, because
 * it says "all" about the selection rather than about the list.
 *
 * The count and Clear sit in a footer rather than beside the trigger: the
 * trigger has to survive being narrow, and it is already carrying the tags.
 */
export const MultiSelect = ({
  options = [],
  value,
  onChange,
  searchPlaceholder = 'Search…',
  searchThreshold = 0,
  selectAllLabel = 'Select all',
  deselectAllLabel = 'Deselect all',
  notFoundContent = 'No matches',
  onOpenChange,
  ...rest
}: MultiSelectProps) => {
  const [query, setQuery] = useState('');
  const searchRef = useRef<InputRef>(null);
  const selected = value ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return q ? options.filter((option) => option.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const searchable = options.length >= searchThreshold;
  const togglable = filtered.filter((option) => !option.disabled).map((option) => option.value);
  const allChosen = togglable.length > 0 && togglable.every((item) => selected.includes(item));

  const toggleAll = () => {
    onChange?.(
      allChosen
        ? selected.filter((item) => !togglable.includes(item))
        : Array.from(new Set([...selected, ...togglable])),
    );
  };

  return (
    <AntSelect<MultiValue[]>
      mode="multiple"
      /*
        The panel owns the query, so the trigger has no need of one — and with
        AntD's own search on, the closed control shows a text caret and invites
        typing that goes nowhere. Off, it reads as what it is: something you open.
      */
      showSearch={false}
      suffixIcon={ARROW}
      className="w-full"
      /*
        Tags collapse into "+3" rather than wrapping. Left to wrap, four choices
        made the closed control three lines tall and shunted every field below it
        down the drawer — a form that changes shape as it is filled in.
      */
      maxTagCount="responsive"
      options={filtered}
      value={selected}
      onChange={(next) => onChange?.(next)}
      notFoundContent={notFoundContent}
      /* The tick at the right of a chosen row is redundant beside a checkbox. */
      menuItemSelectedIcon={null}
      optionRender={(option) => (
        <span className="flex items-center gap-2">
          <AntCheckbox checked={selected.includes(option.value as MultiValue)} />
          {option.label}
        </span>
      )}
      onOpenChange={(open) => {
        if (!open) {
          setQuery('');
        } else if (searchable) {
          window.setTimeout(() => searchRef.current?.focus(), 0);
        }

        onOpenChange?.(open);
      }}
      popupRender={(menu) => (
        <>
          {searchable ? (
            <div className="border-b border-border px-3 py-2">
              <AntInput
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                variant="borderless"
                className="!px-0 focus-visible:outline-none"
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') {
                    event.stopPropagation();
                  }
                }}
              />
            </div>
          ) : null}

          {togglable.length > 0 ? (
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 border-0 border-b border-solid border-border bg-transparent px-3 py-2 text-left text-supporting font-medium text-fg hover:bg-surface-hover"
              // The panel is inside the Select's keyboard scope; without this the
              // click closes it before the toggle is read.
              onMouseDown={(event) => event.preventDefault()}
              onClick={toggleAll}
            >
              <AntCheckbox checked={allChosen} />
              {allChosen ? deselectAllLabel : selectAllLabel}
            </button>
          ) : null}

          {menu}

          {selected.length > 0 ? (
            <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-supporting">
              <span className="text-fg-muted">{selected.length} selected</span>
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 font-medium text-fg hover:underline"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onChange?.([])}
              >
                Clear all
              </button>
            </div>
          ) : null}
        </>
      )}
      {...rest}
    />
  );
};

export interface InlineSelectProps<T = unknown> extends Omit<AntSelectProps<T>, 'status'> {
  /**
   * Accessible name. A bare control has no visible label, and a dropdown that
   * announces itself as "combobox" and nothing else is unusable by voice or
   * screen reader.
   */
  label: string;
}

/**
 * A select with no scaffold around it — for chrome rather than for forms.
 *
 * `Select` above is a form field: it owns a visible label, a hint line and an
 * error line, and it fills its column. None of that is right for a control
 * sitting inline in a toolbar or a pagination bar, where the surrounding text
 * already says what it does and the row's height is set by the buttons beside
 * it.
 *
 * Shape comes from the `Select` component tokens, which pin the small size to
 * the same 8px radius and 28px height as every button — so it reads as one of
 * them rather than as a form control that wandered in.
 */
export const InlineSelect = <T,>({ label, size = 'small', ...rest }: InlineSelectProps<T>) => (
  <AntSelect<T> aria-label={label} size={size} suffixIcon={ARROW} {...rest} />
);

export default Select;
