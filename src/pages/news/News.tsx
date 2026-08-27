import { PlusOutlined } from '@ant-design/icons';
import { Archive, Pencil, Rocket, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  DateCell,
  FilterDropdown,
  FilterGroup,
  MultiSelect,
  NotAvailable,
  PageHeader,
  RowActions,
  SearchInput,
  StatusChip,
  TextCell,
  toast,
} from '@/components/ui';
import { useConfirm } from '@/hooks/useConfirm';
import { usePermissions } from '@/hooks/usePermissions';
import ArticleDrawer from '@/pages/news/ArticleDrawer';
import NewsService, {
  NEWS_STATUS,
  NEWS_VISIBILITY,
  type NewsCategory,
  type NewsRow,
} from '@/services/newsService';
import type { PaginationMeta } from '@/services/BaseService';

/**
 * A-37 — news.
 *
 * Two tabs: the articles, and the categories they are filed under. A category
 * only means something as a filter on the article list, and an admin setting the
 * section up moves between the two constantly — the same reason Categories and
 * Tiers share a page.
 *
 * The lifecycle lives here rather than in the editor drawer. Publish, retire and
 * delete are decisions about an article that already exists; putting them beside
 * Save would leave "fix my typo" and "put this on the public website" one press
 * apart.
 */

interface ApiError {
  message: string;
  requestId?: string;
}

const asError = (error: unknown): ApiError => {
  const err = error as { message?: string; requestId?: string };

  return {
    message: err?.message ?? 'Something went wrong',
    ...(err?.requestId ? { requestId: err.requestId } : {}),
  };
};

/**
 * A descriptor goes up to the tab row, not a rendered button: a node rebuilt on
 * every render would set parent state on every render.
 */
export interface CreateAction {
  label: string;
  onClick: () => void;
  disabledReason?: string;
}

export interface TabBodyProps {
  onRegisterCreate?: (action: CreateAction | null) => void;
  onRegisterSearch?: (node: ReactNode) => void;
}

const STATUS_NAME: Record<number, string> = {
  [NEWS_STATUS.DRAFT]: 'DRAFT',
  [NEWS_STATUS.PUBLISHED]: 'PUBLISHED',
  [NEWS_STATUS.ARCHIVED]: 'ARCHIVED',
};

const VISIBILITY_NAME: Record<number, string> = {
  [NEWS_VISIBILITY.MEMBER_ONLY]: 'MEMBER_ONLY',
  [NEWS_VISIBILITY.PUBLIC]: 'PUBLIC',
};

interface NewsFilters {
  status: string[];
  visibility: string[];
  category: string[];
}

const EMPTY_FILTERS: NewsFilters = { status: [], visibility: [], category: [] };

