import { Building2, IdCard } from 'lucide-react';
import { Card, StatusChip } from '@/components/ui';
import type { ApplicationDetail } from '@/services/applicationsService';
import { formatDateTime } from '@/utils/format';
import { Field, Group } from '@/components/ui/DetailFields';

/**
 * A-04 · left column — everything read together as one record, not split
 * across cards: what the applicant claims about the company, who they are,
 * and the member record this application completes. Four groups, one panel —
 * a reviewer reading top to bottom never leaves the surface they started on.
 *
 * The group titles are Title Case because they are labels naming a thing, not
 * sentences: Company Information, Registration & Identity, Applicant Details,
 * Member Record. The last one carries the member row's own status in brackets,
 * so it reads "Member Record (Draft)" until final approval promotes it.
 *
 * The claimed-company order is not a design choice: it is the order of
 * `saveDraftSchema` on the server, which is the order of the applicant's own
 * form. Applicant and Member Record follow it because they answer "who is
 * this" only after "what are they applying for" has been read.
 */

// Only ever used to title the Member Record group, which is now folded into
// Company Information; the StatusChip inside still speaks the status. Kept as
// source because restoring that group means restoring this map with it.
//
//   const MEMBER_STATUS_LABELS: Record<string, string> = {
//     DRAFT: 'Draft',
//     PENDING: 'Awaiting Payment',
//     ACTIVE: 'Active',
//     SUSPENDED: 'Suspended',
//     EXPIRED: 'Expired',
//     TERMINATED: 'Terminated',
//   };

export interface SnapshotPanelProps {
  application: ApplicationDetail;
}

export const SnapshotPanel = ({ application }: SnapshotPanelProps) => {
  const member = application.member;
  const registered = member?.addresses?.find((row) => row.address_type === 'REGISTERED');

  return (
    <Card>
      <div className="flex flex-col gap-5">
        {/*
          Membership applied for (Category / Tier) — hidden at the client's
          request. The same values are still on screen: Category rides in the
          identity row beside the status chip, and Tier is folded into it
          there too. Restore this block if the group needs to come back on
          its own.

          <Group
            icon={<Layers size={16} strokeWidth={1.5} />}
            title="Membership applied for"
            description="What the applicant will be billed for and listed as if this is approved."
          >
            <Field label="Category" value={application.category?.name} />
            <Field label="Tier" value={application.tier?.name} />
          </Group>
        */}

        <Group icon={<Building2 size={16} strokeWidth={1.5} />} title="Company Information">
          {/*
            Trading name, legal name and business type are hidden at the client's
            request. The trading name is the page's own title, in the shell
            header, so repeating it as the first field said the same word twice.

            <Field label="Trading name" value={application.company_name} />
            <Field label="Legal name" value={application.legal_name} />
            <Field label="Business type" value={application.business_type} />
          */}

          {/*
            Applicant Details and Member Record were their own groups until the
            client merged them in here. They describe one company from three
            angles — what it calls itself, who filed for it, and the member
            record the approval will complete — and three headings for one
            subject made the reader carry the join.
          */}
          <Field label="Name" value={application.user?.full_name} />
          <Field label="Email" value={application.user?.email} />
          <Field label="Phone" value={application.user?.phone} />
          <Field label="Submitted" value={application.submitted_at}>
            {application.submitted_at ? (
              <span className="tabular">{formatDateTime(application.submitted_at)}</span>
            ) : undefined}
          </Field>
          <Field label="Membership number" value={member?.member_code} mono />
          <Field label="Record status" value={member?.status}>
            {member ? <StatusChip domain="member" status={member.status} /> : undefined}
          </Field>
          <Field label="Company type" value={member?.company_type?.name} />
          {/* Labelled "Company category" — the association's own word for the
              MembershipCategories a company belongs to. Matches the member page. */}
          <Field
            label="Company category"
            value={member?.categories?.map((entry) => entry.category.name).join(', ') ?? null}
          />
          <Field
            label="GSTIN holder"
            value={member ? (member.gstin_holder ? 'Yes' : 'No') : null}
          />
          {/*
            The reference form's Yes/No radio of the same name — hidden, because
            the label now belongs to the multi-select above and because nothing
            reads this one (spec OQ-R1 is still open on what it means).

            <Field
              label="Company category"
              value={
                member?.company_category === null || member?.company_category === undefined
                  ? null
                  : member.company_category
                    ? 'Yes'
                    : 'No'
              }
            />
          */}
          <Field label="Landline" value={member?.landline} />
          <Field label="Consent accepted" value={member?.consent_accepted_at}>
            {member?.consent_accepted_at ? (
              <span className="tabular">{formatDateTime(member.consent_accepted_at)}</span>
            ) : undefined}
          </Field>
          <Field label="Country" value={registered?.country} />
          <Field label="State" value={registered?.state} />
          <Field label="City" value={registered?.city} />
          <Field label="Website" value={application.website}>
            {application.website ? (
              <a
                href={application.website}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-supporting underline"
              >
                {application.website}
              </a>
            ) : undefined}
          </Field>
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
            <Field label="About the company" value={application.about} />
          </div>
        </Group>

        {/* description="The numbers the committee verifies against the uploaded documents." — hidden at the client's request. */}
        <Group icon={<IdCard size={16} strokeWidth={1.5} />} title="Registration & Identity">
          <Field label="GST number" value={application.gst_number} mono />
          <Field label="PAN" value={application.pan_number} mono />
          <Field label="IEC code" value={application.iec_code} mono />
          <Field label="Trade licence no." value={application.trade_license_no} mono />
        </Group>
      </div>
    </Card>
  );
};

export default SnapshotPanel;
