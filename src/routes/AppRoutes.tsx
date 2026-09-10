import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { NAV_GROUPS } from '@/constant/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import AppShell from '@/layouts/AppShell';
import ApplicationQueue from '@/pages/applications/ApplicationQueue';
import ApplicationReview from '@/pages/applications/ApplicationReview';
import Invoices from '@/pages/billing/Invoices';
import Refunds from '@/pages/billing/Refunds';
import Enquiries from '@/pages/communication/Enquiries';
import Dashboard from '@/pages/Dashboard';
import Categories from '@/pages/masters/Categories';
import CompanyTypes from '@/pages/masters/CompanyTypes';
import EventTypes from '@/pages/masters/EventTypes';
import RegistrationDetail from '@/pages/events/RegistrationDetail';
import DocumentTypes from '@/pages/masters/DocumentTypes';
import Fees from '@/pages/masters/Fees';
import FeeStructures from '@/pages/masters/FeeStructures';
import Locations from '@/pages/masters/Locations';
import Forbidden from '@/pages/Forbidden';
import Login from '@/pages/Login';
import MemberDetail from '@/pages/members/MemberDetail';
import MemberList from '@/pages/members/MemberList';
import NotFound from '@/pages/NotFound';
import Events from '@/pages/events/Events';
import News from '@/pages/news/News';
import NewsCategories from '@/pages/masters/NewsCategories';
import Registrations from '@/pages/events/Registrations';
import PaymentQueue from '@/pages/billing/PaymentQueue';
import AuditLog from '@/pages/audit/AuditLog';
import Reports from '@/pages/reports/Reports';
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
 * `/applications` — the member request queue, plus one redirect it inherited.
 *
 * The queue and the member-company directory shared this URL as two tabs, told
 * apart by `?scope=member-company`. They are two pages now, so that one value
 * forwards to `/members`; every other search string (the queue's own filters,
 * sort and page) belongs to the queue and is left exactly as it is.
 */
const MemberRequestsEntry = () => {
  const { search } = useLocation();

  if (new URLSearchParams(search).get('scope') === 'member-company') {
    return <Navigate to="/members" replace />;
  }

  return <ApplicationQueue />;
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
        {/*
          The redesigned price list (docs/specs/2026-09-07-membership-fee-plans.md).
          It sits beside the old screen rather than replacing it: the two data
          shapes coexist until the backend lands, and a swap that breaks the
          working screen on the way is not a swap anyone can review.
        */}
        <Route
          path="/masters/fee-plans/*"
          element={
            <RequirePermission anyOf={['fee.view']}>
              <FeeStructures />
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

          The directory is its own page again: it spent a release as a tab on
          `/applications`, which put a standing register and a work queue behind
          one nav entry. `?scope=member-company` is what that tab deep-linked
          with, so `MemberRequestsEntry` below still honours it — the links
          are in bookmarks and in anything already written down.
        */}
        <Route
          path="/members"
          element={
            <RequirePermission anyOf={['member.view']}>
              <MemberList />
            </RequirePermission>
          }
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
              <MemberRequestsEntry />
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

        {/* M10 — reports. `report.view` opens the screen; the Export button
            inside it is gated separately on `report.export`. */}
        <Route
          path="/reports"
          element={
            <RequirePermission anyOf={['report.view']}>
              <Reports />
            </RequirePermission>
          }
        />

        {/* M10 — the audit trail. `audit.view`, and read-only: there is no
            detail route because there is nothing to open beyond the drawer. */}
        <Route
          path="/audit"
          element={
            <RequirePermission anyOf={['audit.view']}>
              <AuditLog />
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

        {/* M8 — enquiries from the public contact form. */}
        <Route
          path="/communication/enquiries"
          element={
            <RequirePermission anyOf={['enquiry.view']}>
              <Enquiries />
            </RequirePermission>
          }
        />

        {/*
          M5 — the refund queue. The nav has advertised this path since the
          billing group was written; until now it led nowhere.
        */}
        <Route
          path="/billing/refunds"
          element={
            <RequirePermission anyOf={['refund.manage']}>
              <Refunds />
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
        {/* M9 — the news category master, beside the other catalogue masters. */}
        <Route
          path="/masters/news-categories"
          element={
            <RequirePermission anyOf={['news.view']}>
              <NewsCategories />
            </RequirePermission>
          }
        />
        {/* M9 — news, the association's own writing on the public website. */}
        <Route
          path="/news/*"
          element={
            <RequirePermission anyOf={['news.view']}>
              <News />
            </RequirePermission>
          }
        />

        {/*
          The detail route is declared BEFORE the wildcard queue route, or
          `/registrations/*` swallows `/registrations/12` and renders the list
          again — whichever is declared first wins.
        */}
        <Route
          path="/registrations/:id"
          element={
            <RequirePermission anyOf={['event.view']}>
              <RegistrationDetail />
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
                  '/masters/fee-plans',
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
                  '/billing/refunds',
                  '/communication/enquiries',
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
