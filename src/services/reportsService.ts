import { ENDPOINTS } from '@/constant/endpoints';
import { BaseService, downloadFile, type ApiResult } from '@/services/BaseService';

/**
 * Reports (M10, screen A-29).
 *
 * A report is **generated once and saved**. The list is of past reports, not of
 * data — which is why there is no call here that runs a report and returns rows.
 * The rows are fetched only when somebody opens or downloads one.
 */

export const REPORT_TYPES = ['members', 'revenue', 'renewals', 'events', 'statement'] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

/** How a cell should be rendered. `money` arrives as a 2-decimal string. */
export type ColumnType = 'text' | 'number' | 'money' | 'date' | 'status';

export interface ReportColumn {
  key: string;
  header: string;
  type: ColumnType;
  /** For `status`: the `constant/status.ts` domain the chip resolves in. */
  domain?: string;
}

export type ReportRow = Record<string, string | number | null>;

/**
 * One filter selection.
 *
 * The NAME travels with the id deliberately: a report is a historical record,
 * and an id-only filter becomes unreadable the moment a category is renamed or
 * a company terminated — leaving a total nobody can explain.
 */
export interface FilterRef {
  id: string;
  name: string;
}

export type ReportFilters = Record<string, FilterRef[]>;

export interface GeneratedReport {
  id: string;
  report_type: ReportType;
  report_name: string;
  from_date: string | null;
  to_date: string | null;
  filters: ReportFilters;
  include_details: boolean;
  /** Only `ready` and `failed` are written today — generation is inline. */
  status: 'queued' | 'running' | 'ready' | 'failed';
  row_count: number;
  generated_by: string;
  generated_by_name: string | null;
  createdAt: string;
}

/**
 * One headline figure.
 *
 * A LIST, not an object: the order each report presents its figures in is part
 * of the report, and `jsonb` does not preserve object key order — an object
 * came back sorted by key length.
 */
export interface ReportFigure {
  label: string;
  value: string | number;
}

export interface GeneratedReportDetail extends GeneratedReport {
  columns: ReportColumn[];
  summary: ReportFigure[];
  /** NULL when the report was generated without the detail box ticked. */
  detail: ReportRow[] | null;
}

export interface GenerateReportBody {
  report_type: ReportType;
  report_name: string;
  from_date?: string;
  to_date?: string;
  filters?: ReportFilters;
  include_details?: boolean;
}

export interface ListReportsParams {
  page?: number;
  limit?: number;
  search?: string;
  report_type?: ReportType;
  generated_by?: string;
}

const query = (params: ListReportsParams = {}): string => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });

  const qs = search.toString();

  return qs ? `?${qs}` : '';
};

export const ReportsService = {
  generate: (body: GenerateReportBody): Promise<ApiResult<GeneratedReport>> =>
    BaseService.post(ENDPOINTS.REPORTS.LIST, body),

  list: (params?: ListReportsParams): Promise<ApiResult<GeneratedReport[]>> =>
    BaseService.get(`${ENDPOINTS.REPORTS.LIST}${query(params)}`),

  get: (id: string): Promise<ApiResult<GeneratedReportDetail>> =>
    BaseService.get(ENDPOINTS.REPORTS.detail(id)),

  /**
   * The saved file. The filename comes back on `Content-Disposition` — the
   * server is what knows the filters, and a client-invented name is one rename
   * away from disagreeing with the sheet's own Summary.
   */
  download: (id: string): Promise<void> =>
    downloadFile(ENDPOINTS.REPORTS.export(id), `report-${id}.xlsx`),
};

export default ReportsService;
