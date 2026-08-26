import { Button, Drawer } from '@/components/ui';
import { DRAWER_BODY_STYLE } from '@/components/ui/drawerChrome';
import type { ApplicationDetail } from '@/services/applicationsService';
import ActivityTimeline from './ActivityTimeline';

/**
 * A-04 — the application's history, on demand.
 *
 * History is reference material, not working material. A reviewer opens this
 * when something on the snapshot does not add up — why is this a second round,
 * who returned it, what did they ask for — and then closes it and gets on with
 * the decision. That is a drawer, not a column: it was costing permanent space
 * on the review page to answer an occasional question, and the answer it gave
 * in that space was the abridged one.
 *
 * The drawer holds nothing of its own. `ActivityTimeline` is the whole content,
 * so there is one rendering of the approval history in the app and no chance of
 * the summary and the full list disagreeing about what happened.
 *
 * 640, not the 560 default: the rows carry two status chips, a stage name and a
 * remark, and at 560 the transition pair wrapped away from the event it belongs
 * to.
 */
export interface ActivityDrawerProps {
  open: boolean;
  onClose: () => void;
  application: ApplicationDetail;
}

export const ActivityDrawer = ({ open, onClose, application }: ActivityDrawerProps) => (
  <Drawer
    open={open}
    width={640}
    /*
      Same chrome as `FormDrawer` and the document drawer beside it: no close
      cross, the title at `text-title-primary`, one labelled way out in the
      footer. This drawer only reads, so Close is the whole footer.
    */
    closable={false}
    styles={{ body: DRAWER_BODY_STYLE }}
    title={<span className="block min-w-0 truncate text-title-primary text-fg">Activity</span>}
    onClose={onClose}
    footer={
      <Button variant="secondary" onClick={onClose}>
        Close
      </Button>
    }
  >
    <ActivityTimeline application={application} />
  </Drawer>
);

export default ActivityDrawer;
