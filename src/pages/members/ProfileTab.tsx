import { useEffect, useState } from 'react';
import { Building2, IdCard } from 'lucide-react';
import { Form, Input, Switch } from 'antd';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DateCell,
  FieldLabel,
  MoneyText,
  MultiSelect,
  FormDrawer,
  NotAvailable,
  StatusChip,
  toast,
} from '@/components/ui';
import { Field, Group } from '@/components/ui/DetailFields';
import { useConfirm } from '@/hooks/useConfirm';
import { usePermissions } from '@/hooks/usePermissions';
import InvoicesService from '@/services/invoicesService';
import MastersService, { type Category } from '@/services/mastersService';
import MembersService, {
  type AdminUpdateMemberInput,
  type MemberDetail,
  type MemberInvoice,
} from '@/services/membersService';
import { asDisplayError } from '@/utils/apiError';
import { formatDate } from '@/utils/format';

/**
 * A-08 · Profile tab — everything the federation knows about the company.
 *
 * Read first, edit second. An admin opening a member is nearly always answering
 * a question ("what is their GST?", "who do we write to?"), not changing
 * anything, so the default state is a dense readable record and editing is one
 * deliberate step away in a drawer.
 *
 * Identity fields (GST, IEC, PAN, legal name) sit in their own block because
 * they are the ones a member cannot change alone — they go through an approver
 * (member.types.ts `APPROVAL_REQUIRED_FIELDS`). An admin editing them here is
 * making exactly the decision that gate exists for.
 */

export interface ProfileTabProps {
  member: MemberDetail;
  onChanged: () => void;
}

