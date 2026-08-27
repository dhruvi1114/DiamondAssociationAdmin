import { Tooltip } from 'antd';
import Highlight from './Highlight';
import NotAvailable from './NotAvailable';

export interface TextCellProps {
  value: string | null | undefined;
  /**
   * Cap the cell's width so long prose cannot stretch the column. Set it to the
   * column's width less its padding (24px, from `cellPaddingInlineMD`).
   */
  width?: number;
  /** Overrides "N/A" where the absence has a better name. */
  empty?: string;
  /**
   * What the reader searched for. Blank leaves the text alone.
   *
   * Here rather than in a second component: a highlighted cell still has to
   * truncate, still needs the tooltip carrying the full text, and still has to
   * fall back to "N/A" when empty. A `<Highlight>` dropped into a cell on its
   * own loses all three, and the columns that can be searched would then look
   * different from the columns that cannot.
   */
  query?: string;
}

/**
 * Free text in a table cell: one line, clipped, whole thing on hover.
 *
 * Prose in a grid is the thing that wrecks a table — one long note either forces
 * a column three times the width it needs or wraps a row to four lines and
 * breaks the scan down every other column. Clipping keeps the grid, and the
 * tooltip means nothing is actually lost.
 *
 * The tooltip is skipped when the text is short enough to be fully visible: a
 * hover that reveals exactly what is already on screen teaches the user that
 * hovering is pointless, and they stop doing it where it matters.
 *
 * The cut is a `max-width`, not the column's `ellipsis` prop, which does not
 * work on these tables and cannot be made to: rc-table falls back to
 * `table-layout: auto` whenever a table has fixed columns AND `scroll.x` is
 * `max-content` — both true here — and under `auto` a column `width` is only a
 * minimum, so a long value widens its column instead of being clipped by it.
 */
export const TextCell = ({ value, width = 220, empty, query }: TextCellProps) => {
  const text = value?.trim();

  if (!text) {
    return <NotAvailable {...(empty ? { label: empty } : {})} />;
  }

  return (
    <Tooltip title={text}>
      <span className="block truncate align-middle text-supporting" style={{ maxWidth: width }}>
        {query ? <Highlight text={text} query={query} /> : text}
      </span>
    </Tooltip>
  );
};

export default TextCell;
