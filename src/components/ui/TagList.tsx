import { Popover } from 'antd';

export interface TagListProps {
  items: string[];
  /** How many to show before the rest collapse into "+n". */
  max?: number;
  /** Heading on the hover card. Say what the list IS — "4 file types". */
  label?: string;
  /** Shown when the list is empty. */
  empty?: string;
}

const CHIP =
  'inline-flex max-w-[140px] items-center truncate rounded-full bg-raised px-2 py-[2px] text-12 font-medium text-fg-muted';

/**
 * A short list of values in a table cell: the first few as chips, the rest
 * behind a "+n" that opens on hover.
 *
 * A cell cannot grow to fit an unbounded list — one row with six values would
 * set the height of every row in the table, or wrap and push the columns beside
 * it out of alignment. Truncating to a sentence ("PDF, JPEG and 2 more") reads
 * as prose in a column of data and cannot be scanned. Chips keep each value
 * separable at a glance, and the overflow stays one hover away.
 *
 * The card carries a heading, because "+2" on its own does not say what kind of
 * thing the two are, and by the time the pointer is over it the column header is
 * out of the reader's field of view.
 */
export const TagList = ({ items, max = 2, label, empty = 'N/A' }: TagListProps) => {
  if (items.length === 0) {
    return <span className="text-supporting italic text-fg-subtle">{empty}</span>;
  }

  const shown = items.slice(0, max);
  const hidden = items.slice(max);

  const card = (
    <div className="min-w-[160px] max-w-[240px]">
      {label ? <div className="label-caps border-b border-border px-3 py-2">{label}</div> : null}
      <ul className="m-0 flex list-none flex-col gap-1 p-3">
        {items.map((item) => (
          <li key={item} className="truncate text-supporting text-fg">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <span className="inline-flex items-center gap-1">
      {shown.map((item) => (
        <span key={item} className={CHIP} title={item}>
          {item}
        </span>
      ))}

      {hidden.length > 0 ? (
        <Popover content={card} placement="topLeft" arrow={false} styles={{ body: { padding: 0 } }}>
          <span className={`${CHIP} cursor-default`}>+{hidden.length}</span>
        </Popover>
      ) : null}
    </span>
  );
};

export default TagList;