const ArticlesTab = ({ onRegisterCreate, onRegisterSearch }: TabBodyProps) => {
  const { can } = usePermissions();
  const canManage = can('news.manage');

  const [rows, setRows] = useState<NewsRow[]>([]);
  const [categories, setCategories] = useState<NewsCategory[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<NewsFilters>(EMPTY_FILTERS);
  const [editing, setEditing] = useState<NewsRow | null>(null);
  const [open, setOpen] = useState(false);

  const publish = useConfirm<NewsRow>();
  const unpublish = useConfirm<NewsRow>();
  const archive = useConfirm<NewsRow>();
  const remove = useConfirm<NewsRow>();

  /*
    Read as strings, not arrays: an array is rebuilt on every render, so a `load`
    that depended on it would refetch forever.
  */
  const statusParam = filters.status.join(',');
  const visibilityParam = filters.visibility.join(',');
  const categoryParam = filters.category.join(',');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Server-side, always: a filter has to match rows on pages nobody has
      // fetched, which a client-side pass over the current twenty cannot.
      const res = await NewsService.list({
        page,
        limit: 20,
        ...(search ? { search } : {}),
        ...(statusParam ? { status: statusParam } : {}),
        ...(visibilityParam ? { visibility: visibilityParam } : {}),
        ...(categoryParam ? { category_id: categoryParam } : {}),
      });

      setRows(res.data.articles);
      setPagination(res.pagination);
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, statusParam, visibilityParam, categoryParam]);

  useEffect(() => {
    void load();
  }, [load]);

  /* The drawer's category dropdown and the filter panel read the same list. */
  useEffect(() => {
    void (async () => {
      try {
        const res = await NewsService.listCategories(false);

        setCategories(res.data.categories);
      } catch {
        // A missing category list is not worth a toast on load: the dropdown
        // simply offers nothing, and the article saves uncategorised.
      }
    })();
  }, []);

  /*
    A new query starts at page one. Staying on page four while the filter cuts
    the list to six rows shows an empty table, which reads as "no matches"
    rather than "you are past the end".
  */
  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);

  const applyFilters = useCallback((next: NewsFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const activeFilterCount =
    (filters.status.length > 0 ? 1 : 0) +
    (filters.visibility.length > 0 ? 1 : 0) +
    (filters.category.length > 0 ? 1 : 0);

  useEffect(() => {
    onRegisterSearch?.(
      <>
        <SearchInput
          value={search}
          onChange={onSearch}
          label="Search news"
          placeholder="Search headline or summary…"
          className="w-[240px]"
        />

        <FilterDropdown<NewsFilters>
          value={filters}
          emptyValue={EMPTY_FILTERS}
          activeCount={activeFilterCount}
          onApply={applyFilters}
          onClear={clearFilters}
        >
          {(draft, setDraft) => (
            <>
              <FilterGroup label="Status">
                <MultiSelect
                  value={draft.status}
                  placeholder="Any status"
                  onChange={(next) => setDraft((d) => ({ ...d, status: next.map(String) }))}
                  options={[
                    { value: String(NEWS_STATUS.DRAFT), label: 'Draft' },
                    { value: String(NEWS_STATUS.PUBLISHED), label: 'Published' },
                    { value: String(NEWS_STATUS.ARCHIVED), label: 'Retired' },
                  ]}
                />
              </FilterGroup>

              <FilterGroup label="Who Can Read It">
                <MultiSelect
                  value={draft.visibility}
                  placeholder="Anyone"
                  onChange={(next) => setDraft((d) => ({ ...d, visibility: next.map(String) }))}
                  options={[
                    { value: String(NEWS_VISIBILITY.PUBLIC), label: 'Public' },
                    { value: String(NEWS_VISIBILITY.MEMBER_ONLY), label: 'Members only' },
                  ]}
                />
              </FilterGroup>

              <FilterGroup label="Category">
                <MultiSelect
                  value={draft.category}
                  placeholder="Any category"
                  onChange={(next) => setDraft((d) => ({ ...d, category: next.map(String) }))}
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                />
              </FilterGroup>
            </>
          )}
        </FilterDropdown>
      </>,
    );

    return () => onRegisterSearch?.(null);
  }, [
    search,
    onSearch,
    onRegisterSearch,
    filters,
    applyFilters,
    clearFilters,
    activeFilterCount,
    categories,
  ]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setOpen(true);
  }, []);

  const createAction = useMemo<CreateAction | null>(
    () => (canManage ? { label: 'Write Article', onClick: openCreate } : null),
    [canManage, openCreate],
  );

  useEffect(() => {
    onRegisterCreate?.(createAction);

    return () => onRegisterCreate?.(null);
  }, [createAction, onRegisterCreate]);

  const runTransition = async (
    row: NewsRow,
    call: (id: string) => Promise<unknown>,
    message: string,
  ) => {
    try {
      await call(row.id);
      toast.success(message);
      await load();
    } catch (err) {
      toast.error(asError(err).message);
    }
  };

  return (
    <>
      <Card flush className="min-h-0 flex-1">
        <DataTable<NewsRow>
          unit="articles"
          serial
          rowKey="id"
          loading={loading}
          error={error}
          onRetry={() => void load()}
          pagination={pagination}
          onPageChange={setPage}
          dataSource={rows}
          filtered={Boolean(search) || activeFilterCount > 0}
          onClearFilter={() => {
            onSearch('');
            clearFilters();
          }}
          emptyTitle="No news yet"
          emptyDescription="An article starts as a draft: write it, add a cover image, then publish it to put it on the website."
          emptyAction={canManage ? <Button onClick={openCreate}>Write Article</Button> : undefined}
          columns={[
            {
              /*
                Headline and summary are two columns, not a stacked pair. They
                are different lengths and different jobs — one identifies the
                article, the other says what it covers — and a reader scanning
                for one should not have to read past the other. `TextCell` gives
                each the same treatment: one line, clipped, the whole thing on
                hover, and the search term marked inside it.
              */
              title: 'Headline',
              dataIndex: 'title',
              width: 300,
              render: (value: string) => <TextCell value={value} query={search} width={276} />,
            },
            {
              title: 'Summary',
              dataIndex: 'excerpt',
              width: 320,
              render: (value: string) => <TextCell value={value} query={search} width={296} />,
            },
            {
              title: 'Category',
              dataIndex: 'category',
              width: 180,
              render: (value: NewsRow['category']) =>
                value ? <TextCell value={value.name} /> : <NotAvailable />,
            },
            {
              title: 'Published',
              dataIndex: 'published_at',
              width: 140,
              render: (value: string | null) =>
                value ? <DateCell value={value} /> : <NotAvailable />,
            },
            {
              title: 'Who Can Read It',
              dataIndex: 'visibility',
              width: 150,
              render: (value: number) => (
                <StatusChip domain="newsVisibility" status={VISIBILITY_NAME[value] ?? 'PUBLIC'} />
              ),
            },
            {
              // No width: this column absorbs the slack, so the headline keeps
              // the space it was given instead of stretching.
              title: 'Status',
              dataIndex: 'status',
              render: (value: number) => (
                <StatusChip domain="news" status={STATUS_NAME[value] ?? 'DRAFT'} />
              ),
            },
            /*
              Who wrote it and who last touched it, each beside its own date.
              On a screen several people share, "published last Tuesday" is only
              half the question — the other half is who to ask about it.
            */
            {
              title: 'Created',
              dataIndex: 'created_at',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              title: 'Created By',
              dataIndex: 'created_by',
              width: 160,
              render: (value: string | null) => <TextCell value={value} width={136} />,
            },
            {
              title: 'Updated',
              dataIndex: 'updated_at',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              title: 'Updated By',
              dataIndex: 'updated_by',
              width: 160,
              render: (value: string | null) => <TextCell value={value} width={136} />,
            },
            {
              title: 'Actions',
              width: 80,
              fixed: 'right' as const,
              render: (_: unknown, row: NewsRow) => (
                <RowActions
                  actions={[
                    {
                      key: 'edit',
                      icon: <Pencil size={15} strokeWidth={1.5} />,
                      label: 'Edit',
                      hidden: !canManage,
                      onClick: () => {
                        setEditing(row);
                        setOpen(true);
                      },
                    },
                    {
                      key: 'publish',
                      icon: <Rocket size={15} strokeWidth={1.5} />,
                      label: 'Publish',
                      success: true,
                      hidden: !canManage || row.status === NEWS_STATUS.PUBLISHED,
                      ...(row.cover_url
                        ? {}
                        : {
                            disabled: true,
                            disabledReason: 'Add a cover image first — the card needs a picture.',
                          }),
                      onClick: () => publish.ask(row),
                    },
                    {
                      key: 'unpublish',
                      icon: <Undo2 size={15} strokeWidth={1.5} />,
                      label: 'Move back to draft',
                      hidden: !canManage || row.status !== NEWS_STATUS.PUBLISHED,
                      onClick: () => unpublish.ask(row),
                    },
                    {
                      key: 'archive',
                      icon: <Archive size={15} strokeWidth={1.5} />,
                      label: 'Retire',
                      hidden:
                        !canManage ||
                        row.status === NEWS_STATUS.DRAFT ||
                        row.status === NEWS_STATUS.ARCHIVED,
                      onClick: () => archive.ask(row),
                    },
                    /*
                      "Open on the website" removed at the client's request.

                      It only ever applied to a published, public article, so it
                      was absent from most rows — and an action that appears on
                      some rows and not others is read as something being wrong
                      with the rows that lack it. The article's address is on the
                      public site, which is where anyone checking it is going
                      anyway.

                    {
                      key: 'view',
                      icon: <ExternalLink size={15} strokeWidth={1.5} />,
                      label: 'Open on the website',
                      hidden:
                        row.status !== NEWS_STATUS.PUBLISHED ||
                        row.visibility !== NEWS_VISIBILITY.PUBLIC,
                      onClick: () => window.open(`/news/${row.slug}`, '_blank', 'noopener'),
                    },
                    */
                    {
                      key: 'remove',
                      icon: <Trash2 size={15} strokeWidth={1.5} />,
                      label: 'Delete',
                      danger: true,
                      // Drafts only. Anything that has been public is retired
                      // instead, so the record of what was said survives.
                      hidden: !canManage || row.status !== NEWS_STATUS.DRAFT,
                      onClick: () => remove.ask(row),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      <ConfirmDialog
        open={publish.target !== null}
        title={`Publish "${publish.target?.title ?? 'this article'}"?`}
        description={
          publish.target?.visibility === NEWS_VISIBILITY.MEMBER_ONLY
            ? 'It appears in the news list for signed-in members. The public website will not show it.'
            : 'It goes on the public website immediately — the homepage Newsroom block, the news page, and search engines.'
        }
        confirmLabel="Publish"
        loading={publish.busy}
        onCancel={publish.cancel}
        onConfirm={() =>
          publish.confirm((row) => runTransition(row, NewsService.publish, 'Article published'))
        }
      />

      <ConfirmDialog
        open={unpublish.target !== null}
        title={`Move "${unpublish.target?.title ?? 'this article'}" back to draft?`}
        description="It comes off the website straight away and stops appearing anywhere public. Its address is kept, so publishing it again restores the same link."
        confirmLabel="Move to draft"
        loading={unpublish.busy}
        onCancel={unpublish.cancel}
        onConfirm={() =>
          unpublish.confirm((row) =>
            runTransition(row, NewsService.unpublish, 'Moved back to draft'),
          )
        }
      />

      <ConfirmDialog
        open={archive.target !== null}
        title={`Retire "${archive.target?.title ?? 'this article'}"?`}
        description="It comes off the website but stays here and in the record. Use this for old news rather than deleting it."
        confirmLabel="Retire"
        loading={archive.busy}
        onCancel={archive.cancel}
        onConfirm={() =>
          archive.confirm((row) => runTransition(row, NewsService.archive, 'Article retired'))
        }
      />

      <ConfirmDialog
        open={remove.target !== null}
        title={`Delete "${remove.target?.title ?? 'this draft'}"?`}
        description="The draft and its uploaded pictures are removed. Only drafts can be deleted — anything that has been on the website is retired instead."
        confirmLabel="Delete"
        loading={remove.busy}
        onCancel={remove.cancel}
        onConfirm={() =>
          remove.confirm((row) => runTransition(row, NewsService.remove, 'Draft deleted'))
        }
      />

      <ArticleDrawer
        open={open}
        editing={editing}
        categories={categories}
        onClose={() => setOpen(false)}
        onSaved={() => void load()}
      />
    </>
  );
};

export const News = () => {
  /*
    Search and create are registered up from the list so they sit on the page
    header rather than claiming a row of their own. Stable callbacks, or the
    child's registering effects would re-run on every parent render.

    Categories used to be a second tab here. They moved to Masters ▸ News
    Categories: a category is configuration the association sets up once, not
    work anybody does daily, and it belongs beside Event Types and Company Types
    where every other master of its kind already lives.
  */
  const [create, setCreate] = useState<CreateAction | null>(null);
  const [searchBox, setSearchBox] = useState<ReactNode>(null);

  const register = useCallback((action: CreateAction | null) => setCreate(action), []);
  const registerSearch = useCallback((node: ReactNode) => setSearchBox(node), []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="News"
        actions={
          <>
            {searchBox}
            {create ? (
              <Button variant="primary" icon={<PlusOutlined />} onClick={create.onClick}>
                {create.label}
              </Button>
            ) : null}
          </>
        }
      />

      <ArticlesTab onRegisterCreate={register} onRegisterSearch={registerSearch} />
    </div>
  );
};

export default News;
