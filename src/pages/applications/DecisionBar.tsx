import { useState } from 'react';
import { Tooltip } from 'antd';
import { ArrowRight, Check, History, Lock, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, toast } from '@/components/ui';
import { usePermissions } from '@/hooks/usePermissions';
import ApplicationsService, {
  isActionable,
  scoreDocuments,
  type ApplicationDetail,
  type ApprovalStage,
  type DecisionResult,
} from '@/services/applicationsService';
import { asDisplayError, type DisplayError } from '@/utils/apiError';
import { formatDate, formatMoney } from '@/utils/format';
import DecisionDialog, { type DecisionKind } from './DecisionDialog';

/**
 * A-04 · right column — the Actions card.
 *
 * A stacked column of full-width buttons, not a horizontal bar: this is the
 * top of the right-hand column now (`ApplicationReview.tsx`), read alongside the
 * Documents Summary rather than pinned across the bottom of the whole screen.
 * One button per row, because the three of them are three different weights of
 * answer and a grid drew them as three equal ones.
 *
 * The card always states three things in the reviewer's language: where this
 * application currently is, whether it is theirs to decide, and what each button
 * would do next (`ux-principles.md` §2). Two of those are new since the
 * reject/resubmit spec: Approve is *disabled* while a required document is
 * unverified — a lock on the button, the short instruction under it and the full
 * count on hover (D-7) — and Reject says which of its two meanings
 * it currently carries — send it back, or close it — because the reviewer cannot
 * see the resubmission count anywhere else. After a decision it becomes the
 * receipt for what actually happened — including, on a final approval, the
 * membership number and the invoice the transaction produced — and offers the
 * next application in the queue, because a reviewer working a queue is working a
 * queue, not one record.
 *
 * **Buttons are hidden by permission and never by stage.** Holding
 * `application.approve` says what you may do; the stage's role says whose queue
 * it is. Those are different questions with different answers, and the second is
 * the server's to give: a reviewer who acts on someone else's stage earns a 403
 * that names the stage and the role that owns it, which teaches more than a
 * control that quietly is not there.
 */

export interface DecisionBarProps {
  application: ApplicationDetail;
  /** Configured stages, for the reassign target and the "what happens next" copy. */
  stages: ApprovalStage[];
  /**
   * `application.max_resubmissions`, from the workflow. `0` means unlimited, in
   * which case a rejection never closes an application and the card says so.
   */
  maxResubmissions: number;
  /** Re-reads the application after anything changes it. */
  onDecided: () => Promise<void>;
  /**
   * A conflict — someone decided first, or a document is not verified after all.
   * Both mean the screen is out of date, so the page reloads and says so rather
   * than leaving a stale decision bar the reviewer can press again.
   */
  onConflict: (error: DisplayError) => void;
  /**
   * Opens the activity drawer. The control lives in this card's header rather
   * than in the page's own: "what has already happened here" is a question a
   * reviewer asks while deciding, so it belongs beside the decision rather than
   * in a page header the record's own scroll can carry away.
   */
  onOpenHistory: () => void;
}

/** What just happened, in one sentence, plus where to go next. */
interface Outcome {
  headline: string;
  nextId: string | null;
}

/** The activity-history control, in the Actions card header. */
const HistoryButton = ({ onClick }: { onClick: () => void }) => (
  // The name is on the button for a screen reader and in a tooltip for everyone
  // else — an icon with neither is a control you have to click to identify.
  <Tooltip title="Activity history">
    <Button
      variant="ghost"
      aria-label="Activity history"
      icon={<History size={18} strokeWidth={1.5} />}
      onClick={onClick}
    />
  </Tooltip>
);

