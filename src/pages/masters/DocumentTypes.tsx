import { PlusOutlined } from '@ant-design/icons';
import { Pencil, Trash2 } from 'lucide-react';
import { DatePicker, Form, Input, Switch, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
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
  NumberInput,
  PageHeader,
  RowActions,
  SearchInput,
  StatusChip,
  TagList,
  TextCell,
  toast,
} from '@/components/ui';
import { useConfirm } from '@/hooks/useConfirm';
import { usePermissions } from '@/hooks/usePermissions';
import MastersService, {
  type DocumentAppliesTo,
  type DocumentSides,
  type DocumentType,
} from '@/services/mastersService';
import type { PaginationMeta } from '@/services/BaseService';

/**
 * A-12 — the KYC checklist, as configuration.
 *
 * The MIME list is a fixed set of four rather than a free-text field, and that is
 * a security decision, not a convenience one: these files are opened by staff
 * reviewing an application, and `image/svg+xml` executes script (file-storage.md §3).
 * An admin cannot widen the allowlist from this screen.
 */

export interface DocumentTypeFilters {
  appliesTo: string[];
  status: string[];
  createdFrom: string;
  createdTo: string;
}

const EMPTY_DOC_TYPE_FILTERS: DocumentTypeFilters = {
  appliesTo: [],
  status: [],
  createdFrom: '',
  createdTo: '',
};

const FILTER_STATUS_OPTIONS = [
  { value: 'active', label: 'In use' },
  { value: 'inactive', label: 'Retired' },
];

const APPLIES_TO: { value: DocumentAppliesTo; label: string; hint: string }[] = [
  {
    value: 'BOTH',
    label: 'Application and profile',
    hint: 'Asked for at application, kept current afterwards.',
  },
  {
    value: 'APPLICATION',
    label: 'Application only',
    hint: 'Needed once, to decide the application.',
  },
  { value: 'MEMBER', label: 'Member profile only', hint: 'Not asked for at application time.' },
];
const SIDES: { value: DocumentSides; label: string; hint: string }[] = [
  {
    value: 'SINGLE',
    label: 'Front only',
    hint: 'One file is the whole document — a certificate or a statement.',
  },
  {
    value: 'FRONT_AND_BACK',
    label: 'Front and back',
    hint: 'An ID card whose reverse carries the address or signature. Both are asked for.',
  },
];

const MIME_OPTIONS = [
  { value: 'application/pdf', label: 'PDF' },
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/png', label: 'PNG' },
  { value: 'image/webp', label: 'WebP' },
];

interface ApiError {
  message: string;
  requestId?: string;
}

/** `code` is immutable once created, so it never goes into a PATCH body. */
const omit = (source: Record<string, unknown>, keys: string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)));

const asError = (error: unknown): ApiError => {
  const err = error as { message?: string; requestId?: string };

  return {
    message: err?.message ?? 'Something went wrong',
    ...(err?.requestId ? { requestId: err.requestId } : {}),
  };
};

