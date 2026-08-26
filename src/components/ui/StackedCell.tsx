import type { ReactNode } from 'react';

export interface StackedCellProps {
  /** The value the column is named for. */
  primary: ReactNode;
  /** Context under it — omitted entirely when there is none, never left blank. */
  secondary?: ReactNode;
  /** Renders the secondary line in the mono face, for a code or a reference. */
  mono?: boolean;
}

/**
 * Two facts in one cell: the value, and the context that identifies it.
 *
 * For the case where a column would otherwise need a partner column that nobody
 * scans — a company's legal name under its trading name, an application number
 * under the applicant, the role that owns a stage under the stage. At 1280px
 * every column that earns its width pushes a useful one off screen, so context
 * rides under its value rather than taking a column of its own.
 *
 * It exists because three tables had each written this stack by hand, and they
 * had drifted: 13px over 12px on one, 14px over 11px on another, one truncating
 * both lines and one truncating neither.
 *
 * Both lines truncate. A cell that grows to fit its longest secondary line sets
 * the width of the column for every row that does not need it.
 */
export const StackedCell = ({ primary, secondary, mono = false }: StackedCellProps) => (
  <div className="min-w-0">
    <div className="truncate text-supporting font-medium text-fg">{primary}</div>
    {secondary ? (
      <div className={`truncate text-11 text-fg-muted ${mono ? 'font-mono' : ''}`.trim()}>
        {secondary}
      </div>
    ) : null}
  </div>
);

export default StackedCell;