export const ProfileTab = ({ member, onChanged }: ProfileTabProps) => {
  const { can } = usePermissions();
  // Unused while the Edit profile action is commented out; kept because the
  // drawer it gated is still here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const canManage = can('member.manage');
  const canRecordPayment = can('payment.record');
  const payment = useConfirm<MemberInvoice>();

  const [editOpen, setEditOpen] = useState(false);
  const [classOpen, setClassOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const memberCategories = member.categories?.map((entry) => entry.category) ?? [];

  /**
   * The registered address, shown inline in Company.
   *
   * `REGISTERED` by type rather than `is_primary`: primary marks the one the
   * member prefers to be written to, which is not necessarily the one they are
   * registered at. Falls back to the primary, then the first, so a member whose
   * addresses predate the type being set still shows something.
   */
  const registered =
    member.addresses.find((address) => address.address_type === 'REGISTERED') ??
    member.addresses.find((address) => address.is_primary) ??
    member.addresses[0] ??
    null;

  const [editForm] = Form.useForm<AdminUpdateMemberInput>();
  const [classForm] = Form.useForm<{ category_ids: string[]; reason: string }>();

  useEffect(() => {
    if (!classOpen) return;

    void MastersService.listCategories({ limit: 100, activeOnly: true })
      .then((categoryResult) => {
        setCategories(categoryResult.data);
      })
      .catch((caught: unknown) => setSaveError(asDisplayError(caught).message));
  }, [classOpen]);

  const downloadInvoice = async (invoice: MemberInvoice) => {
    setDownloadingId(`invoice:${invoice.id}`);
    try {
      await InvoicesService.downloadInvoicePdf(invoice.id, `${invoice.invoice_number}.pdf`);
    } catch (caught) {
      toast.error('Could not download invoice', { description: asDisplayError(caught).message });
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadReceipt = async (invoice: MemberInvoice) => {
    setDownloadingId(`receipt:${invoice.id}`);
    try {
      await InvoicesService.downloadReceiptPdf(invoice.id, `receipt-${invoice.invoice_number}.pdf`);
    } catch (caught) {
      toast.error('Could not download receipt', { description: asDisplayError(caught).message });
    } finally {
      setDownloadingId(null);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const openEdit = () => {
    setSaveError(null);
    editForm.setFieldsValue({
      company_name: member.company_name,
      legal_name: member.legal_name,
      business_type: member.business_type,
      gst_number: member.gst_number,
      pan_number: member.pan_number,
      iec_code: member.iec_code,
      trade_license_no: member.trade_license_no,
      website: member.website,
      about: member.about,
      directory_visible: member.directory_visible,
    });
    setEditOpen(true);
  };

  // Unused while the "Change business nature" button is commented out above,
  // and kept for exactly that reason — the drawer it fills still exists.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const openClassChange = () => {
    setSaveError(null);
    classForm.resetFields();
    classForm.setFieldsValue({
      category_ids: memberCategories.map((row) => row.id),
    });
    setClassOpen(true);
  };

  const submitEdit = async () => {
    const values = await editForm.validateFields();

    setSaving(true);
    setSaveError(null);

    try {
      // Blank means "not recorded", not "empty string" — the API's uniqueness
      // indexes are partial, and an empty GST would collide with every other
      // member who also left it blank.
      const payload = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          key,
          typeof value === 'string' && value.trim() === '' ? null : value,
        ]),
      ) as AdminUpdateMemberInput;

      await MembersService.update(member.id, payload);
      toast.success(`${member.company_name} updated.`);
      setEditOpen(false);
      onChanged();
    } catch (caught) {
      // A duplicate GST or IEC arrives as a 409 with a sentence naming which
      // one. Shown verbatim: the generic "save failed" is what makes an admin
      // retry the same thing three times.
      //
      // Both a toast and the line in the drawer: the toast is the app-wide
      // signal that a save failed, the line stays beside the field the message
      // names once the toast has gone.
      const message = asDisplayError(caught).message;

      setSaveError(message);
      toast.error('Could not save', { description: message });
    } finally {
      setSaving(false);
    }
  };

  const submitClassChange = async () => {
    const values = await classForm.validateFields();

    setSaving(true);
    setSaveError(null);

    try {
      await MembersService.changeCategory(member.id, {
        category_ids: values.category_ids,
        reason: values.reason,
      });
      toast.success(`Membership class updated for ${member.company_name}.`);
      setClassOpen(false);
      onChanged();
    } catch (caught) {
      const message = asDisplayError(caught).message;

      setSaveError(message);
      toast.error('Could not update membership class', { description: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <Group
          icon={<Building2 size={16} strokeWidth={1.5} />}
          title="Company"
          /*
            Hidden at the client's request. `openEdit` and the profile drawer it
            fills are untouched below — only the way in is gone.

            actions={
              canManage ? (
                <Button
                  size="small"
                  variant="secondary"
                  icon={<Pencil size={14} strokeWidth={1.5} />}
                  onClick={openEdit}
                >
                  Edit profile
                </Button>
              ) : null
            }
          */
        >
          {/*
            Trading name, legal name and business type are hidden here for the
            same reason they are on the application review page: the trading name
            is already the page's title, in the shell header.

            <Field label="Trading name" value={member.company_name} />
            <Field label="Legal name" value={member.legal_name} />
            <Field label="Business type" value={member.business_type} />
          */}
          {/*
            Name, email and phone lead the group, matching the application review
            page. They belong to `primary_user` — the login that filed the
            registration — which is why the Primary login group below is gone:
            three fields did not need a card of their own.
          */}
          <Field label="Name" value={member.primary_user?.full_name} />
          <Field label="Email" value={member.primary_user?.email} />
          <Field label="Phone" value={member.primary_user?.phone} />
          <Field label="Company type" value={member.company_type?.name} />
          {/*
            Labelled "Company category" at the client's request. The value is the
            `MembershipCategories` multi-select — Grower, B2B — which is what the
            association actually calls a company's category. The old boolean of
            that name is hidden below.
          */}
          <Field label="Company category" value={null}>
            {memberCategories.length > 0 ? (
              memberCategories.map((row) => row.name).join(', ')
            ) : (
              <NotAvailable label="Not chosen yet" />
            )}
          </Field>
          {/*
            Hidden at the client's request. This is `category` + `tier` — the
            priced class the fee table resolves against — not the "Company
            category" multi-select above it, which is why two fields that sound
            alike were sitting a row apart. `member.category` and `member.tier`
            are untouched, and the fee still resolves from them.

            <Field label="Membership class" value={null}>
              {member.category ? (
                <>
                  {member.category.name}
                  {member.tier ? <span className="text-fg-muted"> · {member.tier.name}</span> : null}
                </>
              ) : (
                <NotAvailable label="Not chosen yet" />
              )}
            </Field>
          */}
          <Field label="Website" value={member.website}>
            {member.website ? (
              <a
                href={member.website}
                target="_blank"
                rel="noreferrer noopener"
                className="break-all text-13 underline"
              >
                {member.website}
              </a>
            ) : undefined}
          </Field>
          <Field
            label="Directory listing"
            value={member.directory_visible ? 'Consented' : 'Opted out'}
          />
          <Field label="Registration consent" value={null}>
            {member.consent_accepted_at ? (
              `${formatDate(member.consent_accepted_at)}${member.consent_ip ? ` · ${member.consent_ip}` : ''}`
            ) : (
              <NotAvailable label="Not recorded" />
            )}
          </Field>
          <Field label="GSTIN holder" value={member.gstin_holder ? 'Yes' : 'No'} />
          {/*
            The reference form's "Company Category" Yes/No radio, hidden because
            the label now belongs to the multi-select above — and because nothing
            has ever read this one. It is spec OQ-R1, still open: "What does
            Company Category: Yes / No mean?" It is stored verbatim and no screen
            or rule consumes it. `Members.company_category` still holds every
            answer, so nothing is lost by not drawing it.

            <Field label="Company category" value={null}>
              {member.company_category === null ? (
                <NotAvailable label="Not specified" />
              ) : member.company_category ? (
                'Yes'
              ) : (
                'No'
              )}
            </Field>
          */}
          <Field label="Landline" value={member.landline} />

          {/*
            The registered address, inline, the way the application review page
            shows it.

            The Addresses card further down still lists every address the member
            holds — factory, correspondence — and is where they are managed. This
            is the one address that answers "where is this company", and a
            reviewer comparing a member against the application they approved
            should not have to scroll past three cards to find it.
          */}
          <Field label="Country" value={registered?.country} />
          <Field label="State" value={registered?.state} />
          <Field label="City" value={registered?.city} />
          <div className="col-span-2 md:col-span-3 lg:col-span-4">
            <Field
              label="Registered address"
              value={
                registered
                  ? [
                      registered.line1,
                      registered.line2,
                      registered.city,
                      registered.state,
                      registered.country,
                      registered.pincode,
                    ]
                      .filter(Boolean)
                      .join(', ')
                  : null
              }
            />
          </div>
          <div className="col-span-2 md:col-span-3 lg:col-span-4">
            <Field label="About" value={member.about} />
          </div>
        </Group>
      </Card>

      <Card>
        <Group icon={<IdCard size={16} strokeWidth={1.5} />} title="Identity & registration">
          <Field label="Member code" value={null}>
            {member.member_code ? (
              <span className="font-mono text-12">{member.member_code}</span>
            ) : (
              <NotAvailable label="Issued on approval" />
            )}
          </Field>
          <Field label="GST number" value={member.gst_number} mono />
          <Field label="PAN" value={member.pan_number} mono />
          <Field label="IEC code" value={member.iec_code} mono />
          <Field label="Trade licence" value={member.trade_license_no} />
          <Field label="Member since" value={null}>
            {member.joined_on ? (
              formatDate(member.joined_on)
            ) : (
              <NotAvailable label="Not yet active" />
            )}
          </Field>
        </Group>
      </Card>

      <Card>
        <h3 className="m-0 mb-2 text-14 font-semibold text-fg">Invoices</h3>
        {/*
          A member can now pay online from the portal (M5). This stays the
          offline path — a member pays by bank transfer or similar and staff
          confirm it here. "Mark as paid" only shows on an invoice that is
          actually payable, and only to ACCOUNTS' own `payment.record`
          permission (member.status stays a separate gate).
        */}
        {member.invoices.length === 0 ? (
          <p className="m-0 text-13 text-fg-muted">No invoices raised yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {member.invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="flex flex-col gap-[2px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-13 text-fg">{invoice.invoice_number}</span>
                    <StatusChip domain="invoice" status={invoice.status} />
                  </div>
                  <span className="text-12 text-fg-muted">
                    Due <DateCell value={invoice.due_date} />
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <MoneyText amount={invoice.total_amount} currency={invoice.currency} />
                  <Button
                    variant="ghost"
                    size="small"
                    loading={downloadingId === `invoice:${invoice.id}`}
                    onClick={() => void downloadInvoice(invoice)}
                  >
                    PDF
                  </Button>
                  {invoice.status === 'PAID' ? (
                    <Button
                      variant="ghost"
                      size="small"
                      loading={downloadingId === `receipt:${invoice.id}`}
                      onClick={() => void downloadReceipt(invoice)}
                    >
                      Receipt
                    </Button>
                  ) : null}
                  {canRecordPayment &&
                  (invoice.status === 'ISSUED' ||
                    invoice.status === 'PARTIALLY_PAID' ||
                    invoice.status === 'OVERDUE') ? (
                    <Button onClick={() => payment.ask(invoice)}>Mark as paid</Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/*
        Hidden at the client's request — its three fields now lead the Company
        group above.

        <Card>
          <Group icon={<User size={16} strokeWidth={1.5} />} title="Primary login">
            <Field label="Name" value={member.primary_user?.full_name} />
            <Field label="Email" value={member.primary_user?.email} />
            <Field label="Phone" value={member.primary_user?.phone} />
          </Group>
        </Card>
      */}

      <Card>
        <h3 className="m-0 mb-2 text-14 font-semibold text-fg">Contacts</h3>
        {member.contacts.length === 0 ? (
          <p className="m-0 text-13 text-fg-muted">
            No contact people yet. The member adds these from their own portal.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {member.contacts.map((contact) => (
              <li key={contact.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-13 font-medium text-fg">{contact.name}</span>
                {contact.is_primary ? <Badge>Primary</Badge> : null}
                <span className="text-12 text-fg-muted">
                  {contact.designation || <NotAvailable />}
                </span>
                <span className="text-12 text-fg-muted">{contact.email || <NotAvailable />}</span>
                <span className="text-12 text-fg-muted">{contact.phone || <NotAvailable />}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="m-0 mb-2 text-14 font-semibold text-fg">Addresses</h3>
        {member.addresses.length === 0 ? (
          <p className="m-0 text-13 text-fg-muted">
            No addresses yet. The member adds these from their own portal.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {member.addresses.map((address) => (
              <li key={address.id} className="flex flex-col gap-[2px]">
                <span className="label-caps">
                  {address.address_type.toLowerCase()}
                  {address.is_primary ? ' · primary' : ''}
                </span>
                <span className="text-13 text-fg">
                  {[address.line1, address.line2, address.city, address.state, address.country]
                    .filter(Boolean)
                    .join(', ')}{' '}
                  <span className="tabular text-fg-muted">{address.pincode}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {member.change_requests.length > 0 ? (
        <Card>
          <h3 className="m-0 mb-1 text-14 font-semibold text-fg">Requested changes</h3>
          {/* Deciding these is M4's workflow engine. Saying so beats a button
              that does nothing, and beats hiding a pending request entirely. */}
          <p className="m-0 mb-3 text-12 text-fg-muted">
            Approving or rejecting a change request arrives with the approval workflow. Until then
            they are listed here so nothing is invisible.
          </p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {member.change_requests.map((request) => (
              <li key={request.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <StatusChip domain="changeRequest" status={request.status} />
                  <span className="text-12 text-fg-muted">{formatDate(request.createdAt)}</span>
                </div>
                <ul className="m-0 flex list-none flex-col gap-[2px] p-0">
                  {Object.entries(request.changes_json ?? {}).map(([field, change]) => (
                    <li key={field} className="text-12 text-fg">
                      <span className="text-fg-muted">{field.replace(/_/g, ' ')}: </span>
                      <span className="line-through">{String(change.old ?? '—')}</span>
                      {' → '}
                      <span className="font-medium">{String(change.new ?? '—')}</span>
                    </li>
                  ))}
                </ul>
                {request.reason ? (
                  <p className="m-0 text-12 text-fg-muted">Reason: {request.reason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <ConfirmDialog
        open={payment.target !== null}
        title={`Mark ${payment.target?.invoice_number ?? 'this invoice'} as paid?`}
        description="Confirms an offline payment was received in full. If this is the member's first invoice, their membership activates immediately."
        confirmLabel="Mark as paid"
        loading={payment.busy}
        onCancel={payment.cancel}
        onConfirm={() =>
          payment.confirm(async (invoice) => {
            try {
              await MembersService.markInvoicePaid(member.id, invoice.id);
              toast.success(`${invoice.invoice_number} marked paid.`);
              onChanged();
            } catch (caught) {
              toast.error('Could not record payment', {
                description: asDisplayError(caught).message,
              });
            }
          })
        }
      />

      <FormDrawer
        open={editOpen}
        title={`Edit ${member.company_name}`}
        description="Changes are recorded against your account in the audit log."
        confirmLabel="Save changes"
        loading={saving}
        width={520}
        onCancel={() => setEditOpen(false)}
        onConfirm={() => void submitEdit()}
      >
        <Form form={editForm} layout="vertical" requiredMark={false}>
          {saveError ? <Alert className="mb-4" variant="danger" message={saveError} /> : null}

          <Form.Item
            name="company_name"
            label="Trading name"
            rules={[{ required: true, message: 'Required' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="legal_name" label="Legal name">
            <Input />
          </Form.Item>
          <Form.Item name="business_type" label="Business type">
            <Input placeholder="Manufacturer" />
          </Form.Item>
          <Form.Item
            name="gst_number"
            label="GST number"
            // The pattern is the server's. Catching it here means the admin sees
            // the problem beside the field instead of after a round trip.
            rules={[
              {
                pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/,
                message: '15 characters, like 24ABCDE1234F1Z5',
              },
            ]}
          >
            <Input placeholder="24ABCDE1234F1Z5" />
          </Form.Item>
          <Form.Item
            name="pan_number"
            label="PAN"
            rules={[
              { pattern: /^[A-Z]{5}[0-9]{4}[A-Z]$/, message: '10 characters, like ABCDE1234F' },
            ]}
          >
            <Input placeholder="ABCDE1234F" />
          </Form.Item>
          <Form.Item
            name="iec_code"
            label="IEC code"
            rules={[{ pattern: /^[0-9A-Z]{10}$/, message: '10 letters or digits' }]}
          >
            <Input placeholder="AAACX1234N" />
          </Form.Item>
          <Form.Item name="trade_license_no" label="Trade licence number">
            <Input />
          </Form.Item>
          <Form.Item
            name="website"
            label="Website"
            rules={[{ type: 'url', message: 'Include https://' }]}
          >
            <Input placeholder="https://example.com" />
          </Form.Item>
          <Form.Item name="about" label="About">
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
          <Form.Item
            name="directory_visible"
            label="Listed in the member directory"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </FormDrawer>

      <FormDrawer
        open={classOpen}
        title={`Change business nature for ${member.company_name}`}
        description="Business nature decides how this member appears in classification and reporting."
        confirmLabel="Save business nature"
        loading={saving}
        onCancel={() => setClassOpen(false)}
        onConfirm={() => void submitClassChange()}
      >
        <Form form={classForm} layout="vertical" requiredMark={false}>
          {saveError ? <Alert className="mb-4" variant="danger" message={saveError} /> : null}

          <Form.Item
            name="category_ids"
            label="Business Nature"
            rules={[{ required: true, message: 'Required' }]}
          >
            <MultiSelect
              options={categories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
              placeholder="Choose one or more categories"
            />
          </Form.Item>

          <Form.Item
            name="reason"
            label={
              <FieldLabel
                label="Reason"
                help="Recorded in the audit log. Say why the business nature is changing."
              />
            }
            rules={[{ required: true, message: 'Required' }]}
          >
            <Input.TextArea rows={3} maxLength={1000} />
          </Form.Item>
        </Form>
      </FormDrawer>
    </div>
  );
};

export default ProfileTab;
