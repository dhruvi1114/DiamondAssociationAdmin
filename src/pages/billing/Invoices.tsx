import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import { Download } from 'lucide-react';
import {
  Card,
  DataTable,
  DateCell,
  FilterDropdown,
  FilterGroup,
  Highlight,
  MoneyText,
  MultiSelect,
  NotAvailable,
  PageHeader,
  RowActions,
  SearchInput,
  StatusChip,
} from '@/components/ui';
import type { TableSort } from '@/components/ui';
import InvoicesService, {
  type InvoiceListRow,
  type InvoiceSortBy,
  type InvoiceStatus,
} from '@/services/invoicesService';
import type { PaginationMeta } from '@/services/BaseService';
import { asDisplayError, type DisplayError } from '@/utils/apiError';

/**
 * A-14 — every invoice across every member, so Accounts can answer "who is
 * behind on payment" without opening one member at a time. The per-member
 * card on the profile screen (M4) stays as the place to act on a single
 * invoice; this page is purely for finding one.
 */

const STATUS_OPTIONS: Array<{ value: InvoiceStatus; label: string }> = [
  { value: 'ISSUED', label: 'Issued' },
  { value: 'PARTIALLY_PAID', label: 'Partially paid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const DEFAULT_SORT: TableSort = { sortBy: 'issue_date', sortOrder: 'desc' };
const SORTABLE: InvoiceSortBy[] = ['issue_date', 'due_date', 'total_amount', 'invoice_number'];
const isSortable = (value: string): value is InvoiceSortBy =>
  (SORTABLE as string[]).includes(value);

interface InvoiceFilters {
  status: InvoiceStatus[];
  /** `YYYY-MM-DD`, or '' for an open end. Strings, not dayjs — they go straight
      into the URL and straight onto the query string. */
  issuedFrom: string;
  issuedTo: string;
}

const EMPTY_FILTERS: InvoiceFilters = { status: [], issuedFrom: '', issuedTo: '' };

export const Invoices = () => {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<InvoiceListRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DisplayError | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const search = params.get('q') ?? '';
  const statuses = (params.get('status') ?? '').split(',').filter(Boolean) as InvoiceStatus[];
  const page = Number(params.get('page') ?? '1') || 1;
  const sortByParam = params.get('sortBy') ?? '';
  const sort: TableSort = {
    sortBy: isSortable(sortByParam) ? sortByParam : DEFAULT_SORT.sortBy,
    sortOrder: params.get('sortOrder') === 'asc' ? 'asc' : 'desc',
  };

  const issuedFrom = params.get('issuedFrom') ?? '';
  const issuedTo = params.get('issuedTo') ?? '';

  const hasFilters = Boolean(search || statuses.length || issuedFrom || issuedTo);
  const filters: InvoiceFilters = { status: statuses, issuedFrom, issuedTo };
  /* Status is one filter however many values it holds; the window is a second. */
  const activeFilterCount = (statuses.length ? 1 : 0) + (issuedFrom || issuedTo ? 1 : 0);

  const patchParams = useCallback(
    (patch: Record<string, string | null>, options?: { keepPage?: boolean }) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          Object.entries(patch).forEach(([key, value]) => {
            if (value === null || value === '') next.delete(key);
            else next.set(key, value);
          });
          if (!options?.keepPage) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await InvoicesService.list({
        page,
        limit: 20,
        ...(search ? { search } : {}),
        ...(statuses.length ? { status: statuses.join(',') } : {}),
        ...(issuedFrom ? { issued_from: issuedFrom } : {}),
        ...(issuedTo ? { issued_to: issuedTo } : {}),
        sortBy: sort.sortBy as InvoiceSortBy,
        sortOrder: sort.sortOrder,
      });
      setRows(result.data);
      setPagination(result.pagination);
    } catch (caught) {
      setError(asDisplayError(caught));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, params.get('status'), issuedFrom, issuedTo, sort.sortBy, sort.sortOrder]);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadPdf = useCallback(async (row: InvoiceListRow) => {
    setDownloadingId(row.id);
    try {
      await InvoicesService.downloadInvoicePdf(row.id, `${row.invoice_number}.pdf`);
    } finally {
      setDownloadingId(null);
    }
  }, []);

  /**
   * The search runs on the server (`invoice_number`, `company_name`,
   * `member_code` — see `listInvoices` in the member repository), so the three
   * columns it matches on are the three that mark the hit. Highlighting a column
   * the query cannot match would claim a match that is not there.
   */
  const columns = useMemo(
    () => [
      {
        title: 'Invoice',
        dataIndex: 'invoice_number',
        key: 'invoice_number',
        sorter: true,
        width: 160,
        render: (value: string) => (
          <span className="font-mono text-supporting text-fg">
            <Highlight text={value} query={search} />
          </span>
        ),
      },
      {
        title: 'Member',
        dataIndex: 'company_name',
        key: 'company_name',
        width: 200,
        render: (value: string) => <Highlight text={value} query={search} />,
      },
      {
        /*
          Its own column, not the second line of Member. It is the reference
          Accounts is given over the phone — "invoice for LGDGF/2026/0001" — and
          a value people search by and read off is a column, not a caption.
        */
        title: 'Member Code',
        dataIndex: 'member_code',
        key: 'member_code',
        width: 190,
        render: (value: string | null) =>
          value ? (
            <span className="font-mono text-supporting text-fg-muted">
              <Highlight text={value} query={search} />
            </span>
          ) : (
            <NotAvailable />
          ),
      },
      {
        /*
          Declared, like every other column here. With a width on all of them
          `DataTable` switches from "one column soaks up the leftover" to
          proportional shares, so on a wide monitor the whole row grows evenly
          instead of one column ballooning — which is what a mixed set does.
        */
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 150,
        render: (value: InvoiceStatus) => <StatusChip domain="invoice" status={value} />,
      },
      {
        title: 'Subtotal',
        dataIndex: 'subtotal',
        key: 'subtotal',
        width: 130,
        render: (_: unknown, row: InvoiceListRow) => (
          <MoneyText amount={row.subtotal} currency={row.currency} />
        ),
      },
      {
        title: 'Tax',
        dataIndex: 'tax_amount',
        key: 'tax_amount',
        width: 120,
        render: (_: unknown, row: InvoiceListRow) => (
          <MoneyText amount={row.tax_amount} currency={row.currency} />
        ),
      },
      {
        title: 'Amount',
        dataIndex: 'total_amount',
        key: 'total_amount',
        sorter: true,
        width: 140,
        render: (_: unknown, row: InvoiceListRow) => (
          <MoneyText amount={row.total_amount} currency={row.currency} />
        ),
      },
      {
        title: 'Issue Date',
        dataIndex: 'issue_date',
        key: 'issue_date',
        sorter: true,
        width: 130,
        render: (_: unknown, row: InvoiceListRow) => <DateCell value={row.issue_date} />,
      },
      {
        title: 'Due Date',
        dataIndex: 'due_date',
        key: 'due_date',
        sorter: true,
        width: 130,
        render: (_: unknown, row: InvoiceListRow) => <DateCell value={row.due_date} />,
      },
      {
        /*
          The date the money actually arrived, read off the receipt — an invoice
          has one or it has none. "Not paid" rather than "N/A": the blank here is
          a state of the invoice, not a missing value.
        */
        title: 'Paid Date',
        dataIndex: 'paid_at',
        key: 'paid_at',
        width: 130,
        render: (_: unknown, row: InvoiceListRow) => (
          /*
            "Not paid" only where that is actually true. A PAID invoice with no
            receipt is a record written by something other than the mark-paid
            flow — which always raises one — so the date is unknown, not absent,
            and saying "Not paid" beside a Paid chip would contradict the row.
          */
          <DateCell value={row.paid_at} {...(row.status === 'PAID' ? {} : { empty: 'Not paid' })} />
        ),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 80,
        fixed: 'right' as const,
        render: (_: unknown, row: InvoiceListRow) => (
          <RowActions
            actions={[
              {
                key: 'download',
                label: 'Download PDF',
                icon: <Download size={16} strokeWidth={1.5} aria-hidden />,
                disabled: downloadingId === row.id,
                ...(downloadingId === row.id ? { disabledReason: 'Preparing the PDF\u2026' } : {}),
                onClick: () => void downloadPdf(row),
              },
            ]}
          />
        ),
      },
    ],
    [downloadPdf, downloadingId, search],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Invoices"
        actions={
          <>
            <SearchInput
              value={search}
              onChange={(next) => patchParams({ q: next.trim() || null })}
              label="Search invoices"
              placeholder="Search invoice number, company or member code"
              className="w-[320px] max-w-full"
            />
            <FilterDropdown<InvoiceFilters>
              value={filters}
              emptyValue={EMPTY_FILTERS}
              onApply={(draft) =>
                patchParams({
                  status: draft.status.join(',') || null,
                  issuedFrom: draft.issuedFrom || null,
                  issuedTo: draft.issuedTo || null,
                })
              }
              onClear={() => patchParams({ status: null, issuedFrom: null, issuedTo: null })}
              activeCount={activeFilterCount}
            >
              {(draft, setDraft) => (
                <>
                  <FilterGroup label="Status">
                    <MultiSelect
                      value={draft.status}
                      placeholder="Any status"
                      options={STATUS_OPTIONS}
                      onChange={(next) =>
                        setDraft((d) => ({ ...d, status: next as InvoiceStatus[] }))
                      }
                    />
                  </FilterGroup>

                  {/*
                    Issue date, matching the column the list sorts by. Both ends
                    are optional — "everything since 1 April" is a question
                    Accounts asks as often as a closed window, and demanding an
                    end date would make them invent one.
                  */}
                  <FilterGroup label="Issue date">
                    <DatePicker.RangePicker
                      className="w-full"
                      format="YYYY-MM-DD"
                      allowEmpty={[true, true]}
                      value={[
                        draft.issuedFrom ? dayjs(draft.issuedFrom) : null,
                        draft.issuedTo ? dayjs(draft.issuedTo) : null,
                      ]}
                      onChange={(range) =>
                        setDraft((d) => ({
                          ...d,
                          issuedFrom: range?.[0] ? range[0].format('YYYY-MM-DD') : '',
                          issuedTo: range?.[1] ? range[1].format('YYYY-MM-DD') : '',
                        }))
                      }
                    />
                  </FilterGroup>
                </>
              )}
            </FilterDropdown>
          </>
        }
      />

      <Card flush className="min-h-0 flex-1">
        <DataTable<InvoiceListRow>
          unit="invoices"
          serial
          rowKey="id"
          loading={loading}
          error={error}
          onRetry={() => void load()}
          pagination={pagination}
          onPageChange={(nextPage) => patchParams({ page: String(nextPage) }, { keepPage: true })}
          sort={sort}
          onSortChange={(next) =>
            patchParams({ sortBy: next?.sortBy ?? null, sortOrder: next?.sortOrder ?? null })
          }
          dataSource={rows}
          columns={columns}
          filtered={hasFilters}
          onClearFilter={() =>
            patchParams({ q: null, status: null, issuedFrom: null, issuedTo: null })
          }
          emptyTitle="No invoices yet"
          emptyDescription="An invoice appears here the moment one is raised for a member."
        />
      </Card>
    </div>
  );
};

export default Invoices;
