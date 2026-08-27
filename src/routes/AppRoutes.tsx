import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { NAV_GROUPS } from '@/constant/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import AppShell from '@/layouts/AppShell';
import ApplicationQueue from '@/pages/applications/ApplicationQueue';
import ApplicationReview from '@/pages/applications/ApplicationReview';
import Invoices from '@/pages/billing/Invoices';
import Dashboard from '@/pages/Dashboard';
import Categories from '@/pages/masters/Categories';
import CompanyTypes from '@/pages/masters/CompanyTypes';
import EventTypes from '@/pages/masters/EventTypes';
import DocumentTypes from '@/pages/masters/DocumentTypes';
import Fees from '@/pages/masters/Fees';
import Locations from '@/pages/masters/Locations';
import Forbidden from '@/pages/Forbidden';
import Login from '@/pages/Login';
import MemberDetail from '@/pages/members/MemberDetail';
import NotFound from '@/pages/NotFound';
import Events from '@/pages/events/Events';
import Registrations from '@/pages/events/Registrations';
import PaymentQueue from '@/pages/billing/PaymentQueue';
import Placeholder from '@/pages/Placeholder';
import SystemSettings from '@/pages/settings/SystemSettings';
import ServerError from '@/pages/ServerError';
import RolesAndPermissions from '@/pages/settings/RolesAndPermissions';
import Workflow from '@/pages/settings/Workflow';
import { Skeleton } from '@/components/ui';
import { authService } from '@/services/authService';
import { useAppDispatch, useAppSelector } from '@/store';
import { profileLoaded, signedOut } from '@/store/authSlice';

/**
 * Route protection.
 *
 * UX only, exactly like `PermissionGate`: it decides what to *render*, never
 * what is *allowed*. Every backend route enforces its own permission and
 * re-reads it from the database on each request (rbac.md §7), so editing
 * localStorage to bypass this guard buys a screen full of 403s, not data.
 *
 * Enforcement is on from M1 — the M0 `AUTH_ENFORCED = false` escape hatch is
 * gone now that sign-in exists.
 */

/**
 * Re-reads the profile from `/auth/admin/me` once per app load.
 *
 * The persisted profile in localStorage is a cache for first paint, nothing
 * more. If a role was revoked while the tab was closed, the persisted copy would
 * still show the old nav; this call replaces it before any screen renders. A 401
 * here means the session is genuinely over and the interceptor has already
 * cleared it.
 */
