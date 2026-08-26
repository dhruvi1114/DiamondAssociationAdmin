import { useEffect, useState } from 'react';
import { Input as AntInput } from 'antd';
import { Search, X } from 'lucide-react';

export interface SearchInputProps {
  /** The committed query — what the list is actually filtered by. */
  value: string;
  /** Fired after the pause, not on every keystroke. */
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name. There is no visible label on a toolbar control. */
  label?: string;
  /** How long to wait after the last keystroke, ms. */
  delay?: number;
  className?: string;
}

/**
 * A search box for a toolbar, wired to a server-side filter.
 *
 * It keeps its own text and hands the committed value up after a pause. That
 * split matters: the field has to stay responsive to every keystroke, but the
 * list behind it must not issue a request per letter — "grower" would be six
 * round trips, five of whose results are thrown away, and on a slow connection
 * they can land out of order and leave the list showing the wrong one.
 *
 * The value is still controlled from outside: if the page resets the query — a
 * cleared filter, a tab switch — the box follows, which a purely local input
 * would not.
 *
 * `className` goes on a wrapper, not on the input. With a prefix icon AntD
 * renders the box as an affix wrapper around the real `<input>` and sends
 * `className` to the inner one — so a width set on this component landed on an
 * element that was already inside a full-width box, the field stretched to its
 * container, and whatever sat beside it in the toolbar was pushed onto its own
 * line.
 */
export const SearchInput = ({
  value,
  onChange,
  placeholder = 'Search…',
  label = 'Search',
  delay = 300,
  className,
}: SearchInputProps) => {
  const [text, setText] = useState(value);

  // Follow the outside value when it changes for a reason other than typing.
  useEffect(() => setText(value), [value]);

  useEffect(() => {
    if (text === value) return;

    const timer = window.setTimeout(() => onChange(text), delay);

    return () => window.clearTimeout(timer);
  }, [text, value, delay, onChange]);

  return (
    <div className={className ?? 'w-[240px]'}>
      <AntInput
        aria-label={label}
        value={text}
        placeholder={placeholder}
        allowClear={{ clearIcon: <X size={14} strokeWidth={1.5} aria-hidden /> }}
        prefix={<Search size={16} strokeWidth={1.5} aria-hidden className="text-fg-subtle" />}
        onChange={(event) => setText(event.target.value)}
        // Enter commits immediately: someone who has finished typing should not
        // wait out a delay that exists for people who have not.
        onPressEnter={() => onChange(text)}
      />
    </div>
  );
};

export default SearchInput;
