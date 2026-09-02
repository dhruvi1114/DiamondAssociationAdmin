import { PlusOutlined } from '@ant-design/icons';
import { Download, Eye, RotateCw, SlidersVertical } from 'lucide-react';
import { Tooltip } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  FilterDropdown,
  FilterGroup,
  MultiSelect,
  NotAvailable,
  PageHeader,
  RowActions,
  SearchInput,
  StatusChip,
  toast,
} from '@/components/ui';
import { usePermissions } from '@/hooks/usePermissions';
import ReportsService, {
  type GeneratedReport,
  type ReportFilters,
  type ReportType,
} from '@/services/reportsService';
import type { PaginationMeta } from '@/services/BaseService';
import { REPORT_SPECS, specFor } from '@/pages/reports/reportSpecs';
import GenerateReportDrawer from '@/pages/reports/GenerateReportDrawer';
import ReportSummaryDrawer from '@/pages/reports/ReportSummaryDrawer';
import { formatDateTime } from '@/utils/format';

/**
 * A-29 — reports.
 *
 * A report here is a **saved record**, not a live table: it is generated once,
 * kept with the filters that produced it, and downloadable again months later.
 * That is why this screen is a list of past reports rather than of data — the
 * data is fetched only when somebody opens or downloads one.
 *
 * Everyone with `report.view` sees everyone's reports. An association office is
 * a shared workspace, and the permission already gates the data: anybody who can
 * see this list could run the same report themselves, so hiding a colleague's
 * result would protect nothing and would only produce duplicates.
 */

interface ApiError {
  message: string;
  requestId?: string;
}

const asError = (error: unknown): ApiError => {
  const err = error as { message?: string; requestId?: string };

  return {
    message: err?.message ?? 'Something went wrong',
    ...(err?.requestId ? { requestId: err.requestId } : {}),
  };
};

/**
 * What the Status column says.
 *
 * The row COUNT, not a "Ready" chip. Once a report has finished, "is it done?"
 * is answered by its presence in the list; the question left is "how big is
 * it?", and that is the number worth a column. A finished report that matched
 * nothing is the one case where the word is more informative than the figure.
 */
const StatusCell = ({ report }: { report: GeneratedReport }) => {
  if (report.status === 'ready') {
    return report.row_count > 0 ? (
      <span className="tabular text-supporting">
        {report.row_count.toLocaleString('en-IN')} rows
      </span>
    ) : (
      <span className="text-supporting text-fg-muted">No rows matched</span>
    );
  }

  if (report.status === 'failed') {
    return <StatusChip domain="generic" status="FAILED" />;
  }

  return <span className="text-supporting text-fg-muted">Generating…</span>;
};

/**
 * The filter count, with the names on hover.
 *
 * A count rather than chips: chips stack a second line under every report name
 * and push the columns beside them off the row, which is what happens the first
 * time somebody filters by six categories.
 */
const FiltersCell = ({ filters }: { filters: ReportFilters }) => {
  const entries = Object.entries(filters ?? {});

  if (entries.length === 0) return <NotAvailable label="None" />;

  const described = entries
    .map(
      ([key, refs]) =>
        `${key
          .replace(/_ids?$/, '')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (character) => character.toUpperCase())}: ${refs
          .map((ref) => ref.name)
          .join(', ')}`,
    )
    .join(' · ');

  return (
    <Tooltip title={described}>
      <span className="inline-flex cursor-default items-center gap-1 text-supporting">
        <SlidersVertical size={14} strokeWidth={1.5} className="text-fg-muted" />
        <span className="tabular">{entries.length}</span>
      </span>
    </Tooltip>
  );
};

interface Filters {
  types: string[];
}

const EMPTY_FILTERS: Filters = { types: [] };

/**
 * The four report cards above the list are switched off at the client's request.
 * Flip this to `true` to bring them back.
 *
 * A flag rather than a commented-out block, for the same two reasons the work
 * queue's is one: the design keeps type-checking as the app changes around it,
 * so it does not rot while it is off; and every hook and helper it uses stays
 * referenced, which a commented block would turn into a file of unused-variable
 * errors.
 *
 * Nothing is lost while they are hidden — "Generate Report" in the toolbar opens
 * the same drawer, and that drawer's first field is the report picker.
 */
const SHOW_REPORT_CARDS: boolean = false;

