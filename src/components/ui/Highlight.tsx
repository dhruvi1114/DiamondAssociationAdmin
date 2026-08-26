export interface HighlightProps {
  /** The full text as it should read. */
  text: string | null | undefined;
  /** What the reader searched for. Case-insensitive; blank leaves the text alone. */
  query?: string;
}

/** Escape a user's query so it cannot act as a regular expression. */
const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Search text with the matched run marked.
 *
 * A filtered list answers "here are the rows that match" but not "and this is
 * where" — on a row whose code, name and description could each be the reason it
 * survived the filter, the reader has to re-scan every cell to find out. Marking
 * the run answers it at a glance.
 *
 * Yellow, from the `highlight` token — the one hue in the system that is not a
 * status. It only appears while a search is active and only inside the run that
 * matched, so it cannot be mistaken for a warning on the row.
 *
 * Colour ONLY: no padding, no weight change. Both push the surrounding letters
 * apart, so "Grower" searched for "Gr" set as "Gr ower" — the word appears to
 * break at exactly the moment the reader is checking whether it is the one they
 * wanted. The wash has to sit behind the glyphs without moving them.
 */
export const Highlight = ({ text, query }: HighlightProps) => {
  const value = text ?? '';
  const needle = query?.trim() ?? '';

  if (!needle || !value) return <>{value}</>;

  const parts = value.split(new RegExp(`(${escape(needle)})`, 'ig'));

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          // Index keys are safe here: the array is derived from the two props and
          // is rebuilt whole whenever either changes.
          <mark key={index} className="bg-highlight p-0 text-highlight-fg">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
};

export default Highlight;
