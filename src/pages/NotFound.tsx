import { Link } from 'react-router-dom';
import { CompassOutlined } from '@ant-design/icons';
import { Button } from '@/components/ui';

/** 404. */
export const NotFound = () => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
    <span className="text-30 text-fg-subtle" aria-hidden="true">
      <CompassOutlined />
    </span>
    <h1 className="m-0 text-18 font-semibold text-fg">This page does not exist</h1>
    <p className="m-0 max-w-[460px] text-14 text-fg-muted">
      The link may be out of date, or the record may have been removed.
    </p>
    <Link to="/">
      <Button variant="primary">Back to work queue</Button>
    </Link>
  </div>
);

export default NotFound;
