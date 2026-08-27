import { Table as AntTable, type TableProps } from 'antd';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { ColumnType } from 'antd/es/table';
import type { SortOrder } from 'antd/es/table/interface';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import Button from './Button';
import EmptyState from './EmptyState';
import { InlineSelect } from './Select';
import ErrorState from './ErrorState';
import Skeleton from './Skeleton';
import type { PaginationMeta } from '@/services/BaseService';

/** The sort the server is currently applying. `sortBy` is a column key. */
export interface TableSort {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

/*
  `summary` is omitted, not inherited. AntD's `summary` is a render function for
  a pinned footer ROW inside the table; ours is a node for the left half of the
  footer BAR outside it. Same name, different thing — so the base type has to be
  dropped rather than narrowed, which is what the compiler was objecting to.
*/
export interface DataTableProps<T> extends Omit<
  TableProps<T>,
  'pagination' | 'loading' | 'summary'
> {
  loading?: boolean;
  error?: { message: string; requestId?: string } | null;
  onRetry?: () => void;
  /** Server pagination meta straight from the response envelope. */
  pagination?: PaginationMeta;
  onPageChange?: (page: number, pageSize: number) => void;
  /**
   * Active server sort. Supplying it marks the matching column as sorted, so the
   * caret shows the real ordering on first paint rather than after a click.
   */
  sort?: TableSort;
  /**
   * Fired when the operator changes the sort. `null` means they cycled the
   * column off and the list should fall back to its default order — the page
   * owns that default, because only it knows what the list is *for*.
   */
  onSortChange?: (sort: TableSort | null) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /**
   * Whether a search or filter is narrowing the list. It swaps the empty state
   * for one that says "nothing MATCHED" rather than "nothing exists" — two
   * different situations with two different next steps, and an empty list that
   * blames the data when the filter is at fault is how people conclude a screen
   * is broken.
   */
  filtered?: boolean;
  /** Clears that filter from inside the empty state. Rendered only when `filtered`. */
  onClearFilter?: () => void;
  /** Shown above the table when rows are selected. */
  selectionBar?: ReactNode;
  /**
   * Left half of the footer bar — counts, totals, whatever the page can say
   * about the whole set rather than the current page. The right half (range and
   * pagination) is built from the envelope and is not a caller's business.
   */
  summary?: ReactNode;
  /**
   * Plural noun for the range line: "Showing 1–20 of 42 members". Left out, it
   * reads "Showing 1–20 of 42", which is correct but anonymous on a screen with
   * more than one list.
   */
  unit?: string;
  /**
   * Prepend a serial-number column. It counts from the page offset, so row 1 of
   * page 3 at 20/page is 41 — a position in the LIST, not in the array, which is
   * the only reading that survives paging.
   */
  serial?: boolean;
}

const ANT_ORDER: Record<'asc' | 'desc', SortOrder> = { asc: 'ascend', desc: 'descend' };

/**
 * Server-paginated table with all four states handled in one place
 * (design-system.md §2): loading, error, empty and populated.
 *
 * Pagination is **server-side** by contract — `total` comes from the envelope,
 * never from `data.length`. AntD's client-side default would silently paginate
 * only the current page and show the wrong total.
 *
 * Sorting is server-side for the same reason: a `sorter` function would reorder
 * the twenty rows currently on screen and call it sorted, which is a lie the
 * operator only discovers on page two (tables.md).
 */
export const DataTable = <T extends object>({
  loading = false,
  error = null,
  onRetry,
  pagination,
  onPageChange,
  sort,
  onSortChange,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  filtered = false,
  onClearFilter,
  selectionBar,
  summary,
  unit,
  serial = false,
  dataSource,
  columns,
  onRow,
  ...rest
}: DataTableProps<T>) => {
  /*
    The height AntD should give its own scrolling body, measured rather than
    guessed.

    Passing `scroll.y` is what makes AntD split the header off into its own
    table and give the body a fixed box that scrolls in BOTH directions. Two
    things follow from that, and neither is achievable without it:

     - the horizontal scrollbar sits on the bottom edge of that box — directly
       above the pagination bar — instead of under the last row, where on a
       short list it floated mid-card and on a long one you had to scroll to the
       end of the data to reach the control for scrolling sideways;
     - the header is genuinely fixed, by AntD's own mechanism, rather than by a
       `sticky` prop pointed at a container that only scrolls one way.

    `y` is the container less the header, because AntD stacks the two and the
    pair has to fit the space the card gives us.
  */
  const [bodyHeight, setBodyHeight] = useState<number>();
  const observerRef = useRef<ResizeObserver | null>(null);

  /*
    A callback ref, not an effect over a ref object.

    The first render of a list is the loading skeleton, and it returns before
    this box exists — so a `useEffect(..., [])` ran once against a null ref, gave
    up, and never fired again once the rows arrived. `y` stayed undefined, AntD
    never split the header off, and the whole fill mechanism below was measuring
    an element that was not there. A callback ref runs when the node itself
    appears, whichever render that turns out to be.
  */
  const measureRef = useCallback((container: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!container) return;

    const measure = () => {
      const header = container.querySelector<HTMLElement>('.ant-table-header');

      setBodyHeight(Math.max(0, container.clientHeight - (header?.offsetHeight ?? 0)));
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(container);
    observerRef.current = observer;
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <ErrorState description={error.message} requestId={error.requestId} onRetry={onRetry} />
      </div>
    );
  }

  if (loading && (!dataSource || dataSource.length === 0)) {
    return <Skeleton variant="table" rows={6} />;
  }

  /*
    AntD's own pagination is off. It renders as one right-aligned strip with the
    range wedged inside the control group, which leaves the left half of the
    footer empty and gives a page nowhere to put what it knows about the whole
    set. The bar below splits the two: what this IS on the left, where you are
    in it on the right.
  */
  /*
    `1`, not `0`, when there is no pagination. `from` is the number of the first
    row on screen, and the serial column renders `from + index` — so an
    unpaginated table numbered its rows 0, 1, 2. An unpaginated table is one
    complete page, and the first row on it is the first row.

    The footer never sees this value: `showFooter` requires `pagination`.
  */
  const from = pagination ? (pagination.page - 1) * pagination.limit + 1 : 1;
  const to = pagination ? Math.min(pagination.page * pagination.limit, pagination.total) : 0;
  const showFooter = Boolean(pagination && pagination.total > 0);

  /**
   * Push the active sort onto the column it belongs to. Without this the table
   * is a controlled component with no controlled value: every column renders
   * unsorted and the caret contradicts the rows underneath it.
   */
  const withSerial =
    serial && columns
      ? [
          {
            title: 'Sr.',
            key: '__serial',
            width: 64,
            render: (_: unknown, __: T, index: number) => (
              <span className="tabular text-fg-muted">{from + index}</span>
            ),
          } as ColumnType<T>,
          ...columns,
        ]
      : columns;

  const sortedColumns = sort
    ? withSerial?.map((column) => {
        const single = column as ColumnType<T>;

        if (!single.sorter) return column;

        const key = String(single.key ?? single.dataIndex ?? '');

        return {
          ...column,
          sortOrder: key === sort.sortBy ? ANT_ORDER[sort.sortOrder] : null,
        };
      })
    : withSerial;

  /**
   * Turn the columns' pixel widths into shares of the table.
   *
   * `scroll.x` puts the table in `table-layout: fixed`, where a declared width
   * is taken literally and any leftover space is dumped into whichever column
   * did not declare one. On a laptop that is invisible; on a 2560px monitor it
   * put ~1100px of blank table into a single column while every other column
   * stayed at its laptop size, and a row a metre wide is hunted rather than
   * read.
   *
   * Restated as percentages of the declared total, the same numbers become
   * proportions: every column keeps its relative share and they grow together
   * to fill whatever width they are given. `scroll.x` stays at the pixel total,
   * so it is still the width below which the table scrolls sideways instead of
   * crushing its columns.
   *
   * Only kicks in when EVERY column has declared a width. A mixed set is a page
   * deliberately nominating one column to absorb the slack, and taking that over
   * would be surprising.
   */
  const { fluidColumns, minTableWidth } = ((): {
    fluidColumns: typeof sortedColumns;
    minTableWidth: number | 'max-content';
  } => {
    const cols = (sortedColumns ?? []) as ColumnType<T>[];

    // Not memoised on purpose: it is a map over a handful of columns, and the
    // early returns above mean a hook here would break the rules-of-hooks order.
    if (cols.length === 0 || !cols.every((column) => typeof column.width === 'number')) {
      return { fluidColumns: sortedColumns, minTableWidth: 'max-content' };
    }

    const total = cols.reduce((sum, column) => sum + (column.width as number), 0);

    return {
      fluidColumns: cols.map((column) => ({
        ...column,
        width: `${(((column.width as number) / total) * 100).toFixed(4)}%`,
      })),
      minTableWidth: total,
    };
  })();

  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : 1;

  const goTo = (page: number) => {
    if (!pagination || page < 1 || page > pageCount || page === pagination.page) return;
    onPageChange?.(page, pagination.limit);
  };

  const STEP =
    'grid h-7 w-7 place-items-center rounded-md border-0 bg-transparent text-fg-muted transition-colors duration-100 enabled:cursor-pointer enabled:hover:bg-surface-hover enabled:hover:text-fg disabled:cursor-not-allowed disabled:text-fg-subtle';

  /*
    The numbered row itself, not just the current page. A lone highlighted
    number with only chevrons around it hides how long the list is — page 2
    of 2 and page 2 of 40 looked identical. Close in, every page is shown; far
    from either end, an ellipsis stands in for the run between the edge and
    the current neighbourhood so the row stays a constant width.
  */
  const PAGE_WINDOW = 1;

  const pageItems: (number | 'ellipsis')[] = (() => {
    if (pageCount <= 1) return [1];

    const current = pagination?.page ?? 1;
    const left = Math.max(2, current - PAGE_WINDOW);
    const right = Math.min(pageCount - 1, current + PAGE_WINDOW);

    const items: (number | 'ellipsis')[] = [1];

    if (left > 2) items.push('ellipsis');
    for (let page = left; page <= right; page += 1) items.push(page);
    if (right < pageCount - 1) items.push('ellipsis');
    if (pageCount > 1) items.push(pageCount);

    return items;
  })();

  return (
    /*
      A column that fills its card: the rows take the slack and scroll inside it,
      and the footer sits on the bottom edge. Before this the whole thing was
      content-height, so on a short list the pagination floated in the middle of
      the card and on a long one it scrolled off the screen entirely — you had to
      reach the end of the data to find the control that takes you past it.
    */
    <div className="flex h-full min-h-0 flex-col">
      {selectionBar ? (
        <div className="mb-2 flex items-center gap-3 rounded-md border border-border bg-surface-subtle px-3 py-2 text-supporting">
          {selectionBar}
        </div>
      ) : null}

      {/* The box AntD measures itself against; it does not scroll, its body does. */}
      <div ref={measureRef} className="min-h-0 flex-1 overflow-hidden">
        <AntTable<T>
          /*
            A row click that opens a record must not fire when the user was
            selecting text in it.

            Highlighting a GST number to copy it ends in a `click` on the row,
            and on a clickable row that navigated away mid-drag — the value gone
            before it could be copied, and no way to tell it from a misclick.
            Guarded here rather than in each page so no table can forget it:
            every `onClick` a caller returns from `onRow` is wrapped.
          */
          onRow={
            onRow
              ? (record, index) => {
                  const handlers = onRow(record, index);
                  const click = handlers.onClick;

                  if (!click) return handlers;

                  return {
                    ...handlers,
                    onClick: (event) => {
                      const selection = window.getSelection();

                      if (selection && !selection.isCollapsed && selection.toString().trim()) {
                        return;
                      }

                      click(event);
                    },
                  };
                }
              : undefined
          }
          /* Hook for the fill rules in `index.css` — see the note there. */
          className="data-table"
          size="middle"
          /*
          Zebra banding, painted in `index.css`. It is index-based rather than
          `:nth-child`, because a page that renders an expanded row or a summary
          row would throw the CSS count off while this stays tied to the data.
        */
          rowClassName={(_record: T, index: number) =>
            index % 2 === 1 ? 'table-row-odd' : 'table-row-even'
          }
          rowKey={(record: T) => String((record as { id?: unknown }).id)}
          dataSource={dataSource}
          columns={fluidColumns}
          loading={loading}
          pagination={false}
          scroll={{ x: minTableWidth, y: bodyHeight }}
          onChange={(_pagination, _filters, sorter, extra) => {
            // The same callback fires for paging and filtering; pagination has its
            // own handler, so anything that is not a sort is somebody else's event.
            if (extra.action !== 'sort' || !onSortChange) return;

            const active = Array.isArray(sorter) ? sorter[0] : sorter;
            const key = active?.columnKey ?? active?.field;

            if (!active?.order || !key) {
              onSortChange(null);

              return;
            }

            onSortChange({
              sortBy: String(key),
              sortOrder: active.order === 'ascend' ? 'asc' : 'desc',
            });
          }}
          locale={{
            emptyText: filtered ? (
              <EmptyState
                title="No matching items"
                description="Nothing here matches your current search or filters. Clearing them brings the list back."
                action={
                  onClearFilter ? <Button onClick={onClearFilter}>Clear all</Button> : undefined
                }
              />
            ) : (
              <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
            ),
          }}
          {...rest}
        />
      </div>

      {showFooter && pagination ? (
        <div className="flex flex-none flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-3 py-2">
          <div className="flex min-w-0 items-center gap-3 text-supporting text-fg-muted">
            {summary}
          </div>

          <div className="flex flex-none items-center gap-2">
            <span className="text-supporting text-fg-muted">
              Showing {from}–{to} of {pagination.total}
              {unit ? ` ${unit}` : ''}
            </span>

            {/*
              First / previous / page / next / last, built here rather than taken
              from AntD's `Pagination`. AntD offers no first-or-last control at
              all — its `«` and `»` jump five pages, which on a 40-page list is
              eight clicks to the end and no way to tell you have arrived. The
              page number is a label, not a list: with server paging the only
              page whose contents are known is this one.
            */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="First page"
                className={STEP}
                disabled={pagination.page <= 1}
                onClick={() => goTo(1)}
              >
                <ChevronsLeft size={16} strokeWidth={1.5} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Previous page"
                className={STEP}
                disabled={pagination.page <= 1}
                onClick={() => goTo(pagination.page - 1)}
              >
                <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
              </button>

              {pageItems.map((item, index) =>
                item === 'ellipsis' ? (
                  <span
                    /*
                      An index key, deliberately. The ellipsis is a gap marker,
                      not a record — it has no identity of its own, and the only
                      thing distinguishing the two that can appear is where they
                      sit. `react/no-array-index-key` is not configured in this
                      project, so the disable directive that used to sit here was
                      itself the lint error.
                    */
                    key={`ellipsis-${index}`}
                    className="grid h-7 w-7 place-items-center text-supporting text-fg-subtle"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    aria-label={`Page ${item}`}
                    aria-current={item === pagination.page ? 'page' : undefined}
                    className={
                      item === pagination.page
                        ? 'grid h-7 min-w-[28px] place-items-center rounded-md border-0 bg-primary px-1.5 text-supporting font-medium text-primary-fg'
                        : `${STEP} min-w-[28px] px-1.5`
                    }
                    onClick={() => goTo(item)}
                  >
                    {item}
                  </button>
                ),
              )}

              <button
                type="button"
                aria-label="Next page"
                className={STEP}
                disabled={pagination.page >= pageCount}
                onClick={() => goTo(pagination.page + 1)}
              >
                <ChevronRight size={16} strokeWidth={1.5} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Last page"
                className={STEP}
                disabled={pagination.page >= pageCount}
                onClick={() => goTo(pageCount)}
              >
                <ChevronsRight size={16} strokeWidth={1.5} aria-hidden />
              </button>
            </div>

            <InlineSelect<number>
              label="Rows per page"
              value={pagination.limit}
              // api-conventions.md §6: limit is capped at 100 server-side.
              options={[20, 50, 100].map((n) => ({ value: n, label: `${n} / page` }))}
              // Changing the page size from deep in a list would land on a page
              // that may no longer exist; page 1 always does.
              onChange={(limit) => onPageChange?.(1, limit)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DataTable;
