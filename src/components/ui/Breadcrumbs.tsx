import { Breadcrumb } from 'antd';
import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  /** Omit for the current page — the last crumb is never a link. */
  to?: string;
}

export interface BreadcrumbsProps {
  items: Crumb[];
}

/** Admin-only wayfinding, derived from the route hierarchy. */
export const Breadcrumbs = ({ items }: BreadcrumbsProps) => (
  <Breadcrumb
    className="text-14"
    items={items.map((crumb) => ({
      title: crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : crumb.label,
    }))}
  />
);

export default Breadcrumbs;
