import { Form, Input } from 'antd';
import { Download, FileText, Paperclip, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  FieldLabel,
  FormDrawer,
  FormSelect,
  ImageUpload,
  RichTextEditor,
  toast,
} from '@/components/ui';
import NewsService, {
  MAX_ATTACHMENTS,
  NEWS_VISIBILITY,
  absoluteUrl,
  toEditorHtml,
  toStoredHtml,
  type NewsCategory,
  type NewsDetail,
  type NewsInput,
  type NewsRow,
} from '@/services/newsService';

/**
 * A-38 — write or edit one news article.
 *
 * The drawer holds the text; the list holds the lifecycle. Publish, retire and
 * delete are row actions, not buttons in here, because they are decisions about
 * an article that already exists — putting them beside Save would make "save my
 * typo fix" and "put this on the public website" adjacent, one press apart.
 *
 * Files are the exception to "nothing commits until Save". A cover, a picture or
 * a PDF uploads the moment it is chosen: it is a file leaving the machine, the
 * server answers with a key the form has no way to hold, and deferring it would
 * mean losing the picked file whenever the save failed. Which is why uploads
 * need a saved draft first, and say so instead of failing when pressed.
 */

interface ApiError {
  message: string;
  fields?: Record<string, string>;
}

const asError = (error: unknown): ApiError => {
  const err = error as { message?: string; fields?: Record<string, string> };

  return { message: err?.message ?? 'Something went wrong', fields: err?.fields };
};

