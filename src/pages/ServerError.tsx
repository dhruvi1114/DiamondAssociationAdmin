import { useRouteError } from 'react-router-dom';
import { ErrorState } from '@/components/ui';

/**
 * 500 / route error boundary.
 *
 * Deliberately shows nothing about the underlying error beyond a retry: the
 * backend already refuses to leak stacks, and the frontend should not reintroduce
 * that by rendering an exception message into the page.
 */
export const ServerError = () => {
  const error = useRouteError();

  if (import.meta.env.DEV) {
    console.error('Route error boundary caught:', error);
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <ErrorState
        title="Something went wrong on our side"
        description="The page could not be displayed. Trying again usually works; if it keeps happening, send us the reference below."
        onRetry={() => window.location.reload()}
        supportEmail="support@example.org"
      />
    </div>
  );
};

export default ServerError;
