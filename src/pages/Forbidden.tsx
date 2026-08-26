import { Link } from 'react-router-dom';
import { LockOutlined } from '@ant-design/icons';
import { Button } from '@/components/ui';

/**
 * 403. Says which permission is missing and who can grant it — "Access denied"
 * alone leaves the user with no next step, which is the one thing every screen
 * in this product must provide (ux-principles.md).
 */
export const Forbidden = () => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
    <span className="text-30 text-fg-subtle" aria-hidden="true">
      <LockOutlined />
    </span>
    <h1 className="m-0 text-18 font-semibold text-fg">You do not have access to this screen</h1>
    <p className="m-0 max-w-[460px] text-14 text-fg-muted">
      Your role does not include the permission this page requires. A super admin can grant it under
      Configure &rarr; Roles &amp; permissions.
    </p>
    <Link to="/">
      <Button variant="primary">Back to work queue</Button>
    </Link>
  </div>
);

export default Forbidden;
