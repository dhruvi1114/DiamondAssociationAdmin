import {
  ClipboardCheck,
  CalendarDays,
  ChartColumn,
  CircleDollarSign,
  ClipboardList,
  FileCheck2,
  FileText,
  Building2,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  type LucideIcon,
  MapPin,
  Megaphone,
  Network,
  Newspaper,
  RefreshCw,
  Scale,
  ScrollText,
  Send,
  Settings,
  ShieldCheck,
  Tags,
  Undo2,
  UserPen,
  Users,
  Workflow,
} from 'lucide-react';

/**
 * Left-nav structure (information-architecture.md §2).
 *
 * Groups: Work · Money · Engage · Configure · Audit. A group the current role
 * cannot use is hidden entirely rather than shown disabled — a nav full of
 * things you may not click teaches the user to ignore the nav.
 *
 * Icons are Lucide components, not rendered elements: the shell owns size and
 * stroke width so every glyph in the rail is drawn on the same 20px / 1.5px
 * grid. A table that stored `<Icon />` would let each row set its own weight,
 * and a rail of mismatched stroke widths is the thing that makes a sidebar look
 * assembled rather than designed.
 *
 * Every item is stubbed in M0; each later cycle replaces the placeholder page
 * behind its route. The permission codes come from rbac.md §3 and are the same
 * strings the backend guards use.
 */
