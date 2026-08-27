import { Ban, CheckCircle2, Eye } from 'lucide-react';
import { Form, Input } from 'antd';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  ConfirmDialog,
  DataTable,
  DateCell,
  FilterDropdown,
  FilterGroup,
  FormDrawer,
  MoneyText,
  MultiSelect,
  NotAvailable,
  PageHeader,
  RowActions,
  SearchInput,
  StatusChip,
  Tabs,
  TextCell,
  toast,
} from '@/components/ui';
import { useConfirm } from '@/hooks/useConfirm';
import { usePermissions } from '@/hooks/usePermissions';
import EventService, { REGISTRATION_STATUS, type RegistrationRow } from '@/services/eventService';
import type { PaginationMeta } from '@/services/BaseService';

/**
 * A-23 — bookings, and the queue of those waiting on a decision.
 *
 * Two tabs rather than a filter: "waiting on me" and "everything" are different
 * questions, and the first is the reason anyone opens this screen. A filter would
 * hide that behind a button.
 */

interface ApiError {
  message: string;
  requestId?: string;
}

const asError = (err: unknown): ApiError => {
  const e = err as { message?: string; requestId?: string };

  return { message: e?.message ?? 'Something went wrong', requestId: e?.requestId };
};

const STATUS_NAME: Record<number, string> = {
  [REGISTRATION_STATUS.PENDING_APPROVAL]: 'PENDING_APPROVAL',
  [REGISTRATION_STATUS.PENDING_PAYMENT]: 'PENDING_PAYMENT',
  [REGISTRATION_STATUS.PAYMENT_UNDER_VERIFICATION]: 'PAYMENT_UNDER_VERIFICATION',
  [REGISTRATION_STATUS.CONFIRMED]: 'CONFIRMED',
  [REGISTRATION_STATUS.EXPIRED]: 'EXPIRED',
  [REGISTRATION_STATUS.CANCELLED]: 'CANCELLED',
  [REGISTRATION_STATUS.REJECTED]: 'REJECTED',
  [REGISTRATION_STATUS.REFUNDED]: 'REFUNDED',
};

/**
 * The filter panel's options, in the order a booking moves through them, not
 * alphabetically — the list reads as the life of a booking.
 */
const STATUS_OPTIONS = [
  { value: String(REGISTRATION_STATUS.PENDING_APPROVAL), label: 'Awaiting approval' },
  { value: String(REGISTRATION_STATUS.PENDING_PAYMENT), label: 'Awaiting payment' },
  { value: String(REGISTRATION_STATUS.PAYMENT_UNDER_VERIFICATION), label: 'Payment being checked' },
  { value: String(REGISTRATION_STATUS.CONFIRMED), label: 'Confirmed' },
  { value: String(REGISTRATION_STATUS.EXPIRED), label: 'Expired' },
  { value: String(REGISTRATION_STATUS.CANCELLED), label: 'Cancelled' },
  { value: String(REGISTRATION_STATUS.REJECTED), label: 'Not accepted' },
  { value: String(REGISTRATION_STATUS.REFUNDED), label: 'Refunded' },
];

interface BookingFilters {
  status: string[];
}

const EMPTY_FILTERS: BookingFilters = { status: [] };

/**
 * One tab body.
 *
 * Each tab fetches its own rows rather than sharing one loader, because they are
 * different questions — "what is waiting on me" and "everything" — and a shared
 * loader would refetch both every time somebody switches.
 */
