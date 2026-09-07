import type { ReactNode } from 'react';
import { Card, EmptyState, Skeleton } from '@/components/ui';

/**
 * The frame every chart sits in: title, one line of context, and the four states
 * a chart can be in.
 *
 * The states are the point. A chart with no data, a chart still loading and a
 * chart that failed all render as an empty rectangle unless something says
 * otherwise — and the last two are the ones a reader must not mistake for "there
 * is nothing here".
 */

export interface ChartCardProps {
  title: string;
  /** What the chart shows, in one line. Say the units and the window. */
  description?: string;
  /** Controls for this chart alone — a grain switch, a legend toggle. */
  actions?: ReactNode;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** True when the query succeeded and genuinely returned nothing. */
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
}

export const ChartCard = ({
  title,
  description,
  actions,
  loading = false,
  error = false,
  onRetry,
  empty = false,
  emptyMessage = 'Nothing to chart for this period.',
  children,
}: ChartCardProps) => (
  <Card className="h-full">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="m-0 text-title-secondary text-fg">{title}</h3>
        {description ? <p className="m-0 text-12 text-fg-muted">{description}</p> : null}
      </div>
      {actions}
    </div>

    <div className="mt-3 min-w-0 flex-1">
      {loading ? (
        <Skeleton variant="list" rows={5} />
      ) : error ? (
        <EmptyState
          title="Could not load this chart"
          description="The figures behind it did not come back. Nothing is wrong with the data."
          action={
            onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="cursor-pointer border-0 bg-transparent p-0 text-supporting text-fg-muted underline"
              >
                Try again
              </button>
            ) : undefined
          }
        />
      ) : empty ? (
        <EmptyState title="Nothing to show yet" description={emptyMessage} />
      ) : (
        children
      )}
    </div>
  </Card>
);

export default ChartCard;
