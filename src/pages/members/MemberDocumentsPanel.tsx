import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  Dialog,
  EmptyState,
  RowActions,
  StatusChip,
  Textarea,
  toast,
} from '@/components/ui';
import { usePermissions } from '@/hooks/usePermissions';
import MembersService, { type MemberDocument } from '@/services/membersService';
import { asDisplayError, type DisplayError } from '@/utils/apiError';
import { formatBytes, formatDateTime } from '@/utils/format';

/**
 * "Aadhaar Card — Back", or just "PAN Document" when the type is one file.
 *
 * Its own copy rather than a shared import with the applications panel: the two
 * screens describe different tables and will diverge, and one duplicated helper
 * is cheaper than a shared one that has to serve both.
 */
const DOCUMENT_SIDE_LABELS: Record<MemberDocument['side'], string> = {
  SINGLE: '',
  FRONT: 'Front',
  BACK: 'Back',
  COMBINED: 'Both sides',
};

const documentLabel = (document: MemberDocument) =>
  DOCUMENT_SIDE_LABELS[document.side]
    ? `${document.document_type.name} — ${DOCUMENT_SIDE_LABELS[document.side]}`
    : document.document_type.name;

/**
 * A-13 · right column — the member's uploaded files, verified one at a time.
 *
 * Same compact list `ApplicationReview`'s `DocumentsPanel` uses, not the
 * eight-column table this replaced — a sidebar card, not a tab of its own,
 * so a reviewer scanning it wants the file and its status at a glance rather
 * than a table row's worth of columns.
 *
 * Self-fetches on `memberId` rather than taking `documents` as a prop —
 * unlike the application review page, `MemberDetail`'s own payload does not
 * embed them (`status_history` is embedded; documents never were).
 */

type Decision = 'VERIFIED' | 'REJECTED';

export interface MemberDocumentsPanelProps {
  memberId: string;
  /** Refreshes anything upstream that shows a pending-documents count. */
  onChanged?: () => void;
}

