import { Eye } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  DateCell,
  Highlight,
  MoneyText,
  NotAvailable,
  PageHeader,
  PermissionGate,
  RowActions,
  SearchInput,
  StatusChip,
  Tabs,
  TextCell,
  toast,
} from '@/components/ui';
import { useConfirm } from '@/hooks/useConfirm';
import type { PaginationMeta } from '@/services/BaseService';
import RenewalsService, {
  type RenewalBucket,
  type RenewalRow,
  type RenewalSummary,
} from '@/services/renewalsService';

/**
 * A-20 — renewals by bucket.
 *
 * Current state: three buckets, each counted by the same SQL that lists it.
 * Required action: chase the grace bucket; "Generate Invoices" re-runs the
 * renewal job now.
 * Next step / expected result: the member pays their renewal invoice and
 * leaves the list.
 */

interface ApiError {
  message: string;
  requestId?: string;
}

const asError = (err: unknown): ApiError =>
  typeof err === 'object' && err !== null && 'message' in err
    ? (err as ApiError)
    : { message: 'Something went wrong' };

const REASON: Record<string, string> = {
  NO_PLAN: 'no plan on record',
  NO_PRICE: 'plan has no renewal price',
  ALREADY_RAISED: 'already raised',
  FAILED: 'failed — see logs',
};

const BucketTable = ({
  bucket,
  search,
  refreshKey,
}: {
  bucket: RenewalBucket;
  search: string;
  refreshKey: number;
}) => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<RenewalRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await RenewalsService.list({
        bucket,
        page,
        limit: 20,
        ...(search ? { search } : {}),
      });
      setRows(res.data);
      setPagination(res.pagination);
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, [bucket, page, search]);

  useEffect(() => {
    void load();
    // refreshKey is a deliberate extra dependency: a successful "Generate
    // Invoices" run should refetch every bucket even though nothing else
    // this table depends on changed.
  }, [load, refreshKey]);

  return (
    <Card flush className="min-h-0 flex-1">
      <DataTable<RenewalRow>
        unit="members"
        serial
        rowKey="member_id"
        loading={loading}
        error={error}
        onRetry={() => void load()}
        pagination={pagination}
        onPageChange={setPage}
        dataSource={rows}
        filtered={Boolean(search)}
        emptyTitle={
          bucket === 'due'
            ? 'Nobody is due'
            : bucket === 'grace'
              ? 'Nobody is in grace'
              : 'No expired members'
        }
        emptyDescription={
          bucket === 'due'
            ? 'Members whose membership ends within the notice window appear here once their renewal invoice is raised.'
            : bucket === 'grace'
              ? 'Members whose membership has ended but who are still inside the grace period appear here.'
              : 'Members who did not renew before grace ended appear here. They can still sign in and pay.'
        }
        columns={[
          {
            title: 'Member',
            dataIndex: 'company_name',
            width: 240,
            render: (v: string) => <Highlight text={v} query={search} />,
          },
          {
            title: 'Member No.',
            dataIndex: 'member_code',
            width: 160,
            render: (v: string | null) =>
              v ? <Highlight text={v} query={search} /> : <NotAvailable />,
          },
          {
            title: 'Plan',
            dataIndex: 'plan_name',
            width: 160,
            render: (v: string | null) => (v ? <TextCell value={v} /> : <NotAvailable />),
          },
          {
            title: 'Ends On',
            dataIndex: 'valid_till',
            width: 130,
            render: (v: string) => <DateCell value={v} />,
          },
          ...(bucket === 'grace'
            ? [
                {
                  title: 'Grace Ends',
                  dataIndex: 'grace_ends_on',
                  width: 130,
                  render: (v: string) => <DateCell value={v} />,
                },
              ]
            : []),
          {
            title: 'Renewal Invoice',
            dataIndex: 'invoice_number',
            width: 160,
            render: (v: string | null) =>
              v ? <TextCell value={v} /> : <NotAvailable label="Not raised" />,
          },
          {
            title: 'Amount',
            dataIndex: 'invoice_total',
            width: 130,
            render: (v: string | null) => (v ? <MoneyText amount={v} /> : <NotAvailable />),
          },
          {
            /* No width: this column absorbs the slack. */
            title: 'Status',
            dataIndex: 'invoice_status',
            render: (_: unknown, row: RenewalRow) =>
              row.renewal_declined ? (
                <StatusChip domain="renewal" status="DECLINED" />
              ) : row.claim_pending ? (
                <StatusChip domain="paymentSubmission" status="PENDING" />
              ) : row.invoice_status ? (
                <StatusChip domain="invoice" status={row.invoice_status} />
              ) : (
                <NotAvailable />
              ),
          },
          {
            title: 'Actions',
            width: 80,
            fixed: 'right' as const,
            render: (_: unknown, row: RenewalRow) => (
              <RowActions
                actions={[
                  {
                    key: 'view',
                    icon: <Eye size={16} strokeWidth={1.5} />,
                    label: 'Open member',
                    onClick: () => navigate(`/members/${row.member_id}`),
                  },
                ]}
              />
            ),
          },
        ]}
      />
    </Card>
  );
};

