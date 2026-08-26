/**
 * The pill switcher, as a form control.
 *
 * `Tabs variant="pill"` already wears this exact chrome, but it is navigation:
 * it reads and writes a query parameter and renders a pane per option. A boolean
 * field is neither — its value belongs to the form, not the URL — so the two
 * share the STYLE below and nothing else.
 *
 * Preferred over a switch for a setting. A switch shows one state and leaves the
 * other implied, and beside a column of text inputs it reads as a different kind
 * of thing at a different height. Both options here are on screen, both
 * labelled, and the control is the same box as the inputs next to it.
 *
 * Two or three options. Past that the labels stop fitting and it is a `Select`.
 */

/**
 * Shared with `Tabs` so the two pill controls cannot drift apart.
 *
 * `SEGMENT_ITEM` deliberately carries no vertical metric. A tab row sizes itself
 * from its text; this control has to land on exactly the 32px of the inputs
 * beside it. Different answers, so each consumer sets its own height and
 * inherits the rest.
 */
export const SEGMENT_TRACK = 'inline-flex items-center gap-1 rounded-[11px] bg-sunken p-[3px]';
export const SEGMENT_ITEM = 'rounded-lg px-3 text-supporting transition-colors duration-100';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Accessible name — the visible label usually sits outside this control. */
  label?: string;
  /** Fill the width it is given, so it lines up with the inputs beside it. */
  block?: boolean;
  className?: string;
}

export const Segmented = <T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  label,
  block = false,
  className = '',
}: SegmentedProps<T>) => (
  <div
    role="radiogroup"
    aria-label={label}
    className={[
      SEGMENT_TRACK,
      // 32px exactly: a 26px item inside 3px of track padding either side.
      'h-8',
      block ? 'flex w-full' : '',
      disabled ? 'opacity-60' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
  >
    {options.map((option) => {
      const selected = option.value === value;

      return (
        /*
          `radio`, not `tab`. A tab says "this reveals a panel"; these change a
          value and reveal nothing. Screen readers announce the group's name and
          the chosen option either way, but only one of them is true.
        */
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={selected}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={[
            SEGMENT_ITEM,
            'inline-flex h-full items-center justify-center',
            block ? 'flex-1' : '',
            'cursor-pointer border-0 disabled:cursor-not-allowed',
            selected
              ? 'bg-surface font-medium text-fg shadow-card'
              : 'bg-transparent text-fg-muted hover:text-fg',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export default Segmented;