export const MemberDocumentsPanel = ({ memberId, onChanged }: MemberDocumentsPanelProps) => {
  const { can } = usePermissions();
  // Unused while verify / reject are commented out of the row actions below,
  // and kept because the dialog they open still exists.

  const canVerify = can('document.verify');

  const [documents, setDocuments] = useState<MemberDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<DisplayError | null>(null);

  const [target, setTarget] = useState<{ document: MemberDocument; decision: Decision } | null>(
    null,
  );
  const [remarks, setRemarks] = useState('');
  const [remarksError, setRemarksError] = useState<string | undefined>();
  const [error, setError] = useState<DisplayError | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const result = await MembersService.documents(memberId);
      setDocuments(result.data);
    } catch (caught) {
      setLoadError(asDisplayError(caught));
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const verified = documents.filter((doc) => doc.verification_status === 'VERIFIED').length;
  const pending = documents.filter((doc) => doc.verification_status === 'PENDING').length;

  const download = async (document: MemberDocument) => {
    setDownloading(document.id);

    try {
      await MembersService.downloadDocument(document.id, document.original_name);
    } catch (caught) {
      toast.error(
        `Could not download ${document.original_name}. ${asDisplayError(caught).message}`,
      );
    } finally {
      setDownloading(null);
    }
  };

  const open = (document: MemberDocument, decision: Decision) => {
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
      await MembersService.verifyDocument(target.document.id, {
        status: target.decision,
        ...(trimmed ? { remarks: trimmed } : {}),
      });

      toast.success(
        target.decision === 'VERIFIED'
          ? `${documentLabel(target.document)} verified.`
          : `${documentLabel(target.document)} rejected. The member has been told why.`,
      );

      setTarget(null);
      await load();
      onChanged?.();
    } catch (caught) {
      setError(asDisplayError(caught));
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <Card title="Documents">
        <Alert
          variant="danger"
          message={loadError.message}
          {...(loadError.requestId ? { description: `Request ${loadError.requestId}` } : {})}
        />
      </Card>
    );
  }

  // Kept deliberately (see the note above the declaration). Referenced so
  // TypeScript's noUnusedLocals does not force its deletion — the author
  // already silenced the matching ESLint rule.
  void open;

  // Kept deliberately (see the note above the declaration). Referenced so
  // TypeScript's noUnusedLocals does not force its deletion — the author
  // already silenced the matching ESLint rule.
  void canVerify;

  return (
    <Card
      title="Documents"
      description={
        loading || documents.length === 0
          ? undefined
          : `${verified} of ${documents.length} verified${pending > 0 ? ` · ${pending} waiting on you` : ''}`
      }
    >
      {!loading && documents.length === 0 ? (
        <EmptyState
          title="No documents uploaded"
          description="KYC files appear here as the member uploads them from their portal. Nothing to verify yet."
        />
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {documents.map((document, index) => (
            <li
              key={document.id}
              className={`flex flex-col gap-2 py-3 ${index > 0 ? 'border-t border-border' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-13 font-medium text-fg">{documentLabel(document)}</span>
                    <Badge>{document.document_type.is_required ? 'Required' : 'Optional'}</Badge>
                    {document.version > 1 ? (
                      <Badge
                        tone="info"
                        tooltip="A re-upload. Earlier versions are kept so a past decision stays explainable by the file the reviewer actually saw."
                      >
                        {`v${document.version}`}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="truncate text-12 text-fg-muted" title={document.original_name}>
                    {document.original_name}
                  </div>
                </div>

                <div className="flex-none">
                  <RowActions
                    actions={[
                      {
                        key: 'download',
                        icon: <Download size={16} strokeWidth={1.5} />,
                        label: 'Download file',
                        disabled: downloading === document.id,
                        onClick: () => void download(document),
                      },
                      /*
                        **No verify / reject here, at the client's request.**

                        A member's KYC is decided once, on the application, by
                        the reviewer who approved it — approval copies those
                        files across already carrying their verdict
                        (`activation.service` → `adoptApplicationDocuments`).
                        Re-deciding them on the member record would let somebody
                        overturn a committee decision from a screen that shows
                        none of the context the committee had.

                        The decision dialog and `open()` below still exist, so
                        restoring this is these two entries and nothing else.

                        ...(canVerify
                          ? [
                              { key: 'verify', ...onClick: () => open(document, 'VERIFIED') },
                              { key: 'reject', ...onClick: () => open(document, 'REJECTED') },
                            ]
                          : []),
                      */
                    ]}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
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
                <span className="tabular text-11 text-fg-muted">
                  {formatBytes(document.size_bytes)} · {document.mime_type}
                </span>
              </div>

              {document.remarks ? (
                <p className="m-0 rounded-md bg-raised px-3 py-2 text-12 text-fg">
                  {document.remarks}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {target ? (
        <Dialog
          open
          danger={target.decision === 'REJECTED'}
          title={
            target.decision === 'VERIFIED'
              ? `Verify ${documentLabel(target.document)}?`
              : `Reject ${documentLabel(target.document)}?`
          }
          description={
            target.decision === 'VERIFIED'
              ? 'Records that you have seen this file and accept it.'
              : 'The member sees this rejected with your note and is asked to upload a replacement.'
          }
          confirmLabel={target.decision === 'VERIFIED' ? 'Verify document' : 'Reject document'}
          loading={saving}
          onCancel={() => setTarget(null)}
          onConfirm={() => void submit()}
        >
          <div className="mt-4 flex flex-col gap-3">
            {error ? <Alert variant="danger" message={error.message} /> : null}

            <Textarea
              autoFocus
              rows={3}
              maxLength={1000}
              value={remarks}
              required={target.decision === 'REJECTED'}
              label={target.decision === 'REJECTED' ? 'Reason for rejection' : 'Note (optional)'}
              hint={
                target.decision === 'REJECTED'
                  ? 'Shown to the member word for word. Say what is wrong and what to upload instead.'
                  : 'Shown to the member if you write one.'
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
      ) : null}
    </Card>
  );
};

export default MemberDocumentsPanel;
