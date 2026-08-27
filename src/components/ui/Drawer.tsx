import { Drawer as AntDrawer, type DrawerProps as AntDrawerProps } from 'antd';
import type { ReactNode } from 'react';
import { DRAWER_HEADER_STYLE } from './drawerChrome';

export interface DrawerProps extends Omit<AntDrawerProps, 'footer'> {
  footer?: ReactNode;
}

/**
 * Detail without navigation — the admin quick view (design-system.md §2).
 *
 * Wider than AntD's 378px default because the things inspected here are member
 * records and invoices, not single fields.
 */
export const Drawer = ({ width = 560, footer, children, styles, ...rest }: DrawerProps) => (
  <AntDrawer
    width={width}
    destroyOnHidden
    // Same bar as the app header and as FormDrawer; a caller can still override.
    styles={{ header: DRAWER_HEADER_STYLE, ...styles }}
    {...rest}
  >
    <div className="flex h-full flex-col">
      {/*
        `min-h-0` as well as `flex-1`: a flex child defaults to min-height:auto,
        which means it refuses to shrink below its content. A table inside then
        pushes the drawer's own scroll instead of scrolling its body, and its
        footer walks off the bottom.
      */}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {footer ? (
        <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">{footer}</div>
      ) : null}
    </div>
  </AntDrawer>
);

export default Drawer;