export const DecisionBar = ({
  application,
  stages,
  maxResubmissions,
  onDecided,
  onConflict,
  onOpenHistory,
}: DecisionBarProps) => {
  const navigate = useNavigate();
  const { can } = usePermissions();

  const [kind, setKind] = useState<DecisionKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<DisplayError | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const stage = application.current_stage;
  const company = application.company_name;

  const nextStage = stage
    ? stages.find((candidate) => candidate.sequence === stage.sequence + 1)
    : undefined;

  /**
   * The oldest application still waiting in the reviewer's own queue.
   *
   * Deliberately the *default* queue rather than whatever filters the reviewer
   * left on A-03: "next" has to mean the same thing every time, or the button
   * silently skips work.
   */
  const findNext = async (): Promise<string | null> => {
    try {
      const result = await ApplicationsService.list({
        mine: true,
        sortBy: 'submitted_at',
        sortOrder: 'asc',
        limit: 5,
      });

      const candidate = result.data.find(
        (row) => row.id !== application.id && row.stage_id !== null,
      );

      return candidate?.id ?? null;
    } catch {
      // A queue lookup that fails costs the reviewer a shortcut, not their
      // decision — which has already been committed at this point.
      return null;
    }
  };

  const messageFor = (decision: DecisionKind, result: DecisionResult): string => {
    if (decision === 'approve') {
      const activation = result.activation;

      if (activation) {
        // The exact sentence AJ-2 asks for. A reviewer must be able to read the
        // membership number and the invoice number off the screen and quote them
        // on the phone without opening anything else.
        return `Approved. Member ${activation.memberCode} created, invoice ${activation.invoiceNumber} issued for ${formatMoney(activation.totalAmount)}.`;
      }

      return nextStage
        ? `Stage cleared. ${company} moves to ${nextStage.name}, decided by ${nextStage.approver_role.name}.`
        : `Stage cleared. ${company} moves to the next stage.`;
    }

    if (decision === 'reject') {
      // Which of the two rejections happened is the SERVER's answer, read back
      // off the row it wrote. Predicting it here would let the screen say
      // "they can resubmit" about an application the cap had just closed.
      return result.application.status === 'REJECTED'
        ? `Rejected. ${company} has been told why, and this application is now closed — a further attempt would be a fresh application.`
        : `Rejected. ${company} has your note and a link to correct and resubmit. It leaves every queue until they do.`;
    }

    const target = stages.find((candidate) => candidate.id === result.application.current_stage_id);

    return target
      ? `Moved to ${target.name}. ${target.approver_role.name} now owns this application.`
      : 'Moved to another stage.';
  };

  const decide = async (input: {
    remarks: string;
    stageId?: string;
    documents?: { id: string; remarks: string }[];
  }) => {
    if (!kind) return null;

    setSubmitting(true);
    setError(null);

    try {
      const result =
        kind === 'approve'
          ? await ApplicationsService.approve(application.id, input.remarks || undefined)
          : kind === 'reject'
            ? await ApplicationsService.reject(application.id, input.remarks, input.documents)
            : await ApplicationsService.reassign(
                application.id,
                input.stageId as string,
                input.remarks,
              );

      const headline = messageFor(kind, result.data);

      toast.success(headline);
      setKind(null);

      const nextId = await findNext();
      setOutcome({ headline, nextId });
      await onDecided();

      return result.data;
    } catch (caught) {
      const display = asDisplayError(caught);

      // Every failure is shown verbatim where the reviewer is looking — the 403
      // that names the owning stage, the 422 that names the field, the conflict
      // that names the missing fee. The server's own sentence is the authority.
      setError(display);
      toast.error('Could not record the decision', { description: display.message });

      // A conflict may also mean the screen is describing a state that no longer
      // exists: another reviewer got there first. Re-read, and hand the message
      // up. Nothing here decides which kind of conflict it was — the reloaded
      // status does, and if the application closed under us this whole branch
      // (dialog included) unmounts and the bar goes read-only on its own.
      if (display.code === 'CONFLICT' || display.code === 'INVALID_STATE_TRANSITION') {
        onConflict(display);
        await onDecided();
      }

      return null;
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = (id: string) => {
    setOutcome(null);
    navigate(`/applications/${id}`);
  };

  /* --- after a decision: the receipt ---------------------------------------- */

  if (outcome) {
    return (
      <Card dense title="Actions" actions={<HistoryButton onClick={onOpenHistory} />}>
        <div className="flex flex-col gap-3">
          <p className="m-0 text-supporting text-fg">{outcome.headline}</p>
          {outcome.nextId ? (
            <Button
              block
              variant="primary"
              icon={<ArrowRight size={16} strokeWidth={1.5} />}
              iconPosition="end"
              onClick={() => goNext(outcome.nextId as string)}
            >
              Next in queue
            </Button>
          ) : (
            <span className="text-supporting text-fg-muted">
              Nothing else is waiting in your queue.
            </span>
          )}
          {/*
            Hidden at the client's request. The shell header's back arrow already
            returns to the queue, and it cannot be scrolled out of reach the way
            a button inside this card can.

            <Button block variant="ghost" onClick={() => navigate('/applications')}>
              Back to queue
            </Button>
          */}
        </div>
      </Card>
    );
  }

  /* --- closed, or with the applicant: a summary, not controls --------------- */

  if (!isActionable(application.status)) {
    const closedCopy: Record<string, string> = {
      APPROVED: application.member?.member_code
        ? `Approved on ${formatDate(application.decided_at)}. Member ${application.member.member_code} was created and invoiced.`
        : `Approved on ${formatDate(application.decided_at)}.`,
      /*
        Closed, but no longer a dead end (spec D-18).

        The old sentence stopped at "closed", which was true and useless: a
        reviewer who has just been told the third rejection was a mistake reads
        it and reaches for the phone. Naming the route out — and who may take it
        — turns the same card into the answer, without pretending the reviewer
        can take it themselves. The control is the Reopen card below this one,
        which renders only for an admin holding `settings.manage`.
      */
      REJECTED: `Rejected on ${formatDate(application.decided_at)} and closed — there were no corrections left. The reason is on the history tab. If this was closed in error, a super admin can reopen it and email the applicant a fresh link.`,
      WITHDRAWN: `Withdrawn by the applicant on ${formatDate(application.decided_at)}.`,
      RETURNED_FOR_CORRECTION:
        'Rejected and sent back to the applicant. Read-only until they correct it through their link and resubmit, at which point it re-enters the queue at stage 1.',
      DRAFT: 'Still a draft. It belongs to the applicant until they submit it.',
    };

    return (
      <Card dense title="Actions" actions={<HistoryButton onClick={onOpenHistory} />}>
        <div className="flex flex-col gap-3">
          <p className="m-0 text-supporting text-fg-muted">
            {closedCopy[application.status] ?? 'This application is not open for a decision.'}
          </p>
          {application.status === 'APPROVED' && application.member ? (
            <Button block onClick={() => navigate(`/members/${application.member?.id}`)}>
              Open member record
            </Button>
          ) : null}
          {/*
            Hidden at the client's request. The shell header's back arrow already
            returns to the queue, and it cannot be scrolled out of reach the way
            a button inside this card can.

            <Button block variant="ghost" onClick={() => navigate('/applications')}>
              Back to queue
            </Button>
          */}
        </div>
      </Card>
    );
  }

  /* --- open: the decision itself -------------------------------------------- */

  const canApprove = can('application.approve');
  const canReject = can('application.reject');
  const canReassign = can('application.reassign');
  const canDecideAnything = canApprove || canReject;

  /*
   * Where this is, and whose it is — the two facts a reviewer needs before they
   * read a single button label.
   *
   * The stage's NAME is deliberately not repeated here any more: the page header
   * says "Stage 1 of 3 : Document verification" and the stage trail draws it a
   * few hundred pixels to the left, so a third copy in the Actions subtitle was
   * spending the one line this card has on something already answered twice.
   * What is NOT answered anywhere else is who owns the stage, which is why that
   * half survived the trim.
   */
  // Hidden with the card's `description` — kept as source so restoring the
  // subtitle does not mean rewriting the sentence from memory.
  // const where = stage
  //   ? `Stage ${stage.sequence} of ${stages.length || stage.sequence} · Only ${stage.approver_role.name} can take action`
  //   : 'Waiting to be picked up';

  /*
   * The Documents panel's score, read here rather than passed down.
   *
   * Both components derive it from the same `application.documents` with the
   * same function, so there is no second copy of the count to fall out of step —
   * which is what lifting it into state would have created. The server runs the
   * same arithmetic again on approve; this only saves the reviewer the round
   * trip and tells them what to do instead.
   */
  const score = scoreDocuments(application.documents);

  /** Why Approve is unavailable, in the reviewer's terms. Empty when it is available. */
  const approveBlockedBecause = (): string | null => {
    if (score.outstanding === 0) return null;

    const parts = [
      score.rejected > 0
        ? `${score.rejected} document${score.rejected === 1 ? ' is' : 's are'} rejected`
        : null,
      score.pending > 0
        ? `${score.pending} document${score.pending === 1 ? ' is' : 's are'} still waiting on you`
        : null,
      score.missing > 0
        ? `${score.missing} required document${score.missing === 1 ? ' was' : 's were'} never uploaded`
        : null,
    ].filter(Boolean);

    return `${parts.join(' and ')}. Every required document has to be verified before this can be approved.`;
  };

  const approveBlocked = approveBlockedBecause();

  /*
   * What Reject will do, said before it is pressed.
   *
   * `resubmission_count` is corrections already made, so the one being asked for
   * now is the next — and the cap closes the application when there are none
   * left. The same arithmetic runs on the server (`resolveRejection`); this is
   * the reviewer's warning, not the rule.
   */
  const attempt = application.resubmission_count + 1;
  const capped = maxResubmissions > 0;
  const rejectCloses = capped && application.resubmission_count >= maxResubmissions;
  const rejectConsequence = !capped
    ? 'They can correct and resubmit — this association has not set a limit.'
    : rejectCloses
      ? 'This is the final attempt — the application will close permanently.'
      : `Attempt ${attempt} of ${maxResubmissions} — they can correct and resubmit.`;

  return (
    <>
      {/*
        `description={where}` — "Stage 1 of 3 · Only Admin can take action" — is
        hidden at the client's request. The stage trail on the left already draws
        position and owner for every stage, and the server's 403 names the owning
        role if a reviewer acts out of turn, which teaches more than a line that
        sits on screen whether or not it applies to you.
      */}
      <Card dense title="Actions" actions={<HistoryButton onClick={onOpenHistory} />}>
        <div className="flex flex-col gap-2">
          {!canDecideAnything ? (
            <p className="m-0 text-supporting text-fg-subtle">
              Your role can read this application but not decide it.
            </p>
          ) : null}

          {/*
            One button per row, full width, most-to-least consequential down the
            column: Approve, Reject, then the quiet Move to another stage.

            It was a 2-column grid, which paired whichever two buttons this
            reviewer's permissions happened to leave visible and made the pair
            read as alternatives of equal weight — Approve and Reject sitting
            side by side, the same size, the same distance from the pointer. A
            column says what the grid could not: these are three different
            answers of three different weights, and the last of them is not a
            button at all but a text action.
          */}
          {canApprove ? (
            <Button
              block
              variant="success"
              icon={<Check size={16} strokeWidth={1.5} />}
              disabled={approveBlocked !== null}
              {...(approveBlocked ? { disabledReason: approveBlocked } : {})}
              onClick={() => setKind('approve')}
            >
              {/*
                The lock is the only thing on the button that changes when it is
                disabled, and it is there because a greyed-out control on its own
                does not say whether it is greyed out FOR you or BROKEN for
                everybody. The full sentence is one hover away — `disabledReason`
                is what renders it — and the short version sits under the button
                for a reviewer who never hovers anything.
              */}
              <span className="inline-flex items-center gap-2">
                {stage?.is_final ? 'Approve and Activate' : 'Approve Application'}
                {approveBlocked ? <Lock size={14} strokeWidth={1.5} aria-hidden /> : null}
              </span>
            </Button>
          ) : null}

          {/*
            Hidden at the client's request. The lock on the button and the
            verification banner on the left both already say the same thing, and
            the full sentence is still one hover away — `disabledReason` renders
            it, and it names the outstanding count, which this line never did.

            {canApprove && approveBlocked ? (
              <p className="m-0 rounded-md bg-raised px-3 py-2 text-12 text-fg-muted">
                Complete document verification to enable approve.
              </p>
            ) : null}
          */}

          {canReject ? (
            <Button
              block
              variant="danger"
              icon={<X size={16} strokeWidth={1.5} />}
              onClick={() => setKind('reject')}
            >
              Reject Application
            </Button>
          ) : null}

          {/*
            What Reject will actually do, said before it is pressed — "reject"
            means two different things depending on a number the reviewer cannot
            see anywhere else on this screen, so the sentence rides directly under
            the button rather than at the foot of the card.
          */}
          {canReject ? (
            <p
              className={`m-0 text-12 ${rejectCloses ? 'text-status-danger-fg' : 'text-fg-muted'}`}
            >
              {rejectConsequence}
            </p>
          ) : null}

          {canReassign ? (
            <Button
              block
              // Bordered rather than ghost: it is the third action in a stack of
              // three, and a borderless control in a column of bordered ones
              // reads as disabled rather than as quiet.
              variant="secondary"
              icon={<ArrowRight size={16} strokeWidth={1.5} />}
              iconPosition="end"
              onClick={() => setKind('reassign')}
            >
              Move to another stage
            </Button>
          ) : null}
        </div>
      </Card>

      <DecisionDialog
        kind={kind}
        application={application}
        stages={stages}
        maxResubmissions={maxResubmissions}
        error={error}
        submitting={submitting}
        onCancel={() => {
          setKind(null);
          setError(null);
        }}
        onConfirm={decide}
      />
    </>
  );
};

export default DecisionBar;