export const DocumentTypes = () => {
  const { can } = usePermissions();
  const canManage = can('category.manage');

  const [rows, setRows] = useState<DocumentType[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<DocumentTypeFilters>(EMPTY_DOC_TYPE_FILTERS);
  const deletion = useConfirm<DocumentType>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentType | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Server-side: the filter has to reach rows on pages nobody has fetched.
      const res = await MastersService.listDocumentTypes({
        page,
        limit: 20,
        ...(search ? { search } : {}),
        ...(filters.appliesTo.length > 0 ? { applies_to: filters.appliesTo.join(',') } : {}),
        ...(filters.status.length > 0 ? { status: filters.status.join(',') } : {}),
        ...(filters.createdFrom ? { created_from: filters.createdFrom } : {}),
        ...(filters.createdTo ? { created_to: filters.createdTo } : {}),
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

  /* A new query starts at page one — see the note in `Categories`. */
  const onSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(1);
  }, []);

  const submit = async () => {
    const values = (await form.validateFields()) as Record<string, unknown>;
    setSaving(true);
    try {
      if (editing) {
        await MastersService.updateDocumentType(editing.id, omit(values, ['code']));
      } else {
        await MastersService.createDocumentType(values);
      }
      setOpen(false);
      await load();
      toast.success(editing ? `${editing.name} updated` : `${String(values.name)} created`);
    } catch (err) {
      toast.error('Could not save', { description: asError(err).message });
    } finally {
      setSaving(false);
    }
  };

  const applyFilters = useCallback((next: DocumentTypeFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_DOC_TYPE_FILTERS);
    setPage(1);
  }, []);

  const activeFilterCount =
    (filters.appliesTo.length > 0 ? 1 : 0) +
    (filters.status.length > 0 ? 1 : 0) +
    (filters.createdFrom || filters.createdTo ? 1 : 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/*
        The strapline is commented out at the client's request. To bring it back,
        pass it to PageHeader again:
          subtitle="What the platform asks applicants and members to upload."
      */}
      <PageHeader
        title="Document Types"
        actions={
          <>
            <SearchInput
              value={search}
              onChange={onSearch}
              label="Search document types"
              placeholder="Search code or name…"
              className="w-[240px]"
            />

            <FilterDropdown<DocumentTypeFilters>
              value={filters}
              emptyValue={EMPTY_DOC_TYPE_FILTERS}
              onApply={applyFilters}
              onClear={clearFilters}
              activeCount={activeFilterCount}
            >
              {(draft, setDraft) => (
                <>
                  {/*
                    A type marked BOTH answers every audience, so the server keeps
                    it whatever is picked here. Filtering to "Application" narrows
                    to the ones that are application-only PLUS the universal ones,
                    which is what someone assembling an application checklist
                    actually wants to see.
                  */}
                  <FilterGroup label="Applies to">
                    <MultiSelect
                      value={draft.appliesTo}
                      placeholder="All audiences"
                      options={APPLIES_TO.map((a) => ({ value: a.value, label: a.label }))}
                      onChange={(next) => setDraft((d) => ({ ...d, appliesTo: next.map(String) }))}
                    />
                  </FilterGroup>

                  <FilterGroup label="Status">
                    <MultiSelect
                      value={draft.status}
                      placeholder="All statuses"
                      options={FILTER_STATUS_OPTIONS}
                      onChange={(next) => setDraft((d) => ({ ...d, status: next.map(String) }))}
                    />
                  </FilterGroup>

                  <FilterGroup label="Created">
                    <DatePicker.RangePicker
                      className="w-full"
                      format="YYYY-MM-DD"
                      allowEmpty={[true, true]}
                      value={[
                        draft.createdFrom ? dayjs(draft.createdFrom) : null,
                        draft.createdTo ? dayjs(draft.createdTo) : null,
                      ]}
                      onChange={(range) =>
                        setDraft((d) => ({
                          ...d,
                          createdFrom: range?.[0] ? range[0].format('YYYY-MM-DD') : '',
                          createdTo: range?.[1] ? range[1].format('YYYY-MM-DD') : '',
                        }))
                      }
                    />
                  </FilterGroup>
                </>
              )}
            </FilterDropdown>
            {canManage ? (
              <Button
                variant="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditing(null);
                  form.resetFields();
                  form.setFieldsValue({
                    applies_to: 'BOTH',
                    is_required: false,
                    sides: 'SINGLE',
                    max_size_mb: 10,
                    allowed_mime: ['application/pdf', 'image/jpeg', 'image/png'],
                    display_order: 0,
                    is_active: true,
                  });
                  setOpen(true);
                }}
              >
                Add document type
              </Button>
            ) : null}
          </>
        }
      />

      <Card flush className="min-h-0 flex-1">
        <DataTable<DocumentType>
          unit="document types"
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
          emptyTitle="No document types yet"
          emptyDescription="Add the documents the federation asks for — GST certificate, IEC certificate, trade licence. Until then the application form has no upload checklist."
          columns={[
            {
              title: 'Code',
              dataIndex: 'code',
              width: 190,
              render: (v: string) => (
                <span className="font-mono text-supporting">
                  <Highlight text={v} query={search} />
                </span>
              ),
            },
            {
              /*
                Truncated like Guidance beside it. A document type's name is
                free text — "Certificate of incorporation (or equivalent)" is a
                real one — and left unbounded it stretched the column past the
                two it sits between.

                `TextCell` cannot take the highlight, since it needs a string to
                measure and clip, so the mark is applied inside the tooltip's
                child instead. The tooltip still carries the whole value.
              */
              title: 'Name',
              dataIndex: 'name',
              width: 220,
              render: (v: string) => (
                <Tooltip title={v}>
                  <span
                    className="block cursor-default truncate align-middle text-supporting"
                    style={{ maxWidth: 196 }}
                  >
                    <Highlight text={v} query={search} />
                  </span>
                </Tooltip>
              ),
            },
            {
              title: 'Guidance',
              dataIndex: 'description',
              width: 260,
              // 260 less the cell's 24px of padding — see `ui/TextCell`.
              render: (value: string | null) => <TextCell value={value} width={236} />,
            },
            {
              title: 'Asked For',
              dataIndex: 'applies_to',
              width: 190,
              render: (v: DocumentAppliesTo) => APPLIES_TO.find((a) => a.value === v)?.label ?? v,
            },
            {
              /*
                Split out of the old "Limits" cell, which read "10 MB · PDF,
                JPEG, PNG". Two unrelated rules sharing a cell separated by a
                middot cannot be scanned down the column — the eye has to parse
                each row to find the number — and neither could ever be sorted.
              */
              title: 'Max Size',
              dataIndex: 'max_size_mb',
              width: 110,
              render: (mb: number) => <span className="tabular text-supporting">{mb} MB</span>,
            },
            {
              title: 'File Types',
              dataIndex: 'allowed_mime',
              width: 200,
              render: (mime: string[]) => {
                const labels = mime.map(
                  (type) => MIME_OPTIONS.find((option) => option.value === type)?.label ?? type,
                );

                return (
                  <TagList
                    items={labels}
                    max={2}
                    label={`${labels.length} file ${labels.length === 1 ? 'type' : 'types'}`}
                  />
                );
              },
            },
            {
              /*
                Reads as a shape, not a status: "Front + back" is what the member
                is asked to hand over, and a StatusChip would imply a state that
                can be good or bad. `Badge` is the neutral qualifier pill.
              */
              title: 'Sides',
              dataIndex: 'sides',
              width: 130,
              render: (value: DocumentSides) => (
                <Badge>{value === 'FRONT_AND_BACK' ? 'Front + back' : 'Front only'}</Badge>
              ),
            },
            {
              title: 'Required',
              dataIndex: 'is_required',
              width: 120,
              render: (required: boolean) => (
                <StatusChip domain="catalogue" status={required ? 'REQUIRED' : 'OPTIONAL'} />
              ),
            },
            {
              /*
                Its own column rather than a footnote on Required. "Required" and
                "still offered" are independent — a type can be mandatory today
                and withdrawn tomorrow without ceasing to be mandatory on the
                applications that already carry it.
              */
              title: 'Offered',
              dataIndex: 'is_active',
              width: 120,
              render: (active: boolean) => (
                <StatusChip domain="catalogue" status={active ? 'ACTIVE' : 'INACTIVE'} />
              ),
            },
            {
              title: 'Created',
              dataIndex: 'createdAt',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            {
              title: 'Updated',
              dataIndex: 'updatedAt',
              width: 130,
              render: (value: string) => <DateCell value={value} />,
            },
            ...(canManage
              ? [
                  {
                    title: 'Actions',
                    key: 'actions',
                    width: 80,
                    fixed: 'right' as const,
                    render: (_: unknown, row: DocumentType) => (
                      <RowActions
                        actions={[
                          {
                            key: 'edit',
                            icon: <Pencil size={16} strokeWidth={1.5} />,
                            label: 'Edit document type',
                            onClick: () => {
                              setEditing(row);
                              form.setFieldsValue(row);
                              setOpen(true);
                            },
                          },
                          {
                            key: 'delete',
                            icon: <Trash2 size={16} strokeWidth={1.5} />,
                            label: 'Delete document type',
                            danger: true,
                            onClick: () => deletion.ask(row),
                          },
                        ]}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>

      {/*
        Deleting a type is not reversible, and documents already uploaded under
        it point at it. It asks, and it names the one it means.
      */}
      <ConfirmDialog
        open={deletion.target !== null}
        title={`Delete ${deletion.target?.name ?? 'document type'}?`}
        description="Documents already uploaded under this type keep pointing at it. If any do, the delete is refused and you will be told — turn off “Offered for new uploads” instead to stop it being asked for."
        loading={deletion.busy}
        onCancel={deletion.cancel}
        onConfirm={() =>
          deletion.confirm(async (row) => {
            try {
              await MastersService.deleteDocumentType(row.id);
              await load();
              toast.success(`${row.name} deleted`);
            } catch (err) {
              toast.error('Could not delete', { description: asError(err).message });
            }
          })
        }
      />

      <FormDrawer
        open={open}
        title={editing ? `Edit ${editing.name}` : 'Add document type'}
        confirmLabel={editing ? 'Save' : 'Create'}
        loading={saving}
        onCancel={() => setOpen(false)}
        onConfirm={() => void submit()}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          {/*
            Laid out like the category drawer: name leads with the write-once
            code beside it, the free-text field takes the full width, and the
            short controls pair off two to a row. Nine fields stacked in one
            column made a drawer you had to scroll to reach Create in.
          */}
          <div className="flex gap-4">
            <Form.Item
              name="name"
              label="Name"
              className="min-w-0 flex-1"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input placeholder="GST certificate" />
            </Form.Item>

            {/* Shown on an edit too, disabled — see the note in `Categories`. */}
            <Form.Item
              name="code"
              label={
                <FieldLabel
                  label="Code"
                  help={
                    editing
                      ? 'Fixed when the type was created. Uploaded documents point at it.'
                      : 'Capitals, digits and underscores. Cannot be changed later.'
                  }
                />
              }
              className="min-w-0 flex-1"
              rules={
                editing
                  ? []
                  : [
                      { required: true, message: 'Required' },
                      { pattern: /^[A-Z][A-Z0-9_]*$/, message: 'Use GST_CERTIFICATE, not gst' },
                    ]
              }
            >
              <Input placeholder="GST_CERTIFICATE" disabled={Boolean(editing)} />
            </Form.Item>
          </div>

          <Form.Item
            name="description"
            label={<FieldLabel label="Guidance" help="Shown next to the upload control." />}
          >
            <Input.TextArea
              rows={2}
              placeholder="A clear scan or PDF of the GST registration certificate."
            />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            {/*
              `FormSelect`, not the native `<select>` this used to be: a native
              dropdown renders as an OS menu, cannot be styled to match the
              inputs above it, and was the one control on the screen with a
              different border, height and arrow.
            */}
            <Form.Item name="applies_to" label="Asked for" className="min-w-0">
              {/*
                No search box: `searchThreshold` defaults to 0, which is right for
                a catalogue list that grows. This one is three fixed values, and a
                search field over three options is a control asking to be used
                for nothing.
              */}
              <FormSelect options={APPLIES_TO} searchThreshold={6} />
            </Form.Item>

            <Form.Item name="max_size_mb" label="Maximum size (MB)" className="min-w-0">
              <NumberInput min={1} max={50} />
            </Form.Item>
          </div>

          {/*
            Paired with nothing, at half width.

            "Sides" belongs beside "Asked for" — both describe what the document
            IS, where the two rows below describe what file is acceptable. Left at
            half width with an empty cell rather than stretched across the row, so
            it matches every other short control on the drawer.
          */}
          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="sides"
              label={
                <FieldLabel
                  label="Sides"
                  help="Front and back asks the member for two files. One multi-page PDF counts as both."
                />
              }
              className="min-w-0"
            >
              <FormSelect options={SIDES} searchThreshold={6} />
            </Form.Item>

            <div />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/*
              A multi-select rather than a row of checkboxes: the list is short
              today and the drawer is not, and the chosen types read back as tags
              in one place instead of as four separate states spread across a
              row. See `ui/MultiSelect` for the rest of the reasoning.
            */}
            <Form.Item
              name="allowed_mime"
              label={
                <FieldLabel
                  label="File types"
                  help="SVG is deliberately not offered — it can carry script, and staff open these files."
                />
              }
              className="min-w-0"
              rules={[{ required: true, message: 'Choose at least one' }]}
            >
              <MultiSelect
                options={MIME_OPTIONS}
                placeholder="Choose file types"
                searchThreshold={8}
              />
            </Form.Item>

            <Form.Item name="display_order" label="Display order" className="min-w-0">
              <NumberInput min={0} max={999} />
            </Form.Item>
          </div>

          {/*
            Both switches on one row. They are the two yes/no questions about the
            same document type — must it be uploaded, and is it still asked for —
            and stacked they took two full rows to say two words each.
          */}
          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="is_required"
              label="Required to submit an application"
              valuePropName="checked"
              className="min-w-0"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              name="is_active"
              label="Offered for new uploads"
              valuePropName="checked"
              className="min-w-0"
            >
              <Switch />
            </Form.Item>
          </div>
        </Form>
      </FormDrawer>
    </div>
  );
};

export default DocumentTypes;
