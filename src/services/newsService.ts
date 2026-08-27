import { ENDPOINTS } from '@/constant/endpoints';
import { BaseService, http } from '@/services/BaseService';

/**
 * News API (M9). Mirrors `backend/src/modules/news` exactly.
 *
 * Visibility and status are integer codes rather than strings, because the
 * tables created from M7 onward store them that way. The maps below are the only
 * place the admin app is allowed to know the numbers.
 *
 * `visibility` deliberately carries the same codes as events: 0 members-only,
 * 1 public. Two public-facing lists that mean opposite things by the same
 * integer is a bug waiting for whoever reads one while thinking of the other.
 */

export const NEWS_VISIBILITY = { MEMBER_ONLY: 0, PUBLIC: 1 } as const;
export const NEWS_STATUS = { DRAFT: 0, PUBLISHED: 1, ARCHIVED: 2 } as const;

/**
 * How many files one article may carry. Mirrors the server's own ceiling.
 *
 * Not a technical limit — a readable one. A foot-of-page list of ten downloads
 * is a filing cabinet, and the reader stops being able to tell which document
 * the article is actually about.
 */
export const MAX_ATTACHMENTS = 6;

export type NewsVisibility = (typeof NEWS_VISIBILITY)[keyof typeof NEWS_VISIBILITY];
export type NewsStatus = (typeof NEWS_STATUS)[keyof typeof NEWS_STATUS];

export interface NewsCategory {
  id: string;
  code: string;
  name: string;
  slug: string;
  display_order: number;
  is_active: boolean;
  /** Master screens show both — "when did the catalogue last change" is what they are scanned for. */
  createdAt: string;
  updatedAt: string;
}

/** The category as it is attached to an article — resolved by the API. */
export interface ArticleCategory {
  id: string;
  name: string;
  slug: string;
}

export interface NewsAttachment {
  id: string;
  /** Where it downloads from — slug plus the file's own random id. */
  url: string;
  name: string;
  mime: string;
  size_bytes: number;
}

/** A row in the admin list. */
export interface NewsRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** Where the cover can be fetched, or null when none is set yet. */
  cover_url: string | null;
  cover_alt: string | null;
  category: ArticleCategory | null;
  category_id: string | null;
  visibility: number;
  status: number;
  published_at: string | null;
  /** Always an array. An article with no downloads has an empty one, never null. */
  attachments: NewsAttachment[];
  created_at: string;
  /** Staff names, resolved by the API — an id in a column tells nobody anything. */
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

/** One picture placed inside the body. */
export interface NewsImage {
  id: string;
  /** The URL written into the article — the same one the public reads it at. */
  url: string;
  original_name: string;
  size_bytes: number;
}

export interface NewsDetail extends NewsRow {
  body: string;
  images: NewsImage[];
}

export interface NewsListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  visibility?: string;
  category_id?: string;
}

/** What create and edit send. Ids are strings — a bigint does not survive JSON. */
export interface NewsInput {
  title: string;
  slug?: string;
  excerpt: string;
  body: string;
  cover_image_alt?: string | null;
  category_id?: string | null;
  visibility: number;
}

export interface CategoryInput {
  code: string;
  name: string;
  slug?: string;
  display_order: number;
  is_active: boolean;
}

/**
 * Where the API lives. The same value `BaseService` builds its client from.
 *
 * Needed here because two things in an article are addresses rather than data:
 * the pictures inside the body, and the files under it. Both are stored as
 * API-relative paths so the SAME markup serves the public site, the member view
 * and this panel — but a relative path in an `<img src>` resolves against
 * whatever origin the page came from, and this page did not come from the API.
 */
const API_ORIGIN = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000'
).replace(/\/+$/, ''); // A trailing slash in the env would produce //api/v1/…

const RELATIVE_PREFIX = '/api/v1/';

/**
 * What the editor is given: the stored markup with its image URLs made absolute.
 *
 * Display only. The body is written back through `toStoredHtml` below, so the
 * host this admin happens to be pointed at never reaches the database — which is
 * the whole reason the stored form is relative.
 */
export const toEditorHtml = (html: string): string =>
  html.replace(
    /(<img[^>]+src=")(\/api\/v1\/[^"]+)(")/g,
    (_match, before: string, path: string, after: string) =>
      `${before}${API_ORIGIN}${path}${after}`,
  );

