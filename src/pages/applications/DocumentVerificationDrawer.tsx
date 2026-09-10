import { useState, type Key } from 'react';
import { Check, Download, Eye, X } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  DateCell,
  Dialog,
  Drawer,
  RowActions,
  StatusChip,
  Textarea,
  TextCell,
  toast,
} from '@/components/ui';
import { DRAWER_BODY_STYLE } from '@/components/ui/drawerChrome';
import { usePermissions } from '@/hooks/usePermissions';
import ApplicationsService, {
  isTerminal,
  DOCUMENT_SIDE_LABELS,
  type ApplicationDetail,
  type ApplicationDocument,
} from '@/services/applicationsService';
import { asDisplayError, type DisplayError } from '@/utils/apiError';
import { formatBytes, formatDateTime } from '@/utils/format';
import DocumentPreviewDialog from '@/components/DocumentPreviewDialog';

/**
 * A-04 — the whole document review, in one drawer.
 *
 * This used to be a card in the review page's right column, squeezed between the
 * decision bar and the activity list at whatever width was left over. Verifying
 * documents is not a sidebar activity: it is the single most consequential thing
 * a reviewer does on this screen, it is the thing Approve is blocked on, and it
 * needs room for a file name, a status, a reason and a set of actions on the
 * same line. So it moved into a surface of its own — the page keeps a count and
 * a way in, and the reviewer works here.
 *
 * Everything the old panel enforced still holds, because the rules were never
 * about layout:
 *
 * - ✓ and ✗ are **marks, not messages** (spec D-6). Nothing done here reaches
 *   the applicant. The marks accumulate; the single Reject in the decision bar
 *   is what sends the whole judgement — the note, the itemised reasons, the
 *   link — in one email.
 * - A rejection reason is **mandatory**, and reaches the applicant verbatim,
 *   because it is what the reject email itemises.
 * - A decided application is history. Its files keep their marks — that is the
 *   record of what the committee saw — but nothing can be re-marked. Opening a
 *   file is not marking it, so that survives the decision.
 *
 * ## Why a table and not a stack of cards
 *
 * The list was a hand-built `<ol>` of expandable cards, each one laying its own
 * name, badges, date and status out with flexbox. Four columns of the same four
 * facts, aligned by nothing but the fact that every card used the same markup —
 * so a long file name pushed that row's date somewhere the row above did not
 * have it, and the reviewer's eye had to re-find every field on every row. A
 * table is what the data always was: same fields, one per column, scanned down
 * rather than read across. `DataTable` also brings the app's own borders, zebra
 * banding and empty state, none of which the cards had.
 *
 * **Every fact is a column; nothing hides.** There was briefly an expand row
 * carrying the per-file detail, dropped at the client's request (2026-09-09).
 * What it held is now placed where it can be read without a click: the remarks
 * are their own column — a rejection reason nobody can see until they expand
 * something is a reason nobody checks before the email goes out — required is
 * its own column, the attribution rides the status chip's tooltip, and the note
 * is written in a dialog. The storage filename, size and type live in the
 * preview the eye opens, beside the file they describe.
 *
 * Wider than the 560px drawer default, and wider than the 640 the cards needed:
 * six columns, the actions that used to sit inside a card now holding a
 * permanent column of their own, and Notes given room to show a reason rather
 * than an ellipsis.
 */

const DRAWER_WIDTH = 880;

type Decision = 'VERIFIED' | 'REJECTED';

/**
 * Why a decided or already-marked file cannot be marked again.
 *
 * One function so the ✓ and the ✗ can never explain the same block differently,
 * and `undefined` when the control is live — `RowActions` shows the label as the
 * tooltip then, so the two never both fire.
 */
const blockedReason = (
  document: ApplicationDocument,
  decision: Decision,
  closed: boolean,
): string | undefined => {
  if (closed) {
    return 'This application has been decided. Its marks are the record of what the committee saw.';
  }

  if (document.verification_status === decision) {
    return decision === 'VERIFIED' ? 'Already marked verified.' : 'Already marked rejected.';
  }

  return undefined;
};

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
 * Required or optional, straight from the master.
 *
 * `application.repository.ts` selects `is_required` on the embedded
 * `document_type` and the controller's `serialise` passes the object through
 * whole, so the flag does reach this screen. It is typed optional because a
 * cached or older payload may not carry it.
 *
 * **When it is absent, the document counts as required.** That is the safe
 * direction to be wrong in: an optional file shown as required costs a reviewer
 * one extra glance, while a required file shown as optional invites them to
 * skip evidence the approval is gated on.
 */
