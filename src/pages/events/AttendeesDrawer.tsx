import { Tooltip } from 'antd';
import { Download, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Drawer,
  MoneyText,
  NotAvailable,
  StackedCell,
  TextCell,
  toast,
} from '@/components/ui';
import EventService, { type AttendeeRow, type EventRow } from '@/services/eventService';
import type { PaginationMeta } from '@/services/BaseService';

/**
 * A-24 — who is going to attend.
 *
 * People, not companies. A row reading "ABC Pvt Ltd — 3" cannot be turned into
 * badges, a catering count or a door list, which are the three things this list
 * exists for.
 *
 * Not an attendance record: nothing here says who turned up. Marking people in
 * on the day is deliberately not part of this cycle.
 *
 * A drawer rather than a page, because it is always read *about* an event the
 * operator already has in front of them, and a page would cost them their place
 * in the list.
 */

interface ApiError {
  message: string;
  requestId?: string;
}

const asError = (err: unknown): ApiError => {
  const e = err as { message?: string; requestId?: string };

  return { message: e?.message ?? 'Something went wrong', requestId: e?.requestId };
};

/** Codes on the wire; words on the screen. "1" is not a dietary requirement. */
const FOOD_LABEL: Record<number, string> = { 0: 'Veg', 1: 'Non-veg', 2: 'Jain' };

interface AttendeesDrawerProps {
  event: EventRow | null;
  onClose: () => void;
}

export const AttendeesDrawer = ({ event, onClose }: AttendeesDrawerProps) => {
  const [rows, setRows] = useState<AttendeeRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    if (!event) return;

    setLoading(true);
    setError(null);
    try {
      const res = await EventService.listAttendees(event.id, { page, limit: 20 });

      setRows(res.data.rows ?? []);
      setPagination(res.pagination);
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, [event, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // A fresh event starts at page one; otherwise opening a second event lands on
  // whatever page the first one was left on, which reads as an empty list.
  useEffect(() => {
    setPage(1);
  }, [event?.id]);

  const download = useCallback(async () => {
    if (!event) return;

    setDownloading(true);
    try {
      await EventService.downloadAttendees(event.id);
    } catch (err) {
      toast.error(asError(err).message);
    } finally {
      setDownloading(false);
    }
  }, [event]);

  return (
    <Drawer
      open={event !== null}
      onClose={onClose}
      /*
        Wide enough for the email and the phone to sit as their own columns
        without the list being read sideways, and no wider: a drawer that covers
        the whole window stops being a quick look at one row of the list behind
        it and becomes a page that took the operator's place away.
      */
      width={980}
      /*
        AntD puts its own close cross to the LEFT of the title, which left this
        drawer with its way out at the opposite corner from every other control
        in the bar — and at a different corner from the rest of the app, since
        `FormDrawer` and the two application drawers all suppress it. Turning it
        off and rebuilding it in `extra` keeps the exits together on the right.
      */
      closable={false}
      /*
        The same title span `FormDrawer`, `ActivityDrawer` and `MemberDetail`
        use. Passing a bare string left AntD styling it with its own default,
        which is why this header sat at a different size from every other one.
      */
      title={
        <span className="block min-w-0 truncate text-title-primary text-fg">
          {event ? `Who Is Attending — ${event.title}` : 'Who Is Attending'}
        </span>
      }
      extra={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            icon={<Download size={15} />}
            loading={downloading}
            disabled={rows.length === 0}
            disabledReason={rows.length === 0 ? 'Nobody has registered yet' : undefined}
            onClick={() => void download()}
          >
            Export to Excel
          </Button>
          <Tooltip title="Close">
            <Button
              variant="secondary"
              icon={<X size={16} strokeWidth={1.75} />}
              aria-label="Close"
              onClick={onClose}
            />
          </Tooltip>
        </div>
      }
    >
      {/*
        The same `Card flush` every list on the platform sits in, so this reads
        as one of them rather than a table dropped into a panel — and so the
        card's clipping keeps the header, the rows and the pager inside one
        rounded box.
      */}
      <Card flush className="min-h-0 flex-1">
        <DataTable<AttendeeRow>
          unit="people"
          serial
          rowKey="attendee_code"
          loading={loading}
          error={error}
          onRetry={() => void load()}
          pagination={pagination}
          onPageChange={setPage}
          dataSource={rows}
          emptyTitle="Nobody is registered yet"
          emptyDescription="People appear here as soon as a member or a guest books a seat. Bookings whose seats have been released are not counted."
          columns={[
            {
              title: 'Name',
              dataIndex: 'full_name',
              width: 170,
              render: (value: string, row) => (
                <StackedCell primary={value} secondary={row.designation ?? undefined} />
              ),
            },
            {
              title: 'Organisation',
              dataIndex: 'booked_by',
              width: 170,
              render: (value: string | null) => <TextCell value={value ?? 'Guest'} />,
            },
            {
              /*
                Its own column, not a grey second line under the organisation.
                Whether the seat was booked at the member rate is the fact the
                fee beside it has to be defended by, and a caption under another
                value is neither sortable by eye down the column nor readable
                as a category.
              */
              title: 'Type',
              dataIndex: 'registrant_type',
              width: 120,
              render: (value: number) => (
                <Badge
                  tone={value === 0 ? 'info' : 'neutral'}
                  tooltip={
                    value === 0
                      ? 'Booked by a member organisation, at the member rate'
                      : 'Booked by a guest, at the non-member rate'
                  }
                >
                  {value === 0 ? 'Member' : 'Non-member'}
                </Badge>
              ),
            },
            {
              /*
                Email and phone are separate columns rather than one stacked
                "Contact". They are used at different moments — the email to send
                the badge and the joining note, the phone to reach somebody who
                has not arrived — and stacking them meant whichever was missing
                silently promoted the other into its place, so a column read as
                an address on one row and a number on the next.
              */
              title: 'Email',
              dataIndex: 'email',
              width: 210,
              render: (value: string | null) =>
                value ? <TextCell value={value} /> : <NotAvailable />,
            },
            {
              title: 'Phone',
              dataIndex: 'phone',
              width: 140,
              render: (value: string | null) =>
                value ? <TextCell value={value} /> : <NotAvailable />,
            },
            {
              title: 'Fee',
              dataIndex: 'unit_price',
              width: 90,
              align: 'right' as const,
              render: (value: string) => <MoneyText amount={value} />,
            },
            {
              title: 'Food',
              dataIndex: 'food_preference',
              width: 90,
              render: (value: number | null) =>
                value === null ? <NotAvailable /> : <TextCell value={FOOD_LABEL[value] ?? ''} />,
            },
            {
              // The slack column. The code is what goes on the badge and into
              // the attendee's own email, so it is the one worth leaving room for.
              title: 'Code',
              dataIndex: 'attendee_code',
              render: (value: string) => <TextCell value={value} />,
            },
          ]}
        />
      </Card>
    </Drawer>
  );
};

export default AttendeesDrawer;
