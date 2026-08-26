import { WarningFilled } from '@ant-design/icons';
import Button from './Button';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  /**
   * Correlation id from the failed response. Showing it is the difference
   * between "it broke" and a support request that can actually be traced
   * (observability.md §2/§8).
   */
  requestId?: string;
  onRetry?: () => void;
  supportEmail?: string;
}

export const ErrorState = ({
  title = 'Something went wrong',
  description = 'The page could not be loaded. This is usually temporary.',
  requestId,
  onRetry,
  supportEmail,
}: ErrorStateProps) => (
  <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
    <span className="text-24 text-status-danger-fg" aria-hidden="true">
      <WarningFilled />
    </span>
    <h3 className="m-0 text-16 font-semibold text-fg">{title}</h3>
    <p className="m-0 max-w-[440px] text-14 text-fg-muted">{description}</p>

    <div className="mt-1 flex items-center gap-2">
      {onRetry ? (
        <Button variant="primary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
      {supportEmail ? (
        <Button
          variant="ghost"
          href={`mailto:${supportEmail}${requestId ? `?subject=Support request ${requestId}` : ''}`}
        >
          Contact support
        </Button>
      ) : null}
    </div>

    {requestId ? (
      <p className="m-0 mt-2 text-12 text-fg-subtle">
        Reference{' '}
        <code className="rounded-sm bg-surface-subtle px-[6px] py-[2px] font-mono">
          {requestId}
        </code>
      </p>
    ) : null}
  </div>
);

export default ErrorState;
