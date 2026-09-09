import { Check, Mail, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Card,
  DataTable,
  DateCell,
  Dialog,
  FilterDropdown,
  FilterGroup,
  Highlight,
  MultiSelect,
  NotAvailable,
  PageHeader,
  RowActions,
  SearchInput,
  StatusChip,
  TextCell,
  toast,
} from '@/components/ui';
import { usePermissions } from '@/hooks/usePermissions';
import EnquiriesService, {
  ENQUIRY_STATUS,
  ENQUIRY_STATUS_NAME,
  type EnquiryRow,
} from '@/services/enquiriesService';
import type { PaginationMeta } from '@/services/BaseService';

/**
 * A-?? — enquiries sent from the public contact form.
 *
 * A tracked to-do list, not a helpdesk. Staff read the message here, reply from
 * their own inbox — the notification carries the sender's address as Reply-To,
 * so pressing Reply reaches them — and come back to mark it dealt with.
 *
 * There is no reply box on this screen, and that is deliberate. Replying from
 * inside the app means threading, attachments and an inbox to maintain; the
 * office already has email, and this only has to stop enquiries being forgotten.
 */

interface ApiError {
  message: string;
  requestId?: string;
}

const asError = (err: unknown): ApiError =>
  typeof err === 'object' && err !== null && 'message' in err
    ? (err as ApiError)
    : { message: 'Something went wrong' };

const STATUS_OPTIONS = [
  { value: String(ENQUIRY_STATUS.NEW), label: 'New' },
  { value: String(ENQUIRY_STATUS.HANDLED), label: 'Handled' },
];

interface EnquiryFilters {
  status: string[];
}

const EMPTY_FILTERS: EnquiryFilters = { status: [] };

export const Enquiries = () => {
  const { can } = usePermissions();
  const canManage = can('enquiry.manage');

  const [rows, setRows] = useState<EnquiryRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<EnquiryFilters>(EMPTY_FILTERS);

  /** The enquiry being read. The list shows a subject; the message needs room. */
  const [reading, setReading] = useState<EnquiryRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Joined, not the array: a new array every render re-runs the effect forever.
  const statusKey = filters.status.join(',');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await EnquiriesService.list({
        page,
        limit: 20,
        ...(search ? { search } : {}),
        ...(statusKey ? { status: Number(statusKey.split(',')[0]) } : {}),
      });

      setRows(res.data);
      setPagination(res.pagination);
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, statusKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);

  const applyFilters = useCallback((next: EnquiryFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const activeFilterCount = useMemo(() => (filters.status.length > 0 ? 1 : 0), [filters]);

  const setHandled = useCallback(
    async (enquiry: EnquiryRow, handled: boolean) => {
      setBusy(enquiry.id);
      try {
        await EnquiriesService.setHandled(enquiry.id, handled);
        toast.success(
          handled ? `Marked handled — ${enquiry.name}` : `Put back on the queue — ${enquiry.name}`,
        );
        setReading(null);
        await load();
      } catch (err) {
        toast.error(asError(err).message);
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Enquiries"
        actions={
          <>
            <SearchInput value={search} onChange={onSearch} placeholder="Name, email or subject" />

            <FilterDropdown<EnquiryFilters>
              value={filters}
              emptyValue={EMPTY_FILTERS}
              onApply={applyFilters}
              onClear={clearFilters}
              activeCount={activeFilterCount}
            >
              {(draft, setDraft) => (
                <FilterGroup label="Status">
                  <MultiSelect
                    value={draft.status}
                    placeholder="All statuses"
                    options={STATUS_OPTIONS}
                    onChange={(next) => setDraft((d) => ({ ...d, status: next.map(String) }))}
                  />
                </FilterGroup>
              )}
            </FilterDropdown>
          </>
        }
      />

      <Card flush className="min-h-0 flex-1">
        <DataTable<EnquiryRow>
          unit="enquiries"
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
          emptyTitle="No enquiries"
          emptyDescription="Messages sent through the contact form on the public website arrive here."
          /* The whole row opens the message — the subject alone never fits. */
          onRow={(row) => ({
            onClick: () => setReading(row),
            className: 'cursor-pointer',
          })}
          columns={[
            {
              title: 'From',
              dataIndex: 'name',
              width: 200,
              render: (value: string) => <Highlight text={value} query={search} />,
            },
            {
              title: 'Email',
              dataIndex: 'email',
              width: 240,
              render: (value: string) => <Highlight text={value} query={search} />,
            },
            {
              title: 'Phone',
              dataIndex: 'phone',
              width: 150,
              render: (value: string | null) =>
                value ? <TextCell value={value} /> : <NotAvailable />,
            },
            {
              title: 'Subject',
              dataIndex: 'subject',
              width: 280,
              render: (value: string) => <Highlight text={value} query={search} />,
            },
            {
              title: 'Received',
              dataIndex: 'createdAt',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              title: 'Handled By',
              dataIndex: 'handled_by',
              width: 170,
              render: (value: string | null) =>
                value ? <TextCell value={value} /> : <NotAvailable />,
            },
            {
              /* No width: this column absorbs the slack. */
              title: 'Status',
              dataIndex: 'status',
              render: (value: number) => (
                <StatusChip domain="enquiry" status={ENQUIRY_STATUS_NAME[value] ?? 'NEW'} />
              ),
            },
            {
              title: 'Actions',
              width: 110,
              fixed: 'right' as const,
              render: (_: unknown, row: EnquiryRow) => (
                <RowActions
                  actions={[
                    {
                      key: 'read',
                      icon: <Mail size={16} />,
                      label: 'Read the message',
                      onClick: () => setReading(row),
                    },
                    {
                      key: 'handled',
                      icon:
                        row.status === ENQUIRY_STATUS.HANDLED ? (
                          <Undo2 size={16} />
                        ) : (
                          <Check size={16} />
                        ),
                      label:
                        row.status === ENQUIRY_STATUS.HANDLED
                          ? 'Put back on the queue'
                          : 'Mark handled',
                      success: row.status !== ENQUIRY_STATUS.HANDLED,
                      hidden: !canManage,
                      onClick: () => void setHandled(row, row.status !== ENQUIRY_STATUS.HANDLED),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      {/*
        Reading is a dialog, not a drawer or a page: an enquiry is a few lines of
        text and one decision, and a route of its own would need a back button
        for something the reader is finished with in ten seconds.
      */}
      {reading ? (
        <Dialog
          open
          title={reading.subject}
          description={`From ${reading.name} · ${reading.email}${reading.phone ? ` · ${reading.phone}` : ''}`}
          confirmLabel={
            reading.status === ENQUIRY_STATUS.HANDLED ? 'Put back on the queue' : 'Mark handled'
          }
          cancelLabel="Close"
          loading={busy === reading.id}
          width={560}
          onConfirm={() => void setHandled(reading, reading.status !== ENQUIRY_STATUS.HANDLED)}
          onCancel={() => setReading(null)}
        >
          <div className="flex flex-col gap-4">
            <p className="m-0 whitespace-pre-line text-supporting text-fg">{reading.message}</p>

            {/*
              A real mailto, because replying happens in the office's own inbox.
              The notification already carries Reply-To; this is the same route
              for somebody who found the enquiry here rather than in their email.
            */}
            <a
              href={`mailto:${reading.email}?subject=${encodeURIComponent(`Re: ${reading.subject}`)}`}
              className="text-supporting underline underline-offset-2"
            >
              Reply to {reading.email}
            </a>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
};

export default Enquiries;
