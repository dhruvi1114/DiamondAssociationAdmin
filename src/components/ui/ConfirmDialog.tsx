import type { ReactNode } from 'react';
import Dialog from './Dialog';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in one sentence. Not a restatement of the title. */
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * "Are you sure" for an action that cannot be undone.
 *
 * Wraps `Dialog` with the defaults a destructive confirmation always wants —
 * danger styling, a Delete/Cancel pair — so that no screen has to decide them
 * again and none of them can disagree.
 *
 * It replaces the browser's `confirm()`, which cannot be styled, cannot say
 * WHICH record it is about, blocks the whole tab, and looks like a phishing
 * prompt in a tool people use all day.
 */
export const ConfirmDialog = ({
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  ...rest
}: ConfirmDialogProps) => (
  <Dialog {...rest} confirmLabel={confirmLabel} cancelLabel={cancelLabel} danger={danger} />
);

export default ConfirmDialog;
