import { ConfigProvider, Input as AntInput } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  ErrorState,
  FieldLabel,
  FormSelect,
  ImageUpload,
  NumberInput,
  PageHeader,
  Segmented,
  Skeleton,
  toast,
} from '@/components/ui';
import { ENDPOINTS } from '@/constant/endpoints';
import { refreshBranding } from '@/hooks/useBranding';
import { refreshOrganisation } from '@/hooks/useOrganisation';
import { usePermissions } from '@/hooks/usePermissions';
import { API_ORIGIN } from '@/services/BaseService';
import SettingsService, {
  type BrandingSlot,
  type SettingChange,
  type SystemSetting,
} from '@/services/settingsService';

/** Only what this screen shows. The service's own error type carries more. */
interface ApiError {
  message: string;
  requestId?: string;
}

/**
 * A-34 — runtime configuration.
 *
 * The rows are not hard-coded: the server returns every setting with its group,
 * description and `editable` flag, and this screen renders whatever it is given.
 * A setting added to the seed appears here without a frontend change, and one
 * the API will not accept a write for arrives with `editable: false` rather than
 * being offered and then refused.
 *
 * Only the human-facing labels live here — a dotted key is what code reads, not
 * something to put in front of an admin.
 */

/** Section order and titles. A group the map does not know is shown last, by key. */
/**
 * Sections, and which server groups feed each.
 *
 * A section is not always one group. `billing`, `notification`, `application`,
 * `directory` and `registration` are five server groups but one card: what an
 * invoice looks like, what a new member is charged, how the platform behaves
 * day to day and what registration collects are all "running the association
 * day to day" to the person on this screen, and five small boxes read as more
 * screen than one settings card with five headed groups inside it.
 */
const GROUPS: {
  key: string;
  groups: string[];
  /** Pulled out of whichever group they would otherwise land in, into this
   *  section instead. `notification.email_enabled`/`whatsapp_enabled` are
   *  `notification` settings by group, but sit here so they fill the empty
   *  row GSTIN — the one Organisation field nobody can leave half-blank —
   *  would otherwise leave beside it. */
  extraKeys?: string[];
  title: string;
  note: string;
  /** Fields per row at `xl` and up. 3 unless a card says otherwise — Operations
   *  earns 4 because "Application fee", "In-app bell", "Resubmission limit"
   *  and "Public directory" read as one row of four short switches, not two
   *  cramped rows of two. */
  columns?: 3 | 4;
}[] = [
  {
    key: 'organisation',
    groups: ['organisation'],
    extraKeys: ['notification.email_enabled', 'notification.whatsapp_enabled'],
    title: 'Organisation',
    note: 'Who the association is and how it reaches members — printed on invoices and receipts, shown to members, and the channels notifications go out on.',
  },
  {
    key: 'operations',
    /*
      `events` and `membership` are here rather than in cards of their own for
      the reason the other five are: how long seats are held and how long a
      lapsed membership is tolerated are both "how the platform runs day to
      day", and a card holding a single field reads as more screen than the
      field is worth.
    */
    groups: [
      'billing',
      'notification',
      'application',
      'directory',
      'registration',
      'events',
      'membership',
    ],
    columns: 4,
    // Renamed from "Billing" once notifications, applications, the directory
    // and registration joined the invoice/fee settings in this one card —
    // "Billing" described only the smaller card this used to be.
    title: 'Operations',
    note: 'How the platform runs day to day — invoices, fees, notifications, applications, the directory and the windows a booking or a membership is held open for.',
  },
];

/**
 * Admin-facing name and explanation per setting.
 *
 * The row's stored `description` is written for whoever maintains the code — it
 * cites `notification-architecture.md §7`, says FALSE rather than off, and names
 * open questions by number. All true, none of it addressed to the person using
 * this screen. The stored text stays the developer's note; this is the admin's.
 *
 * A setting with no entry here falls back to its key and its stored description,
 * so adding one to the seed still produces a usable row.
 */