const isRequired = (document: ApplicationDocument): boolean =>
  document.document_type.is_required !== false;

export interface DocumentVerificationDrawerProps {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  documents: ApplicationDetail['documents'];
  status: ApplicationDetail['status'];
  /** Refreshes the application so the tiles and the decision bar stay honest. */
  onChanged: () => Promise<void>;
}

export const DocumentVerificationDrawer = ({
  open,
  onClose,
  applicationId,
  documents,
  status,
  onChanged,
}: DocumentVerificationDrawerProps) => {
  const { can } = usePermissions();
  const canVerify = can('document.verify');
  const closed = isTerminal(status);

  /**
   * The document the eye opened. The one control on the row a decided
   * application does not disable — the record of what the committee saw outlives
   * the decision, and reading it back is how an appeal or an audit is answered.
   */
  const [preview, setPreview] = useState<ApplicationDocument | null>(null);

  /**
   * The note dialog's target — one document (the row's own ✓/✗) or several (the
   * selection bar's Approve/Reject selected). Same dialog either way: a
   * rejection reason is asked for the same way regardless of how many documents
   * it applies to, so there is exactly one reason-collection pattern in this
   * file rather than a second one for the bulk case.
   */
  type NoteTarget =
    | { scope: 'single'; document: ApplicationDocument; decision: Decision }
    | { scope: 'bulk'; documents: ApplicationDocument[]; decision: Decision };

  const [target, setTarget] = useState<NoteTarget | null>(null);
  const [remarks, setRemarks] = useState('');
  const [remarksError, setRemarksError] = useState<string | undefined>();
  const [error, setError] = useState<DisplayError | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  /**
   * Documents the reviewer has ticked for a bulk decision. Only ever holds
   * undecided documents — the checkbox is disabled on anything else — so a
   * bulk action can never reach a document someone already ruled on.
   */
  const [selectedIds, setSelectedIds] = useState<Key[]>([]);

  /**
   * Sequential, not `Promise.all`. Each download hands the browser a file, and
   * firing eight of those at once is how a browser decides the tab is spamming
   * downloads and silently drops the rest.
   */
  const downloadAll = async () => {
    setDownloading(true);

    try {
      for (const document of documents) {
        await ApplicationsService.downloadDocument(
          applicationId,
          document.id,
          document.original_name,
        );
      }
    } catch (caught) {
      toast.error(asDisplayError(caught).message);
    } finally {
      setDownloading(false);
    }
  };

  /** Arms the note dialog for one document. Nothing is written until it confirms. */
  const ask = (document: ApplicationDocument, decision: Decision) => {
    setTarget({ scope: 'single', document, decision });
    setRemarks('');
    setRemarksError(undefined);
    setError(null);
  };

  /**
   * Arms the note dialog for the current selection.
   *
   * Reads `documents` — the live prop, not anything cached off the checkboxes —
   * and drops anything no longer undecided, the same guard `submit` repeats
   * immediately before it fires. Two checks rather than one because a refetch
   * can land in the gap between ticking rows and pressing this button, and
   * again in the gap between this and confirming the dialog.
   */
  const askBulk = (decision: Decision) => {
    const chosen = documents.filter(
      (document) => selectedIds.includes(document.id) && document.verification_status === 'PENDING',
    );

    if (chosen.length === 0) return;

    setTarget({ scope: 'bulk', documents: chosen, decision });
    setRemarks('');
    setRemarksError(undefined);
    setError(null);
  };

  const submit = async () => {
    if (!target) return;

    const trimmed = remarks.trim();

    if (target.decision === 'REJECTED' && trimmed.length === 0) {
      setRemarksError('Required');

      return;
    }

    setSaving(true);
    setError(null);

    if (target.scope === 'single') {
      try {
        await ApplicationsService.verifyDocument(applicationId, target.document.id, {
          status: target.decision,
          ...(trimmed ? { remarks: trimmed } : {}),
        });

        toast.success(
          target.decision === 'VERIFIED'
            ? `${documentLabel(target.document)} marked verified.`
            : `${documentLabel(target.document)} marked rejected. It goes to the applicant when you press Reject.`,
        );

        setTarget(null);
        await onChanged();
      } catch (caught) {
        setError(asDisplayError(caught));
      } finally {
        setSaving(false);
      }

      return;
    }

    /*
      Bulk. There is no bulk endpoint — each document is its own PATCH, fired
      independently, so each keeps its own audit row. `verifyDocument` is
      called once per document rather than once for the batch: a single audit
      entry covering five documents would make "who verified this certificate?"
      unanswerable later.

      Re-validated here, immediately before firing, against `documents` — the
      live prop — rather than the list captured when the dialog opened. The
      drawer can refetch while this dialog sits open, and a row no longer
      undecided must be dropped rather than sent blind.
    */
    const currentById = new Map(documents.map((document) => [document.id, document]));
    const eligible = target.documents.filter(
      (document) => currentById.get(document.id)?.verification_status === 'PENDING',
    );

    if (eligible.length === 0) {
      toast.error('Nothing left to decide — those documents have already been marked.');
      setSelectedIds([]);
      setTarget(null);
      setSaving(false);
      await onChanged();

      return;
    }

    const results = await Promise.allSettled(
      eligible.map((document) =>
        ApplicationsService.verifyDocument(applicationId, document.id, {
          status: target.decision,
          ...(trimmed ? { remarks: trimmed } : {}),
        }).then(() => document.id),
      ),
    );

    const failed: ApplicationDocument[] = [];

    results.forEach((result, index) => {
      if (result.status === 'rejected') failed.push(eligible[index]);
    });

    const succeededCount = eligible.length - failed.length;
    const verb = target.decision === 'VERIFIED' ? 'verified' : 'rejected';

    if (failed.length === 0) {
      toast.success(`${succeededCount} document${succeededCount === 1 ? '' : 's'} marked ${verb}.`);
      setSelectedIds([]);
      setTarget(null);
    } else {
      // Per document, not a generic failure — the reviewer needs to know
      // exactly which ones did not go through, and they stay selected so a
      // retry does not have to start the selection over.
      toast.error(
        succeededCount > 0
          ? `${succeededCount} of ${eligible.length} marked ${verb}. Still failing: ${failed.map(documentLabel).join(', ')}.`
          : `Could not mark any of the selected documents ${verb}: ${failed.map(documentLabel).join(', ')}.`,
      );
      setSelectedIds(failed.map((document) => document.id));
      setTarget(null);
    }

    setSaving(false);
    await onChanged();
  };

  /**
   * There is nothing left to POST here.
   *
   * Every mark is written the moment it is made — that is what makes a partly
   * reviewed application survive a closed laptop. So this button is not a save
   * in the form sense; it is the reviewer saying "I am done in here", and its
   * job is to pull the application fresh so the decision bar behind the drawer
   * agrees with the marks just made, then get out of the way.
   */
  const finish = async () => {
    await onChanged();
    onClose();
  };

  /**
   * The note, asked for in a dialog.
   *
   * It used to be written under the row, in an expanded panel, so the file and
   * the note about it were on screen together. The expander is gone at the
   * client's request (2026-09-09) and a mandatory field with validation needs a
   * surface; a dialog is the one left. What the old arrangement was protecting —
   * knowing which of four files you are writing about — is preserved by naming
   * the document in the title.
   *
   * Mandatory on a rejection, optional on a verification. That asymmetry is the
   * rule rather than the layout: a rejection reason is itemised into the
   * applicant's email verbatim, and a verification has nothing to explain.
   *
   * Bulk shares this same dialog rather than growing one of its own — the
   * title and description are the only things that read differently for a
   * batch, and one reason still applies to the whole selection.
   */
  const noteDialog = target ? (
    <Dialog
      open
      title={
        target.scope === 'single'
          ? `${target.decision === 'REJECTED' ? 'Reject' : 'Verify'} ${documentLabel(target.document)}`
          : `${target.decision === 'REJECTED' ? 'Reject' : 'Verify'} ${target.documents.length} documents`
      }
      description={
        target.decision === 'REJECTED'
          ? 'Nothing is sent now — this is a mark. The reason is carried into the Reject email word for word when the decision bar sends them together.'
          : 'Nothing is sent now. This is a mark; the decision bar sends the judgement.'
      }
      confirmLabel={target.decision === 'REJECTED' ? 'Mark rejected' : 'Mark verified'}
      danger={target.decision === 'REJECTED'}
      loading={saving}
      onConfirm={() => void submit()}
      onCancel={() => setTarget(null)}
    >
      <div className="flex flex-col gap-3">
        {error ? <Alert variant="danger" message={error.message} /> : null}

        <Textarea
          autoFocus
          rows={4}
          maxLength={1000}
          value={remarks}
          required={target.decision === 'REJECTED'}
          label={target.decision === 'REJECTED' ? 'Reason for rejection' : 'Note (optional)'}
          hint={
            target.decision === 'REJECTED'
              ? 'Say what is wrong and what to upload instead.'
              : 'Kept on the record. The applicant sees it if you write one.'
          }
          placeholder={
            target.decision === 'REJECTED'
              ? 'The certificate is expired — please upload one valid for the current year.'
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
  ) : null;

  return (
    <>
      <Drawer
        open={open}
        width={DRAWER_WIDTH}
        onClose={onClose}
        /*
          Same chrome as `FormDrawer`, which is the pattern every other drawer in
          this app follows: no close cross, the title at `text-title-primary`,
          and a footer of right-aligned buttons. The cross is dropped for the
          reason FormDrawer drops it — the footer already carries a labelled way
          out, and a cross at the opposite corner reads as "discard" to some
          people and "close, keep my marks" to others. Esc and the mask still
          close it, so nobody is trapped.
        */
        closable={false}
        styles={{ body: DRAWER_BODY_STYLE }}
        title={
          <span className="block min-w-0 truncate text-title-primary text-fg">
            Document verification
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void finish()}>
              Verify &amp; Save
            </Button>
          </>
        }
      >
        {/*
          Full height, and a column that can shrink.

          `DataTable` measures its own scrolling body from the box it is given —
          container height minus the header — so a table dropped into an
          auto-height parent measures nothing, resolves a body of 0px and renders
          its header over an empty void. That is not a data problem and does not
          look like one, which is what makes it worth this comment: the rows were
          there all along.

          `h-full` because AntD's drawer body is already a definite-height flex
          item; `min-h-0` because a flex child will not shrink below its content
          without it, which would hand the table the full list height and put the
          scrollbar on the drawer instead of inside the table.
        */}
        <div className="flex h-full min-h-0 flex-col gap-4">
          {/*
            The instruction and the bulk download share one line. `Download all`
            was in the footer, which now carries only the drawer's own two
            actions — the FormDrawer pattern — and an action on the documents
            belongs with the documents rather than beside Cancel.
          */}
          {/*
            `justify-end` rather than `justify-between`, because the line that
            used to sit opposite this button is commented out below — with one
            child, `justify-between` would park the button on the LEFT.
          */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/*
              The instruction is hidden at the client's request (2026-09-09). The
              drawer's title already says what this is, and the row statuses say
              what is left to do.

              <p className="m-0 text-supporting text-fg-muted">
                Review and validate all required documents.
              </p>
            */}
            <Button
              size="small"
              variant="secondary"
              icon={<Download size={14} strokeWidth={1.5} />}
              loading={downloading}
              disabled={documents.length === 0}
              {...(documents.length === 0
                ? { disabledReason: 'There is nothing to download yet.' }
                : {})}
              onClick={() => void downloadAll()}
            >
              Download all
            </Button>
          </div>

          {/*
            `autoHeight`: the card ends where the data ends. A list page wants a
            table that fills its card, but this one is a block inside a drawer
            that scrolls as a whole, and filling left a bordered box of empty
            space under four rows.
          */}
          <Card flush>
            <DataTable<ApplicationDocument>
              autoHeight
              dataSource={documents}
              emptyTitle="No documents uploaded"
              emptyDescription="An application cannot be submitted without its required documents, so an empty list here means the requirement list is empty."
              /*
                Selection is opt-in on `DataTable`, and gated on `canVerify` here
                for the same reason the row ✓/✗ are hidden without it — a
                reviewer who cannot mark a document one at a time has no
                business marking several.
              */
              {...(canVerify
                ? {
                    selection: {
                      selectedRowKeys: selectedIds,
                      onChange: (keys: Key[]) => setSelectedIds(keys),
                      // Only undecided documents join a batch — a bulk action
                      // must never silently overwrite a decision someone
                      // already made with a reason attached.
                      isSelectable: (document: ApplicationDocument) =>
                        !closed && document.verification_status === 'PENDING',
                      disabledReason: (document: ApplicationDocument) =>
                        closed
                          ? 'This application has been decided.'
                          : document.verification_status !== 'PENDING'
                            ? 'Already decided — a bulk action cannot overwrite it.'
                            : undefined,
                    },
                    selectionBar:
                      selectedIds.length > 0 ? (
                        <>
                          <span className="font-medium text-fg">
                            {selectedIds.length} document{selectedIds.length === 1 ? '' : 's'}{' '}
                            selected
                          </span>
                          <div className="ml-auto flex items-center gap-2">
                            <Button
                              size="small"
                              variant="success"
                              onClick={() => askBulk('VERIFIED')}
                            >
                              Approve selected
                            </Button>
                            <Button
                              size="small"
                              variant="danger"
                              onClick={() => askBulk('REJECTED')}
                            >
                              Reject selected
                            </Button>
                          </div>
                        </>
                      ) : undefined,
                  }
                : {})}
              columns={[
                {
                  title: 'Document',
                  key: 'document',
                  width: 240,
                  render: (_: unknown, document: ApplicationDocument) => (
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <TextCell value={documentLabel(document)} width={190} />
                      {/* A re-upload. Earlier versions are kept so a past decision
                          stays explainable by the file the reviewer actually saw. */}
                      {document.version > 1 ? (
                        <Badge tone="warning">{`v${document.version}`}</Badge>
                      ) : null}
                      {/* Set by a rejection already SENT, so it is a debt the
                          applicant owes rather than a mark waiting to go out. */}
                      {document.requires_reupload ? (
                        <Badge
                          tone="warning"
                          tooltip="The applicant has been asked to replace this file and has not done so yet."
                        >
                          Awaiting re-upload
                        </Badge>
                      ) : null}
                    </div>
                  ),
                },
                {
                  /*
                    Its own column at the client's request (2026-09-09), where it
                    used to be a badge trailing the name. Required and optional
                    then read as a column you can scan down rather than a
                    qualifier you have to find at the end of each name.
                  */
                  title: 'Required',
                  key: 'required',
                  width: 104,
                  render: (_: unknown, document: ApplicationDocument) => (
                    <Badge tone={isRequired(document) ? 'info' : 'neutral'}>
                      {isRequired(document) ? 'Required' : 'Optional'}
                    </Badge>
                  ),
                },
                {
                  /* 132, not 110: "09 Sept 2026" wrapped onto two lines and made
                     every row in the table taller to fit one date. */
                  title: 'Uploaded',
                  key: 'uploaded',
                  width: 132,
                  render: (_: unknown, document: ApplicationDocument) => (
                    <DateCell value={document.createdAt} />
                  ),
                },
                {
                  /*
                    The reviewer's own words, promoted out of the expanded row
                    that no longer exists. It is the text the reject email
                    itemises, so it earns a column: a rejection whose reason is
                    invisible until you open something is a rejection nobody can
                    check before the email goes out.

                    The slack column, and widened at the client's request
                    (2026-09-09): the surrounding columns gave up ~60px between
                    them and `TextCell` now truncates at 300 rather than 180, so
                    a sentence like "the certificate is expired" is readable in
                    the row instead of only on hover. The full text is still on
                    hover, because a reason can be a paragraph.
                  */
                  title: 'Notes',
                  key: 'remarks',
                  render: (_: unknown, document: ApplicationDocument) => (
                    <TextCell value={document.remarks} width={240} />
                  ),
                },
                {
                  /*
                    A chip here, an icon in the page's summary card. The card is a
                    sidebar column where the word cost a third of every row; this
                    is a table with room to print it, and a status is what a
                    reviewer scans this column for.

                    The tooltip carries who marked it and when — `StatusChipProps`
                    documents that as exactly what it is for, and with the
                    expanded row gone this is where the attribution lives.
                  */
                  title: 'Status',
                  key: 'status',
                  width: 128,
                  render: (_: unknown, document: ApplicationDocument) => (
                    <StatusChip
                      domain="document"
                      status={document.verification_status}
                      {...(document.verified_at
                        ? {
                            tooltip: `Marked by ${document.verified_by?.full_name ?? 'a colleague'} · ${formatDateTime(document.verified_at)}`,
                          }
                        : {})}
                    />
                  ),
                },
                {
                  title: 'Actions',
                  key: 'actions',
                  width: 108,
                  fixed: 'right' as const,
                  /*
                    Three visible buttons rather than a menu: the eye is the first
                    thing done to every file and the ✓/✗ are the point of the
                    screen, so putting any of them one click deep would add a
                    click to every row of every review. `RowActions` is what draws
                    them — icon-only at the client's request, and it is what
                    supplies the `aria-label`, the tooltip and the reason a
                    blocked control is blocked, none of which an icon has on its
                    own.

                    ✓ and ✗ are hidden rather than disabled without
                    `document.verify`: a permission the actor does not hold is not
                    a thing to explain on every row, and the eye keeps the cell
                    from reading as a rendering fault. The eye is never disabled —
                    reading a file is not marking it, so it outlives the decision.
                  */
                  render: (_: unknown, document: ApplicationDocument) => (
                    <RowActions
                      actions={[
                        {
                          key: 'preview',
                          icon: <Eye size={16} strokeWidth={1.5} />,
                          label: 'Open this document',
                          onClick: () => setPreview(document),
                        },
                        {
                          key: 'verify',
                          icon: <Check size={16} strokeWidth={1.5} />,
                          label: 'Mark verified',
                          success: true,
                          hidden: !canVerify,
                          disabled: closed || document.verification_status === 'VERIFIED',
                          ...(blockedReason(document, 'VERIFIED', closed)
                            ? { disabledReason: blockedReason(document, 'VERIFIED', closed) }
                            : {}),
                          onClick: () => ask(document, 'VERIFIED'),
                        },
                        {
                          key: 'reject',
                          icon: <X size={16} strokeWidth={1.5} />,
                          label: 'Mark rejected',
                          danger: true,
                          hidden: !canVerify,
                          disabled: closed || document.verification_status === 'REJECTED',
                          ...(blockedReason(document, 'REJECTED', closed)
                            ? { disabledReason: blockedReason(document, 'REJECTED', closed) }
                            : {}),
                          onClick: () => ask(document, 'REJECTED'),
                        },
                      ]}
                    />
                  ),
                },
              ]}
            />
          </Card>

          {/*
            The verification guidelines box is hidden at the client's request.

            <div className="rounded-md border border-border bg-surface-subtle px-3 py-3">
            <p className="m-0 flex items-center gap-2 text-supporting font-medium text-fg">
            <Info
            size={16}
            strokeWidth={1.5}
            className="flex-none text-status-info-fg"
            aria-hidden
            />
            Verification guidelines
            </p>
            <ul className="m-0 mt-2 flex list-disc flex-col gap-1 pl-6 text-12 text-fg-muted">
            <li>Ensure the document is valid and not expired.</li>
            <li>Verify that the business name matches across documents.</li>
            <li>All required documents must be verified to enable approval.</li>
            </ul>
            </div>
          */}
        </div>
      </Drawer>

      {/*
        Outside the drawer, not inside it. The dialog is centred on the viewport
        and 900px wide — wider than the drawer it was opened from — and a modal
        nested in a drawer's own DOM inherits that drawer's stacking context,
        which is how a preview ends up rendered underneath the surface that
        launched it.
      */}
      <DocumentPreviewDialog
        documentId={preview?.id ?? null}
        label={preview ? documentLabel(preview) : ''}
        {...(preview
          ? {
              /* The storage filename and size, which the table no longer prints —
                 they belong beside the file rather than in a column. */
              description: `${preview.original_name} · ${formatBytes(preview.size_bytes)}`,
            }
          : {})}
        load={(documentId) => ApplicationsService.previewDocument(applicationId, documentId)}
        revoke={ApplicationsService.revokeDocumentPreview}
        download={() =>
          preview
            ? ApplicationsService.downloadDocument(applicationId, preview.id, preview.original_name)
            : Promise.resolve()
        }
        onClose={() => setPreview(null)}
      />

      {/* Same reason as the preview: a modal nested inside the drawer's DOM
          inherits its stacking context and renders underneath it. */}
      {noteDialog}
    </>
  );
};

export default DocumentVerificationDrawer;
