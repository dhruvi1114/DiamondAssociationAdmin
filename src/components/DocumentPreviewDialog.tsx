import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog, ErrorState, Skeleton, toast } from '@/components/ui';
import { asDisplayError, type DisplayError } from '@/utils/apiError';

/**
 * An uploaded file, on screen.
 *
 * Until this existed the only way to see a document was to download it: the
 * reviewer left the browser, opened the file in whatever the operating system
 * chose, marked it in a window that no longer showed the record, and was left
 * with a copy of somebody's GST certificate in Downloads. Verifying a document
 * you cannot read is a rubber stamp, and a download is the slowest possible way
 * to read one.
 *
 * Download has not gone away; it has moved *inside* the preview, which is the
 * order the reader actually wants. Look first, keep a copy only if there is a
 * reason to.
 *
 * **Source-agnostic on purpose.** An application document and a member document
 * are different types on different services behind different endpoints, and the
 * only thing this component needs from either is "give me a blob" and "save this
 * for me". Passing those in is what lets one preview serve both screens rather
 * than the two drifting into different ideas of what a PDF looks like.
 */

/** What the browser will render inline, by the blob's own reported type. */
const isImage = (type: string) => type.startsWith('image/');
const isPdf = (type: string) => type === 'application/pdf';

export interface DocumentPreviewDialogProps {
  /** `null` closes the dialog. A change of id opens it and starts a fresh fetch. */
  documentId: string | null;
  /** The name the screen calls this file — "Aadhaar Card — Back", not the storage name. */
  label: string;
  /** One quiet line under the title: the storage filename, its size. Optional. */
  description?: string;
  /** Fetches the file. Ownership of the returned object URL passes to this dialog. */
  load: (documentId: string) => Promise<{ url: string; type: string }>;
  /** Releases what `load` allocated. */
  revoke: (url: string) => void;
  /** Saves the file. Wired to the dialog's confirm button. */
  download: () => Promise<void>;
  onClose: () => void;
  /**
   * Extra buttons beside Download/Close — an Approve/Reject pair, say — so a
   * reviewer can read the file and decide without leaving the preview. Opt-in:
   * left out, the footer is just Download and Close, as it always was.
   */
  actions?: ReactNode;
}

export const DocumentPreviewDialog = ({
  documentId,
  label,
  description,
  load,
  revoke,
  download,
  onClose,
  actions,
}: DocumentPreviewDialogProps) => {
  const [file, setFile] = useState<{ url: string; type: string } | null>(null);
  const [error, setError] = useState<DisplayError | null>(null);
  const [downloading, setDownloading] = useState(false);

  /*
    The callbacks live in refs so the fetch effect depends on the document alone.
    A caller writing `load={(id) => Service.preview(id)}` inline hands us a new
    function every render, and an effect that depended on it would refetch the
    same file forever.
  */
  const loadRef = useRef(load);
  const revokeRef = useRef(revoke);

  loadRef.current = load;
  revokeRef.current = revoke;

  useEffect(() => {
    if (!documentId) return undefined;

    let url: string | null = null;
    /*
      The fetch outlives a fast close, and a reader clicking down a list opens
      several in a row. Without this guard the slower response overwrites the
      faster one and the dialog shows the wrong document — an especially bad race
      when the question on screen is whether a scan is genuine.
    */
    let live = true;

    setFile(null);
    setError(null);

    loadRef
      .current(documentId)
      .then((loaded) => {
        url = loaded.url;

        if (!live) {
          revokeRef.current(loaded.url);

          return;
        }

        setFile(loaded);
      })
      .catch((caught) => {
        if (live) setError(asDisplayError(caught));
      });

    return () => {
      live = false;
      if (url) revokeRef.current(url);
    };
  }, [documentId]);

  if (!documentId) return null;

  const save = async () => {
    setDownloading(true);

    try {
      await download();
    } catch (caught) {
      toast.error(asDisplayError(caught).message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog
      open
      title={label}
      {...(description ? { description } : {})}
      width={900}
      confirmLabel="Download"
      cancelLabel="Close"
      loading={downloading}
      onConfirm={() => void save()}
      onCancel={onClose}
      {...(actions ? { actions } : {})}
    >
      <div className="flex min-h-[320px] items-center justify-center overflow-auto rounded-md bg-sunken p-2">
        {error ? (
          <ErrorState
            title="This document could not be opened"
            description={error.message}
            {...(error.requestId ? { requestId: error.requestId } : {})}
          />
        ) : !file ? (
          <Skeleton variant="detail" />
        ) : isImage(file.type) ? (
          <img src={file.url} alt={label} className="max-h-[65vh] max-w-full object-contain" />
        ) : isPdf(file.type) ? (
          /* `title` is the frame's accessible name; without it a screen reader
             announces "frame" and nothing else. */
          <iframe src={file.url} title={label} className="h-[65vh] w-full border-0" />
        ) : (
          /* A type the browser will not render — a .docx licence, say. Saying so
             plainly beats an empty box, and Download below still works, which is
             the whole answer for this case. */
          <p className="m-0 max-w-[46ch] p-6 text-center text-supporting text-fg-muted">
            {`This file is a ${file.type || 'type the browser cannot display'}, so it cannot be shown here. Download it to open it in the application it belongs to.`}
          </p>
        )}
      </div>
    </Dialog>
  );
};

export default DocumentPreviewDialog;