export const Renewals = () => {
  const [summary, setSummary] = useState<RenewalSummary | null>(null);
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const run = useConfirm<true>();

  const loadSummary = useCallback(async () => {
    try {
      setSummary((await RenewalsService.summary()).data);
    } catch (err) {
      toast.error(asError(err).message);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary, refreshKey]);

  const onSearch = useCallback((next: string) => setSearch(next), []);

  const count = (n: number | undefined) => <Badge>{n === undefined ? '…' : String(n)}</Badge>;

  const toolbar = (
    <>
      <SearchInput
        value={search}
        onChange={onSearch}
        label="Search renewals"
        placeholder="Company or member no."
      />
      <PermissionGate permission="renewal.manage">
        <Button variant="primary" onClick={() => run.ask(true)}>
          Generate Invoices
        </Button>
      </PermissionGate>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Renewals" />
      <Tabs
        variant="pill"
        queryParam="bucket"
        defaultTab="due"
        actions={toolbar}
        items={[
          {
            key: 'due',
            label: <span className="flex items-center gap-2">Due Soon {count(summary?.due)}</span>,
            /*
              `key={search}` rather than a separate page-reset effect: a search
              change remounts this pane exactly like switching tabs already
              does, so `page` initialises straight back to 1 and `load` fires
              exactly once with the new search term — never once with the old
              page and once more with the corrected one.
            */
            children: (
              <BucketTable key={search} bucket="due" search={search} refreshKey={refreshKey} />
            ),
          },
          {
            key: 'grace',
            label: (
              <span className="flex items-center gap-2">In Grace {count(summary?.grace)}</span>
            ),
            children: (
              <BucketTable key={search} bucket="grace" search={search} refreshKey={refreshKey} />
            ),
          },
          {
            key: 'expired',
            label: (
              <span className="flex items-center gap-2">Expired {count(summary?.expired)}</span>
            ),
            children: (
              <BucketTable key={search} bucket="expired" search={search} refreshKey={refreshKey} />
            ),
          },
        ]}
      />

      <ConfirmDialog
        open={run.target !== null}
        danger={false}
        title="Generate renewal invoices now?"
        description={`Raises renewal invoices for members whose membership ends within the next ${summary?.notice_days ?? 15} days and who do not have one yet, and sends today's reminders. Nobody else is billed early. Safe to run more than once.`}
        confirmLabel="Generate Invoices"
        loading={run.busy}
        onCancel={run.cancel}
        onConfirm={() =>
          run.confirm(async () => {
            // `useConfirm().confirm` does not catch — an error thrown here
            // would otherwise become an unhandled rejection behind a dialog
            // that has already closed. Caught here so the operator sees why
            // the run failed, the same pattern `Registrations.tsx` uses for
            // its own async confirm bodies.
            try {
              const { data } = await RenewalsService.run();
              const blocked = data.skipped.filter((s) => s.reason !== 'ALREADY_RAISED');

              toast.success(
                `${data.raised} renewal invoice${data.raised === 1 ? '' : 's'} raised.`,
                {
                  description: blocked.length
                    ? `Not raised: ${blocked.map((s) => `${s.company_name} (${REASON[s.reason] ?? s.reason})`).join(', ')}.`
                    : undefined,
                },
              );
              setRefreshKey((k) => k + 1);
            } catch (err) {
              toast.error(asError(err).message);
            }
          })
        }
      />
    </div>
  );
};

export default Renewals;
