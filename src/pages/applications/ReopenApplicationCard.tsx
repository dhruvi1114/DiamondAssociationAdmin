import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Alert, Button, Card, Dialog, Textarea, toast } from '@/components/ui';
import { usePermissions } from '@/hooks/usePermissions';
import ApplicationsService, { type ApplicationDetail } from '@/services/applicationsService';
import { asDisplayError, type DisplayError } from '@/utils/apiError';
import { formatDate } from '@/utils/format';

/**
 * A-04 · right column — the way back from a closed application (spec D-18).
 *
 * A closed application used to be the end of the record. D-5 made that the rule
 * — reaching the cap closes it permanently — and D-13 gave the super admin a
 * counter reset that pointedly did *not* apply to one already closed, which left
 * the association with no answer at all to "the third rejection was our mistake".
 * D-18 is that answer, and this card is where it is taken.
 *
 * Three deliberate choices, all of them about how easy this is to do by accident:
 *
 *  - **Its own card, below Actions, not a button inside it.** The Actions card is
 *    where a reviewer works a queue; this undoes a decision that queue already
 *    made. Somewhere else on the screen is the point.
 *  - **A dialog that lists the consequences by name**, including the two nobody
 *    thinks of: the counter goes back to zero, and an email leaves the building.
 *  - **A mandatory reason**, because the server demands one and because an audit
 *    row saying who reopened an application but not why is half a record.
 *
 * **Hidden by permission, never by role.** `settings.manage` says what this admin
 * may do; the super-admin floor is the server's answer and its 403 names it. That
 * is the same split `DecisionBar` makes between a permission and a stage's owning
 * role, and the reason is the same: a control that quietly is not there teaches
 * nobody, while a refusal that names the rule teaches once and for good.
 */

export interface ReopenApplicationCardProps {
  application: ApplicationDetail;
  /**
   * `application.max_resubmissions`, for the sentence that says what the reset
   * gives back. `0` means the association set no limit — in which case this
   * application was not closed by the cap and the copy says nothing about it.
   */
  maxResubmissions: number;
  /** Re-reads the application; the status, the counter and the link all changed. */
  onReopened: () => Promise<void>;
}

export const ReopenApplicationCard = ({
  application,
  maxResubmissions,
  onReopened,
}: ReopenApplicationCardProps) => {
  const { can } = usePermissions();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<DisplayError | null>(null);

  // Only ever offered on the one status it applies to. A withdrawn or approved
  // application is not "closed too early", it is finished.
  if (application.status !== 'REJECTED' || !can('settings.manage')) return null;

  const company = application.company_name;
  const spent = application.resubmission_count;

  const close = () => {
    setOpen(false);
    setReason('');
    setReasonError(undefined);
    setError(null);
  };

  const confirm = async () => {
    const trimmed = reason.trim();

    if (trimmed.length === 0) {
      setReasonError('Required');

      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await ApplicationsService.reopen(application.id, trimmed);

      toast.success(
        `Reopened. ${company} can correct and resubmit again, and the link has been emailed.`,
      );
      close();
      // The status, the counter and the token all moved together; the detail
      // endpoint is the only place they are consistent.
      await onReopened();
    } catch (caught) {
      const display = asDisplayError(caught);

      // Shown verbatim, inside the dialog the admin is looking at. The 403 that
      // names the super-admin requirement is the most useful sentence this
      // screen can print, and paraphrasing it would lose the rule.
      setError(display);
      toast.error('Could not reopen this application', { description: display.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card title="Reopen">
        <div className="flex flex-col gap-3">
          {/*
            Current state → required action → next step → expected result, in
            three short lines and one button. The first line is the fact that
            makes this card exist: the application is closed and the applicant's
            link is dead, so nothing they do can restart it.
          */}
          <p className="m-0 text-supporting text-fg-muted">
            Closed on {formatDate(application.decided_at)}
            {maxResubmissions > 0 && spent >= maxResubmissions
              ? ` after ${spent} correction${spent === 1 ? '' : 's'}, which is the limit this association allows`
              : ''}
            . The applicant’s link is dead and they cannot restart it themselves.
          </p>

          <Button
            block
            icon={<RotateCcw size={16} strokeWidth={1.5} />}
            onClick={() => setOpen(true)}
          >
            Reopen application
          </Button>

          <p className="m-0 text-12 text-fg-subtle">
            Super admin only. Recorded in the audit trail with your reason.
          </p>
        </div>
      </Card>

      <Dialog
        open={open}
        title={`Reopen ${company}’s application?`}
        description={`${company} will be able to correct and resubmit again. Their attempt count resets to 0 and a new link is emailed to them.`}
        confirmLabel="Reopen and email the link"
        loading={submitting}
        onCancel={close}
        onConfirm={() => void confirm()}
      >
        <div className="flex flex-col gap-3">
          {/*
            The same informed-consent list the final approval uses: what this
            actually does, itemised, rather than a typed phrase. Reopening is
            reversible — the next rejection closes it again — so the friction
            that belongs here is reading, not typing.
          */}
          <div className="rounded-md border border-border bg-raised px-3 py-3">
            <p className="m-0 text-12 font-medium text-fg">Reopening will:</p>
            <ul className="m-0 mt-2 flex list-disc flex-col gap-1 pl-4 text-12 text-fg-muted">
              <li>put the application back with the applicant, awaiting their correction</li>
              <li>
                set the correction count back to 0
                {maxResubmissions > 0
                  ? ` — they get all ${maxResubmissions} attempts again, not the ${Math.max(maxResubmissions - spent, 0)} that were left`
                  : ''}
              </li>
              <li>issue a fresh link and email it to them, replacing the dead one</li>
              <li>record who reopened it, when, and the reason you give below</li>
            </ul>
            <p className="m-0 mt-2 text-12 text-fg-muted">
              It re-enters the queue at stage 1 when they send it back, and the earlier rounds stay
              on the activity timeline.
            </p>
          </div>

          {error ? <Alert variant="danger" message={error.message} /> : null}

          <Textarea
            autoFocus
            rows={4}
            maxLength={500}
            value={reason}
            required
            label="Why this is being reopened"
            hint="Kept in the audit trail, not sent to the applicant. Written for whoever reads this record in a year’s time."
            placeholder="The trade licence was rejected in error — the scan was legible and the number matched."
            {...(reasonError ? { error: reasonError } : {})}
            onChange={(event) => {
              setReason(event.target.value);
              if (reasonError) setReasonError(undefined);
            }}
          />
        </div>
      </Dialog>
    </>
  );
};

export default ReopenApplicationCard;
