import { Tooltip } from 'antd';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface ImageUploadProps {
  /** Where the current image can be fetched, or `null` when none is set. */
  src: string | null;
  /** Names the image in the tooltip and to a screen reader. Sentence case: "Logo". */
  label: string;
  /** MIME types the picker offers and the server accepts. */
  accept?: string;
  uploading?: boolean;
  disabled?: boolean;
  onSelect: (file: File) => void;
  onRemove?: () => void;
}

/**
 * An image that is stored server-side — shown, replaced and removed in one tile.
 *
 * The tile IS the button. A row of Upload / Replace / Remove buttons underneath
 * costs three labels and two decisions to say what one square already shows: you
 * click the picture to change the picture. The only thing that needs its own
 * target is removal, because it destroys something, and it appears on the corner
 * where a dismiss has meant the same thing for thirty years.
 *
 * Not a form field, and deliberately not pretending to be one. Everything else
 * on a settings screen is a draft until Save; an upload is a file leaving the
 * machine, so it commits on choose. Holding a File in the same draft as the text
 * fields would mean either uploading on Save — and losing the picked file if the
 * save failed — or uploading twice.
 *
 * The preview is the stored image fetched back from the server, never a local
 * `URL.createObjectURL` of what was picked. A local preview shows the admin what
 * they chose; this shows them what a member will see, which is the only thing
 * that answers "did it work".
 */
export const ImageUpload = ({
  src,
  label,
  accept = 'image/png,image/jpeg,image/webp',
  uploading = false,
  disabled = false,
  onSelect,
  onRemove,
}: ImageUploadProps) => {
  const input = useRef<HTMLInputElement>(null);
  const [broken, setBroken] = useState(false);

  // A replaced image keeps the same URL, so a failure on the old one must not
  // stick to the new one.
  useEffect(() => setBroken(false), [src]);

  const noun = label.toLowerCase();
  const showImage = Boolean(src) && !broken;
  const busy = uploading || disabled;

  return (
    <div className="group relative inline-block">
      <Tooltip title={disabled ? undefined : `${src ? 'Replace' : 'Upload'} ${noun}`}>
        <button
          type="button"
          disabled={busy}
          aria-label={`${src ? 'Replace' : 'Upload'} ${noun}`}
          onClick={() => input.current?.click()}
          className={[
            'grid h-20 w-20 place-items-center overflow-hidden rounded-lg border bg-surface p-2',
            'transition-colors duration-100',
            // Dashed while there is nothing there. A solid empty box reads as a
            // field that failed to load; a dashed one reads as a slot to fill.
            showImage ? 'border-border' : 'border-dashed border-border-strong',
            busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-fg-subtle',
          ].join(' ')}
        >
          {uploading ? (
            <Loader2 size={16} strokeWidth={1.5} className="animate-spin text-fg-subtle" />
          ) : showImage ? (
            <img
              src={src as string}
              alt={label}
              // `contain`, so a wide wordmark and a square mark both show whole.
              // Cropping a logo to fill a box is the one thing nobody wants.
              className="max-h-full max-w-full object-contain"
              onError={() => setBroken(true)}
            />
          ) : (
            <span className="flex flex-col items-center gap-1 text-11 text-fg-subtle">
              <ImagePlus size={16} strokeWidth={1.5} aria-hidden />
              {broken ? 'Could not load' : 'Upload'}
            </span>
          )}
        </button>
      </Tooltip>

      {showImage && onRemove && !disabled ? (
        <Tooltip title={`Remove ${noun}`}>
          <button
            type="button"
            disabled={uploading}
            aria-label={`Remove ${noun}`}
            onClick={onRemove}
            className={[
              'absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full',
              // A ring in the page colour, not a border: the badge overhangs the
              // tile corner, so without it the circle blurs into whatever pixels
              // of the logo happen to sit behind it.
              'bg-fg-muted text-bg ring-2 ring-surface',
              'transition-opacity duration-100 hover:bg-fg',
              /*
                Hidden until the tile is hovered — a destructive control does not
                need to be on screen while nobody is reaching for it. `opacity`,
                not `hidden`, so it stays in the tab order: revealing it on hover
                alone would make removal impossible by keyboard.
              */
              'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            ].join(' ')}
          >
            <X size={13} strokeWidth={2.5} aria-hidden />
          </button>
        </Tooltip>
      ) : null}

      <input
        ref={input}
        type="file"
        accept={accept}
        /*
          An inline style, not the `hidden` utility. Inside an AntD `<Form>` the
          form's own rules target this element with a descendant selector, which
          outranks a single-class utility — so the tile rendered correctly on the
          settings page and showed a raw "Choose file" beside it in a form
          drawer. An inline declaration cannot be outranked by either.
        */
        style={{ display: 'none' }}
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];

          /*
            Cleared before the handler runs. The input keeps the last filename,
            and picking the SAME file again fires no change event — so an admin
            who uploads, sees it is wrong, fixes the file and picks it again
            would get nothing at all.
          */
          event.target.value = '';
          if (file) onSelect(file);
        }}
      />
    </div>
  );
};

export default ImageUpload;