interface SettingCopy {
  label: string;
  help: string;
  /**
   * A textarea rather than a one-line input. An address typed into a single
   * line comes out as one run of commas on the invoice.
   */
  multiline?: boolean;
  /** A fixed set of values. Rendered as a list, so nobody has to know the spelling. */
  options?: { label: string; value: string }[];
  /**
   * Only shown while this other setting is on.
   *
   * A price for something the association does not charge for is not a setting
   * with a sensible value — it is a question that should not have been asked.
   * Hiding it is also the answer to "if yes, ask the price immediately": the
   * field appears the moment the switch is turned on, right beside it.
   */
  showWhen?: string;
  /** Uploaded, not typed. The stored value is a storage key nobody should see. */
  slot?: BrandingSlot;
  /** Occupies the whole row. For controls a third of a card cannot hold. */
  full?: boolean;
  /**
   * Forces a new row, leaving whatever gap that costs.
   *
   * Controls in a grid row are bottom-aligned so that a label wrapping to two
   * lines does not step its neighbour's input down. That is right while every
   * control is the same 32px box — and wrong the moment a tall one joins the
   * row, because the short ones then float down to meet its foot and each ends
   * up with a hole between its label and its input. Cheaper to break the row.
   */
  startsRow?: boolean;
  /**
   * Decimal places a NUMBER setting may carry. Defaults to none: a due date is
   * measured in whole days, and 15.5 is a value the API would refuse after the
   * admin had already typed it.
   */
  decimals?: number;
}

const COPY: Record<string, SettingCopy> = {
  'organisation.name': {
    label: 'Display name',
    help: 'Used in email subjects, page titles and the invoice header.',
  },
  'organisation.legal_name': {
    label: 'Legal name',
    help: 'The registered name printed on invoices and receipts.',
  },
  'organisation.support_email': {
    label: 'Support email',
    help: 'Shown to members on error screens and in the footer of every notification.',
  },
  'organisation.gstin': {
    label: 'GSTIN',
    help: '15 characters, e.g. 24AABCU9603R1ZM. Invoices must not be issued to a real member while this is blank.',
  },
  'notification.email_enabled': {
    label: 'Email delivery',
    help: 'Off leaves messages queued rather than discarding them, so nothing is lost while the channel is muted.',
  },
  'notification.whatsapp_enabled': {
    label: 'WhatsApp delivery',
    help: 'No provider is connected yet, so turning this on only queues messages.',
  },
  'notification.in_app_enabled': {
    label: 'In-app bell',
    help: 'The notification feed inside the member portal.',
  },
  'billing.invoice_due_days': {
    label: 'Invoice due days',
    help: 'Days between an invoice being issued and falling due. Issued 1 Sep with 15 falls due 16 Sep.',
  },
  'application.max_resubmissions': {
    // "Maximum resubmissions" and then "Resubmission limit" both wrapped to two
    // lines in a third of a half-width card. "Retries" says the same thing in
    // half the width, and the ? carries the detail either way.
    label: 'Retries allowed',
    help: 'How many times a rejected application may be corrected and resubmitted before the next rejection closes it permanently. 0 means unlimited, not none — with 0 an application can be sent back forever and is never closed by a reviewer.',
  },
  'directory.public_enabled': {
    label: 'Public directory',
    help: 'On makes the list of member firms readable by anyone, without logging in.',
  },
  'registration.consent_text': {
    label: 'Registration consent text',
    help: 'Shown beside the checkbox an applicant must tick to submit the registration form. Leave blank to print nothing beyond the checkbox itself.',
    multiline: true,
    full: true,
  },
  'organisation.address': {
    label: 'Registered address',
    help: 'Printed under the legal name on every invoice and receipt. Type it the way it should appear, one line per line.',
    multiline: true,
    full: true,
  },
  'organisation.logo': {
    label: 'Logo',
    // First of the two tall controls in this card — everything above it is a
    // 32px input and would otherwise be dragged down to the buttons' baseline.
    startsRow: true,
    help: 'The full logo with the wordmark. Shown on the member portal header and at the top of an invoice. PNG, JPG or WebP, up to 2 MB.',
    slot: 'logo',
  },
  'organisation.logo_mark': {
    label: 'Logo mark',
    help: 'The square version without the wordmark, for places the full logo will not fit — the browser tab, a collapsed sidebar. PNG, JPG or WebP, up to 2 MB.',
    slot: 'logo-mark',
  },
  'organisation.signature': {
    label: 'Signature',
    help: 'The authorised signature printed on invoices and receipts, above the association name. Upload a scan on a plain background. PNG, JPG or WebP, up to 2 MB.',
    slot: 'signature',
  },
  'event.payment_hold_days': {
    label: 'Event seat hold days',
    help: 'How long a booking holds its seats before payment. The window is counted from approval on an event that needs it, so an admin taking their time never shortens what the payer gets.',
  },
  'membership.grace_days': {
    label: 'Membership grace days',
    help: 'How long after a membership expires it still counts as current — the window a renewal can be paid in before access is withdrawn.',
  },
  'billing.invoice_prefix': {
    label: 'Invoice prefix',
    help: 'The letters an invoice number starts with — IN in IN202603001. Changing it starts a new series: invoices already issued keep the number they were issued under.',
  },
  'billing.invoice_footer': {
    label: 'Invoice footer',
    help: 'Printed at the foot of every invoice — bank details, payment terms, a declaration. Leave blank to print nothing.',
    multiline: true,
    full: true,
  },
  'billing.renewal_basis': {
    label: 'Renewal basis',
    help: 'Financial year ends every term on 31 March so the whole association renews together, and a member joining part-way through pays only for the months left. Fixed term runs the fee’s own duration from the day each member joins.',
    options: [
      { label: 'Fixed term from join date', value: 'term' },
      { label: 'Financial year (31 March)', value: 'financial_year' },
    ],
  },
  'billing.charge_application_fee': {
    label: 'Application fee',
    help: 'Adds a one-time application fee to a new member’s first invoice, raised when the application is approved — not when it is submitted.',
    // Forces a new row rather than filling the fourth slot beside "Invoice
    // prefix"/"Invoice due days"/"Renewal basis" at `2xl`'s 4-column width —
    // it belongs on the row with "In-app bell", "Resubmission limit" and
    // "Public directory" (ROW_ORDER, right after this one), not that one.
    startsRow: true,
  },
  'billing.application_fee_amount': {
    // Short on purpose — it sits right beside "Application fee" and wrapped
    // to two lines, which stepped the whole row down to meet it.
    label: 'Fee amount',
    help: 'Before tax, in the fee currency. One amount for every category. Tax is added at the same rate as the membership fee.',
    showWhen: 'billing.charge_application_fee',
    decimals: 2,
  },
};

