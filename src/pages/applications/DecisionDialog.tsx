import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Dialog, FieldLabel, Select, Textarea } from '@/components/ui';
import { usePermissions } from '@/hooks/usePermissions';
import {
  rejectedDocuments,
  DOCUMENT_SIDE_LABELS,
  type ApplicationDetail,
  type ApplicationDocument,
  type ApprovalStage,
  type DecisionResult,
} from '@/services/applicationsService';
import type { DisplayError } from '@/utils/apiError';

/**
 * "Aadhaar Card — Back", or just "PAN Document" when the type is one file.
 *
 * The name comes from the API, which resolves it from the master: an admin who
 * renames a document type expects this screen to say the new name, and a code
 * like `TRADE_LICENCE` was never an instruction anybody could act on.
 */
const documentLabel = (document: ApplicationDocument) =>
  DOCUMENT_SIDE_LABELS[document.side]
    ? `${document.document_type.name} — ${DOCUMENT_SIDE_LABELS[document.side]}`
    : document.document_type.name;

/**
 * The confirmation in front of every reviewer decision (A-04).
 *
 * A **modal**, not a drawer. Create and edit belong in a drawer so the list
 * behind stays readable; a decision that a company can read tomorrow is the one
 * case where blocking the screen is the point (design-system.md §5a).
 *
 * Each variant states its consequence in the reviewer's own terms before they
 * confirm — not a restatement of the button they just pressed. The final
 * approval gets the longest one it will ever get, because it is the transaction
 * that mints a membership number and raises an invoice.
 *
 * Reject has two consequences behind one button (spec D-1): while corrections
 * remain it sends the application back with a login-free link, and at the cap it
 * closes the application for good. The title, the description and the confirm
 * label all change accordingly, because a reviewer who reads "Reject" and gets
 * "closed permanently" has been misled by the interface, not by themselves.
 *
 * The rejection body is assembled, not typed: the ✗ marks from the Documents
 * panel are listed read-only above one mandatory overall note (D-8), and both go
 * to the server as a single decision.
 */

export type DecisionKind = 'approve' | 'reject' | 'reassign';

export interface DecisionDialogProps {
  kind: DecisionKind | null;
  application: ApplicationDetail;
  /** Configured stages, for the reassign target. Empty if the workflow failed to load. */
  stages: ApprovalStage[];
  /** `application.max_resubmissions`. `0` means unlimited. */
  maxResubmissions: number;
  /** Server error from the last attempt, shown verbatim. */
  error: DisplayError | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (input: {
    remarks: string;
    stageId?: string;
    documents?: { id: string; remarks: string }[];
  }) => Promise<DecisionResult | null>;
}

