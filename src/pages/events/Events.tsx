import { Ban, Pencil, Rocket, Users } from 'lucide-react';
import { DatePicker, Form, Input, TimePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  DateCell,
  FieldLabel,
  FilterDropdown,
  FilterGroup,
  FormDrawer,
  FormSelect,
  Highlight,
  MultiSelect,
  NotAvailable,
  NumberInput,
  PageHeader,
  RowActions,
  Segmented,
  SearchInput,
  StatusChip,
  TextCell,
  toast,
} from '@/components/ui';
import { useConfirm } from '@/hooks/useConfirm';
import { usePermissions } from '@/hooks/usePermissions';
import AttendeesDrawer from '@/pages/events/AttendeesDrawer';
import { PriceTierEditor } from '@/pages/events/PriceTierEditor';
import { tiersFromApi, tiersToApi, type TierValue } from '@/pages/events/priceTiers';
import MastersService, {
  type City,
  type Country,
  type EventType,
  type State,
} from '@/services/mastersService';
import EventService, {
  EVENT_STATUS,
  EVENT_VISIBILITY,
  type EventDetail,
  type EventRow,
} from '@/services/eventService';
import type { PaginationMeta } from '@/services/BaseService';

/**
 * A-21 — events.
 *
 * One list, one drawer. The drawer carries the whole event including its price
 * table, because an event without a price cannot be published and splitting the
 * two across screens would let an admin create something unpublishable and only
 * find out later.
 */

interface ApiError {
  message: string;
  requestId?: string;
}

/**
 * Server field path → the form field that owns it.
 *
 * Most match by name. The exceptions are the two fields the form combines: the
 * date range is one control called `when` but two columns on the wire, and a
 * price tier's message arrives against `price_tiers.0.ends_on` rather than the
 * list itself.
 */
const formFieldFor = (serverPath: string): (string | number)[] => {
  if (serverPath === 'start_at' || serverPath === 'end_at') return ['when'];

  const tier = /^price_tiers\.(\d+)\.(.+)$/.exec(serverPath);

  if (tier) {
    const index = Number(tier[1]);
    const column = tier[2];

    // starts_on / ends_on are one RangePicker in the form.
    if (column === 'starts_on' || column === 'ends_on') return ['price_tiers', index, 'range'];

    return ['price_tiers', index, column];
  }

  return serverPath.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part));
};

const asError = (err: unknown): ApiError => {
  const e = err as { message?: string; requestId?: string };

  return { message: e?.message ?? 'Something went wrong', requestId: e?.requestId };
};

/** Code → the string the shared status map is keyed on. */
/**
 * 12-hour, to match the two clocks on the form.
 *
 * The form and the list showing the same event as "6:00 PM" and "18:00" is the
 * kind of small disagreement that makes an operator check whether they are
 * looking at the right row. `en-IN` renders the marker lower-case, so it is
 * upper-cased here to read as it does on the form.
 */
const asTime = (value: Date): string =>
  value
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toUpperCase();

/** The hours it runs, e.g. 9:00 AM – 6:00 PM. */
const EventTime = ({ start, end }: { start: string; end: string }) => (
  <TextCell value={`${asTime(new Date(start))} – ${asTime(new Date(end))}`} />
);

/** A day from one control and an hour from another, as one instant. */
const withTime = (day: Dayjs, time: Dayjs): Dayjs =>
  day.hour(time.hour()).minute(time.minute()).second(0).millisecond(0);

/**
 * A yes/no answer, as a labelled pair rather than a switch.
 *
 * Written as a controlled component so `Form.Item` drives it directly: the form
 * holds a boolean, this converts either way, and no call site has to remember
 * `valuePropName`. The help sits beside the label, where a rule that is needed
 * once belongs (association-admin-ui).
 */
const YesNo = ({
  value,
  onChange,
  help,
}: {
  value?: boolean;
  onChange?: (next: boolean) => void;
  help: string;
}) => (
  <div className="flex items-center gap-2">
    <Segmented
      value={value ? 'yes' : 'no'}
      options={[
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ]}
      onChange={(next) => onChange?.(next === 'yes')}
    />
    <FieldLabel label="" help={help} />
  </div>
);

