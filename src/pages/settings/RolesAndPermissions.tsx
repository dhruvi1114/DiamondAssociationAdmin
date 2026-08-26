import { Card, EmptyState, PageHeader, Tabs } from '@/components/ui';

/**
 * A-13 / A-14 — who may do what, and who holds it.
 *
 * Two screens, one page. Roles define the permission sets; staff accounts are
 * the people those sets are assigned to. They were separate nav items, which
 * made assigning a role a navigation problem: you edit a role, then leave to
 * find the person, then come back to check what you gave them. Tabs put both
 * halves of that job on one screen, and make the relationship between them
 * visible — a role is only ever interesting because somebody holds it.
 *
 * Roles lead. A staff account cannot be given a role that does not exist yet, so
 * the order is the order of the work.
 *
 * Neither half is built — both are M10 — so each tab carries its own stub rather
 * than one stub for the page. That keeps the split reviewable now and means each
 * tab can be implemented on its own later.
 */

const Stub = ({ children }: { children: string }) => (
  <Card flush className="min-h-0 flex-1">
    <EmptyState title="Arrives in M10" description={children} />
  </Card>
);

export const RolesAndPermissions = () => (
  <div className="flex h-full min-h-0 flex-col">
    <PageHeader title="Roles & Permissions" />

    <Tabs
      variant="pill"
      items={[
        {
          key: 'roles',
          label: 'Roles',
          children: (
            <Stub>
              Named permission sets — what a Reviewer or an Accountant may do. Scheduled for M10;
              the permission checks the app already enforces are the same ones this screen will
              edit.
            </Stub>
          ),
        },
        {
          key: 'staff',
          label: 'Staff',
          children: (
            <Stub>
              The people who sign in to this admin, and the role each one holds. Scheduled for M10.
              Until then a super admin issues accounts directly.
            </Stub>
          ),
        },
      ]}
    />
  </div>
);

export default RolesAndPermissions;
