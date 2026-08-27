import { Ban, Pencil, Rocket, Trash2, Users } from 'lucide-react';
import { DatePicker, Form, Input, Switch } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  SearchInput,
  StackedCell,
  StatusChip,
  TextCell,
  toast,
} from '@/components/ui';
import { useConfirm } from '@/hooks/useConfirm';
import { usePermissions } from '@/hooks/usePermissions';
import AttendeesDrawer from '@/pages/events/AttendeesDrawer';
import { PriceTierEditor } from '@/pages/events/PriceTierEditor';
import { tiersFromApi, tiersToApi, type TierValue } from '@/pages/events/priceTiers';
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
          description: detail.description ?? undefined,
          when: [dayjs(detail.start_at), dayjs(detail.end_at)],
          venue_name: detail.venue_name ?? undefined,
          venue_address_line1: detail.venue_address_line1 ?? undefined,
          venue_address_line2: detail.venue_address_line2 ?? undefined,
          city: detail.city ?? undefined,
          state: detail.state ?? undefined,
          pincode: detail.pincode ?? undefined,
          visibility: detail.visibility,
          capacity: detail.capacity ?? undefined,
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
        description: values.description,
        start_at: values.when[0].toISOString(),
        end_at: values.when[1].toISOString(),
        venue_name: values.venue_name,
        venue_address_line1: values.venue_address_line1,
        venue_address_line2: values.venue_address_line2,
        city: values.city,
        state: values.state,
        pincode: values.pincode,
        visibility: values.visibility,
        capacity: values.capacity ?? null,
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

  const subtitle = useMemo(
    () => 'Create an event, price it, then publish it to make it visible.',
    [],
  );

  return (
    <>
      <PageHeader
        title="Events"
        subtitle={subtitle}
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

      <Card flush>
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
              width: 300,
              render: (value: string, row) => (
                <StackedCell
                  primary={<Highlight text={value} query={search} />}
                  secondary={row.city ?? undefined}
                />
              ),
            },
            {
              title: 'When',
              dataIndex: 'start_at',
              width: 150,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              title: 'Registration Closes',
              dataIndex: 'registration_closes_at',
              width: 160,
              render: (value: string | null) =>
                value ? <DateCell value={value} /> : <NotAvailable />,
            },
            {
              /*
                Seats read as a fraction rather than two columns. "12 / 100" is
                the question an admin actually asks — how full is it — and two
                separate numbers make them do the arithmetic.
              */
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
              title: 'Who Can See It',
              dataIndex: 'visibility',
              width: 150,
              render: (value: number) => (
                <StatusChip domain="eventVisibility" status={VISIBILITY_NAME[value]} />
              ),
            },
            {
              // The column with no width — it absorbs the slack, so the title
              // column keeps its cap instead of stretching across the table.
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
                    {
                      key: 'delete',
                      icon: <Trash2 size={16} strokeWidth={1.5} />,
                      label: 'Delete event',
                      danger: true,
                      hidden: !canManage || row.seats_taken > 0,
                      onClick: () => remove.ask(row),
                    },
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
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="title"
            label="Title"
            rules={[{ required: true, message: 'Give the event a title' }]}
          >
            <Input placeholder="Annual Export Summit 2026" />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="What the event is about" />
          </Form.Item>

          <Form.Item
            name="when"
            label="Date & Time"
            rules={[{ required: true, message: 'When does it start and end?' }]}
          >
            <DatePicker.RangePicker showTime className="w-full" format="DD MMM YYYY HH:mm" />
          </Form.Item>

          <Form.Item name="venue_name" label="Venue">
            <Input placeholder="Hotel Grand" />
          </Form.Item>

          <Form.Item name="venue_address_line1" label="Address">
            <Input placeholder="Address line 1" />
          </Form.Item>

          <Form.Item name="venue_address_line2">
            <Input placeholder="Address line 2" />
          </Form.Item>

          <div className="flex gap-4">
            <Form.Item name="city" label="City" className="min-w-0 flex-1">
              <Input placeholder="Ahmedabad" />
            </Form.Item>
            <Form.Item name="state" label="State" className="min-w-0 flex-1">
              <Input placeholder="Gujarat" />
            </Form.Item>
            <Form.Item name="pincode" label="Pincode" className="min-w-0 flex-1">
              <Input placeholder="380015" />
            </Form.Item>
          </div>

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
          </div>

          <Form.Item name="registration_closes_at" label="Registration Closes">
            <DatePicker showTime className="w-full" format="DD MMM YYYY HH:mm" />
          </Form.Item>

          <PriceTierEditor />

          <div className="mt-4 flex flex-col gap-4">
            {/*
              Switch beside its label, not above it. A Form.Item with no label
              renders the control on its own line and leaves the sentence
              orphaned underneath, which reads as a stray toggle belonging to
              nothing.
            */}
            <div className="flex items-center gap-3">
              <Form.Item name="requires_approval" valuePropName="checked" className="mb-0">
                <Switch />
              </Form.Item>
              <FieldLabel
                label="Registrations need my approval before payment"
                help="Off for open events: people register and pay straight away. On for an AGM or a vetted delegation: the request reaches you first, and no invoice exists until you approve it — so rejecting costs nothing to reverse."
              />
            </div>

            <div className="flex flex-col gap-2">
              <FieldLabel
                label="Collect From Each Delegate"
                help="Only what this event actually needs. A one-hour members' meeting needs none of these; a two-day expo needs all three."
              />
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-2">
                  <Form.Item
                    name="collect_food_preference"
                    valuePropName="checked"
                    initialValue={true}
                    className="mb-0"
                  >
                    <Switch size="small" />
                  </Form.Item>
                  <span className="text-supporting">Food preference</span>
                </div>
                <div className="flex items-center gap-2">
                  <Form.Item name="collect_photo" valuePropName="checked" className="mb-0">
                    <Switch size="small" />
                  </Form.Item>
                  <span className="text-supporting">Photo for badge</span>
                </div>
                <div className="flex items-center gap-2">
                  <Form.Item name="collect_gov_id" valuePropName="checked" className="mb-0">
                    <Switch size="small" />
                  </Form.Item>
                  <span className="text-supporting">Government ID</span>
                </div>
              </div>
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
    </>
  );
};

export default Events;