export interface NavItem {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /** Rendered when the admin holds at least one of these. */
  anyOf: string[];
  /** Cycle that implements the screen — shown on the placeholder page. */
  module: string;
  /**
   * Kept out of the sidebar and the command palette, but still present here so
   * `AppShell`'s path-matching still resolves a header title for routes under
   * it (`/members/:id`, in particular). Use this when a screen's own list page
   * moves under a tab elsewhere but its detail route stays standalone — see
   * `member-company` tab on `ApplicationQueue.tsx`.
   */
  hidden?: boolean;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'work',
    label: 'Work',
    items: [
      {
        key: 'dashboard',
        label: 'Work Queue',
        path: '/',
        icon: LayoutDashboard,
        anyOf: ['dashboard.view'],
        module: 'M10',
      },
      {
        key: 'applications',
        label: 'Applications',
        path: '/applications',
        icon: ClipboardList,
        anyOf: ['application.view'],
        module: 'M4',
      },
      {
        key: 'members',
        /*
          "Member Companies", not "Members". Every row here is a company — the
          list says "companies on record" in its own copy — and "Members" reads
          as people first. The route, the API and the permissions keep the
          association's own word (`member.view`, `/members`); only the label the
          reader sees is more specific.

          `hidden`: the list itself now lives on the Applications page's
          Member Company tab (`/applications?scope=member-company`) — `/members`
          redirects there. This entry stays, hidden from the sidebar, purely so
          `/members/:id` still resolves "Member Companies" as its header title.
        */
        label: 'Member Companies',
        path: '/members',
        icon: Users,
        anyOf: ['member.view'],
        module: 'M3',
        hidden: true,
      },
      {
        key: 'change-requests',
        label: 'Change Requests',
        path: '/members/change-requests',
        icon: UserPen,
        anyOf: ['member.approve_change'],
        module: 'M3',
      },
      {
        key: 'renewals',
        label: 'Renewals',
        path: '/renewals',
        icon: RefreshCw,
        anyOf: ['renewal.view'],
        module: 'M6',
      },
      {
        key: 'org',
        /*
          Filed under Work, not Configure. Office bearers, committees and chapter
          heads are a record of who currently holds what — read and updated as
          the association's terms turn over, like the member and application
          records above it. Configure is for the rules a screen runs by:
          categories, fees, document types.

          "Organisation", not "Designations & Committees" — which truncated in
          the rail at any width worth having. The screen covers all three of
          those things (requirements.md); the old label named two and still did
          not fit.
        */
        label: 'Organisation',
        path: '/masters/committees',
        icon: Network,
        anyOf: ['org.manage'],
        module: 'M10',
      },
    ],
  },
  {
    key: 'money',
    label: 'Money',
    items: [
      {
        key: 'invoices',
        label: 'Invoices',
        path: '/billing/invoices',
        icon: FileText,
        anyOf: ['invoice.view'],
        module: 'M5',
      },
      {
        key: 'payments',
        label: 'Payments',
        path: '/billing/payments',
        icon: CircleDollarSign,
        anyOf: ['payment.view'],
        module: 'M5',
      },
      {
        key: 'reconciliation',
        label: 'Reconciliation',
        path: '/billing/reconciliation',
        icon: Scale,
        anyOf: ['payment.view'],
        module: 'M5',
      },
      {
        key: 'refunds',
        label: 'Refunds',
        path: '/billing/refunds',
        icon: Undo2,
        anyOf: ['refund.manage'],
        module: 'M5',
      },
    ],
  },
  {
    key: 'engage',
    label: 'Engage',
    items: [
      {
        key: 'events',
        label: 'Events',
        path: '/events',
        icon: CalendarDays,
        anyOf: ['event.view'],
        module: 'M7',
      },
      {
        key: 'registrations',
        label: 'Registrations',
        path: '/registrations',
        icon: ClipboardCheck,
        anyOf: ['event.view'],
        module: 'M7',
      },
      {
        /*
          News, not Notices. A notice is pushed to chosen members and tracked per
          recipient; news is a page anyone can read and Google indexes. They sit
          next to each other because both are things the association publishes,
          and are separate because the audience and the lifecycle differ.
        */
        key: 'news',
        label: 'News',
        path: '/news',
        icon: Newspaper,
        anyOf: ['news.view'],
        module: 'M9',
      },
      {
        key: 'notices',
        label: 'Notices',
        path: '/communication/notices',
        icon: Megaphone,
        anyOf: ['notice.view'],
        module: 'M8',
      },
      {
        key: 'templates',
        label: 'Templates',
        path: '/communication/templates',
        icon: LayoutTemplate,
        anyOf: ['template.manage'],
        module: 'M8',
      },
      {
        key: 'outbox',
        label: 'Outbox',
        path: '/communication/outbox',
        icon: Send,
        anyOf: ['notification.view'],
        module: 'M8',
      },
    ],
  },
  {
    key: 'configure',
    label: 'Configure',
    items: [
      {
        key: 'categories',
        label: 'Categories',
        path: '/masters/categories',
        icon: Layers,
        anyOf: ['category.view'],
        module: 'M2',
      },
      {
        key: 'fees',
        label: 'Fee Structures',
        path: '/masters/fees',
        icon: Tags,
        anyOf: ['fee.view'],
        module: 'M2',
      },
      {
        key: 'document-types',
        label: 'Document Types',
        path: '/masters/document-types',
        icon: FileCheck2,
        anyOf: ['category.view'],
        module: 'M2',
      },
      {
        key: 'company-types',
        label: 'Company Types',
        path: '/masters/company-types',
        icon: Building2,
        anyOf: ['category.view'],
        module: 'M5',
      },
      {
        key: 'event-types',
        label: 'Event Types',
        path: '/masters/event-types',
        icon: CalendarDays,
        anyOf: ['category.view'],
        module: 'M7',
      },
      {
        /*
          A master, like Event Types beside it: the filter tabs on the website's
          news page are the association's own vocabulary, and it maintains them
          here rather than on the News screen where the daily work happens.
        */
        key: 'news-categories',
        label: 'News Categories',
        path: '/masters/news-categories',
        icon: Newspaper,
        anyOf: ['news.view'],
        module: 'M9',
      },
      {
        key: 'locations',
        label: 'Locations',
        path: '/masters/locations',
        icon: MapPin,
        anyOf: ['category.view'],
        module: 'M5',
      },
      {
        /*
          Staff accounts used to be a second entry here. It is a tab on this
          screen now — assigning a role and holding a role are two halves of one
          job, and splitting them across two nav items made it a navigation
          problem.
        */
        key: 'roles',
        label: 'Roles & Permissions',
        path: '/settings/roles',
        icon: ShieldCheck,
        anyOf: ['rbac.manage'],
        module: 'M10',
      },
      {
        key: 'workflow',
        label: 'Approval Workflow',
        path: '/settings/workflow',
        icon: Workflow,
        anyOf: ['workflow.view'],
        module: 'M4',
      },
      {
        key: 'system',
        label: 'System Settings',
        path: '/settings/system',
        icon: Settings,
        anyOf: ['settings.manage'],
        module: 'M10',
      },
    ],
  },
  {
    key: 'audit',
    label: 'Audit',
    items: [
      {
        key: 'audit-log',
        label: 'Audit Log',
        path: '/audit',
        icon: ScrollText,
        anyOf: ['audit.view'],
        module: 'M10',
      },
      {
        key: 'reports',
        label: 'Reports',
        path: '/reports',
        icon: ChartColumn,
        anyOf: ['report.view'],
        module: 'M10',
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
