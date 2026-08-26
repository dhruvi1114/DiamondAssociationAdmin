import { useEffect, useState } from 'react';
import { Alert, Dialog, Textarea, toast } from '@/components/ui';
import MembersService from '@/services/membersService';
import { asDisplayError, type DisplayError } from '@/utils/apiError';

/**
 * A-09 — suspend, reactivate, terminate.
 *
 * A **modal**, not a drawer. Create and edit belong in a drawer so the list
 * behind stays readable; a destructive yes/no is the one case where blocking the
 * screen is the point — the operator should be looking at nothing else
 * (design-system.md §5a).
 *
 * Three rules the backend enforces and this dialog therefore states plainly:
 * the reason is mandatory and reaches the member, terminate is final, and an
 * illegal move (reactivating a terminated member, say) comes back as a 409. The
 * buttons are **not** pre-hidden by status — a greyed control teaches nothing,
 * whereas the server's own sentence names the states involved.
 */

export type StatusAction = 'suspend' | 'reactivate' | 'terminate';

interface Copy {
  title: (name: string) => string;
  /** One sentence: what changes for this member the moment you confirm. */
  consequence: string;
  confirmLabel: string;
  danger: boolean;
  /** Typed confirmation, for the move that cannot be undone. */
  phrase?: string;
  success: (name: string) => string;
}

const COPY: Record<StatusAction, Copy> = {
  suspend: {
    title: (name) => `Suspend ${name}?`,
    consequence:
      'Suspending hides this member from the directory and blocks event registration. They keep portal access and can still see their invoices.',
    confirmLabel: 'Suspend membership',
    danger: false,
    success: (name) => `${name} suspended. The member has been notified with your reason.`,
  },
  reactivate: {
    title: (name) => `Reactivate ${name}?`,
    consequence:
      'Reactivating returns this member to the directory and lets them register for events again.',
    confirmLabel: 'Reactivate membership',
    danger: false,
    success: (name) => `${name} reactivated. The member has been notified with your reason.`,
  },
  terminate: {
    title: (name) => `Terminate ${name}?`,
    consequence:
      'Terminating ends this membership permanently. Terminated is a final state — there is no route back, and returning this company would mean a fresh application.',
    confirmLabel: 'Terminate membership',
    danger: true,
    phrase: 'TERMINATE',
    success: (name) => `${name} terminated. The member has been notified with your reason.`,
  },
};

const CALL: Record<StatusAction, (id: string, reason: string) => Promise<unknown>> = {
  suspend: MembersService.suspend,
  reactivate: MembersService.reactivate,
  terminate: MembersService.terminate,
};

export interface StatusDialogProps {
  action: StatusAction | null;
  member: { id: string; company_name: string };
  onClose: () => void;
  /** Fired after a successful change so the record behind can refresh. */
  onChanged: () => void;
}

export const StatusDialog = ({ action, member, onClose, onChanged }: StatusDialogProps) => {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [error, setError] = useState<DisplayError | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // A reason typed for a suspend must not survive into a terminate.
    setReason('');
    setReasonError(undefined);
    setError(null);
  }, [action]);

  if (!action) return null;

  const copy = COPY[action];

  const confirm = async () => {
    if (reason.trim().length === 0) {
      setReasonError('Required');

      return;
    }

    setSaving(true);
    setError(null);

    try {
      await CALL[action](member.id, reason.trim());
      toast.success(copy.success(member.company_name));
      onChanged();
      onClose();
    } catch (caught) {
      // A 409 here is the transition guard. Its message names the two states,
      // which is exactly what the operator needs, so it is shown verbatim — in
      // the dialog, which stays open, and as the app-wide failure signal.
      const display = asDisplayError(caught);

      setError(display);
      toast.error('Could not update status', { description: display.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      title={copy.title(member.company_name)}
      /*
        The consequence sentence moves to the mark beside the Reason label — the
        client's call, applied to all three actions so they cannot drift apart.

        Terminate is the one worth watching: hiding "there is no route back"
        behind a hover would normally be the wrong trade, and it is only
        acceptable here because that dialog ALSO makes you type TERMINATE. The
        typed phrase, not the sentence, is what stops an accidental one.

        description={copy.consequence}
      */
      confirmLabel={copy.confirmLabel}
      danger={copy.danger}
      loading={saving}
      {...(copy.phrase ? { confirmationPhrase: copy.phrase } : {})}
      onCancel={onClose}
      onConfirm={() => void confirm()}
    >
      <div className="flex flex-col gap-3">
        {error ? <Alert variant="danger" message={error.message} /> : null}

        <Textarea
          required
          autoFocus
          label="Reason"
          rows={3}
          value={reason}
          maxLength={1000}
          {...(reasonError ? { error: reasonError } : {})}
          // hint="Recorded in the member's history and sent to them with the
          // notification." — hidden at the client's request, on all three
          // actions. What the note DOES is now the only thing in the mark
          // beside the label.
          help={copy.consequence}
          placeholder="Membership dues unpaid past the grace period."
          onChange={(event) => {
            setReason(event.target.value);
            if (reasonError) setReasonError(undefined);
          }}
        />
      </div>
    </Dialog>
  );
};

export default StatusDialog;
