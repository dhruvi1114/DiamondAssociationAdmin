import { Download } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
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
      width={880}
      title={event ? `Who Is Attending — ${event.title}` : 'Who Is Attending'}
      extra={
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
      }
    >
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
            width: 200,
            render: (value: string, row) => (
              <StackedCell primary={value} secondary={row.designation ?? undefined} />
            ),
          },
          {
            title: 'Organisation',
            dataIndex: 'booked_by',
            width: 200,
            render: (value: string | null, row) => (
              <StackedCell
                primary={value ?? 'Guest'}
                secondary={row.registrant_type === 0 ? 'Member' : 'Non-member'}
              />
            ),
          },
          {
            title: 'Contact',
            dataIndex: 'email',
            width: 220,
            render: (value: string | null, row) =>
              value || row.phone ? (
                <StackedCell
                  primary={value ?? row.phone}
                  secondary={value ? (row.phone ?? undefined) : undefined}
                />
              ) : (
                <NotAvailable />
              ),
          },
          {
            title: 'Fee',
            dataIndex: 'unit_price',
            width: 100,
            align: 'right' as const,
            render: (value: string) => <MoneyText amount={value} />,
          },
          {
            title: 'Food',
            dataIndex: 'food_preference',
            width: 100,
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
    </Drawer>
  );
};

export default AttendeesDrawer;
