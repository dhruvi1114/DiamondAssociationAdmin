import { Tooltip } from 'antd';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Loader2,
  Quote,
  Redo2,
  Strikethrough,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The three widths an image may take, stored as a class rather than a style.
 *
 * A class because the server's sanitiser allows exactly these three names on an
 * image and nothing else — a `style` attribute would be a far wider door — and
 * because a width expressed in pixels on a desktop is wrong on every phone. The
 * same three classes are styled by the public site, so what the writer sets here
 * is what a reader gets.
 */
export const IMAGE_SIZES = [
  { value: 'sm', label: 'Small', width: 'One third' },
  { value: 'md', label: 'Medium', width: 'Two thirds' },
  { value: 'full', label: 'Full width', width: 'Full width' },
] as const;

type ImageSize = (typeof IMAGE_SIZES)[number]['value'];

const SizedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      size: {
        default: 'full' as ImageSize,
        parseHTML: (element: HTMLElement) => {
          const match = /news-img-(sm|md|full)/.exec(element.getAttribute('class') ?? '');

          return (match?.[1] ?? 'full') as ImageSize;
        },
        renderHTML: (attributes: { size?: ImageSize }) => ({
          class: `news-img-${attributes.size ?? 'full'}`,
        }),
      },
    };
  },
});

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Uploads a dropped-in picture and returns the URL to place in the article.
   *
   * Absent when there is nothing to attach a picture to yet — a draft that has
   * never been saved has no id — and the image button says so rather than
   * failing when pressed.
   */
  onUploadImage?: (file: File) => Promise<string>;
  /** Why the image button is unavailable, when it is. */
  imageDisabledReason?: string;
}

/**
 * The editor behind any long-form field the association writes itself.
 *
 * Deliberately small. The toolbar offers what an association's writing actually
 * uses — two heading levels, emphasis, lists, a quote, links and pictures — and
 * nothing else. Every extra control is a way to produce markup the public site's
 * stylesheet has never been asked to render, and the server's sanitiser would
 * strip most of it on save anyway: a button whose effect silently disappears is
 * worse than no button.
 *
 * The value is HTML, which is what the API stores. It is sanitised server-side
 * on the way in, so what this component produces is a proposal, not the final
 * markup — a paste out of Word is cleaned there, not here.
 *
 * Images upload the moment they are chosen, before the article is saved. That is
 * the same rule `ImageUpload` follows and for the same reason: a file leaving the
 * machine is not a draft, and holding it until Save means losing it if the save
 * fails.
 */

interface ToolButtonProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  /** Sized for a word rather than a glyph. */
  wide?: boolean;
  onClick: () => void;
}

const ToolButton = ({
  icon,
  label,
  active = false,
  disabled = false,
  wide = false,
  onClick,
}: ToolButtonProps) => (
  <Tooltip title={label}>
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      /*
        `onMouseDown` with preventDefault, not `onClick`: pressing a toolbar
        button steals focus from the document, and a command applied after the
        selection has collapsed formats nothing. This keeps the caret where it was.
      */
      onMouseDown={(event) => {
        event.preventDefault();
        if (!disabled) onClick();
      }}
      className={[
        'grid h-7 place-items-center rounded transition-colors duration-100',
        wide ? 'px-2' : 'w-7',
        disabled
          ? 'cursor-not-allowed text-fg-subtle opacity-50'
          : active
            ? 'bg-surface-selected text-fg'
            : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
      ].join(' ')}
    >
      {icon}
    </button>
  </Tooltip>
);

const Divider = () => <span className="mx-1 h-4 w-px bg-border" aria-hidden />;

const ICON = { size: 15, strokeWidth: 1.75 } as const;

/** Ask for the URL, normalise it, and refuse anything that is not a web address. */
const promptForLink = (existing: string): string | null => {
  const raw = window.prompt('Link address', existing || 'https://');

  if (raw === null) return null;

  const trimmed = raw.trim();

  if (!trimmed) return '';

  /*
    https only, matching the server's sanitiser. A javascript: link would be
    stripped on save, so accepting one here would let the writer believe they had
    added a link that quietly vanishes.
  */
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  return /^https:\/\//i.test(withScheme) ? withScheme : null;
};