const STATUS_NAME: Record<number, string> = {
  [EVENT_STATUS.DRAFT]: 'DRAFT',
  [EVENT_STATUS.PUBLISHED]: 'PUBLISHED',
  [EVENT_STATUS.CANCELLED]: 'CANCELLED',
  [EVENT_STATUS.COMPLETED]: 'COMPLETED',
};

const VISIBILITY_NAME: Record<number, string> = {
  [EVENT_VISIBILITY.MEMBER_ONLY]: 'MEMBER_ONLY',
  [EVENT_VISIBILITY.PUBLIC]: 'PUBLIC',
};

interface EventFilters {
  status: string[];
  visibility: string[];
}

const EMPTY_FILTERS: EventFilters = { status: [], visibility: [] };

const Events = () => {
  const { can } = usePermissions();
  const canManage = can('event.manage');

  const [rows, setRows] = useState<EventRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<EventFilters>(EMPTY_FILTERS);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EventDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const [attendeesOf, setAttendeesOf] = useState<EventRow | null>(null);

  /*
    Geography comes from the masters, not free text. "Surat", "surat" and "SURAT"
    are three cities in a text column and one row in the master — and the cascade
    is what stops an event in Gujarat being filed under a city in Kerala.
  */
  const [countries, setCountries] = useState<Country[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [countryId, setCountryId] = useState<string | undefined>();
  const [stateId, setStateId] = useState<string | undefined>();

  const publish = useConfirm<EventRow>();
  const cancel = useConfirm<EventRow>();
  const remove = useConfirm<EventRow>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Server-side, always: a filter has to match rows on pages nobody has
      // fetched, which a client-side filter over the current twenty cannot.
      const res = await EventService.list({
        page,
        limit: 20,
        ...(search ? { search } : {}),
        ...(filters.status.length > 0 ? { status: filters.status.join(',') } : {}),
        ...(filters.visibility.length > 0 ? { visibility: filters.visibility.join(',') } : {}),
      });

      setRows(res.data.rows ?? []);
      setPagination(res.pagination);
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  // Only when the drawer is open: the list screen has no use for these, and
  // fetching three masters on every page view is three requests nobody reads.
  useEffect(() => {
    if (!open) return;

    void MastersService.listCountries({ limit: 300 })
      .then((res) => setCountries(res.data ?? []))
      .catch(() => setCountries([]));

    /*
      Only the ones still offered. A type the association has deactivated is
      still carried by the events that already have it — that is the point of
      deactivating rather than deleting — but it must not be pickable for a new
      one, or "stop offering it" would mean nothing.
    */
    void MastersService.listEventTypes({ limit: 200, status: 'active' })
      .then((res) => setEventTypes(res.data ?? []))
      .catch(() => setEventTypes([]));
  }, [open]);

  useEffect(() => {
    if (!countryId) {
      setStates([]);
      return;
    }

    void MastersService.listStates({ limit: 300, country_id: countryId })
      .then((res) => setStates(res.data ?? []))
      .catch(() => setStates([]));
  }, [countryId]);

  useEffect(() => {
    if (!stateId) {
      setCities([]);
      return;
    }

    void MastersService.listCities({ limit: 500, state_id: stateId })
      .then((res) => setCities(res.data ?? []))
      .catch(() => setCities([]));
  }, [stateId]);

  /*
    A new query starts at page one. Staying on page four while the filter cuts
    the list to six rows shows an empty table, which reads as "no matches"
    rather than "you are past the end".
  */
  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);

  const applyFilters = useCallback((next: EventFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const activeFilterCount =
    (filters.status.length > 0 ? 1 : 0) + (filters.visibility.length > 0 ? 1 : 0);

  const openCreate = useCallback(() => {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  }, [form]);

  const openEdit = useCallback(
    async (row: EventRow) => {
      try {
        const res = await EventService.get(row.id);
        const detail = res.data;

        setEditing(detail);
        form.setFieldsValue({
          title: detail.title,
          event_type_id: detail.event_type_id ?? undefined,
          description: detail.description ?? undefined,
          dates: [dayjs(detail.start_at), dayjs(detail.end_at)],
          start_time: dayjs(detail.start_at),
          end_time: dayjs(detail.end_at),
          venue_name: detail.venue_name ?? undefined,
          venue_address_line1: detail.venue_address_line1 ?? undefined,
          venue_address_line2: detail.venue_address_line2 ?? undefined,
          city: detail.city ?? undefined,
          pincode: detail.pincode ?? undefined,
          state: detail.state ?? undefined,
          visibility: detail.visibility,
          capacity: detail.capacity ?? undefined,
          tax_rate: Number(detail.tax_rate),
          registration_closes_at: detail.registration_closes_at
            ? dayjs(detail.registration_closes_at)
            : undefined,
          requires_approval: detail.requires_approval,
          collect_food_preference: detail.collect_food_preference,
          collect_photo: detail.collect_photo,
          collect_gov_id: detail.collect_gov_id,
          price_tiers: tiersFromApi(detail.price_tiers),
        });
        setOpen(true);
      } catch (err) {
        toast.error(asError(err).message);
      }
    },
    [form],
  );

  const submit = useCallback(async () => {
    const values = await form.validateFields();

    setSaving(true);
    try {
      const body = {
        title: values.title,
        /* Null, not undefined: "no type" is an answer the API stores, and an
           absent key would leave a previously-set type in place on an edit. */
        event_type_id: values.event_type_id ?? null,
        description: values.description,
        /*
          The two halves put back together. The date carries the day and the
          time carries the hour, so each is read from the control that owns it —
          taking the hour off the date picker would silently save midnight.
        */
        start_at: withTime(values.dates[0], values.start_time).toISOString(),
        end_at: withTime(values.dates[1], values.end_time).toISOString(),
        venue_name: values.venue_name,
        venue_address_line1: values.venue_address_line1,
        venue_address_line2: values.venue_address_line2,
        city: values.city,
        state: values.state,
        visibility: values.visibility,
        pincode: values.pincode,
        capacity: values.capacity ?? null,
        tax_rate: values.tax_rate ?? 0,
        registration_closes_at: values.registration_closes_at?.toISOString() ?? null,
        requires_approval: Boolean(values.requires_approval),
        collect_food_preference: Boolean(values.collect_food_preference),
        collect_photo: Boolean(values.collect_photo),
        collect_gov_id: Boolean(values.collect_gov_id),
        price_tiers: tiersToApi(values.price_tiers as TierValue[]),
      };

      if (editing) {
        await EventService.update(editing.id, body);
        toast.success('Event updated');
      } else {
        await EventService.create(body);
        toast.success('Event saved as a draft. Publish it when you are ready.');
      }

      setOpen(false);
      await load();
    } catch (err) {
      /*
        The API answers a 422 with a map of field → message. Showing only the
        generic sentence leaves the operator staring at a long form with nothing
        marked, hunting for what the server already told us — which is exactly
        what happened with "registration closes after the event starts".
      */
      const error = asError(err);
      const fields = (err as { fields?: Record<string, string> }).fields;

      if (fields && Object.keys(fields).length > 0) {
        const entries = Object.entries(fields);

        form.setFields(
          entries.map(([path, message]) => ({ name: formFieldFor(path), errors: [message] })),
        );

        // Take them to the first one. On a form this tall the offending field is
        // usually scrolled out of sight.
        form.scrollToField(formFieldFor(entries[0]![0]), { behavior: 'smooth', block: 'center' });

        toast.error(entries[0]![1]);
      } else {
        toast.error(error.message);
      }
    } finally {
      setSaving(false);
    }
  }, [editing, form, load]);

  /*
    Hidden at the client's request. Kept rather than deleted, because the
    sentence is the only place the draft → price → publish order is stated, and
    the empty state below still leans on it.

    const subtitle = 'Create an event, price it, then publish it to make it visible.';
  */

  return (
    /*
      Full height, so the card below can fill what is left and the table's
      pagination bar sits on the bottom edge instead of hugging the last row.
      Without it the card is content-height and a two-row list puts the pager
      half way up an empty screen.
    */
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Events"
        actions={
          <>
            <SearchInput value={search} onChange={onSearch} placeholder="Search events" />
            <FilterDropdown<EventFilters>
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
                        { value: '0', label: 'Draft' },
                        { value: '1', label: 'Published' },
                        { value: '2', label: 'Cancelled' },
                        { value: '3', label: 'Completed' },
                      ]}
                    />
                  </FilterGroup>
                  <FilterGroup label="Who Can See It">
                    <MultiSelect
                      value={draft.visibility}
                      placeholder="Anyone"
                      onChange={(next) => setDraft((d) => ({ ...d, visibility: next.map(String) }))}
                      options={[
                        { value: '0', label: 'Members only' },
                        { value: '1', label: 'Public' },
                      ]}
                    />
                  </FilterGroup>
                </>
              )}
            </FilterDropdown>
            {canManage && (
              <Button variant="primary" onClick={openCreate}>
                Add Event
              </Button>
            )}
          </>
        }
      />

      <Card flush className="min-h-0 flex-1">
        <DataTable<EventRow>
          unit="events"
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
          emptyTitle="No events yet"
          emptyDescription="An event starts as a draft: add the details and its pricing, then publish it to make it visible to members or to the public."
          emptyAction={canManage ? <Button onClick={openCreate}>Add Event</Button> : undefined}
          columns={[
            {
              title: 'Event',
              dataIndex: 'title',
              width: 220,
              render: (value: string) => <Highlight text={value} query={search} />,
            },
            {
              /*
                Beside the title, because it says what kind of thing the title
                names. "N/A" on the events that predate the master, rather than a
                guessed type — nobody classified them, and pretending otherwise
                would make the column unusable for counting.
              */
              title: 'Type',
              dataIndex: 'event_type',
              width: 150,
              render: (value: string | null) =>
                value ? <TextCell value={value} width={126} /> : <NotAvailable />,
            },
            {
              title: 'Description',
              dataIndex: 'description',
              width: 240,
              render: (value: string | null) =>
                value ? <TextCell value={value} width={216} /> : <NotAvailable />,
            },
            {
              title: 'Venue',
              dataIndex: 'venue_name',
              width: 170,
              render: (value: string | null) =>
                value ? <TextCell value={value} width={146} /> : <NotAvailable />,
            },
            {
              title: 'City',
              dataIndex: 'city',
              width: 130,
              render: (value: string | null) =>
                value ? <TextCell value={value} /> : <NotAvailable />,
            },
            {
              title: 'Starts',
              dataIndex: 'start_at',
              key: 'starts_on',
              width: 140,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              title: 'Ends',
              dataIndex: 'end_at',
              key: 'ends_on',
              width: 140,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              title: 'Time',
              dataIndex: 'start_at',
              key: 'event_time',
              /* "9:00 AM – 6:00 PM" needs the room "09:00 – 18:00" did not. */
              width: 170,
              render: (value: string, row) => <EventTime start={value} end={row.end_at} />,
            },
            {
              title: 'Registration Closes',
              dataIndex: 'registration_closes_at',
              width: 160,
              render: (value: string | null) =>
                value ? <DateCell value={value} /> : <TextCell value="When it starts" />,
            },
            {
              title: 'Seats',
              dataIndex: 'seats_taken',
              width: 110,
              render: (taken: number, row) => (
                <TextCell
                  value={
                    row.capacity === null ? `${taken} / unlimited` : `${taken} / ${row.capacity}`
                  }
                />
              ),
            },
            {
              title: 'Needs Approval',
              dataIndex: 'requires_approval',
              // Wide enough for the heading to sit on one line; wrapped, it made
              // the header row taller than every other column needed.
              width: 170,
              render: (value: boolean) => <TextCell value={value ? 'Yes' : 'No'} />,
            },
            {
              title: 'Who Can See It',
              dataIndex: 'visibility',
              width: 150,
              render: (value: number) => (
                <StatusChip domain="eventVisibility" status={VISIBILITY_NAME[value]} />
              ),
            },
            {
              title: 'Created',
              dataIndex: 'createdAt',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              title: 'Created By',
              dataIndex: 'created_by',
              width: 160,
              render: (value: string | null) =>
                value ? <TextCell value={value} width={136} /> : <NotAvailable />,
            },
            {
              title: 'Updated',
              dataIndex: 'updatedAt',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              title: 'Updated By',
              dataIndex: 'updated_by',
              width: 160,
              render: (value: string | null) =>
                value ? <TextCell value={value} width={136} /> : <NotAvailable />,
            },
            {
              // The column with no width — it absorbs the slack.
              title: 'Status',
              dataIndex: 'status',
              render: (value: number) => <StatusChip domain="event" status={STATUS_NAME[value]} />,
            },
            {
              title: 'Actions',
              width: 80,
              fixed: 'right' as const,
              render: (_: unknown, row: EventRow) => (
                <RowActions
                  actions={[
                    {
                      /*
                        First, because on a live event it is the thing an admin
                        opens this row for — the list is what becomes badges, a
                        catering count and the door list.
                      */
                      key: 'attendees',
                      icon: <Users size={16} strokeWidth={1.5} />,
                      label: 'Who is attending',
                      hidden: row.status === EVENT_STATUS.DRAFT,
                      onClick: () => setAttendeesOf(row),
                    },
                    {
                      key: 'edit',
                      icon: <Pencil size={16} strokeWidth={1.5} />,
                      label: 'Edit event',
                      hidden: !canManage || row.status === EVENT_STATUS.CANCELLED,
                      onClick: () => void openEdit(row),
                    },
                    {
                      key: 'publish',
                      icon: <Rocket size={16} strokeWidth={1.5} />,
                      label: 'Publish event',
                      hidden: !canManage || row.status !== EVENT_STATUS.DRAFT,
                      onClick: () => publish.ask(row),
                    },
                    {
                      key: 'cancel',
                      icon: <Ban size={16} strokeWidth={1.5} />,
                      label: 'Call this event off',
                      danger: true,
                      hidden: !canManage || row.status !== EVENT_STATUS.PUBLISHED,
                      onClick: () => cancel.ask(row),
                    },
                    /*
                      Delete is hidden at the client's request. The endpoint, the
                      confirm dialog and the guard all still exist — cancelling is
                      the action the association actually wants, because it tells
                      the people who booked instead of making the event vanish.
                    */
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      <AttendeesDrawer event={attendeesOf} onClose={() => setAttendeesOf(null)} />

      <FormDrawer
        open={open}
        width={720}
        title={editing ? 'Edit Event' : 'Add Event'}
        description={
          editing
            ? 'Changes apply to future bookings. Anyone already registered keeps the price they booked at.'
            : 'The event is saved as a draft. Nobody can see it until you publish it.'
        }
        confirmLabel={editing ? 'Save changes' : 'Save as draft'}
        loading={saving}
        onConfirm={submit}
        onCancel={() => setOpen(false)}
      >
        <Form form={form} layout="vertical" requiredMark={false} className="event-form">
          {/*
            Title and type on one row. The type is what the title is an instance
            of, and it is one short choice — on its own line it would take a full
            row of the drawer to hold a single dropdown.

            `grid-cols-2`, not weighted flex: these two are a matched pair and
            have to stay the same width whatever is typed into them. Weighted at
            2:1 the dropdown read as an afterthought pinned to the right edge
            rather than as the field beside the title.
          */}
          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="title"
              label="Title"
              className="min-w-0"
              rules={[{ required: true, message: 'Give the event a title' }]}
            >
              <Input placeholder="Annual Export Summit 2026" />
            </Form.Item>

            {/*
              Optional, deliberately. The list is the association's to curate and
              may be empty on the day this ships; a required field pointing at an
              empty master is a form nobody can submit. `allowClear` because
              "actually, no type" has to be sayable after a type was chosen.
            */}
            <Form.Item
              name="event_type_id"
              label={
                <FieldLabel
                  label="Event Type"
                  help="Kinds of event are maintained under Masters ▸ Event Types. Deactivated ones are not offered here."
                />
              }
              className="min-w-0"
            >
              <FormSelect
                allowClear
                placeholder="Not classified"
                options={eventTypes.map((row) => ({ value: row.id, label: row.name }))}
              />
            </Form.Item>
          </div>

          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="What the event is about" />
          </Form.Item>

          {/*
            Dates and times on one row: they are one fact — when the event runs —
            and reading them as three stacked fields makes the operator assemble
            it. The dates take the width because a range needs it; the two clocks
            are narrow and fixed.
          */}
          <div className="flex gap-4">
            <Form.Item
              name="dates"
              label="Event Dates"
              className="min-w-0 flex-[2]"
              rules={[{ required: true, message: 'Which days does it run?' }]}
            >
              <DatePicker.RangePicker
                className="w-full"
                format="DD MMM YYYY"
                /* An event cannot be scheduled into the past. */
                disabledDate={(current) => current && current < dayjs().startOf('day')}
              />
            </Form.Item>

            <Form.Item
              name="start_time"
              label="Starts At"
              className="min-w-0 flex-1"
              /*
                Defaulted rather than left blank. A working day is what almost
                every association event is, so the common case needs no typing —
                and an empty field would save midnight, which reads as a genuine
                00:00 start on every invitation.
              */
              initialValue={dayjs('09:00', 'HH:mm')}
              rules={[{ required: true, message: 'What time does it start?' }]}
            >
              {/*
                Read and written as 9:00 AM, not 09:00. The 24-hour clock is not
                how anyone in this office says a time out loud, and "18:00" on an
                invitation is the kind of thing that gets re-typed as 8:00 by the
                person building the mailer. Stored unchanged either way — the
                form still holds a dayjs, and the API still gets 24-hour.
              */}
              <TimePicker
                className="w-full"
                use12Hours
                format="h:mm A"
                minuteStep={5}
                needConfirm={false}
              />
            </Form.Item>

            <Form.Item
              name="end_time"
              label="Ends At"
              className="min-w-0 flex-1"
              initialValue={dayjs('18:00', 'HH:mm')}
              rules={[{ required: true, message: 'What time does it end?' }]}
            >
              <TimePicker
                className="w-full"
                use12Hours
                format="h:mm A"
                minuteStep={5}
                needConfirm={false}
              />
            </Form.Item>
          </div>

          {/* Venue and its street on one row: the name and the address are one
              answer to "where is it", and a venue with no address is the case
              this pairing makes obvious. */}
          <div className="flex gap-4">
            <Form.Item name="venue_name" label="Venue" className="min-w-0 flex-[2]">
              <Input placeholder="Hotel Grand" />
            </Form.Item>
            <Form.Item name="venue_address_line1" label="Address" className="min-w-0 flex-[2]">
              <Input placeholder="Address line 1" />
            </Form.Item>
            {/* Back on the row: a printed venue address without a postcode is
                one somebody has to look up before posting anything to it. */}
            <Form.Item name="pincode" label="Pincode" className="min-w-0 flex-1">
              <Input placeholder="380015" />
            </Form.Item>
          </div>

          {/*
            Address line 2 stays hidden at the client's request. The column and
            the API still carry it, so restoring it is un-commenting this rather
            than a migration.

            <Form.Item name="venue_address_line2">
              <Input placeholder="Address line 2" />
            </Form.Item>
          */}

          {/*
            Country → State → City, from the masters and in that order. Typed
            free, "Surat", "surat" and "SURAT" are three cities in a report and
            one row here; the cascade is also what stops an event in Gujarat
            being filed under a city in Kerala.

            The names are what the event stores, not the ids: this is a printed
            address, and a renamed master must not rewrite an invitation that has
            already gone out.
          */}
          <div className="flex gap-4">
            <Form.Item label="Country" className="min-w-0 flex-1">
              <FormSelect
                value={countryId}
                placeholder="Select a country"
                options={countries.map((row) => ({ value: row.id, label: row.name }))}
                onChange={(value) => {
                  const id = value === undefined ? undefined : String(value);

                  setCountryId(id);
                  // Both cleared: a state from the old country is not a state of
                  // the new one, and leaving it makes an impossible address.
                  setStateId(undefined);
                  form.setFieldsValue({
                    country: countries.find((row) => row.id === id)?.name,
                    state: undefined,
                    city: undefined,
                  });
                }}
              />
            </Form.Item>

            <Form.Item label="State" className="min-w-0 flex-1">
              <FormSelect
                value={stateId}
                placeholder={countryId ? 'Select a state' : 'Pick a country first'}
                disabled={!countryId}
                options={states.map((row) => ({ value: row.id, label: row.name }))}
                onChange={(value) => {
                  const id = value === undefined ? undefined : String(value);

                  setStateId(id);
                  form.setFieldsValue({
                    state: states.find((row) => row.id === id)?.name,
                    city: undefined,
                  });
                }}
              />
            </Form.Item>

            <Form.Item name="city" label="City" className="min-w-0 flex-1">
              <FormSelect
                placeholder={stateId ? 'Select a city' : 'Pick a state first'}
                disabled={!stateId}
                options={cities.map((row) => ({ value: row.name, label: row.name }))}
              />
            </Form.Item>
          </div>

          {/* Held so the payload carries the names the selects resolved. */}
          <Form.Item name="country" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="state" hidden>
            <Input />
          </Form.Item>

          <div className="flex gap-4">
            <Form.Item
              name="visibility"
              label="Who Can See It"
              className="min-w-0 flex-1"
              initialValue={EVENT_VISIBILITY.MEMBER_ONLY}
              rules={[{ required: true }]}
            >
              <FormSelect
                options={[
                  { value: EVENT_VISIBILITY.MEMBER_ONLY, label: 'Members only' },
                  { value: EVENT_VISIBILITY.PUBLIC, label: 'Public — members and non-members' },
                ]}
              />
            </Form.Item>

            <Form.Item name="capacity" label="Seats" className="min-w-0 flex-1">
              <NumberInput min={1} placeholder="Leave blank for unlimited" className="w-full" />
            </Form.Item>

            {/*
              GST, on top of the tier price. Defaulted to 18 rather than 0: a
              paid event registration is a taxable service, and a zero default is
              the value nobody notices until an invoice has already gone out
              without tax on it. A genuinely exempt event is one edit; a forgotten
              18% is a correction to a bill somebody has already paid.
            */}
            <Form.Item
              name="tax_rate"
              label="GST %"
              className="min-w-0 flex-1"
              initialValue={18}
              rules={[{ required: true, message: 'Enter 0 if this event is exempt' }]}
            >
              <NumberInput min={0} max={100} precision={2} className="w-full" />
            </Form.Item>

            {/*
              Bounded at both ends, so the impossible cases cannot be picked
              rather than being rejected after Save:
                · not in the past — a deadline already gone means nobody can book;
                · not on or after the day the event starts.

              The second bound is stricter than it was (client decision,
              2026-08-27). The start day used to be selectable, so an event
              running 1–10 Sep could take a booking on the morning of the 1st —
              after the badges are printed and the caterer's count has gone in,
              which is the whole reason the deadline exists. The last selectable
              day is now the day before: 31 Aug for an event starting 1 Sep.

              Left blank it stays open until the event begins. That is not a
              deadline that lands on the start day — it is the absence of one,
              and an association willing to take bookings to the last minute is
              entitled to say so.
            */}
            <Form.Item
              name="registration_closes_at"
              label="Registration Closes"
              className="min-w-0 flex-1"
              dependencies={['dates']}
            >
              <DatePicker
                className="w-full"
                format="DD MMM YYYY"
                placeholder="When the event starts"
                disabledDate={(current) => {
                  if (!current) return false;

                  const start = form.getFieldValue('dates')?.[0] as Dayjs | undefined;

                  return (
                    current < dayjs().startOf('day') ||
                    (start ? !current.isBefore(start.startOf('day')) : false)
                  );
                }}
              />
            </Form.Item>
          </div>

          <PriceTierEditor />

          {/*
            Yes/No segments, not switches. A switch shows one state and leaves
            the other implied — you read the knob's position and infer the rest —
            and beside these text fields it also sat at a different height and
            broke the row. Both answers are on screen, both labelled, and the
            control is the same box as every input above it (SystemSettings.tsx
            settled this once already).
          */}
          <div className="event-form-section flex flex-col gap-3">
            <div className="flex gap-4">
              <Form.Item
                name="requires_approval"
                label="Registrations Need My Approval"
                className="min-w-0 flex-1"
                initialValue={false}
              >
                <YesNo help="Off for open events: people register and pay straight away. On for an AGM or a vetted delegation — the request reaches you first, and no invoice exists until you approve it, so refusing costs nothing to reverse." />
              </Form.Item>

              <Form.Item
                name="collect_food_preference"
                label="Collect Food Preference"
                className="min-w-0 flex-1"
                initialValue
              >
                <YesNo help="Veg, non-veg or Jain, asked of each delegate. Almost every catered event wants this; a one-hour meeting does not." />
              </Form.Item>
            </div>

            <div className="flex gap-4">
              <Form.Item
                name="collect_photo"
                label="Collect Photo For Badge"
                className="min-w-0 flex-1"
                initialValue={false}
              >
                <YesNo help="Only for events that print photo badges. Asking otherwise collects a photograph nobody uses." />
              </Form.Item>

              <Form.Item
                name="collect_gov_id"
                label="Collect Government ID"
                className="min-w-0 flex-1"
                initialValue={false}
              >
                <YesNo help="Only where the venue's security requires it, such as a convention centre. It is identity data, so collect it when it is needed and not by default." />
              </Form.Item>
            </div>
          </div>
        </Form>
      </FormDrawer>

      <ConfirmDialog
        open={publish.target !== null}
        title="Publish this event?"
        confirmLabel="Publish"
        loading={publish.busy}
        description={
          publish.target
            ? `"${publish.target.title}" becomes visible ${
                publish.target.visibility === EVENT_VISIBILITY.PUBLIC
                  ? 'to members and to the public'
                  : 'to members only'
              }, and people can start registering. You can call it off later, but you cannot un-publish it.`
            : ''
        }
        onCancel={publish.cancel}
        onConfirm={() =>
          publish.confirm(async (row) => {
            const res = await EventService.publish(row.id);

            toast.success(`Published. Now visible to ${res.data.audience_size} members.`);
            await load();
          })
        }
      />

      <ConfirmDialog
        open={cancel.target !== null}
        title="Call this event off?"
        confirmLabel="Call it off"
        danger
        loading={cancel.busy}
        description={
          cancel.target
            ? `"${cancel.target.title}" stops accepting registrations and is marked as called off. Everyone already registered is told.`
            : ''
        }
        onCancel={cancel.cancel}
        onConfirm={() =>
          cancel.confirm(async (row) => {
            await EventService.cancel(row.id, 'Called off by the association');
            toast.success('Event called off');
            await load();
          })
        }
      />

      <ConfirmDialog
        open={remove.target !== null}
        title="Delete this event?"
        confirmLabel="Delete"
        danger
        loading={remove.busy}
        description={
          remove.target
            ? `"${remove.target.title}" will be removed. This is only possible because nobody has booked a seat — once someone has, call the event off instead so they are told.`
            : ''
        }
        onCancel={remove.cancel}
        onConfirm={() =>
          remove.confirm(async (row) => {
            await EventService.remove(row.id);
            toast.success('Event deleted');
            await load();
          })
        }
      />
    </div>
  );
};

export default Events;
