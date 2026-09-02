import { ConfigProvider, Drawer } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import Button from './Button';
import FieldLabel from './FieldLabel';
import { DRAWER_BODY_STYLE, DRAWER_FOOTER_STYLE, DRAWER_HEADER_STYLE } from './drawerChrome';

export interface FormDrawerProps {
  open: boolean;
  title: string;
  /** What this drawer does, when the title alone is not enough. One line. */
  description?: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  /**
   * Blocks the confirm while the form cannot be submitted — a required first
   * choice not yet made, say.
   *
   * `disabledReason` rides with it because `Button` turns one into a tooltip: a
   * dead control that does not say why it is dead is a control the operator has
   * to guess at, and guessing on a submit button reads as the app being broken.
   */
  confirmDisabled?: boolean;
  disabledReason?: string;
  /** 480 suits a single-column form; widen only for genuinely two-column content. */
  width?: number;
}

/**
 * The standard create/edit surface for admin records.
 *
 * A side drawer rather than a modal, deliberately. A modal covers the list the
 * operator is working from, so every "what did that other row say?" costs a
 * cancel and a re-open. A drawer keeps the table visible, holds a taller form
 * without scrolling the page behind it, and gives the actions a fixed footer
 * instead of a primary button lost somewhere in the scroll (components.md).
 *
 * Modals stay for confirmations — a destructive yes/no genuinely should block
 * the screen.
 */
export const FormDrawer = ({
  open,
  title,
  description,
  children,
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
  confirmDisabled = false,
  disabledReason,
  width = 480,
}: FormDrawerProps) => {
  /*
    Cap at the viewport. A fixed 480px drawer on a phone narrower than that
    overflows horizontally and clips the form; clamping keeps Cancel/Save and
    every field on-screen without inventing a second mobile layout.
  */
  const [drawerWidth, setDrawerWidth] = useState(width);

  useEffect(() => {
    const sync = () => setDrawerWidth(Math.min(width, window.innerWidth));

    sync();
    window.addEventListener('resize', sync);

    return () => window.removeEventListener('resize', sync);
  }, [width]);

  return (
    <Drawer
      open={open}
      onClose={onCancel}
      width={drawerWidth}
      // Renamed in AntD 5.25; the old name logs a console error on every mount.
      destroyOnHidden
      maskClosable={!loading}
      /*
        No close cross. The footer already carries Cancel, and two controls that do
        the same thing at opposite corners make the user pick one — the cross also
        reads as "discard" to some and "close, keep my draft" to others, which is
        exactly the ambiguity a labelled button removes. Esc and the mask still
        close it, so nobody is trapped.
      */
      closable={false}
      /*
        The description rides in a hover target beside the title, not as a second
        line under it. Standing prose in a drawer header pushes the first field
        down every time the drawer opens — and the reader has already decided to
        open it, so the sentence explaining what the drawer is for is read once and
        then skipped forever. One glyph keeps it reachable and gives the space back
        to the form.
      */
      title={
        <div className="min-w-0">
          {description ? (
            <FieldLabel
              label={title}
              help={description}
              className="text-title-primary text-fg"
              iconSize={18}
            />
          ) : (
            <span className="truncate text-title-primary text-fg">{title}</span>
          )}
        </div>
      }
      // Secondary left, primary right — the footer is pinned, so a long form never
      // hides its own submit.
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            onClick={() => void onConfirm()}
            loading={loading}
            disabled={confirmDisabled}
            {...(confirmDisabled && disabledReason ? { disabledReason } : {})}
          >
            {confirmLabel}
          </Button>
        </div>
      }
      styles={{
        header: DRAWER_HEADER_STYLE,
        body: DRAWER_BODY_STYLE,
        footer: DRAWER_FOOTER_STYLE,
      }}
    >
      {/*
        Everything inside a form drawer reads at the supporting size. AntD sizes
        labels, help text and controls from the global 13px operator body — right
        in a dense table, too tight in a form the user is composing in.

        Done with a nested `ConfigProvider` rather than CSS. AntD emits its own
        `.css-<hash>.ant-form-item .ant-form-item-label > label` at three classes
        deep, so a scoped stylesheet rule cannot reach it without an escalating
        specificity hack. A nested provider merges over the app theme and re-emits
        the component styles at the new size, which is the supported seam.
      */}
      <ConfigProvider
        theme={{ token: { fontSize: 14 }, components: { Form: { labelFontSize: 14 } } }}
      >
        {children}
      </ConfigProvider>
    </Drawer>
  );
};

export default FormDrawer;