export const DecisionDialog = ({
  kind,
  application,
  stages,
  maxResubmissions,
  error,
  submitting,
  onCancel,
  onConfirm,
}: DecisionDialogProps) => {
  const { can } = usePermissions();

  const [remarks, setRemarks] = useState('');
  const [remarksError, setRemarksError] = useState<string | undefined>();
  const [stageId, setStageId] = useState<string | undefined>();
  const [stageError, setStageError] = useState<string | undefined>();

  useEffect(() => {
    // Remarks typed for one decision must never survive into another.
    setRemarks('');
    setRemarksError(undefined);
    setStageId(undefined);
    setStageError(undefined);
  }, [kind]);

  if (!kind) return null;

  const company = application.company_name;
  const stage = application.current_stage;
  const isFinalStage = stage?.is_final ?? false;

  /*
   * The ✗ marks, gathered from the panel rather than retyped here (spec D-8).
   *
   * The reviewer already wrote a reason against each file. Asking for them again
   * in this dialog would produce two versions of the same sentence and no rule
   * about which one the applicant gets. These are shown read-only, and submitted
   * as the `documents` array so one transaction carries the lot.
   */
  const marks = rejectedDocuments(application.documents);

  /*
   * What this rejection will do, in the same words the Actions card used.
   *
   * `resubmission_count` counts corrections already made, so the one being asked
   * for now is the next; at the cap there is no next and the application closes.
   */
  const attempt = application.resubmission_count + 1;
  const capped = maxResubmissions > 0;
  const rejectCloses = capped && application.resubmission_count >= maxResubmissions;

  /** The stage an approval moves this to, when it is not the last one. */
  const nextStage = stage
    ? stages.find((candidate) => candidate.sequence === stage.sequence + 1)
    : undefined;

  const remarksRequired = kind !== 'approve';

  const confirm = () => {
    const trimmed = remarks.trim();

    if (remarksRequired && trimmed.length === 0) {
      setRemarksError('Required');

      return;
    }

    if (kind === 'reassign' && !stageId) {
      setStageError('Choose the stage this should go to');

      return;
    }

    void onConfirm({
      remarks: trimmed,
      ...(stageId ? { stageId } : {}),
      // Only a rejection carries document marks. Sending them on an approval
      // would flag files for re-upload on an application nobody is correcting.
      ...(kind === 'reject' && marks.length > 0
        ? {
            documents: marks.map((document) => ({
              id: document.id,
              remarks: document.remarks ?? '',
            })),
          }
        : {}),
    });
  };

  const copy: Record<
    DecisionKind,
    {
      title: string;
      /**
       * Optional: the send-back case deliberately has none, because the sentence
       * would only repeat what the Actions card already says. Typed as required,
       * it forced either a cast or copy nobody asked for.
       */
      description?: string;
      confirmLabel: string;
      danger: boolean;
    }
  > = {
    approve: {
      title: isFinalStage ? `Approve and activate ${company}?` : `Clear this stage for ${company}?`,
      /*
        The final-stage line is hidden at the client's request; what it said —
        that this is one all-or-nothing transaction — now sits in the mark beside
        the summary below.

        description: 'This is the final stage. Approving does everything below in one transaction — all of it, or none of it.',
      */
      description: isFinalStage
        ? ''
        : `Approving records that ${stage?.name ?? 'this stage'} is satisfied and moves the application on. It does not create a member yet.`,
      confirmLabel: isFinalStage ? 'Approve and activate' : 'Approve this stage',
      danger: false,
    },
    reject: {
      title: rejectCloses ? `Close ${company}’s application?` : `Reject ${company}?`,
      /*
        The send-back description is hidden at the client's request; the closing
        one stays, because there the sentence IS the consequence — this is the
        last attempt and the application will not reopen. The attempt count is
        still on screen either way, under the Reject button in the Actions card.

        description: capped
          ? `Attempt ${attempt} of ${maxResubmissions}. They get your note and a link to correct and resubmit — no sign-in. It returns at stage 1.`
          : 'They get your note and a link to correct and resubmit — no sign-in. Corrections are unlimited here, so this never closes the application.',
      */
      description: rejectCloses
        ? `Attempt ${attempt} of ${maxResubmissions} — the last one. This closes the application permanently; they would have to start again. They are emailed your reason.`
        : undefined,
      confirmLabel: rejectCloses ? 'Reject and close' : 'Reject and send back',
      danger: true,
    },
    reassign: {
      title: `Move ${company} to another stage?`,
      description:
        'Moves the application into a different queue without deciding it. Use this when it landed with the wrong team, not to skip a check.',
      confirmLabel: 'Move to this stage',
      danger: false,
    },
  };

  const current = copy[kind];

  return (
    <Dialog
      open
      title={current.title}
      description={current.description}
      /*
        Reassign only. Its sentence orients a first-timer — "use this when it
        landed with the wrong team, not to skip a check" — and the dialog's own
        two fields are the content. Approve and reject keep theirs on the page,
        because there the sentence IS the consequence being agreed to.
      */
      describeInTitle={kind === 'reassign'}
      confirmLabel={current.confirmLabel}
      danger={current.danger}
      loading={submitting}
      onCancel={onCancel}
      onConfirm={confirm}
    >
      {/*
        No `mt-4`. `Dialog` now rules off its own header and pads the body, so a
        margin here stacked on top of that and left the first label floating a
        long way under the divider. Spacing between the dialog's chrome and its
        content belongs to the dialog, not to each caller.
      */}
      <div className="flex flex-col gap-3">
        {/*
          Informed consent rather than a typed-phrase speed bump. The activation
          is irreversible, but it is also the routine act of a super admin's day;
          making them type APPROVE forty times a month trains the typing, not the
          reading. Listing what it produces is the friction that actually informs
          (ux-principles.md §4). Reject earns no phrase either — its mandatory
          reason is already a paragraph of deliberate thought.
        */}
        {kind === 'approve' && isFinalStage ? (
          <div className="rounded-md border border-border bg-raised px-3 py-2">
            <FieldLabel
              label="Creates the member, term and invoice — all of it, or none of it"
              help="Issues a membership number, moves the member to awaiting payment, opens a term priced from the live fee structure, raises its invoice, and emails both to the applicant. With no fee configured, nothing happens and the error names what is missing."
              className="text-12 text-fg-muted"
              iconSize={13}
            />
          </div>
        ) : null}

        {kind === 'approve' && !isFinalStage && nextStage ? (
          <div className="rounded-md border border-border bg-raised px-3 py-2 text-12 text-fg-muted">
            Next: <span className="font-medium text-fg">{nextStage.name}</span>, decided by{' '}
            {nextStage.approver_role.name}. The applicant is told it advanced.
          </div>
        ) : null}

        {/*
          The itemised reasons, read-only. This is the body of the email the
          applicant is about to get, shown to the person writing it — a reviewer
          should not have to remember what they marked ten minutes ago in a panel
          that is now behind a modal.
        */}
        {kind === 'reject' ? (
          <div className="rounded-md border border-border bg-raised px-3 py-3">
            {marks.length === 0 ? (
              /*
                The consequence folded into the mark beside the statement: the
                headline is the fact a reviewer needs at a glance, and what
                follows from it is one hover away rather than three more lines
                above the field they came here to fill.
              */
              <FieldLabel
                label="No document is marked rejected"
                help="They will be asked to correct the application rather than re-upload. To flag a file, mark it in Documents first."
                className="text-12 text-fg-muted"
                iconSize={13}
              />
            ) : (
              <>
                <p className="m-0 text-12 font-medium text-fg">
                  {marks.length === 1
                    ? 'They will be asked to replace this document:'
                    : `They will be asked to replace these ${marks.length} documents:`}
                </p>
                <ul className="m-0 mt-2 flex list-disc flex-col gap-1 pl-4 text-12 text-fg-muted">
                  {marks.map((document) => (
                    <li key={document.id}>
                      <span className="font-medium text-fg">{documentLabel(document)}</span>
                      {document.remarks ? ` — ${document.remarks}` : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}

        {error ? (
          <Alert
            variant="danger"
            message={error.message}
            {...(kind === 'approve' && error.code === 'CONFLICT' && can('fee.view')
              ? {
                  // AJ-2's missing-fee recovery. The activation prices the term
                  // before it writes anything, so an unpriced category blocks the
                  // approval and changes nothing — the only useful next step is
                  // the fee table, and making the reviewer find it themselves is
                  // how a two-minute fix becomes a support ticket.
                  description: (
                    <Link to="/masters/fees" className="text-supporting underline">
                      Open fee structures
                    </Link>
                  ),
                }
              : {})}
          />
        ) : null}

        {kind === 'reassign' ? (
          /*
            The catalogue's Select, not a raw AntSelect. It was the one exception
            the UI skill named — "it predates FormSelect; move it when you next
            touch that file" — and it hand-rolled the label, the required mark
            and the error line that this component owns.
          */
          <Select<string>
            id="reassign-stage"
            label="Move to stage"
            required
            value={stageId}
            placeholder="Choose a stage"
            {...(stageError ? { error: stageError } : {})}
            onChange={(value) => {
              setStageId(value);
              setStageError(undefined);
            }}
            options={stages.map((candidate) => ({
              value: candidate.id,
              label: `${candidate.sequence}. ${candidate.name} — ${candidate.approver_role.name}`,
              disabled: candidate.id === stage?.id,
            }))}
          />
        ) : null}

        <Textarea
          autoFocus={kind !== 'reassign'}
          rows={4}
          maxLength={2000}
          value={remarks}
          required={remarksRequired}
          label={
            kind === 'approve'
              ? 'Remarks (optional)'
              : kind === 'reassign'
                ? 'Why it is moving'
                : 'What the applicant must know'
          }
          /*
            `hint` stands under the field; `help` is a mark beside the label.

            The send-back guidance is a rule a reviewer learns once — where the
            note goes and what to put in it — so it moves to the mark. The
            closing one stays visible: "the last thing they hear about this
            application" is the consequence of the button, not a tip.
          */
          hint={
            // 'Kept on the approval history. The applicant does not see it.'
            // — hidden at the client's request; the field is already optional.
            kind === 'reject' && rejectCloses
              ? 'Sent word for word, and it is the last thing they hear about this application. Say why it is closed and what, if anything, they can do.'
              : undefined
          }
          help={
            kind === 'reject' && !rejectCloses
              ? 'Sent to the applicant word for word, above the document reasons. Say what to fix and what a correct version looks like.'
              : undefined
          }
          placeholder={
            kind === 'reject'
              ? marks.length > 0
                ? 'Please re-upload both documents as clear scans of every page.'
                : 'The company is not registered as a lab-grown diamond grower, which this category requires.'
              : undefined
          }
          {...(remarksError ? { error: remarksError } : {})}
          onChange={(event) => {
            setRemarks(event.target.value);
            if (remarksError) setRemarksError(undefined);
          }}
        />
      </div>
    </Dialog>
  );
};

export default DecisionDialog;
