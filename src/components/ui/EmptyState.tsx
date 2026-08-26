import { Search } from 'lucide-react';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** What is not here — a noun phrase, not "No data". */
  title: string;
  /** One sentence saying WHY it is empty. */
  description?: string;
  /** The single action that resolves it. Omit when there genuinely is none. */
  action?: ReactNode;
  icon?: ReactNode;
}

/**
 * Empty is a state to design, not an accident (design-system.md §2).
 *
 * "No data" tells the user nothing. The contract here is: what is missing, why
 * it is missing, and the one thing that would fix it.
 *
 * `h-full` with centring, not a fixed block of padding. Inside a table that
 * fills its card, an empty state anchored to the top leaves the message pinned
 * under the header with the rest of the card blank below it — the eye reads that
 * as a row that failed to render rather than as an answer. Centred in the space,
 * it reads as the state of the whole list.
 *
 * The mark sits in a filled disc for the same reason the state exists: at 16px
 * on white it was a speck, and the block had no anchor for the eye to land on
 * before the words.
 */
export const EmptyState = ({ title, description, action, icon }: EmptyStateProps) => (
  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
    <span
      className="grid h-12 w-12 place-items-center rounded-full bg-raised text-fg-subtle"
      aria-hidden="true"
    >
      {icon ?? <Search size={20} strokeWidth={1.5} />}
    </span>
    <h3 className="m-0 text-title-secondary text-fg">{title}</h3>
    {description ? (
      <p className="m-0 max-w-[420px] text-supporting text-fg-muted">{description}</p>
    ) : null}
    {action ? <div className="mt-1">{action}</div> : null}
  </div>
);

export default EmptyState;