export const Reports = () => {
  const { can } = usePermissions();
  const canGenerate = can('report.create');
  const canExport = can('report.export');

  const [rows, setRows] = useState<GeneratedReport[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [preselect, setPreselect] = useState<ReportType | null>(null);
  const [prefill, setPrefill] = useState<GeneratedReport | null>(null);
  const [viewing, setViewing] = useState<GeneratedReport | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ReportsService.list({
        page,
        limit: 20,
        ...(search ? { search } : {}),
        // One type at a time: the API takes a single enum, and a report list
        // narrowed to two types is a question nobody has asked yet.
        ...(filters.types.length === 1 ? { report_type: filters.types[0] as ReportType } : {}),
      });
      setRows(res.data);
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

  /* A new query starts at page one: staying on page four while the filter cuts
     the list to six rows shows an empty table, which reads as "no matches". */
  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);

  const openGenerate = (type: ReportType | null, from?: GeneratedReport) => {
    setPreselect(type);
    setPrefill(from ?? null);
    setDrawerOpen(true);
  };

  const download = async (report: GeneratedReport) => {
    setDownloadingId(report.id);
    try {
      await ReportsService.download(report.id);
    } catch (err) {
      toast.error('Could not download', { description: asError(err).message });
    } finally {
      setDownloadingId(null);
    }
  };

  const activeFilterCount = filters.types.length > 0 ? 1 : 0;

  const cards = useMemo(
    () =>
      REPORT_SPECS.map((spec) => (
        <Card key={spec.key} title={spec.title} description={spec.description} className="h-full">
          <div className="mt-auto pt-2">
            <Button
              variant="secondary"
              size="small"
              disabled={!canGenerate}
              {...(canGenerate ? {} : { disabledReason: 'You cannot generate reports.' })}
              onClick={() => openGenerate(spec.key)}
            >
              Generate
            </Button>
          </div>
        </Card>
      )),
    [canGenerate],
  );

  return (
    /* `min-w-0` is load-bearing: without it a wide table inside a flex child
       expands the page instead of scrolling inside `DataTable`'s body. */
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <PageHeader
        title="Reports"
        actions={
          <>
            <SearchInput
              value={search}
              onChange={onSearch}
              label="Search reports"
              placeholder="Search report name…"
              className="min-w-0 w-full max-w-[240px] sm:w-[240px]"
            />

            <FilterDropdown<Filters>
              value={filters}
              emptyValue={EMPTY_FILTERS}
              onApply={(next) => {
                setFilters(next);
                setPage(1);
              }}
              onClear={() => {
                setFilters(EMPTY_FILTERS);
                setPage(1);
              }}
              activeCount={activeFilterCount}
            >
              {(draft, setDraft) => (
                <FilterGroup label="Report">
                  <MultiSelect
                    value={draft.types}
                    placeholder="Any report"
                    options={REPORT_SPECS.map((spec) => ({
                      value: spec.key,
                      label: spec.title,
                    }))}
                    onChange={(next) =>
                      // The API narrows to one type, so the panel keeps the
                      // latest pick rather than offering a combination it
                      // would have to ignore.
                      setDraft((current) => ({ ...current, types: next.map(String).slice(-1) }))
                    }
                  />
                </FilterGroup>
              )}
            </FilterDropdown>

            {canGenerate ? (
              <Button variant="primary" icon={<PlusOutlined />} onClick={() => openGenerate(null)}>
                Generate Report
              </Button>
            ) : null}
          </>
        }
      />

      {/* The four reports, above the list of what has been run from them. */}
      {SHOW_REPORT_CARDS ? (
        <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4 [&>*]:h-full">{cards}</div>
      ) : null}

      <Card flush className="min-h-0 min-w-0 flex-1">
        <DataTable<GeneratedReport>
          unit="reports"
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
            setFilters(EMPTY_FILTERS);
          }}
          emptyTitle="No reports generated yet"
          emptyDescription="Pick one of the four reports above, choose its filters, and generate it. What you generate is saved here and can be downloaded again later."
          emptyAction={
            canGenerate ? (
              <Button onClick={() => openGenerate(null)}>Generate report</Button>
            ) : undefined
          }
          columns={[
            {
              title: 'Report Name',
              dataIndex: 'report_name',
              width: 280,
              render: (value: string) => <span className="text-supporting">{value}</span>,
            },
            {
              title: 'Type',
              dataIndex: 'report_type',
              width: 150,
              render: (value: ReportType) => <Badge>{specFor(value).title}</Badge>,
            },
            {
              title: 'Status',
              key: 'status',
              width: 140,
              render: (_: unknown, row: GeneratedReport) => <StatusCell report={row} />,
            },
            {
              title: 'Filters',
              key: 'filters',
              width: 90,
              align: 'center' as const,
              render: (_: unknown, row: GeneratedReport) => <FiltersCell filters={row.filters} />,
            },
            {
              /* The word, not a tick: a bare check has to be decoded, and this
                 decides whether the download carries rows at all. */
              title: 'Details',
              dataIndex: 'include_details',
              width: 100,
              align: 'center' as const,
              render: (value: boolean) =>
                value ? <span className="text-supporting">Included</span> : <NotAvailable />,
            },
            {
              title: 'Generated By',
              dataIndex: 'generated_by_name',
              width: 160,
              render: (value: string | null) =>
                value ? <span className="text-supporting">{value}</span> : <NotAvailable />,
            },
            {
              /* Carries no width: the last column before the frozen actions
                 absorbs the slack, so the name column never stretches. */
              title: 'Generated At',
              dataIndex: 'createdAt',
              render: (value: string) => (
                <span className="tabular text-supporting">{formatDateTime(value)}</span>
              ),
            },
            {
              title: 'Actions',
              key: 'actions',
              width: 110,
              fixed: 'right' as const,
              render: (_: unknown, row: GeneratedReport) => (
                <RowActions
                  actions={[
                    {
                      key: 'view',
                      icon: <Eye size={16} strokeWidth={1.5} />,
                      label: 'View summary',
                      disabled: row.status !== 'ready',
                      onClick: () => setViewing(row),
                    },
                    ...(canExport
                      ? [
                          {
                            key: 'download',
                            icon: <Download size={16} strokeWidth={1.5} />,
                            label: 'Download Excel',
                            disabled: row.status !== 'ready' || downloadingId === row.id,
                            onClick: () => void download(row),
                          },
                        ]
                      : []),
                    ...(canGenerate
                      ? [
                          {
                            key: 'rerun',
                            icon: <RotateCw size={16} strokeWidth={1.5} />,
                            // Reopens the drawer with this report's own filters,
                            // so next month's run is one click rather than
                            // re-picking every choice by hand.
                            label: 'Run again',
                            onClick: () => openGenerate(row.report_type, row),
                          },
                        ]
                      : []),
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      <GenerateReportDrawer
        open={drawerOpen}
        preselect={preselect}
        prefill={prefill}
        onClose={() => setDrawerOpen(false)}
        onGenerated={() => {
          setPage(1);
          void load();
        }}
      />

      <ReportSummaryDrawer report={viewing} onClose={() => setViewing(null)} />
    </div>
  );
};

export default Reports;