const Toolbar = ({
  editor,
  onPickImage,
  uploading,
  imageDisabledReason,
  canUploadImage,
}: {
  editor: Editor;
  onPickImage: () => void;
  uploading: boolean;
  imageDisabledReason?: string;
  canUploadImage: boolean;
}) => {
  const is = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs);

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-subtle px-2 py-1.5">
      <ToolButton
        icon={<Bold {...ICON} />}
        label="Bold"
        active={is('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolButton
        icon={<Italic {...ICON} />}
        label="Italic"
        active={is('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolButton
        icon={<Strikethrough {...ICON} />}
        label="Strikethrough"
        active={is('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <Divider />
      {/*
        H2 and H3 only. The article's own title is the page's H1, so an editor
        offering H1 produces two of them — which is a real accessibility and SEO
        fault, not a stylistic preference.
      */}
      <ToolButton
        icon={<Heading2 {...ICON} />}
        label="Heading"
        active={is('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolButton
        icon={<Heading3 {...ICON} />}
        label="Subheading"
        active={is('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <Divider />
      <ToolButton
        icon={<List {...ICON} />}
        label="Bulleted list"
        active={is('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolButton
        icon={<ListOrdered {...ICON} />}
        label="Numbered list"
        active={is('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolButton
        icon={<Quote {...ICON} />}
        label="Quote"
        active={is('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <Divider />
      <ToolButton
        icon={<Link2 {...ICON} />}
        label="Add link"
        active={is('link')}
        onClick={() => {
          const href = promptForLink((editor.getAttributes('link').href as string) ?? '');

          if (href === null) return;

          if (!href) {
            editor.chain().focus().unsetLink().run();

            return;
          }

          editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
        }}
      />
      <ToolButton
        icon={<Link2Off {...ICON} />}
        label="Remove link"
        disabled={!is('link')}
        onClick={() => editor.chain().focus().unsetLink().run()}
      />
      <ToolButton
        icon={uploading ? <Loader2 {...ICON} className="animate-spin" /> : <ImagePlus {...ICON} />}
        label={canUploadImage ? 'Insert image' : (imageDisabledReason ?? 'Insert image')}
        disabled={!canUploadImage || uploading}
        onClick={onPickImage}
      />
      <Divider />
      <ToolButton
        icon={<Undo2 {...ICON} />}
        label="Undo"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <ToolButton
        icon={<Redo2 {...ICON} />}
        label="Redo"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      />

      {/*
        Everything you can do to the picture you just clicked.

        Contextual rather than always present: three width buttons and a delete
        that do nothing for the other 95% of the time in this editor would be
        four dead controls, and a toolbar of mostly-dead controls is one nobody
        reads. It appears on selection, which is also when the writer is looking
        for it.

        Kept in the toolbar rather than floated over the image: a bubble that
        follows the selection needs its own positioning, its own escape
        behaviour and its own scroll handling, and none of that is worth adding
        for four buttons that already have a home.
      */}
      {is('image') && (
        <>
          <Divider />
          <span className="px-1 text-11 text-fg-subtle">Image</span>
          {IMAGE_SIZES.map((size) => (
            <ToolButton
              key={size.value}
              icon={<span className="text-11 font-medium">{size.label}</span>}
              label={`${size.width} — resize the selected image`}
              active={editor.getAttributes('image').size === size.value}
              wide
              onClick={() =>
                editor.chain().focus().updateAttributes('image', { size: size.value }).run()
              }
            />
          ))}
          <ToolButton
            icon={<Trash2 {...ICON} />}
            label="Remove image"
            onClick={() => editor.chain().focus().deleteSelection().run()}
          />
        </>
      )}
    </div>
  );
};

export const RichTextEditor = ({
  value,
  onChange,
  placeholder = 'Write the article…',
  disabled = false,
  onUploadImage,
  imageDisabledReason,
}: RichTextEditorProps) => {
  const picker = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // The title above is the page's only H1 (see the toolbar note).
        heading: { levels: [2, 3] },
        // Nothing on the public site renders a code block, and the sanitiser
        // does not allow one through — so offering it would be a lie.
        codeBlock: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ['https'],
        HTMLAttributes: { rel: 'noopener noreferrer' },
      }),
      SizedImage.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor: instance }) => {
      const html = instance.getHTML();

      // TipTap's empty document is `<p></p>`, which is not nothing to a length
      // check on the server. Report it as the empty string it means.
      onChange(instance.isEmpty ? '' : html);
    },
  });

  /*
    Push a value in only when it genuinely differs from what is on screen.
    Setting content on every render would move the caret to the start on every
    keystroke — the classic controlled-editor bug.
  */
  useEffect(() => {
    if (!editor) return;

    const current = editor.isEmpty ? '' : editor.getHTML();

    if (value !== current) {
      editor.commands.setContent(value || '', false);
    }
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) return null;

  const pickImage = async (file: File) => {
    if (!onUploadImage) return;

    setUploading(true);

    try {
      const url = await onUploadImage(file);

      editor.chain().focus().setImage({ src: url }).run();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={[
        'overflow-hidden rounded-lg border border-border bg-surface',
        disabled ? 'opacity-60' : '',
      ].join(' ')}
    >
      <Toolbar
        editor={editor}
        uploading={uploading}
        canUploadImage={Boolean(onUploadImage) && !disabled}
        imageDisabledReason={imageDisabledReason}
        onPickImage={() => picker.current?.click()}
      />
      <EditorContent editor={editor} className="rich-text" />
      <input
        ref={picker}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        // Inline, not the `hidden` utility — see the note in ImageUpload.
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];

          // Reset first: choosing the same file twice must fire again.
          event.target.value = '';

          if (file) void pickImage(file);
        }}
      />
    </div>
  );
};

export default RichTextEditor;
