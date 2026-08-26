import { useState } from 'react';
import { ConfigProvider, Modal } from 'antd';
import type { ReactNode } from 'react';
import Button from './Button';
import FieldLabel from './FieldLabel';
import Input from './Input';

export interface DialogProps {
  open: boolean;
  title: string;
  /** What will happen, in one sentence. Not a restatement of the title. */
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  danger?: boolean;
  /**
   * Requires the user to type this exact string before confirming.
   * Mandatory for destructive, irreversible actions — terminate a membership,
   * cancel an invoice (design-system.md §2).
   */
  confirmationPhrase?: string;
  /**
   * Fold `description` into a `?` beside the title instead of printing it above
   * the fields.
   *
   * **Opt-in, and it must stay that way.** On a destructive confirmation the
   * description IS the consequence — "this will no longer appear in active
   * listings" — and help you cannot see is help most people never read. Use it
   * only where the sentence is orientation for a first-timer rather than the
   * thing being agreed to, and where the dialog's own fields are the content.
   */
  describeInTitle?: boolean;
  /** 520 is AntD's default; a dialog with one select and one note wants less. */
  width?: number;
}

export const Dialog = ({
  open,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
  danger = false,
  confirmationPhrase,
  describeInTitle = false,
  width = 460,
}: DialogProps) => {
  const [typed, setTyped] = useState('');
  const confirmBlocked = Boolean(confirmationPhrase) && typed !== confirmationPhrase;

  const close = () => {
    setTyped('');
    onCancel();
  };

  return (
    <Modal
      open={open}
      width={width}
      /*
        Both branches carry the SAME type role.

        Passing the bare string let AntD size the title from its own theme, so a
        dialog with a `?` and one without rendered their titles at different
        sizes — the defect you cannot see until two of them sit side by side.
        The wrapper is the fix: the role is stated here, once, for both.
      */
      title={
        describeInTitle && typeof description === 'string' ? (
          <FieldLabel label={title} help={description} className="text-title-secondary text-fg" />
        ) : (
          <span className="text-title-secondary text-fg">{title}</span>
        )
      }
      onCancel={close}
      /*
        No close cross. The footer carries Cancel, and two ways out at opposite
        corners make the reader choose between them — the same reasoning
        `FormDrawer` documents. Esc and the mask still close it.
      */
      closable={false}
      // Rules under the header and above the footer, and a quieter footer:
      // the dialog reads as three bands — what this is, what you are choosing,
      // what you can do — rather than one undifferentiated sheet.
      styles={{
        /*
          The rules run the full width of the card, not the width of the text.

          AntD pads the modal's content box (20px 24px) and the header/footer sit
          inside that padding, so a plain `border-bottom` stopped 24px short at
          each end and read as an underline under the title rather than as a
          division of the dialog. Pulling the box out by the padding and putting
          it back as padding gives an edge-to-edge rule with the text still
          aligned to everything else.
        */
        header: {
          borderBottom: '1px solid var(--border)',
          margin: '0 -24px',
          padding: '0 24px 12px',
        },
        body: { paddingTop: 12, paddingBottom: 12 },
        footer: {
          borderTop: '1px solid var(--border)',
          margin: '0 -24px',
          padding: '12px 24px 0',
        },
      }}
      /*
        Centred, not AntD's default 100px from the top. A confirmation is the one
        thing on screen at that moment, and pinned to the top it sits over the
        toolbar with the whole page still readable below it — which is how a
        destructive prompt gets dismissed without being read. Centring also keeps
        it in one place regardless of how tall the dialog is.
      */
      centered
      // `destroyOnClose` was deprecated in AntD 5.25 and logs a console error on
      // every mount. Same behaviour, current name: unmount the body when hidden,
      // so a half-typed reason never reappears in the next confirmation.
      destroyOnHidden
      maskClosable={!loading}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={loading}
            disabled={confirmBlocked}
            disabledReason={
              confirmBlocked ? `Type "${confirmationPhrase}" to enable this action.` : undefined
            }
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {/*
        Everything inside a dialog reads at the supporting size, the same nested
        provider `FormDrawer` uses and for the same reason: AntD sizes its own
        controls — a Select's options above all, which render in a portal — from
        the global 13px operator body. Right in a dense table, too tight in a
        dialog somebody is composing in. A nested provider re-emits the component
        styles at the new size, which is the supported seam; a stylesheet rule
        cannot reach AntD's own three-class-deep selectors without a specificity
        fight.
      */}
      <ConfigProvider theme={{ token: { fontSize: 14 } }}>
        {description && !describeInTitle ? (
          <p className="mt-0 text-supporting text-fg-muted">{description}</p>
        ) : null}
        {children}

        {confirmationPhrase ? (
          <div className="mt-4">
            <Input
              label={`Type "${confirmationPhrase}" to confirm`}
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
        ) : null}
      </ConfigProvider>
    </Modal>
  );
};

export default Dialog;
