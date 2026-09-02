import { useEffect, useState } from 'react';
import {
  DataTable,
  DateCell,
  Drawer,
  MoneyText,
  NotAvailable,
  StatusChip,
  TextCell,
} from '@/components/ui';
import { Field as DetailField, Group as DetailGroup } from '@/components/ui/DetailFields';
import ReportsService, {
  type GeneratedReport,
  type GeneratedReportDetail,
  type ReportColumn,
  type ReportRow,
} from '@/services/reportsService';
import { specFor } from '@/pages/reports/reportSpecs';
import { formatDateTime } from '@/utils/format';

/**
 * What a saved report says, without downloading it.
 *
 * Filters come before the figures here for the same reason they do in the
 * sheet: a filtered number read as an association-wide total is the failure
 * this whole design exists to prevent.
 */

interface Props {
  report: GeneratedReport | null;
  onClose: () => void;
}

/** One cell, rendered by the type the server gave its column. */
const Cell = ({ column, row }: { column: ReportColumn; row: ReportRow }) => {
  const value = row[column.key];

  // Zero is a value, not an absence: `!value` would turn "0 attendees" into
  // "N/A", which is the one reading of that cell that is actually wrong.
  if (value === null || value === undefined || value === '') return <NotAvailable />;

  switch (column.type) {
    case 'money':
      return <MoneyText amount={String(value)} />;
    case 'date':
      return <DateCell value={String(value)} />;
    case 'status':
      return <StatusChip domain={column.domain ?? 'generic'} status={String(value)} />;
    case 'number':
      return <span className="tabular">{Number(value).toLocaleString('en-IN')}</span>;
    default:
      return <TextCell value={String(value)} width={200} />;
  }
};

/** How many detail rows the drawer shows before deferring to the download. */
const PREVIEW_ROWS = 20;

export const ReportSummaryDrawer = ({ report, onClose }: Props) => {
  const [detail, setDetail] = useState<GeneratedReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  useEffect(() => {
    if (!report) {
      setDetail(null);
      return;
    }

    setLoading(true);
    setError(null);
    ReportsService.get(report.id)
      .then((res) => setDetail(res.data))
      .catch((err: { message?: string; requestId?: string }) =>
        setError({
          message: err?.message ?? 'Could not load this report',
          ...(err?.requestId ? { requestId: err.requestId } : {}),
        }),
      )
      .finally(() => setLoading(false));
  }, [report]);

  const rows = detail?.detail ?? [];

  return (
    <Drawer
      open={report !== null}
      onClose={onClose}
      title={report?.report_name ?? 'Report'}
      width={640}
    >
      {report ? (
        <div className="flex flex-col gap-6 overflow-y-auto">
          <DetailGroup title="What was run">
            <DetailField label="Report" value={specFor(report.report_type).title} />
            <DetailField label="Generated" value={formatDateTime(report.createdAt)} />
            <DetailField label="By" value={report.generated_by_name} />
            <DetailField
              label="Date range"
              value={
                report.from_date && report.to_date
                  ? `${report.from_date} to ${report.to_date}`
                  : null
              }
            />
          </DetailGroup>

          {/*
            Before the figures, always. Said explicitly when there were none:
            "no filters" and "the filter line failed to render" look identical
            on a page, and only one of them is safe to act on.
          */}
          <DetailGroup title="Filters applied">
            {Object.keys(report.filters ?? {}).length === 0 ? (
              <DetailField label="Filters" value="None (all records)" />
            ) : (
              Object.entries(report.filters).map(([key, refs]) => (
                <DetailField
                  key={key}
                  label={key
                    .replace(/_ids?$/, '')
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (character) => character.toUpperCase())}
                  value={refs.map((ref) => ref.name).join(', ')}
                />
              ))
            )}
          </DetailGroup>

          <DetailGroup title="Figures">
            {loading ? (
              <DetailField label="Loading" value={null} />
            ) : error ? (
              <DetailField label="Could not load" value={error.message} />
            ) : (
              (detail?.summary ?? []).map((figure) => (
                <DetailField
                  key={figure.label}
                  label={figure.label}
                  value={
                    typeof figure.value === 'number'
                      ? figure.value.toLocaleString('en-IN')
                      : String(figure.value)
                  }
                />
              ))
            )}
          </DetailGroup>

          {rows.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-title-secondary">
                Detail — first {Math.min(PREVIEW_ROWS, rows.length)} of{' '}
                {rows.length.toLocaleString('en-IN')}
              </h3>
              {/* A preview, not the list. The download carries every row, and
                  saying so beats a drawer that scrolls for a thousand rows. */}
              <p className="m-0 text-supporting text-fg-muted">
                The download carries all {rows.length.toLocaleString('en-IN')} rows.
              </p>
              <DataTable<ReportRow>
                rowKey={(row) => String(row[detail?.columns[0]?.key ?? ''] ?? '')}
                dataSource={rows.slice(0, PREVIEW_ROWS)}
                columns={(detail?.columns ?? []).map((column) => ({
                  title: column.header,
                  key: column.key,
                  ...(column.type === 'money' || column.type === 'number'
                    ? { align: 'right' as const }
                    : {}),
                  render: (_: unknown, row: ReportRow) => <Cell column={column} row={row} />,
                }))}
              />
            </div>
          ) : detail && !detail.include_details ? (
            <p className="m-0 text-supporting text-fg-muted">
              This report was generated without the detailed breakdown, so it holds the figures
              above and a row count only. Run it again with the breakdown to keep the rows.
            </p>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
};

export default ReportSummaryDrawer;
