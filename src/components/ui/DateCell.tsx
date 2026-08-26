import { Tooltip } from 'antd';
import NotAvailable from './NotAvailable';
import { formatDate, formatDateTime } from '@/utils/format';

export interface DateCellProps {
  value: string | null | undefined;
  /** Overrides "N/A" where the missing date has a better name — "Not submitted". */
  empty?: string;
}

/**
 * A date in a table cell: the day on the page, the timestamp on hover.
 *
 * The column is scanned, not read — an admin looks down it for "has anyone
 * touched this lately", and a time on every row is noise at that job. But the
 * minute matters exactly when someone stops scanning and starts asking which of
 * two edits came first, so it lives one hover away rather than in a drawer two
 * clicks off.
 *
 * Ordinary cell colour, not `fg-muted`. It was muted, which read as secondary or
 * disabled next to the values beside it — a date is data here, the same as a
 * name or a count.
 *
 * `tabular` so the digits sit in a column and the dates stack into a readable
 * block instead of a ragged one.
 */
export const DateCell = ({ value, empty }: DateCellProps) => {
  /*
    A missing date is an absence like any other, and until now it was the one
    cell in the app that still fell back to a bare em-dash in ordinary text —
    indistinguishable from a date that failed to render.
  */
  if (!value) return <NotAvailable {...(empty ? { label: empty } : {})} />;

  const full = formatDateTime(value);
  const short = formatDate(value);

  // Nothing to reveal when the two read the same, and a tooltip repeating what
  // is already on screen teaches the user that hovering is pointless.
  if (short === full) {
    return <span className="tabular text-supporting">{short}</span>;
  }

  return (
    <Tooltip title={full}>
      <span className="tabular cursor-default text-supporting">{short}</span>
    </Tooltip>
  );
};

export default DateCell;