const useSessionBootstrap = (): { ready: boolean } => {
  const dispatch = useAppDispatch();
  const accessToken = useAppSelector((state) => state.auth.accessToken);
  const [ready, setReady] = useState(!accessToken);

  useEffect(() => {
    if (!accessToken) {
      setReady(true);
      return;
    }

    let cancelled = false;

    authService
      .me()
      .then((profile) => {
        if (!cancelled) {
          dispatch(profileLoaded(profile));
        }
      })
      .catch(() => {
        if (!cancelled) {
          dispatch(signedOut());
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
    // Deliberately once per mount: re-running on every token change would fire
    // again after each silent refresh, for no new information.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ready };
};

const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = usePermissions();
  const location = useLocation();

  if (!isAuthenticated) {
    // `from` preserves the deep link, so signing in returns the user to the page
    // they asked for instead of dumping them on the landing screen.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
};

const RequirePermission = ({ anyOf, children }: { anyOf: string[]; children: ReactNode }) => {
  const { canAny } = usePermissions();

  if (!canAny(...anyOf)) {
    return <Forbidden />;
  }

  return <>{children}</>;
};

/**
 * Every nav destination has a route so the shell is genuinely navigable and the
 * permission wiring is reviewable. Each later cycle swaps its `Placeholder` for
 * the real screen without touching this file's shape.
 */
export const AppRoutes = () => {
  const { ready } = useSessionBootstrap();

  if (!ready) {
    // Rendering the routes before the profile resolves would flash the wrong
    // nav — or bounce a signed-in user to /login for a frame.
    return (
      <div className="mx-auto w-full max-w-content p-6">
        <Skeleton variant="list" rows={6} />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/403" element={<Forbidden />} />
      <Route path="/500" element={<ServerError />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />

        {/*
          M2 — the first cycle to replace placeholders with real screens. Declared
          before the generated placeholder routes so these paths win the match.
        */}
        <Route
          path="/masters/categories/*"
          element={
            <RequirePermission anyOf={['category.view']}>
              <Categories />
            </RequirePermission>
          }
        />
        <Route
          path="/masters/fees/*"
          element={
            <RequirePermission anyOf={['fee.view']}>
              <Fees />
            </RequirePermission>
          }
        />
        <Route
          path="/masters/document-types/*"
          element={
            <RequirePermission anyOf={['category.view']}>
              <DocumentTypes />
            </RequirePermission>
          }
        />
        <Route
          path="/masters/company-types/*"
          element={
            <RequirePermission anyOf={['category.view']}>
              <CompanyTypes />
            </RequirePermission>
          }
        />
        <Route
          path="/masters/event-types/*"
          element={
            <RequirePermission anyOf={['category.view']}>
              <EventTypes />
            </RequirePermission>
          }
        />
        <Route
          path="/masters/locations/*"
          element={
            <RequirePermission anyOf={['category.view']}>
              <Locations />
            </RequirePermission>
          }
        />

        {/*
          M3. `/members/change-requests` is a static segment and outranks
          `/members/:id` in React Router's own scoring, so the placeholder for it
          still wins its own URL — but only while this route stays dynamic.

          The list itself moved to the Applications page's Member Company tab.
          The old path stays as a redirect rather than a 404 — same reason
          `/settings/admin-users` redirects below: it is in bookmarks, in links
          elsewhere in the app, and in anything already written down.
        */}
        <Route
          path="/members"
          element={<Navigate to="/applications?scope=member-company" replace />}
        />
        <Route
          path="/members/:id"
          element={
            <RequirePermission anyOf={['member.view']}>
              <MemberDetail />
            </RequirePermission>
          }
        />

        {/*
          M4. `application.view` guards both screens; what a reviewer may *do* on
          one is a second question, answered per button and again by the server.
          The workflow view is its own permission (`workflow.view`) because it is
          configuration, not work.
        */}
        <Route
          path="/applications"
          element={
            <RequirePermission anyOf={['application.view']}>
              <ApplicationQueue />
            </RequirePermission>
          }
        />
        <Route
          path="/applications/:id"
          element={
            <RequirePermission anyOf={['application.view']}>
              <ApplicationReview />
            </RequirePermission>
          }
        />
        <Route
          path="/settings/roles"
          element={
            <RequirePermission anyOf={['rbac.manage']}>
              <RolesAndPermissions />
            </RequirePermission>
          }
        />
        {/*
          Staff accounts moved into a tab on the page above. The old path stays
          as a redirect rather than a 404: it is in bookmarks, in the audit log's
          links, and in anything already written down.
        */}
        <Route
          path="/settings/admin-users"
          element={<Navigate to="/settings/roles?tab=staff" replace />}
        />
        <Route
          path="/settings/workflow"
          element={
            <RequirePermission anyOf={['workflow.view']}>
              <Workflow />
            </RequirePermission>
          }
        />

        <Route
          path="/settings/system"
          element={
            <RequirePermission anyOf={['settings.manage']}>
              <SystemSettings />
            </RequirePermission>
          }
        />

        <Route
          path="/billing/invoices"
          element={
            <RequirePermission anyOf={['invoice.view']}>
              <Invoices />
            </RequirePermission>
          }
        />

        {/* M7 — events, the bookings queue, and the payment claims queue. */}
        <Route
          path="/events/*"
          element={
            <RequirePermission anyOf={['event.view']}>
              <Events />
            </RequirePermission>
          }
        />
        <Route
          path="/registrations/*"
          element={
            <RequirePermission anyOf={['event.view']}>
              <Registrations />
            </RequirePermission>
          }
        />
        <Route
          path="/billing/payments/*"
          element={
            <RequirePermission anyOf={['payment.view']}>
              <PaymentQueue />
            </RequirePermission>
          }
        />

        {NAV_GROUPS.flatMap((group) =>
          group.items
            .filter(
              (item) =>
                item.path !== '/' &&
                ![
                  '/masters/categories',
                  '/settings/system',
                  '/masters/fees',
                  '/masters/document-types',
                  '/masters/company-types',
                  '/masters/event-types',
                  '/masters/locations',
                  '/members',
                  '/applications',
                  '/settings/roles',
                  '/settings/workflow',
                  '/billing/invoices',
                  '/events',
                  '/registrations',
                  '/billing/payments',
                ].includes(item.path),
            )
            .map((item) => (
              <Route
                key={item.key}
                path={`${item.path}/*`}
                element={
                  <RequirePermission anyOf={item.anyOf}>
                    <Placeholder
                      title={item.label}
                      module={item.module}
                      group={group.label}
                      description={`${item.label} lives here. The screen is delivered in ${item.module}.`}
                    />
                  </RequirePermission>
                }
              />
            )),
        )}

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