const labelOf = (key: string) => COPY[key]?.label ?? key;

/** Our copy where we have it; the stored developer note only as a fallback. */
const helpFor = (row: SystemSetting) => COPY[row.key]?.help ?? row.description ?? null;

/**
 * The order rows appear in, within their section.
 *
 * The API returns them sorted by key, which put GSTIN — the one field nobody can
 * fill in yet — at the top of Organisation, above the name of the association.
 * Alphabetical order of a machine key has nothing to do with the order an admin
 * reads these in.
 */
const ROW_ORDER = [
  // Organisation. Identity first, GSTIN next, then the delivery channels
  // `extraKeys` moved here (GROUPS, above) — filling the row GSTIN would
  // otherwise sit in alone — then the two images, then the address, which
  // takes a full row and so has to come last or it would break the grid in half.
  'organisation.name',
  'organisation.legal_name',
  'organisation.support_email',
  'organisation.gstin',
  'notification.email_enabled',
  'notification.whatsapp_enabled',
  'organisation.logo',
  'organisation.logo_mark',
  'organisation.signature',
  'organisation.address',
  // Billing. The invoice, then the term, then the fee — and the fee's amount
  // immediately after the switch that reveals it — then the rest of "day to
  // day operation": the one remaining delivery channel, the application and
  // directory switches, and what registration collects. The footer and the
  // consent text are both full-width blocks of prose, so both go dead last —
  // ahead of them, every row is a one-line field or a toggle.
  'billing.invoice_prefix',
  'billing.invoice_due_days',
  'billing.renewal_basis',
  'billing.charge_application_fee',
  'billing.application_fee_amount',
  'notification.in_app_enabled',
  'application.max_resubmissions',
  'directory.public_enabled',
  // The two day-to-day windows, beside the switches they run alongside and
  // ahead of the two prose blocks that close the card.
  'event.payment_hold_days',
  'membership.grace_days',
  'registration.consent_text',
  'billing.invoice_footer',
];

/** Anything unknown sorts after everything known, then by key. */
const rank = (key: string) => {
  const at = ROW_ORDER.indexOf(key);

  return at === -1 ? ROW_ORDER.length : at;
};