const readableSize = (bytes: number | null): string => {
  if (bytes === null) return '';

  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

export interface ArticleDrawerProps {
  open: boolean;
  /** The row being edited, or null for a new article. */
  editing: NewsRow | null;
  categories: NewsCategory[];
  /**
   * False for staff who hold `news.view` but not `news.manage`.
   *
   * The drawer stays reachable — a reviewer has every reason to read what was
   * published — but it stops pretending to be a form: the fields are disabled,
   * the uploads are inert and the footer says Close rather than Save. Opening a
   * live-looking form that refuses on submit is the worse of the two failures.
   */
  canManage?: boolean;
  onClose: () => void;
  /** Called after a successful save so the list can refresh. */
  onSaved: (article: NewsRow) => void;
}

interface FormValues {
  title: string;
  excerpt: string;
  cover_image_alt?: string;
  category_id?: string | null;
  visibility: number;
}

export const ArticleDrawer = ({
  open,
  editing,
  categories,
  canManage = true,
  onClose,
  onSaved,
}: ArticleDrawerProps) => {
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);

  /*
    The body lives outside the antd form. The editor is not an input — it does
    not take a value/onChange pair antd can drive — and wrapping it in a
    Form.Item only to bridge the two would put the caret at the mercy of antd's
    re-render cycle.
  */
  const [body, setBody] = useState('');

  /** The article as the server currently holds it, including its files. */
  const [detail, setDetail] = useState<NewsDetail | null>(null);
  const [coverSrc, setCoverSrc] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  /*
    Files chosen before the article exists.

    An upload needs an id to belong to, and a brand-new article has none — but
    "save first, then come back for the picture" is a rule the writer has to obey
    for the tool's convenience, not their own. So a file picked now is held here,
    previewed locally, and sent the moment Save creates the row. On an article
    that already exists nothing is held: the upload commits immediately, as it
    always did.
  */
  const [pendingCover, setPendingCover] = useState<File | null>(null);
  const [pendingPdfs, setPendingPdfs] = useState<File[]>([]);
  const pdfPicker = useRef<HTMLInputElement>(null);

  const articleId = detail?.id ?? editing?.id ?? null;
  /** Uploads need both a saved article and the permission to change it. */
  const canAttach = canManage && Boolean(articleId);

  /* Object URLs are revoked when they are replaced, or the tab leaks a blob per open. */
  const showCover = useCallback((blob: Blob | null) => {
    setCoverSrc((previous) => {
      if (previous) URL.revokeObjectURL(previous);

      return blob ? URL.createObjectURL(blob) : null;
    });
  }, []);

  const loadCover = useCallback(
    async (id: string, hasCover: boolean) => {
      if (!hasCover) {
        showCover(null);

        return;
      }

      try {
        showCover(await NewsService.fetchCover(id));
      } catch {
        // A missing cover is a state the tile already draws. It is not worth a
        // toast on open — the admin has not asked for anything yet.
        showCover(null);
      }
    },
    [showCover],
  );

  useEffect(() => {
    if (!open) return;

    if (!editing) {
      form.resetFields();
      form.setFieldsValue({ visibility: NEWS_VISIBILITY.PUBLIC, category_id: null });
      setBody('');
      setDetail(null);
      setPendingCover(null);
      setPendingPdfs([]);
      showCover(null);

      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const res = await NewsService.detail(editing.id);

        if (cancelled) return;

        const article = res.data.article;

        setDetail(article);
        // Absolute while it is being edited; stored relative again on save.
        setBody(toEditorHtml(article.body ?? ''));
        form.setFieldsValue({
          title: article.title,
          excerpt: article.excerpt,
          cover_image_alt: article.cover_alt ?? '',
          category_id: article.category_id,
          visibility: article.visibility,
        });
        await loadCover(article.id, Boolean(article.cover_url));
      } catch (err) {
        if (!cancelled) toast.error(asError(err).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, editing, form, loadCover, showCover]);

  /* Release the last object URL when the drawer goes away for good. */
  useEffect(
    () => () => {
      setCoverSrc((previous) => {
        if (previous) URL.revokeObjectURL(previous);

        return null;
      });
    },
    [],
  );

  const uploadCover = useCallback(
    async (id: string, file: File) => {
      setUploadingCover(true);

      try {
        const res = await NewsService.uploadCover(id, file);

        onSaved(res.data.article);
        await loadCover(id, true);
        toast.success('Cover image updated');
      } catch (err) {
        toast.error(asError(err).message);
      } finally {
        setUploadingCover(false);
      }
    },
    [loadCover, onSaved],
  );

  /**
   * A cover was chosen. Send it now if there is something to attach it to, and
   * otherwise hold it with a local preview until Save creates the article.
   */
  const chooseCover = useCallback(
    (file: File) => {
      if (articleId) {
        void uploadCover(articleId, file);

        return;
      }

      setPendingCover(file);
      // The writer's own file, not the stored one — there is nothing stored yet.
      showCover(file);
    },
    [articleId, showCover, uploadCover],
  );

  const uploadPdf = useCallback(
    async (id: string, file: File) => {
      setUploadingPdf(true);

      try {
        const res = await NewsService.uploadAttachment(id, file);

        setDetail((previous) =>
          previous ? { ...previous, attachments: res.data.article.attachments } : previous,
        );
        onSaved(res.data.article);
        toast.success('Attachment added');
      } catch (err) {
        toast.error(asError(err).message);
      } finally {
        setUploadingPdf(false);
      }
    },
    [onSaved],
  );

  /** Same rule as the cover: send it now, or hold it until the article exists. */
  const choosePdf = useCallback(
    (file: File) => {
      if (articleId) {
        void uploadPdf(articleId, file);

        return;
      }

      // Appended, never replaced — the previous pick is not a draft of this one.
      setPendingPdfs((held) => [...held, file]);
    },
    [articleId, uploadPdf],
  );

  const submit = useCallback(async () => {
    const values = await form.validateFields();

    setSaving(true);

    try {
      const payload: NewsInput = {
        title: values.title,
        excerpt: values.excerpt,
        // Back to the API-relative form every audience reads.
        body: toStoredHtml(body),
        cover_image_alt: values.cover_image_alt?.trim() ? values.cover_image_alt.trim() : null,
        category_id: values.category_id ?? null,
        visibility: values.visibility,
        /*
          No slug on the wire. The form no longer collects one, so the server
          makes it from the headline — and an omitted key is how this API says
          "no opinion", where an empty string would be a value it must reject.
        */
      };

      const res = editing
        ? await NewsService.update(editing.id, payload)
        : await NewsService.create(payload);

      const saved = res.data.article;

      toast.success(editing ? 'Article saved' : 'Draft created');
      onSaved(saved);

      if (editing) {
        onClose();

        return;
      }

      /*
        The row exists now, so anything the writer picked while it did not can
        finally be sent. Sequential rather than parallel: two multipart writes to
        the same article race on `updated_by`, and the second would report a
        result computed before the first landed.
      */
      if (pendingCover) {
        await uploadCover(saved.id, pendingCover);
        setPendingCover(null);
      }

      // In order, one at a time: they share a row, and the display order is the
      // order the writer added them in.
      for (const file of pendingPdfs) {
        await uploadPdf(saved.id, file);
      }

      setPendingPdfs([]);

      /*
        A new article stays open rather than closing on save: the writer is
        mid-sentence, and pictures inside the body still need the id that has
        only just come into existence.

        Read back rather than reusing `saved`: that response was computed before
        the two uploads above ran, so trusting it would blank the attachment row
        the writer had just filled.
      */
      const fresh = await NewsService.detail(saved.id);

      setDetail(fresh.data.article);
      setBody(toEditorHtml(fresh.data.article.body ?? ''));
    } catch (err) {
      const error = asError(err);

      if (error.fields && Object.keys(error.fields).length > 0) {
        const entries = Object.entries(error.fields);

        form.setFields(
          entries.map(([name, message]) => ({
            name: name as keyof FormValues,
            errors: [message],
          })),
        );
        toast.error(entries[0]![1]);
      } else {
        toast.error(error.message);
      }
    } finally {
      setSaving(false);
    }
  }, [body, editing, form, onClose, onSaved, pendingCover, pendingPdfs, uploadCover, uploadPdf]);

  const removePdf = useCallback(
    async (attachmentId: string) => {
      if (!articleId) return;

      try {
        await NewsService.removeAttachment(articleId, attachmentId);
        setDetail((previous) =>
          previous
            ? {
                ...previous,
                attachments: previous.attachments.filter((row) => row.id !== attachmentId),
              }
            : previous,
        );
        toast.success('Attachment removed');
      } catch (err) {
        toast.error(asError(err).message);
      }
    },
    [articleId],
  );

  /*
    Fetched with the staff token and handed to the browser as a blob: the public
    URL on the row answers 404 for a draft, and an `<a href>` cannot carry an
    Authorization header.
  */
  const downloadPdf = useCallback(
    async (attachmentId: string, name: string) => {
      if (!articleId) return;

      try {
        const blob = await NewsService.fetchAttachment(articleId, attachmentId);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = name;
        link.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        toast.error(asError(err).message);
      }
    },
    [articleId],
  );

  const uploadBodyImage = useCallback(
    async (file: File): Promise<string> => {
      if (!articleId) throw new Error('Save the draft first');

      const res = await NewsService.uploadImage(articleId, file);

      /*
        Absolute, so the picture appears the moment it is dropped in. `submit`
        converts it back before the body is stored — what goes in the database
        is the one URL that works for the public site and the member view too.
      */
      return absoluteUrl(res.data.image.url) ?? res.data.image.url;
    },
    [articleId],
  );

  /*
    The one upload that still needs a saved article. A cover and a PDF are held
    and sent on Save, but a picture inside the body is different: the editor has
    to write a URL into the text at the moment it is dropped in, and there is no
    URL until the article exists.
  */
  const bodyImageNeedsDraft = 'Save the draft first, then pictures can go inside the article.';
  /*
    One list: the files already stored, then the ones waiting to be sent. The
    writer chose each of them, so a row that stayed empty until Save would read
    as the pick having failed — and holding the two in separate lists would put
    the same file in two places depending on when you looked.
  */
  const shownAttachments = [
    ...(detail?.attachments ?? []).map((row) => ({
      key: row.id,
      id: row.id,
      name: row.name,
      size: row.size_bytes,
      stored: true as const,
    })),
    ...pendingPdfs.map((file, index) => ({
      key: `pending-${index}`,
      id: null,
      name: file.name,
      size: file.size,
      stored: false as const,
    })),
  ];

  return (
    <FormDrawer
      open={open}
      width={760}
      title={canManage ? (editing ? 'Edit Article' : 'Write Article') : 'Article'}
      description={
        canManage
          ? articleId
            ? 'Saving keeps this a draft. Publish it from the list when it is ready.'
            : 'Save to create the draft, then add the cover image and any pictures.'
          : 'Read-only — editing news needs the news.manage permission.'
      }
      confirmLabel={canManage ? (editing ? 'Save' : 'Save Draft') : 'Close'}
      loading={saving}
      onConfirm={canManage ? submit : onClose}
      onCancel={onClose}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        disabled={!canManage}
        className="news-form"
      >
        <Form.Item
          name="title"
          label="Title"
          rules={[
            { required: true, message: 'A headline is required' },
            { min: 3, message: 'Too short to be a headline' },
            { max: 220, message: 'Keep the headline under 220 characters' },
          ]}
        >
          <Input placeholder="GJEPC Seminar Highlights B2B E-Commerce in Delhi" />
        </Form.Item>

        <div className="flex gap-4">
          <Form.Item
            name="category_id"
            label={
              <FieldLabel
                label="Category"
                help="Which filter tab this appears under on the website."
              />
            }
            className="min-w-0 flex-1"
          >
            <FormSelect
              allowClear
              placeholder="Uncategorised"
              options={categories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="visibility"
            label={
              <FieldLabel
                label="Who Can Read It"
                help="Public means everyone, members included. Members only hides it from the public site entirely."
              />
            }
            className="min-w-0 flex-1"
            rules={[{ required: true, message: 'Choose who can read it' }]}
          >
            <FormSelect
              options={[
                { value: NEWS_VISIBILITY.PUBLIC, label: 'Public — anyone on the website' },
                { value: NEWS_VISIBILITY.MEMBER_ONLY, label: 'Members only — signed-in members' },
              ]}
            />
          </Form.Item>
        </div>

        <Form.Item
          name="excerpt"
          label={
            <FieldLabel
              label="Summary"
              help="The two lines printed on the news card, and what a shared link previews as."
            />
          }
          rules={[
            { required: true, message: 'A summary is required — it is what the card shows' },
            { min: 10, message: 'Too short to summarise anything' },
            { max: 400, message: 'Keep the summary under 400 characters' },
          ]}
        >
          <Input.TextArea rows={2} maxLength={400} showCount placeholder="One or two sentences." />
        </Form.Item>

        {/*
          The web address is not a field.

          It is made from the headline, and nothing here benefits from letting an
          admin type a different one: the link is generated, shared and read by
          the site, never composed by a person. The column behind it still exists,
          is still unique, and is still frozen once the article is published — so
          the day the association wants to choose its own addresses this block
          comes back rather than a migration.

          <Form.Item name="slug" label={<FieldLabel label="Web Address" help="…" />}>
            <Input disabled={!isDraft} addonBefore="/news/" />
          </Form.Item>
        */}

        <div className="news-form-section">
          {/*
            Two columns, each with its own label on the same line — not a section
            heading with a field tucked under its right-hand side. The picture and
            the sentence describing it are one decision made together, and a label
            sitting a row lower than its partner reads as belonging to whatever is
            above it.
          */}
          <div className="flex items-start gap-4">
            <div>
              <FieldLabel
                label="Cover Image"
                help="Shown on the card and used as the picture when the article is shared."
                className="text-supporting font-medium"
              />
              <div className="mt-2">
                <ImageUpload
                  src={coverSrc}
                  label="Cover image"
                  uploading={uploadingCover}
                  disabled={!canManage}
                  onSelect={chooseCover}
                />
              </div>
            </div>

            <Form.Item
              name="cover_image_alt"
              label={
                <FieldLabel
                  label="Describe the Picture"
                  help="Read aloud by screen readers and shown if the image fails to load."
                />
              }
              className="min-w-0 flex-1"
            >
              <Input maxLength={200} placeholder="Attendees at the Delhi seminar" />
            </Form.Item>
          </div>
        </div>

        <div className="news-form-section">
          <span className="text-supporting font-medium">Article</span>
          <div className="mt-2">
            <RichTextEditor
              value={body}
              onChange={setBody}
              disabled={!canManage}
              onUploadImage={canAttach ? uploadBodyImage : undefined}
              imageDisabledReason={bodyImageNeedsDraft}
              placeholder="Write the article…"
            />
          </div>
        </div>

        <div className="news-form-section">
          <FieldLabel
            label="Attachments"
            help="PDFs the article refers to — a circular, its annexure, a form to fill in. They are listed in the order you add them."
            className="text-supporting font-medium"
          />
          <div className="mt-2 space-y-2">
            {shownAttachments.map((file) => (
              <div
                key={file.key}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-subtle px-3 py-2"
              >
                <FileText size={16} strokeWidth={1.5} className="shrink-0 text-fg-muted" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-supporting">{file.name}</div>
                  <div className="text-11 text-fg-subtle">
                    {readableSize(file.size)}
                    {file.stored ? '' : ' · uploads when you save'}
                  </div>
                </div>
                {/* Only a stored file can be downloaded — a held one is still on this machine. */}
                {file.stored && (
                  <Button
                    size="small"
                    icon={<Download size={14} strokeWidth={1.5} />}
                    onClick={() => void downloadPdf(file.id as string, file.name)}
                  >
                    Download
                  </Button>
                )}
                {canManage && (
                  <Button
                    size="small"
                    variant="danger"
                    icon={<Trash2 size={14} strokeWidth={1.5} />}
                    aria-label={`Remove ${file.name}`}
                    onClick={() =>
                      file.stored
                        ? void removePdf(file.id as string)
                        : setPendingPdfs((held) =>
                            held.filter((_, index) => `pending-${index}` !== file.key),
                          )
                    }
                  />
                )}
              </div>
            ))}

            <div className="flex items-center gap-3">
              <input
                ref={pdfPicker}
                type="file"
                accept="application/pdf"
                // Inline, not the `hidden` utility — see the note in ImageUpload.
                style={{ display: 'none' }}
                onChange={(event) => {
                  const file = event.target.files?.[0];

                  // Cleared first: picking the same file twice must fire again.
                  event.target.value = '';

                  if (file) choosePdf(file);
                }}
              />
              <Button
                icon={<Paperclip size={14} strokeWidth={1.5} />}
                loading={uploadingPdf}
                {...(shownAttachments.length >= MAX_ATTACHMENTS
                  ? {
                      disabled: true,
                      disabledReason: `An article can carry at most ${MAX_ATTACHMENTS} files.`,
                    }
                  : { disabled: !canManage })}
                onClick={() => pdfPicker.current?.click()}
              >
                {shownAttachments.length > 0 ? 'Add another PDF' : 'Attach PDF'}
              </Button>
            </div>
          </div>
        </div>
      </Form>
    </FormDrawer>
  );
};

export default ArticleDrawer;
