import { useState } from 'react';
import { Check, ChevronDown, Download, FileText, X } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Drawer,
  EmptyState,
  StatusChip,
  Textarea,
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
import { formatBytes, formatDate, formatDateTime } from '@/utils/format';

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
 *   record of what the committee actually saw — but nothing can be re-marked.
 *
 * Wider than the 560px drawer default. A document row carries a name, a
 * required/optional qualifier, an upload date and a status on one line; at 560
 * the status wrapped under the name and the row stopped reading as one fact.
 */

const DRAWER_WIDTH = 640;

type Decision = 'VERIFIED' | 'REJECTED';

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

/*
  One of the four tiles across the top — hidden with them, kept with them.

  interface Tile {
    key: string;
    label: string;
    value: number;
    icon: typeof FileText;
    // Status token class for the mark. Chrome stays greyscale; meaning gets hue.
    tone: string;
  }
*/

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

  /**
   * Rows open independently rather than one-at-a-time. Comparing a rejection
   * reason against the reason written on a neighbouring file is a real move, and
   * an accordion that closes the first row to open the second makes it
   * impossible.
   */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [target, setTarget] = useState<{
    document: ApplicationDocument;
    decision: Decision;
  } | null>(null);
  const [remarks, setRemarks] = useState('');
  const [remarksError, setRemarksError] = useState<string | undefined>();
  const [error, setError] = useState<DisplayError | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  /**
   * The running score, over the latest version of each required type — the same
   * arithmetic the decision bar reads and the same the server enforces. Counting
   * every row instead would let a superseded v1 rejection keep Approve disabled
   * after its replacement had been verified.
   */
  // const score = scoreDocuments(documents);  ← restored with the tiles above.

  /**
   * A decided application is history: its marks are the record of what the
   * committee saw, and re-marking them afterwards would rewrite the basis of a
   * decision already taken.
   */
  const closed = isTerminal(status);

  /*
    Hidden with the KPI tiles and the Required / Optional tabs below. Kept as
    commented source rather than deleted, because restoring either piece of UI
    means restoring exactly this — and re-deriving it from memory is how the two
    would come back subtly different. Restoring also needs the `Tile` interface,
    the `Tabs`, `Info` and `Lock` imports and the `CircleCheck` / `CircleX` /
    `Clock3` icons.

  // const required = documents.filter((document) => isRequired(document));
  // const optional = documents.filter((document) => !isRequired(document));
  //
  // const tiles: Tile[] = [
  //   {
  //     key: 'total',
  //     label: 'Total Documents',
  //     value: score.total,
  //     icon: FileText,
  //     tone: 'text-fg-muted',
  //   },
  //   {
  //     key: 'verified',
  //     label: 'Verified',
  //     value: score.verified,
  //     icon: CircleCheck,
  //     tone: 'text-status-success-fg',
  //   },
  //   {
  //     key: 'pending',
  //     label: 'Awaiting review',
  //     value: score.pending,
  //     icon: Clock3,
  //     tone: 'text-status-warning-fg',
  //   },
  //   {
  //     key: 'rejected',
  //     label: 'Rejected',
  //     value: score.rejected,
  //     icon: CircleX,
  //     tone: 'text-status-danger-fg',
  //   },
  // ];
  */

  /**
   * Verifying a document you cannot read is a rubber stamp, so opening it is
   * available on a decided application too — the record of what the committee
   * saw outlives the decision.
   */
  const openFile = async (document: ApplicationDocument) => {
    try {
      await ApplicationsService.downloadDocument(
        applicationId,
        document.id,
        document.original_name,
      );
    } catch (caught) {
      toast.error(asDisplayError(caught).message);
    }
  };

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

  const ask = (document: ApplicationDocument, decision: Decision) => {
    setTarget({ document, decision });
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

  const documentList = (rows: ApplicationDocument[], emptyTitle: string, emptyWhy: string) => {
    if (rows.length === 0) {
      return (
        <EmptyState
          title={emptyTitle}
          description={emptyWhy}
          icon={<FileText size={20} strokeWidth={1.5} />}
        />
      );
    }

    return (
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((document) => {
          const isOpen = Boolean(expanded[document.id]);
          const label = documentLabel(document);

          return (
            <li key={document.id} className="rounded-md border border-border bg-surface">
              {/*
                The whole header is the toggle, not just the chevron. The chevron
                says which way the row will move; a 16px hit area is not what a
                reviewer aims at when the obvious target is the file name.
              */}
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() =>
                  setExpanded((current) => ({ ...current, [document.id]: !current[document.id] }))
                }
                className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-3 py-3 text-left"
              >
                <FileText
                  size={16}
                  strokeWidth={1.5}
                  className="flex-none text-fg-muted"
                  aria-hidden
                />

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-supporting font-medium text-fg">{label}</span>
                    <Badge tone={isRequired(document) ? 'info' : 'neutral'}>
                      {isRequired(document) ? 'Required' : 'Optional'}
                    </Badge>
                    {/* A re-upload. Earlier versions are kept so a past decision
                        stays explainable by the file the reviewer actually saw. */}
                    {document.version > 1 ? (
                      <Badge tone="warning">{`v${document.version}`}</Badge>
                    ) : null}
                  </span>
                  <span className="block text-12 text-fg-muted">
                    Uploaded on <span className="tabular">{formatDate(document.createdAt)}</span>
                  </span>
                </span>

                <span className="flex flex-none items-center gap-2">
                  <StatusChip
                    domain="document"
                    status={document.verification_status}
                    {...(document.verified_at
                      ? {
                          tooltip: `${document.verified_by?.full_name ?? 'A colleague'} · ${formatDateTime(
                            document.verified_at,
                          )}`,
                        }
                      : {})}
                  />
                  {/* One mark turning over, the same rotation every select arrow
                      in the app uses — not two swapped glyphs. */}
                  <ChevronDown
                    size={16}
                    strokeWidth={1.5}
                    aria-hidden
                    className={`text-fg-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>

              {isOpen ? (
                <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
                  {/*
                    One line: what the file is on the left, what you can do to it
                    on the right. The controls used to sit under the remarks,
                    which put three buttons a paragraph away from the thing they
                    act on — and on a row with no remarks they moved up, so their
                    position depended on whether the reviewer had written
                    anything. `min-w-0` on the left half is what lets a long
                    filename truncate instead of pushing the buttons off the row.
                  */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      {/* Set by a rejection that has already been sent, so this is
                        a debt the applicant owes — not a mark waiting to be sent. */}
                      {document.requires_reupload ? (
                        <Badge
                          tone="warning"
                          tooltip="The applicant has been asked to replace this file and has not done so yet."
                        >
                          Awaiting re-upload
                        </Badge>
                      ) : null}
                      {/* Sniffed from the bytes server-side, not taken from the
                        upload header — so this is what the file actually is. A
                        4 KB "GST certificate" is a screenshot of an error page. */}
                      <span
                        className="truncate text-12 text-fg-muted"
                        title={document.original_name}
                      >
                        {document.original_name}
                      </span>
                      <span className="tabular text-12 text-fg-subtle">
                        {formatBytes(document.size_bytes)} · {document.mime_type}
                      </span>
                    </div>

                    {/*
                    Icon-only, at the client's request, and therefore every one
                    of them carries an `aria-label` AND a `title`: an icon with
                    no accessible name is a button a screen reader announces as
                    "button", and a reviewer who does not recognise the glyph has
                    nothing to hover. `disabledReason` still supplies the tooltip
                    wherever the control is blocked, so the two never both fire.
                  */}
                    <div className="flex flex-none items-center gap-2">
                      <Button
                        size="small"
                        variant="secondary"
                        aria-label="Download this document"
                        title="Download"
                        icon={<Download size={14} strokeWidth={1.5} />}
                        onClick={() => void openFile(document)}
                      />

                      {canVerify ? (
                        <>
                          <Button
                            size="small"
                            variant="success"
                            aria-label="Mark this document verified"
                            {...(closed || document.verification_status === 'VERIFIED'
                              ? {}
                              : { title: 'Mark verified' })}
                            icon={<Check size={14} strokeWidth={1.5} />}
                            disabled={closed || document.verification_status === 'VERIFIED'}
                            disabledReason={
                              closed
                                ? 'This application has been decided. Its marks are the record of what the committee saw.'
                                : document.verification_status === 'VERIFIED'
                                  ? 'Already marked verified.'
                                  : undefined
                            }
                            onClick={() => ask(document, 'VERIFIED')}
                          />
                          <Button
                            size="small"
                            variant="danger"
                            aria-label="Mark this document rejected"
                            {...(closed || document.verification_status === 'REJECTED'
                              ? {}
                              : { title: 'Mark rejected' })}
                            icon={<X size={14} strokeWidth={1.5} />}
                            disabled={closed || document.verification_status === 'REJECTED'}
                            disabledReason={
                              closed
                                ? 'This application has been decided. Its marks are the record of what the committee saw.'
                                : document.verification_status === 'REJECTED'
                                  ? 'Already marked rejected.'
                                  : undefined
                            }
                            onClick={() => ask(document, 'REJECTED')}
                          />
                        </>
                      ) : null}
                    </div>
                  </div>

                  {/* The reviewer's own words, kept where the file they are about
                      is — this is the text the reject email itemises. */}
                  {document.remarks ? (
                    <p className="m-0 rounded-md bg-raised px-3 py-2 text-supporting text-fg">
                      {document.remarks}
                    </p>
                  ) : null}

                  {/*
                    The note is asked for HERE, under the row, not in a modal.

                    A dialog covered the list the reviewer was working through —
                    including the file they were deciding on — so writing "the
                    certificate is expired" meant remembering which one it was.
                    Inline, the file, its name, its size and the note are all on
                    screen at once, and marking six documents is six notes rather
                    than six open-and-close cycles.
                  */}
                  {target && target.document.id === document.id ? (
                    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-subtle p-3">
                      {error ? <Alert variant="danger" message={error.message} /> : null}

                      <Textarea
                        autoFocus
                        rows={3}
                        maxLength={1000}
                        value={remarks}
                        required={target.decision === 'REJECTED'}
                        label={
                          target.decision === 'REJECTED'
                            ? 'Reason for rejection'
                            : 'Note (optional)'
                        }
                        hint={
                          target.decision === 'REJECTED'
                            ? 'Carried into the Reject email word for word. Say what is wrong and what to upload instead.'
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

                      <div className="flex justify-end gap-2">
                        <Button
                          size="small"
                          variant="secondary"
                          disabled={saving}
                          onClick={() => setTarget(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="small"
                          variant={target.decision === 'REJECTED' ? 'danger' : 'success'}
                          loading={saving}
                          onClick={() => void submit()}
                        >
                          {target.decision === 'REJECTED' ? 'Mark rejected' : 'Mark verified'}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    );
  };

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
        <div className="flex flex-col gap-4">
          {/*
            The instruction that used to sit under the drawer's title. It belongs
            here, immediately above the list it is about.
          */}
          {/*
            The instruction and the bulk download share one line. `Download all`
            was in the footer, which now carries only the drawer's own two
            actions — the FormDrawer pattern — and an action on the documents
            belongs with the documents rather than beside Cancel.
          */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-supporting text-fg-muted">
              Review and validate all required documents.
            </p>
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
            The four KPI tiles are hidden at the client's request. Each row states
            its own status, and a count of rows the reviewer can already see is a
            summary of one screenful. `tiles` is still computed below — restoring
            this only needs the markup back.

            <div className="grid grid-cols-4 gap-2">
            {tiles.map((tile) => {
            const Icon = tile.icon;

            return (
            <div
            key={tile.key}
            className="flex flex-col gap-1 rounded-md border border-border bg-surface-subtle px-3 py-3"
            >
            <Icon size={16} strokeWidth={1.5} className={tile.tone} aria-hidden />
            <span className="tabular text-20 font-semibold text-fg">{tile.value}</span>
            <span className="text-12 text-fg-muted">{tile.label}</span>
            </div>
            );
            })}
            </div>
          */}

          {documents.length === 0 ? (
            <EmptyState
              title="No documents uploaded"
              description="An application cannot be submitted without its required documents, so an empty list here means the requirement list is empty."
              icon={<FileText size={20} strokeWidth={1.5} />}
            />
          ) : (
            /*
              The Required / Optional tabs are hidden at the client's request:
              with every document required on this application, two of the three
              tabs were a filter with nothing to filter. The flat list is what
              remains, and `required` / `optional` are still derived above if the
              tabs come back.
            */
            documentList(
              documents,
              'No documents uploaded',
              'Nothing has been uploaded against this application yet.',
            )
          )}

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
    </>
  );
};

export default DocumentVerificationDrawer;