const BookingsTable = ({
  queueOnly,
  onRegisterSearch,
}: {
  queueOnly: boolean;
  onRegisterSearch?: (node: ReactNode) => void;
}) => {
  const { can } = usePermissions();
  const canDecide = can('event.manage');
  const navigate = useNavigate();

  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<BookingFilters>(EMPTY_FILTERS);

  const approve = useConfirm<RegistrationRow>();
  const [rejecting, setRejecting] = useState<RegistrationRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await EventService.listRegistrations({
        page,
        limit: 20,
        /*
          Matched by the server, over every booking — not by this component over
          the twenty rows it happens to be holding. A client-side filter cannot
          see the booking on page four, so it answers "no matches" to a reference
          that exists.
        */
        ...(search ? { search } : {}),
        /*
          The queue is exactly the bookings a decision is owed on, and that is
          not negotiable by a filter — which is why the panel's status group is
          hidden on this tab rather than merely ignored.

          Joined here rather than in the HTTP layer: the shared query builder
          stringifies whatever it is given, so an array would arrive as "3,4" by
          accident rather than by decision.
        */
        ...(queueOnly
          ? { status: String(REGISTRATION_STATUS.PENDING_APPROVAL) }
          : filters.status.length > 0
            ? { status: filters.status.join(',') }
            : {}),
      });

      setRows(res.data.rows ?? []);
      setPagination(res.pagination);
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, [page, queueOnly, search, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    A new query starts at page one. Staying on page four while the search cuts
    the list to three rows shows an empty table, which reads as "nothing matched"
    rather than "you are past the end".
  */
  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);

  const applyFilters = useCallback((next: BookingFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const filtered = search.length > 0 || filters.status.length > 0;

  const clearEverything = useCallback(() => {
    setSearch('');
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  /*
    Registered up to the page so it can sit on the tab row. Tabs and their
    controls share one line (the admin UI catalogue is explicit about it); a
    second row would push the table further from the tabs than the toolbar is.
  */
  useEffect(() => {
    onRegisterSearch?.(
      <>
        <SearchInput
          value={search}
          onChange={onSearch}
          label="Search bookings"
          placeholder="Booking ref, invoice, company or email…"
          className="w-[280px]"
        />

        {/*
          No filter button on the queue tab. Its one filter — status — is already
          fixed at "awaiting approval" by the tab itself, and a panel whose only
          control cannot change anything is worse than no panel.
        */}
        {queueOnly ? null : (
          <FilterDropdown<BookingFilters>
            value={filters}
            emptyValue={EMPTY_FILTERS}
            onApply={applyFilters}
            onClear={clearFilters}
            activeCount={filters.status.length > 0 ? 1 : 0}
          >
            {(draft, setDraft) => (
              <FilterGroup label="Status">
                <MultiSelect
                  value={draft.status}
                  placeholder="Any status"
                  options={STATUS_OPTIONS}
                  onChange={(next) => setDraft((d) => ({ ...d, status: next.map(String) }))}
                />
              </FilterGroup>
            )}
          </FilterDropdown>
        )}
      </>,
    );

    return () => onRegisterSearch?.(null);
  }, [search, onSearch, onRegisterSearch, filters, applyFilters, clearFilters, queueOnly]);

  const submitRejection = useCallback(async () => {
    const values = await form.validateFields();

    if (!rejecting) return;

    setSaving(true);
    try {
      await EventService.rejectRegistration(rejecting.id, values.reason);
      toast.success('Request not accepted. The applicant has been told, with the reason.');
      setRejecting(null);
      form.resetFields();
      await load();
    } catch (err) {
      toast.error(asError(err).message);
    } finally {
      setSaving(false);
    }
  }, [form, load, rejecting]);

  /*
    A decision column is only worth its width once something on the page has been
    decided. On a queue of untouched requests all four read "N/A" in every row —
    four columns of nothing, pushing the columns that do say something off the
    right edge. Approved and rejected are judged separately: a page can hold one
    without the other, and hiding both because neither is universal would be the
    same mistake in reverse.
  */
  const showApproved = rows.some((row) => row.approved_at);
  const showRejected = rows.some((row) => row.rejected_at);

  return (
    <>
      <Card flush className="min-h-0 flex-1">
        <DataTable<RegistrationRow>
          unit="bookings"
          serial
          rowKey="id"
          loading={loading}
          error={error}
          onRetry={() => void load()}
          pagination={pagination}
          onPageChange={setPage}
          dataSource={rows}
          /*
            "Nothing matched" and "there is nothing here" are different answers
            with different next steps, so the empty state has to know which one
            it is looking at.
          */
          filtered={filtered}
          onClearFilter={clearEverything}
          emptyTitle={queueOnly ? 'Nothing waiting on you' : 'No bookings yet'}
          emptyDescription={
            queueOnly
              ? 'Bookings appear here only for events set to need your approval before payment. Everything else confirms on payment without you.'
              : 'Bookings appear here as soon as members or guests register for a published event.'
          }
          columns={[
            {
              /*
                Marked, along with the four columns below it, because these are
                exactly the fields the server matches on. A filtered list that
                highlights nothing says which rows matched without saying which
                cell did the matching, and the reader re-reads the whole row.
              */
              title: 'Booked By',
              dataIndex: 'booked_by',
              width: 200,
              render: (value: string | null) => (
                <TextCell value={value ?? 'Guest'} width={176} query={search} />
              ),
            },
            {
              /*
                Member or guest, its own column now rather than a subtitle. It is
                the fact that decides what everything else on the row means — a
                guest is billed personally and has no company record behind it.
              */
              title: 'Type',
              dataIndex: 'registrant_type',
              width: 100,
              render: (value: number) => (
                <TextCell value={value === 0 ? 'Member' : 'Guest'} width={76} />
              ),
            },
            {
              /*
                The company's own email and phone — the guest's, when there is no
                company. Not an attendee's: a five-seat booking has five of those
                and the office rings the payer, not a delegate.
              */
              title: 'Email',
              dataIndex: 'contact_email',
              width: 220,
              render: (value: string | null) => (
                <TextCell value={value} width={196} query={search} />
              ),
            },
            {
              title: 'Phone',
              dataIndex: 'contact_phone',
              width: 140,
              render: (value: string | null) => (
                <TextCell value={value} width={116} query={search} />
              ),
            },
            {
              title: 'City',
              dataIndex: 'city',
              width: 140,
              render: (value: string | null) => <TextCell value={value} width={116} />,
            },
            {
              title: 'Event',
              dataIndex: 'event_title',
              width: 220,
              render: (value: string) => <TextCell value={value} width={196} query={search} />,
            },
            {
              /* The booking's own reference — what the office quotes back. */
              title: 'Booking Ref',
              dataIndex: 'registration_code',
              width: 170,
              render: (value: string) => <TextCell value={value} width={146} query={search} />,
            },
            {
              /*
                Left-aligned, with Amount beside it. Right-alignment is the
                convention for a column you total down, and neither of these is
                totalled here — the page is a work queue, not a ledger. Ranged
                left they start under their own headings and on the same edge as
                every other column, so the row reads straight across.
              */
              title: 'Seats',
              dataIndex: 'attendee_count',
              width: 80,
              render: (value: number) => <TextCell value={String(value)} />,
            },
            {
              title: 'Amount',
              dataIndex: 'total_amount',
              width: 120,
              render: (value: string) => <MoneyText amount={value} />,
            },
            {
              title: 'Requested',
              dataIndex: 'registered_at',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              /*
              The date the seats go back. It is the only thing on this row that
              is a deadline for the association rather than for the booker, which
              is why it is worth a column of its own.
            */
              title: 'Held Until',
              dataIndex: 'expires_at',
              width: 130,
              render: (value: string | null) =>
                value ? <DateCell value={value} /> : <NotAvailable />,
            },
            /*
              Four columns rather than one "decision" cell, as asked, and each
              pair appears only once a row on this page carries it. Within a
              shown pair a row that lacks the date still reads "N/A" — the
              booking beside it was decided and this one was not, which is the
              comparison the column is there to make.
            */
            ...(showApproved
              ? [
                  {
                    title: 'Approved At',
                    dataIndex: 'approved_at',
                    width: 130,
                    render: (value: string | null) =>
                      value ? <DateCell value={value} /> : <NotAvailable />,
                  },
                  {
                    title: 'Approved By',
                    dataIndex: 'approved_by',
                    width: 180,
                    render: (value: string | null) => <TextCell value={value} width={156} />,
                  },
                ]
              : []),
            ...(showRejected
              ? [
                  {
                    title: 'Rejected At',
                    dataIndex: 'rejected_at',
                    width: 130,
                    render: (value: string | null) =>
                      value ? <DateCell value={value} /> : <NotAvailable />,
                  },
                  {
                    title: 'Rejected By',
                    dataIndex: 'rejected_by',
                    width: 180,
                    render: (value: string | null) => <TextCell value={value} width={156} />,
                  },
                ]
              : []),
            {
              title: 'Status',
              dataIndex: 'status',
              render: (value: number) => (
                <StatusChip domain="eventRegistration" status={STATUS_NAME[value] ?? 'CONFIRMED'} />
              ),
            },
            {
              title: 'Actions',
              /* Three icons now, not two. */
              width: 120,
              fixed: 'right' as const,
              render: (_: unknown, row: RegistrationRow) => {
                /*
                  Two different "no" answers, shown two different ways. Lacking
                  the permission hides the action — it is not the actor's screen
                  to act on. A row that is simply past the decision keeps both
                  icons, disabled: an empty cell beside a live one reads as a
                  rendering fault, and says nothing about which of the two it is.
                */
                const decided = row.status !== REGISTRATION_STATUS.PENDING_APPROVAL;
                const decidedReason = 'This booking is no longer waiting on a decision.';

                return (
                  <RowActions
                    actions={[
                      {
                        /*
                          First, and never hidden or disabled. Reading a booking
                          is what `event.view` already bought — the two decisions
                          beside it are the ones a role or a settled status can
                          take away.
                        */
                        key: 'view',
                        icon: <Eye size={16} strokeWidth={1.5} />,
                        label: 'Open this booking',
                        onClick: () => navigate(`/registrations/${row.id}`),
                      },
                      {
                        key: 'approve',
                        icon: <CheckCircle2 size={16} strokeWidth={1.5} />,
                        label: 'Approve this request',
                        hidden: !canDecide,
                        disabled: decided,
                        ...(decided ? { disabledReason: decidedReason } : {}),
                        onClick: () => approve.ask(row),
                      },
                      {
                        key: 'reject',
                        icon: <Ban size={16} strokeWidth={1.5} />,
                        label: 'Do not accept this request',
                        danger: true,
                        hidden: !canDecide,
                        disabled: decided,
                        ...(decided ? { disabledReason: decidedReason } : {}),
                        onClick: () => setRejecting(row),
                      },
                    ]}
                  />
                );
              },
            },
          ]}
        />
      </Card>

      <ConfirmDialog
        open={approve.target !== null}
        title="Approve this request?"
        confirmLabel="Approve"
        loading={approve.busy}
        description={
          approve.target
            ? `${approve.target.booked_by ?? 'The applicant'} asked for ${approve.target.attendee_count} seat(s) at ${approve.target.event_title}. Approving raises the invoice now and starts their payment window from today — the price they were quoted does not change.`
            : ''
        }
        onCancel={approve.cancel}
        onConfirm={() =>
          approve.confirm(async (row) => {
            await EventService.approveRegistration(row.id);
            toast.success(
              'Approved. The invoice has been sent and their payment window starts now.',
            );
            await load();
          })
        }
      />

      {/*
        A reason is mandatory, so this is a form rather than a confirm dialog:
        the text is what the applicant is told, and a refusal with no explanation
        is a phone call to the office.
      */}
      <FormDrawer
        open={rejecting !== null}
        title="Do not accept this request"
        description="The applicant is told this reason. Nothing has been charged and no invoice exists, so nothing needs reversing."
        confirmLabel="Send the refusal"
        loading={saving}
        onConfirm={submitRejection}
        onCancel={() => {
          setRejecting(null);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="reason"
            label="Reason"
            rules={[{ required: true, message: 'Say why, so the applicant knows what to do next' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="This AGM is for Executive Committee members only"
            />
          </Form.Item>
        </Form>
      </FormDrawer>
    </>
  );
};

/** A-23 — the page itself is just the two tabs and the toolbar they share. */
const Registrations = () => {
  /*
    The live tab registers its own search box and filter panel up to here, so the
    two sit on the tab row rather than each tab growing a toolbar of its own.
    Only one tab is mounted at a time, so there is only ever one registrant.
  */
  const [toolbar, setToolbar] = useState<ReactNode>(null);

  /* Stable, or the child's registering effect would re-run on every render. */
  const registerSearch = useCallback((node: ReactNode) => setToolbar(node), []);

  return (
    /*
      Full height, so the card fills what is left and the pagination bar sits on
      the bottom edge instead of hugging the last row.
    */
    <div className="flex h-full min-h-0 flex-col">
      {/* subtitle="Approve the requests waiting on you, and see every booking across all events." */}
      <PageHeader title="Registrations" />

      <Tabs
        variant="pill"
        queryParam="scope"
        defaultTab="queue"
        actions={toolbar}
        items={[
          {
            key: 'queue',
            label: 'Awaiting My Approval',
            children: <BookingsTable queueOnly onRegisterSearch={registerSearch} />,
          },
          {
            key: 'all',
            label: 'All Bookings',
            children: <BookingsTable queueOnly={false} onRegisterSearch={registerSearch} />,
          },
        ]}
      />
    </div>
  );
};

export default Registrations;