const byRowOrder = (a: SystemSetting, b: SystemSetting) =>
  rank(a.key) - rank(b.key) || a.key.localeCompare(b.key);

/**
 * Rows already in `ROW_ORDER`, sliced into the lines they render as.
 *
 * A break happens on `startsRow` or `full` (before the row that carries it),
 * or once a line already holds `columns` fields — whichever comes first. A
 * `full` row is always alone on its line, since it is meant to take the
 * whole width rather than share a row with anything.
 */
const groupIntoRows = (visibleRows: SystemSetting[], columns: number): SystemSetting[][] => {
  const groups: SystemSetting[][] = [];
  let current: SystemSetting[] = [];

  for (const row of visibleRows) {
    const copy = COPY[row.key];

    if ((copy?.startsRow || copy?.full) && current.length > 0) {
      groups.push(current);
      current = [];
    }

    current.push(row);

    if (copy?.full || current.length >= columns) {
      groups.push(current);
      current = [];
    }
  }

  if (current.length > 0) groups.push(current);

  return groups;
};

const asError = (error: unknown): ApiError => {
  const err = error as { message?: string; requestId?: string };

  return {
    message: err?.message ?? 'Something went wrong',
    ...(err?.requestId ? { requestId: err.requestId } : {}),
  };
};

export const SystemSettings = () => {
  const { can } = usePermissions();
  const canManage = can('settings.manage');

  const [rows, setRows] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * Edits, keyed by setting. Held separately from `rows` rather than mutating
   * them, so "what did the admin change" is a comparison rather than a flag —
   * which is what lets the save bar name the fields and Discard be a delete.
   */
  const [draft, setDraft] = useState<Record<string, string>>({});

  /**
   * Which image is mid-upload, and a counter appended to the preview URL.
   *
   * The public image URL is fixed per slot, so a replaced logo would keep
   * showing the old bytes out of the browser cache — the admin uploads, nothing
   * on screen changes, and they upload again. Bumping the counter makes it a
   * different URL and the new image appears at once.
   */
  const [uploading, setUploading] = useState<BrandingSlot | null>(null);
  const [brandingVersion, setBrandingVersion] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await SettingsService.list();
      setRows(res.data);
      setDraft({});
    } catch (err) {
      setError(asError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const valueOf = useCallback((row: SystemSetting) => draft[row.key] ?? row.value, [draft]);

  /**
   * A row gated behind a switch is only on screen while that switch is on.
   *
   * Read from the DRAFT, not from the saved value, so turning the application
   * fee on reveals its price field immediately — the admin never has to save
   * once to find out what else they have to fill in.
   */
  const isVisible = useCallback(
    (row: SystemSetting) => {
      const gate = COPY[row.key]?.showWhen;

      if (!gate) return true;

      const gateRow = rows.find((candidate) => candidate.key === gate);

      return gateRow ? (draft[gate] ?? gateRow.value) === 'true' : false;
    },
    [rows, draft],
  );

  /*
    A field the admin typed back to its original value is not a change. Without
    this, tabbing through a form leaves the save bar claiming edits that would
    be no-ops — and the server would agree, reporting "0 updated" after a save
    the admin was told they were making.
  */
  /*
    A hidden row is not a change either. Switching the application fee off after
    typing an amount would otherwise still save that amount — a figure the admin
    can no longer see, named in the save bar as something they changed.
  */
  const changed = useMemo(
    () =>
      rows.filter(
        (row) => isVisible(row) && draft[row.key] !== undefined && draft[row.key] !== row.value,
      ),
    [rows, draft, isVisible],
  );

  const sections = useMemo(() => {
    // Claimed by some section's `extraKeys` — pulled out of group membership
    // entirely, so the group they would normally land in does not also show
    // them.
    const claimed = new Set(GROUPS.flatMap((group) => group.extraKeys ?? []));

    const known = GROUPS.map((group) => ({
      ...group,
      rows: rows
        .filter(
          (row) =>
            group.extraKeys?.includes(row.key) ||
            (group.groups.includes(row.group) && !claimed.has(row.key)),
        )
        .sort(byRowOrder),
    })).filter((group) => group.rows.length > 0);

    const seen = new Set(GROUPS.flatMap((group) => group.groups));
    const rest = [...new Set(rows.map((row) => row.group))].filter((key) => !seen.has(key));

    return [
      ...known,
      ...rest.map((key) => ({
        key,
        title: key,
        note: '',
        columns: undefined,
        rows: rows.filter((row) => row.group === key).sort(byRowOrder),
      })),
    ];
  }, [rows]);

  const save = async () => {
    setSaving(true);
    try {
      const payload: SettingChange[] = changed.map((row) => ({
        key: row.key,
        value: draft[row.key] as string,
      }));

      const res = await SettingsService.update(payload);

      await load();
      // The display name titles the browser tab, and the tab is not part of this
      // screen — nothing else would tell it the name just changed.
      refreshOrganisation();
      toast.success(
        res.data.updated === 1 ? '1 setting saved' : `${res.data.updated} settings saved`,
      );
    } catch (err) {
      toast.error('Could not save', { description: asError(err).message });
    } finally {
      setSaving(false);
    }
  };

  /*
    One row, updated in place — deliberately not a reload.

    `load()` clears the draft, so refetching after an upload would silently throw
    away every text field the admin had edited but not yet saved. The upload
    already returns the new value; nothing else on the screen changed.
  */
  const setStoredValue = (key: string, value: string) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, value } : row)));

  /**
   * Uploading commits on the spot, unlike everything else here.
   *
   * There is nothing sensible to hold in the draft — the stored value is a
   * storage key the server invents, not something the form knows before it
   * asks. Deferring it to Save would mean either holding the file in memory and
   * losing it if the save failed, or uploading twice.
   */
  const putBranding = async (slot: BrandingSlot, file: File) => {
    setUploading(slot);
    try {
      const res = await SettingsService.uploadBranding(slot, file);

      setStoredValue(res.data.key, res.data.value);
      setBrandingVersion((version) => version + 1);
      refreshBranding();
      toast.success('Image uploaded');
    } catch (err) {
      toast.error('Could not upload the image', { description: asError(err).message });
    } finally {
      setUploading(null);
    }
  };

  const dropBranding = async (slot: BrandingSlot) => {
    setUploading(slot);
    try {
      const res = await SettingsService.removeBranding(slot);

      setStoredValue(res.data.key, '');
      setBrandingVersion((version) => version + 1);
      refreshBranding();
      toast.success('Image removed');
    } catch (err) {
      toast.error('Could not remove the image', { description: asError(err).message });
    } finally {
      setUploading(null);
    }
  };

  const control = (row: SystemSetting) => {
    const copy = COPY[row.key];
    const value = valueOf(row);
    const set = (next: string) => setDraft((d) => ({ ...d, [row.key]: next }));
    const locked = !row.editable || !canManage;

    /*
      Checked before `value_type`, because these are STRING rows whose value is a
      storage key. Rendering the key in a text box would show an admin a UUID and
      invite them to edit it — and the API refuses anything but an empty string
      here for exactly that reason.
    */
    if (copy?.slot) {
      const slot = copy.slot;

      return (
        <ImageUpload
          label={labelOf(row.key)}
          src={
            row.value ? `${API_ORIGIN}${ENDPOINTS.brandingImage(slot)}?v=${brandingVersion}` : null
          }
          uploading={uploading === slot}
          disabled={!canManage}
          onSelect={(file) => void putBranding(slot, file)}
          onRemove={() => void dropBranding(slot)}
        />
      );
    }

    /*
      A fixed list of values, chosen rather than typed.

      A dropdown, not a two-option segment like the Yes/No above: these labels
      are sentences ("Financial year (31 March)"), and a segment splitting a
      third of a card between two of them would truncate both. The search box is
      suppressed — a list you can read in full does not need filtering.
    */
    if (copy?.options) {
      return (
        <FormSelect
          aria-label={labelOf(row.key)}
          value={value}
          disabled={locked}
          onChange={(next) => set(String(next))}
          options={copy.options}
          searchThreshold={99}
        />
      );
    }

    if (row.value_type === 'BOOLEAN') {
      return (
        /*
          A two-option segment rather than a switch.
          
          A switch shows one state and leaves the other implied — you read the
          knob's position and infer the rest. Sitting in a grid beside text
          fields it also read as a different KIND of thing, at a different
          height, breaking the row. Yes and No are both on screen, both
          labelled, and the control is the same 32px box as every input beside
          it.
        */
        <Segmented
          label={labelOf(row.key)}
          value={value === 'true' ? 'true' : 'false'}
          disabled={locked}
          onChange={set}
          options={[
            { label: 'Yes', value: 'true' },
            { label: 'No', value: 'false' },
          ]}
        />
      );
    }

    if (row.value_type === 'NUMBER') {
      return (
        <NumberInput
          className="w-full"
          min={0}
          // Whole numbers unless the setting says otherwise. Days and retry
          // counts have no fractions; a fee has two.
          precision={copy?.decimals ?? 0}
          value={value === '' ? null : Number(value)}
          disabled={locked}
          onChange={(next) =>
            set(next === null || next === undefined ? '' : next.toFixed(copy?.decimals ?? 0))
          }
        />
      );
    }

    /*
      A textarea for anything that is genuinely several lines.

      An address forced onto one line comes back as a run of commas, and the
      admin cannot see where it will break on the invoice. Four rows shows a
      typical Indian address whole without turning the cell into a panel.
    */
    if (copy?.multiline) {
      return (
        <AntInput.TextArea
          aria-label={labelOf(row.key)}
          value={value}
          rows={4}
          // Fixed, not auto-growing: these sit in a grid, and a cell that grows
          // as you type re-heights the row and shifts every field beside it.
          style={{ resize: 'vertical' }}
          placeholder={row.value === '' ? 'Not set' : undefined}
          disabled={locked}
          onChange={(event) => set(event.target.value)}
        />
      );
    }

    return (
      /*
        AntD's input, not our `Input`.
        
        Ours exists to draw the label / hint / error scaffold around a control,
        and this screen draws its own label above the cell. Nested, that scaffold
        rendered empty but still contributed its 6px gap — so every text field
        was a 38px box where the number fields and the Yes/No were 32, and the
        row of labels sat 6px further from its inputs in this card than in the
        next one. A control that is already labelled needs the control only.
      */
      <AntInput
        className="w-full"
        aria-label={labelOf(row.key)}
        value={value}
        placeholder={row.value === '' ? 'Not set' : undefined}
        disabled={locked}
        onChange={(event) => set(event.target.value)}
      />
    );
  };

  if (error) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="System settings" />
        <ErrorState
          description={error.message}
          {...(error.requestId ? { requestId: error.requestId } : {})}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="System settings" />

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {loading ? (
          <Skeleton variant="card" />
        ) : (
          /*
            Two sections to a row. These are short lists — four rows at most —
            and stacked one-per-row they left the right half of a wide screen
            empty while pushing Directory below the fold. `lg:` so a narrow
            window puts them back in one column rather than halving an already
            narrow field.
          */
          /*
            Controls read at the supporting size, matching their labels.

            Through a nested `ConfigProvider`, not a class: AntD emits its own
            `.css-<hash>.ant-input` at a specificity a utility cannot reach, so
            `text-supporting` on the control was simply ignored and the values
            stayed at the 13px operator body — smaller than the label above them.
            Same seam `FormDrawer` uses for the same reason.
          */
          <ConfigProvider theme={{ token: { fontSize: 14 } }}>
            <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
              {sections.map((section) => (
                <Card key={section.key} flush>
                  <div className="border-b border-border px-4 py-3">
                    <h2 className="m-0 text-title-secondary text-fg">{section.title}</h2>
                    {section.note ? (
                      <p className="m-0 mt-0.5 text-13 text-fg-muted">{section.note}</p>
                    ) : null}
                  </div>

                  {/*
                  Rows, not a grid — `groupIntoRows` below splits this card's
                  fields into explicit rows of up to `columns` (3, or 4 for a
                  card that opts in), and each row is a flex line whose fields
                  share `flex-1`. A CSS grid with a fixed track count sizes
                  EVERY row by that count: a row with fewer fields than the
                  grid's columns sits in that many equal-width TRACKS and
                  leaves the rest of the row empty rather than stretching to
                  fill it — exactly what put a gap after "Renewal basis" once
                  Operations went to 4 columns for its one 4-field row but
                  still had 3-field rows above it. Flex rows have no such
                  fixed track count, so 1, 2, 3 or 4 fields in a row always
                  divide that row's actual width evenly.

                  Stacked below `xl` (one on a phone, two side by side above
                  640px — `sm:flex-row` on a row of 2 or fewer) for the same
                  reason the grid was: a narrower window gives each field too
                  little room to still read as a field, not a slot.
                */}
                  <div className="flex flex-col gap-4 p-4">
                    {groupIntoRows(section.rows.filter(isVisible), section.columns ?? 3).map(
                      (group, index) => (
                        <div
                          key={index}
                          className={['flex flex-col gap-4', group.length > 1 ? 'sm:flex-row' : '']
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {group.map((row) => (
                            <div
                              key={row.key}
                              className={[
                                'flex min-w-0 flex-col gap-1.5',
                                // An 80px upload tile has no business claiming
                                // an equal share of the row — stretched to it,
                                // "Logo mark" ended up half the card away from
                                // "Logo" instead of sitting beside it.
                                COPY[row.key]?.slot ? 'flex-none' : 'flex-1',
                              ].join(' ')}
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  {/*
                                  The explanation rides in the `?` rather than
                                  standing under the field. Ten settings each
                                  carrying two lines of prose made the screen a
                                  wall of grey text with the controls — the only
                                  thing anyone came here to touch — scattered
                                  down the right of it. Same rule the form
                                  drawers follow: guidance needed once goes
                                  behind the mark, guidance needed every time
                                  stays visible.
                                */}
                                  {helpFor(row) ? (
                                    <FieldLabel
                                      label={labelOf(row.key)}
                                      help={helpFor(row) as string}
                                      className="text-supporting font-medium text-fg"
                                    />
                                  ) : (
                                    <span className="text-supporting font-medium text-fg">
                                      {labelOf(row.key)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/*
                              `mt-auto` pins the control to the bottom of its
                              cell, and the wrapper is a plain block so its
                              child fills the column. As a flex container it
                              sized the text inputs to their content while the
                              number inputs — which carry `w-full` — stretched,
                              so two fields side by side in identical columns
                              came out different widths.

                              A row's items stretch to the tallest one (`items-
                              stretch`, the flex default), so a label that
                              wraps — "Maximum resubmissions" does, in a third
                              of a half-width card — pushed its own control a
                              line lower than its neighbours and the row of
                              inputs came out stepped. Bottom-aligned, they
                              line up whatever the labels above them do.
                            */}
                              <div className="mt-auto min-w-0">{control(row)}</div>
                            </div>
                          ))}
                        </div>
                      ),
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </ConfigProvider>
        )}
      </div>

      {/*
        Always on screen, disabled until there is something to save.

        The negative margins cancel the shell's 12px page frame so the bar meets
        the window on three sides. Inside the padding it read as a panel that had
        floated to the bottom of the page rather than the floor of the screen —
        and left a 12px strip of background under it that looked like a
        rendering fault.

        It used to appear only once a field changed, on the reasoning that a
        permanently visible Save invites a pointless press. That was wrong in the
        way that matters: the first thing anyone does on a settings screen is
        look for the Save button, and a screen that answers "there isn't one yet"
        has failed before the user has typed anything. Disabled still says the
        button exists and where it lives; absent says neither.

        The line on the left does the job the appearing bar was meant to — it
        names the fields, so "did I change anything?" is answered without
        scrolling back up.
      */}
      <div className="-mx-3 -mb-3 flex flex-none items-center justify-between gap-4 border-t border-border bg-surface-subtle px-4 py-2.5">
        <span className="min-w-0 truncate text-supporting text-fg-muted">
          {changed.length === 0
            ? 'No changes'
            : `${changed.length === 1 ? '1 change not saved' : `${changed.length} changes not saved`} · ${changed
                .map((row) => labelOf(row.key))
                .join(', ')}`}
        </span>

        <span className="flex flex-none items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setDraft({})}
            disabled={saving || changed.length === 0}
            disabledReason={changed.length === 0 ? 'Nothing has been changed yet.' : undefined}
          >
            Discard
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            loading={saving}
            disabled={changed.length === 0}
            disabledReason={changed.length === 0 ? 'Nothing has been changed yet.' : undefined}
          >
            Save changes
          </Button>
        </span>
      </div>
    </div>
  );
};

export default SystemSettings;