/** The inverse: strip this environment's origin back off before saving. */
export const toStoredHtml = (html: string): string =>
  html.split(`${API_ORIGIN}${RELATIVE_PREFIX}`).join(RELATIVE_PREFIX);

/** An API path made loadable by this page — covers, downloads, inline pictures. */
export const absoluteUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;

  return /^https?:\/\//i.test(path) ? path : `${API_ORIGIN}${path}`;
};

const NewsService = {
  list: (params: NewsListParams) =>
    BaseService.get<{ articles: NewsRow[] }>(ENDPOINTS.NEWS.LIST, { params }),

  detail: (id: string) => BaseService.get<{ article: NewsDetail }>(ENDPOINTS.NEWS.detail(id)),

  create: (body: NewsInput) => BaseService.post<{ article: NewsRow }>(ENDPOINTS.NEWS.LIST, body),

  update: (id: string, body: NewsInput) =>
    BaseService.patch<{ article: NewsRow }>(ENDPOINTS.NEWS.detail(id), body),

  /*
    Three calls rather than one PATCH of `status`. Publishing runs checks that
    editing does not, unpublishing is a correction and archiving is a
    retirement — and the server records each under its own audit action.
  */
  publish: (id: string) => BaseService.post<{ article: NewsRow }>(ENDPOINTS.NEWS.publish(id)),

  unpublish: (id: string) => BaseService.post<{ article: NewsRow }>(ENDPOINTS.NEWS.unpublish(id)),

  archive: (id: string) => BaseService.post<{ article: NewsRow }>(ENDPOINTS.NEWS.archive(id)),

  remove: (id: string) => BaseService.delete<null>(ENDPOINTS.NEWS.detail(id)),

  /**
   * Uploads are their own calls, never part of the form's draft.
   *
   * The stored value is a key the server decides, so there is nothing for the
   * form to hold: the upload IS the save. Holding a File alongside the text
   * fields would mean either uploading on Save — and losing the picked file if
   * the save failed — or uploading twice.
   */
  uploadCover: (id: string, file: File) => {
    const body = new FormData();

    body.append('file', file);

    return BaseService.post<{ article: NewsRow }>(ENDPOINTS.NEWS.cover(id), body);
  },

  /** Adds one more file. Never replaces what is already attached. */
  uploadAttachment: (id: string, file: File) => {
    const body = new FormData();

    body.append('file', file);

    return BaseService.post<{ article: NewsRow; attachment: { id: string } }>(
      ENDPOINTS.NEWS.attachments(id),
      body,
    );
  },

  removeAttachment: (id: string, attachmentId: string) =>
    BaseService.delete<null>(ENDPOINTS.NEWS.attachment(id, attachmentId)),

  uploadImage: (id: string, file: File) => {
    const body = new FormData();

    body.append('file', file);

    return BaseService.post<{ image: NewsImage }>(ENDPOINTS.NEWS.images(id), body);
  },

  removeImage: (id: string, imageId: string) =>
    BaseService.delete<null>(ENDPOINTS.NEWS.image(id, imageId)),

  listCategories: (includeInactive = false) =>
    BaseService.get<{ categories: NewsCategory[] }>(ENDPOINTS.NEWS.CATEGORIES, {
      params: { include_inactive: includeInactive },
    }),

  createCategory: (body: CategoryInput) =>
    BaseService.post<{ category: NewsCategory }>(ENDPOINTS.NEWS.CATEGORIES, body),

  updateCategory: (id: string, body: Partial<CategoryInput>) =>
    BaseService.patch<{ category: NewsCategory }>(ENDPOINTS.NEWS.category(id), body),

  removeCategory: (id: string) => BaseService.delete<null>(ENDPOINTS.NEWS.category(id)),

  /**
   * The cover and the attachment, fetched with the staff token.
   *
   * The public URLs on the row answer 404 for a draft or a members-only
   * article — correct for a stranger, useless for the person writing it. An
   * `<img src>` cannot carry an Authorization header, so the bytes come back as
   * a blob and the caller renders an object URL from it.
   */
  fetchCover: async (id: string): Promise<Blob> =>
    (await http.get<Blob>(ENDPOINTS.NEWS.cover(id), { responseType: 'blob' })).data,

  fetchAttachment: async (id: string, attachmentId: string): Promise<Blob> =>
    (await http.get<Blob>(ENDPOINTS.NEWS.attachment(id, attachmentId), { responseType: 'blob' }))
      .data,
};

export default NewsService;
