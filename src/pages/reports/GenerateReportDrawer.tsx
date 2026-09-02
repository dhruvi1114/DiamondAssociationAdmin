import { Form, Input, Switch, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FieldLabel, FormDrawer, FormSelect, MultiSelect, toast } from '@/components/ui';
import EventService from '@/services/eventService';
import MastersService from '@/services/mastersService';
import MembersService from '@/services/membersService';
import ReportsService, {
  type FilterRef,
  type GeneratedReport,
  type ReportFilters,
  type ReportType,
} from '@/services/reportsService';
import {
  REPORT_SPECS,
  REQUIRED_FILTERS,
  SINGLE_VALUE_FILTERS,
  STATIC_OPTIONS,
  specFor,
  type FilterField,
} from '@/pages/reports/reportSpecs';

/**
 * Generating a report (screen A-29).
 *
 * **The first field picks the report, and nothing below it renders until it is
 * chosen.** The drawer opens as one question rather than a wall of inputs whose
 * relevance the reader has to work out — and the filters below genuinely differ
 * per report, so showing them early would show the wrong ones.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  onGenerated: (report: GeneratedReport) => void;
  /** Prefill from a past report — the "Run again" action. */
  prefill?: GeneratedReport | null;
  /** Preselect a report type — clicking one of the cards. */
  preselect?: ReportType | null;
}

interface Option {
  id: string;
  name: string;
}

const asError = (error: unknown): string =>
  (error as { message?: string })?.message ?? 'Something went wrong';

