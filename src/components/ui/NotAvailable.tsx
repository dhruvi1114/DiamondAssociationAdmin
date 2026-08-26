export interface NotAvailableProps {
  /** Overrides the text where the absence has a better name than "N/A". */
  label?: string;
}

/**
 * The one way this app says "there is nothing here".
 *
 * Before this, an empty cell was an em-dash on one screen, the word "None" on
 * another and a blank on a third — and a blank is the worst of the three,
 * because it cannot be told apart from a cell that failed to render.
 *
 * Italic, 12px and subtle on purpose: it is the only text in a table that is not
 * data, so it should not read as a value someone entered — smaller and lighter
 * than the cells around it is exactly the signal. `N/A` rather than `—` because a
 * dash is also a legitimate character in a name or a code.
 *
 * `label` exists but is deliberately unused in the list tables. Naming each
 * absence — "Not issued", "Not in a queue", "None uploaded" — explained WHY a
 * cell was empty, but it put eight different sentences down one row: text you
 * read rather than skip, and each one had to be understood before you could tell
 * it was an absence at all. One reading of "nothing here" is worth more across a
 * table than eight precise ones. Save `label` for a single cell whose absence
 * genuinely means something the reader must act on.
 *
 * `opacity-80` on top of `fg-subtle`, which is already the lightest text token
 * the palette has. Anything lighter as a token would fail contrast where it IS
 * meant to be read.
 */
export const NotAvailable = ({ label = 'N/A' }: NotAvailableProps) => (
  <span className="text-12 italic text-fg-subtle opacity-80">{label}</span>
);

export default NotAvailable;
