import type { ReactNode } from 'react';
import { Skeleton as AntSkeleton } from 'antd';

export type SkeletonVariant = 'list' | 'card' | 'detail' | 'table';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  /** Rows for the `list` and `table` variants. */
  rows?: number;
  loading?: boolean;
  children?: ReactNode;
}

/**
 * Loading placeholders built on AntD's `Skeleton` (design-system.md §2).
 *
 * Never a bare spinner on a blank page: a skeleton that matches the shape of the
 * content it replaces stops the layout jumping when data lands, and tells the
 * user what is coming.
 */
export const Skeleton = ({
  variant = 'list',
  rows = 4,
  loading = true,
  children,
}: SkeletonProps) => {
  if (!loading) {
    return <>{children}</>;
  }

  if (variant === 'card') {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <AntSkeleton active title paragraph={{ rows: 3 }} />
      </div>
    );
  }

  if (variant === 'detail') {
    return (
      <div className="flex flex-col gap-4">
        <AntSkeleton active avatar title paragraph={{ rows: 2 }} />
        <AntSkeleton active title={false} paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-surface-subtle px-4 py-3">
          <AntSkeleton.Input active size="small" style={{ width: 180 }} />
        </div>
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: rows }).map((_, index) => (
            <AntSkeleton.Input key={index} active block size="small" />
          ))}
        </div>
      </div>
    );
  }

  return <AntSkeleton active title={false} paragraph={{ rows }} />;
};

export default Skeleton;