export const GenerateReportDrawer = ({ open, onClose, onGenerated, prefill, preselect }: Props) => {
  const [type, setType] = useState<ReportType | null>(null);
  const [name, setName] = useState('');
  /** Set once the person edits the name, so the suggestion stops overwriting it. */
  const [nameTouched, setNameTouched] = useState(false);
  const [selections, setSelections] = useState<ReportFilters>({});
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  /*
    On by default.

    Somebody generating a report almost always wants the rows — a summary
    without them answers "how many" and not "which", and finding out the rows
    are missing costs a second run. Turning it off is the deliberate choice,
    for the case where only the headline figures are wanted.
  */
  const [includeDetails, setIncludeDetails] = useState(true);
  const [saving, setSaving] = useState(false);

  /** Option lists per filter key, however they were sourced. */
  const [options, setOptions] = useState<Record<string, Option[]>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const spec = type ? specFor(type) : null;

  /* Opening resets everything, or the previous run's filters leak into the next
     one — which on a report is not a stale form, it is a wrong answer. */
  useEffect(() => {
    if (!open) return;

    if (prefill) {
      setType(prefill.report_type);
      setName(prefill.report_name);
      // A prefilled name is a name the person already chose once. Re-suggesting
      // over it would undo the point of "run again".
      setNameTouched(true);
      setSelections(prefill.filters ?? {});
      setFrom(prefill.from_date ?? '');
      setTo(prefill.to_date ?? '');
      setIncludeDetails(prefill.include_details);
      return;
    }

    setType(preselect ?? null);
    setName('');
    setNameTouched(false);
    setSelections({});
    setFrom('');
    setTo('');
    setIncludeDetails(true);
  }, [open, prefill, preselect]);

  /**
   * The suggested name: `{title} — {filters}`, where one value shows its name
   * and several show "N selected".
   *
   * Derived rather than assigned on every change, so it cannot overwrite what
   * somebody is halfway through typing.
   */
  const suggested = useMemo(() => {
    if (!spec) return '';

    const summary = Object.values(selections)
      .filter((refs) => refs.length > 0)
      .map((refs) => (refs.length === 1 ? refs[0].name : `${refs.length} selected`))
      .join(' · ');

    return summary ? `${spec.title} — ${summary}` : spec.title;
  }, [spec, selections]);

  useEffect(() => {
    if (!nameTouched && suggested) setName(suggested);
  }, [suggested, nameTouched]);

  /**
   * Load one filter's options.
   *
   * Members and events are **searched server-side** rather than fetched as a
   * capped list. A capped picker silently cannot offer the three-thousandth
   * member, and nothing on screen says why — the one failure mode a filter must
   * not have.
   */
  const loadOptions = useCallback(async (field: FilterField, search?: string) => {
    if (STATIC_OPTIONS[field.source]) {
      setOptions((current) => ({ ...current, [field.key]: STATIC_OPTIONS[field.source] }));
      return;
    }

    setLoadingKey(field.key);
    try {
      if (field.source === 'category') {
        const res = await MastersService.listCategories({ limit: 100, activeOnly: true });
        setOptions((current) => ({
          ...current,
          [field.key]: res.data.map((row) => ({ id: row.id, name: row.name })),
        }));
      } else if (field.source === 'member') {
        const res = await MembersService.list({ limit: 25, ...(search ? { search } : {}) });
        setOptions((current) => ({
          ...current,
          [field.key]: res.data.map((row) => ({
            id: row.id,
            name: row.member_code ? `${row.company_name} (${row.member_code})` : row.company_name,
          })),
        }));
      } else if (field.source === 'event') {
        const res = await EventService.list({ limit: 25, ...(search ? { search } : {}) });
        setOptions((current) => ({
          ...current,
          [field.key]: res.data.rows.map((row) => ({ id: row.id, name: row.title })),
        }));
      }
    } catch {
      // An option list that will not load must not become a picker that
      // silently offers nothing; it says so instead.
      setOptions((current) => ({ ...current, [field.key]: [] }));
    } finally {
      setLoadingKey(null);
    }
  }, []);

  /* Only the fields on screen are fetched: opening the Revenue drawer must not
     pull the category list it will never show. */
  useEffect(() => {
    if (!spec) return;
    spec.filterFields.forEach((field) => void loadOptions(field));
  }, [spec, loadOptions]);

  const setFilter = (key: string, chosen: string[], from_: Option[]) => {
    // A single-valued filter keeps only the latest pick, matching the server's
    // cap — so the control cannot build a selection the API will refuse.
    const ids = (SINGLE_VALUE_FILTERS[type ?? 'members'] ?? []).includes(key)
      ? chosen.slice(-1)
      : chosen;

    const refs: FilterRef[] = ids.map((id) => ({
      id,
      // The name is stored beside the id so the report stays readable after a
      // rename. Falling back to the id keeps it valid if an option vanished.
      name: from_.find((option) => option.id === id)?.name ?? id,
    }));

    setSelections((current) => {
      const next = { ...current };

      if (refs.length === 0) delete next[key];
      else next[key] = refs;

      return next;
    });
  };

  /**
   * Required filters the admin has not answered yet.
   *
   * The Generate button stays disabled while any are missing and says which —
   * a button that submits and comes back with a validation error is a button
   * that could have said so before it was pressed.
   */
  const missing = useMemo(() => {
    if (!type) return [];

    return (REQUIRED_FILTERS[type] ?? [])
      .filter((key) => !(selections[key]?.length ?? 0))
      .map((key) => key.replace(/_id$/, ''));
  }, [type, selections]);

  const submit = async () => {
    if (!type) return;

    setSaving(true);
    try {
      const res = await ReportsService.generate({
        report_type: type,
        report_name: name.trim() || suggested || specFor(type).title,
        ...(from ? { from_date: from } : {}),
        ...(to ? { to_date: to } : {}),
        ...(Object.keys(selections).length > 0 ? { filters: selections } : {}),
        include_details: includeDetails,
      });

      // The row count is named deliberately: it is the one moment the person
      // can check the answer against what they asked for.
      toast.success(
        `Generated · ${res.data.row_count} ${res.data.row_count === 1 ? 'row' : 'rows'}`,
      );
      onGenerated(res.data);
      onClose();
    } catch (error) {
      toast.error('Could not generate', { description: asError(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDrawer
      open={open}
      title="Generate report"
      confirmLabel="Generate"
      loading={saving}
      confirmDisabled={!type || missing.length > 0}
      disabledReason={
        !type ? 'Choose a report first.' : `Choose a ${missing.join(' and a ')} first.`
      }
      onCancel={onClose}
      onConfirm={() => void submit()}
    >
      <Form layout="vertical" requiredMark={false}>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Form.Item label="Report" className="min-w-0 flex-1" required>
            <FormSelect
              value={type ?? undefined}
              placeholder="Choose a report"
              options={REPORT_SPECS.map((option) => ({ value: option.key, label: option.title }))}
              onChange={(next) => {
                // Switching report clears the filters: they belong to the report
                // that offered them, and carrying them over would send the server
                // a filter it rejects.
                setType(next ? (String(next) as ReportType) : null);
                setSelections({});
                setNameTouched(false);
              }}
            />
          </Form.Item>

          <Form.Item label="Report Name" className="min-w-0 flex-1">
            <Input
              value={name}
              placeholder="Named from your filters"
              disabled={!type}
              onChange={(event) => {
                setName(event.target.value);
                setNameTouched(true);
              }}
            />
          </Form.Item>
        </div>

        {/* Nothing below renders until a report is chosen. */}
        {spec ? (
          <>
            <p className="m-0 mb-4 text-supporting text-fg-muted">{spec.description}</p>

            {spec.filterFields.map((field) => (
              <Form.Item key={field.key} label={field.label}>
                <MultiSelect
                  value={(selections[field.key] ?? []).map((ref) => ref.id)}
                  placeholder={
                    options[field.key]?.length === 0 && loadingKey !== field.key
                      ? `No ${field.label.toLowerCase()} to choose from`
                      : `All ${field.label.toLowerCase()}`
                  }
                  options={(options[field.key] ?? []).map((option) => ({
                    value: option.id,
                    label: option.name,
                  }))}
                  {...(field.source === 'member' || field.source === 'event'
                    ? {
                        /* Searched on the server: the list is too long to cap,
                           and a capped list cannot say what it left out. */
                        searchPlaceholder: `Search ${field.label.toLowerCase()}…`,
                        onSearch: (value: string) => void loadOptions(field, value),
                      }
                    : {})}
                  onChange={(next) =>
                    setFilter(field.key, next.map(String), options[field.key] ?? [])
                  }
                />
              </Form.Item>
            ))}

            {spec.dateLabel ? (
              <Form.Item label={spec.dateLabel}>
                {/* Both bounds are inclusive whole days, matching the server. */}
                <DatePicker.RangePicker
                  className="w-full"
                  format="YYYY-MM-DD"
                  allowEmpty={[true, true]}
                  value={[from ? dayjs(from) : null, to ? dayjs(to) : null]}
                  onChange={(range) => {
                    setFrom(range?.[0] ? range[0].format('YYYY-MM-DD') : '');
                    setTo(range?.[1] ? range[1].format('YYYY-MM-DD') : '');
                  }}
                />
              </Form.Item>
            ) : null}

            <Form.Item
              label={
                <FieldLabel
                  label="Include Detailed Breakdown"
                  help="Adds every matching row to the report and to its download. Without it you get the headline figures only."
                />
              }
            >
              <Switch checked={includeDetails} onChange={setIncludeDetails} />
            </Form.Item>
          </>
        ) : null}
      </Form>
    </FormDrawer>
  );
};

export default GenerateReportDrawer;
