import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, ChevronRight, FileText } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  StatusDot,
} from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePermissions } from '@/hooks/usePermissions';
import ApplicationsService, {
  DOCUMENT_SIDE_LABELS,
  isActionable,
  latestDocuments,
  scoreDocuments,
  type ApplicationDetail,
  type ApplicationDocument,
  type ApprovalStage,
} from '@/services/applicationsService';
import { asDisplayError, type DisplayError } from '@/utils/apiError';
import { formatDate } from '@/utils/format';
import ActivityDrawer from './ActivityDrawer';
import DecisionBar from './DecisionBar';
import DocumentVerificationDrawer from './DocumentVerificationDrawer';
import ReopenApplicationCard from './ReopenApplicationCard';
import SnapshotPanel from './SnapshotPanel';

/**
 * A-04 — review and decide one membership application (AJ-2).
 *
 * The heart of M4. The page opens with its own header block — breadcrumb, the
 * company name, the status, and one quiet line saying when it arrived and where
 * it has got to — then splits: the record on the left, the decision on the
 * right. Everything the applicant claimed, who they are and the member record it
 * completes (`SnapshotPanel`) is the reading; Actions and the Documents Summary
 * are the doing.
 *
 * **Two things are drawers now, not columns.** Verifying documents and reading
 * the activity history were both panels in the right-hand column, and between
 * them they made the column taller than the screen on every application with
 * more than three files — so the Actions card, the one thing that column exists
 * for, was regularly scrolled off. They are `DocumentVerificationDrawer` and
 * `ActivityDrawer`; this page owns only whether each is open. What stays in the
 * column is the *summary* of the documents, which is what a reviewer needs while
 * reading the record, and a banner on the left that says plainly how many files
 * are still waiting and opens the drawer that clears them.
 *
 * **Where the record is named.** Once, in the shell header, which reads
 * "Virali & Sons" rather than "Applications" — `usePageTitle` is called with the
 * company name below. The page itself deliberately carries NO `<h1>`: the name
 * appearing both in the header bar and again in the page body is the exact
 * defect design-system.md §5a exists to prevent, and the client chose the header
 * as the place it should live.
 *
 * What stays on the page under the breadcrumb is everything the header cannot
 * say: which list this came from, the status chip, when it was submitted and
 * which stage holds it. The back arrow stays in the shell too, because it cannot
 * be scrolled away there — which the breadcrumb can.
 */

/** The configured stages, drawn as a trail with this application's position on it. */
const StageTrail = ({
  stages,
  currentStageId,
  status,
}: {
  stages: ApprovalStage[];
  currentStageId: string | null;
  status: ApplicationDetail['status'];
}) => {
  if (stages.length === 0) return null;

  const currentIndex = stages.findIndex((stage) => stage.id === currentStageId);

  return (
    <ol className="m-0 flex list-none items-center p-0">
      {stages.map((stage, index) => {
        const isCurrent = stage.id === currentStageId;
        // With no current stage the application is closed, so "done" means
        // approved and nothing else. A rejected application did not clear the
        // stages it never reached.
        const isDone = currentIndex === -1 ? status === 'APPROVED' : index < currentIndex;

        return (
          <li key={stage.id} className="flex min-w-0 flex-1 items-center">
            <div
              className="flex min-w-0 items-center gap-2"
              {...(isCurrent ? { 'aria-current': 'step' as const } : {})}
            >
              {isDone ? (
                <CheckCircle2
                  size={28}
                  strokeWidth={1.5}
                  className="flex-none text-status-success-fg"
                  aria-hidden
                />
              ) : (
                <span
                  className={[
                    'grid h-7 w-7 flex-none place-items-center rounded-full text-13 font-semibold',
                    isCurrent ? 'bg-primary text-primary-fg' : 'bg-sunken text-fg-subtle',
                  ].join(' ')}
                  aria-hidden
                >
                  {stage.sequence}
                </span>
              )}
              <div className="min-w-0">
                <p
                  className={[
                    'm-0 truncate text-supporting font-medium',
                    isCurrent ? 'text-primary' : isDone ? 'text-fg' : 'text-fg-muted',
                  ].join(' ')}
                >
                  {stage.name}
                </p>
                <p className="m-0 truncate text-12 text-fg-muted">
                  {stage.approver_role.name} decides
                  {stage.sla_hours !== null ? ` · ${stage.sla_hours}h target` : ''}
                </p>
              </div>
            </div>

            {/* Connects to the next circle — the last stage has nothing after it. */}
            {index < stages.length - 1 ? (
              <div className={`mx-3 h-px min-w-6 flex-1 ${isDone ? 'bg-primary' : 'bg-border'}`} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
};

/**
 * "Aadhaar Card — Back", or just "PAN Document" when the type is one file.
 *
 * The name comes from the API, which resolves it from the master: an admin who
 * renames a document type expects this screen to say the new name, and a code
 * like `TRADE_LICENCE` was never an instruction anybody could act on.
 */
const documentLabel = (document: ApplicationDocument) =>
  DOCUMENT_SIDE_LABELS[document.side]
    ? `${document.document_type.name} — ${DOCUMENT_SIDE_LABELS[document.side]}`
    : document.document_type.name;

/**
 * A-04 · left column — the one thing standing between this application and a
 * decision, said as a sentence with the way to fix it attached.
 *
 * It renders only while the application is still actionable AND something is
 * genuinely outstanding. That condition is the whole point: a banner that keeps
 * announcing work after the work is done is worse than no banner, because the
 * next one the reviewer meets gets read as furniture too. When the last file is
 * verified this disappears and the Approve button un-locks — the two are the
 * same fact, drawn at the two ends of the screen a reviewer is looking at.
 */
const VerificationBanner = ({
  outstanding,
  onOpen,
}: {
  outstanding: number;
  onOpen: () => void;
}) => (
  /*
    The card stays greyscale like every other surface on the page; the colour is
    on the BUTTON, which is the only part of this banner anybody acts on.

    A tinted panel colours a whole region to say one thing, and next to four
    grey cards it read as an alert about the record rather than as work waiting
    to be done. On the control, the same warning role points at the thing to
    press and leaves the reading matter alone.
  */
  <Card>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-[2px] flex-none text-status-warning-fg" aria-hidden>
          <FileText size={20} strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <p className="m-0 text-supporting font-semibold text-fg">
            Document verification in progress
          </p>
          <p className="m-0 mt-[2px] text-supporting text-fg-muted">
            Verify all documents from the drawer. Once completed, approval action will be enabled.
          </p>
        </div>
      </div>

      <Button
        variant="warning"
        icon={<ChevronRight size={16} strokeWidth={1.5} />}
        iconPosition="end"
        onClick={onOpen}
      >
        {`${outstanding} Document${outstanding === 1 ? '' : 's'} to verify`}
      </Button>
    </div>
  </Card>
);

/**
 * A-04 · right column — what was uploaded and how it stands, read-only.
 *
 * This card used to carry the ✓/✗ controls themselves. They moved into
 * `DocumentVerificationDrawer`, where a reviewer can see the file and mark it in
 * the same place — marking a document you cannot read is a rubber stamp, and the
 * old panel asked for exactly that. What is left here is the part a reviewer
 * wants *while reading the record*: the score, and which named file is holding
 * it up. Every row is a link into the drawer by way of the button at the foot.
 *
 * One row per required face, newest version only (`latestDocuments`) — the same
 * set `scoreDocuments` counts, so the count above the list and the list under it
 * cannot disagree. A superseded v1 is still on the record; it is in the drawer,
 * which is where the history of what a reviewer actually saw belongs.
 */
const DocumentsSummaryCard = ({
  documents,
  onOpen,
}: {
  documents: ApplicationDocument[];
  onOpen: () => void;
}) => {
  const score = scoreDocuments(documents);
  const rows = latestDocuments(documents);

  const count = [
    `${score.verified} of ${score.total} verified`,
    score.pending > 0 ? `${score.pending} awaiting review` : null,
    score.rejected > 0 ? `${score.rejected} rejected` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card
      dense
      title="Documents Summary"
      description={rows.length === 0 ? undefined : count}
      footer={
        rows.length === 0 ? undefined : (
          <Button
            block
            variant="ghost"
            icon={<ChevronRight size={16} strokeWidth={1.5} />}
            iconPosition="end"
            onClick={onOpen}
          >
            View all documents
          </Button>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title="No documents uploaded"
          description="An application cannot be submitted without its required documents, so an empty list here means the requirement list is empty."
        />
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {rows.map((document, index) => (
            <li
              key={document.id}
              className={`flex items-start justify-between gap-3 py-2 ${
                index > 0 ? 'border-t border-border' : ''
              }`}
            >
              <div className="flex min-w-0 items-start gap-2">
                <span className="mt-[2px] flex-none text-fg-muted" aria-hidden>
                  <FileText size={16} strokeWidth={1.5} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-supporting font-medium text-fg">
                      {documentLabel(document)}
                    </span>
                    {/*
                      `is_required` is absent on an older response, and absent
                      reads as required — which is what every screen assumed
                      before the field was typed, and the safer of the two
                      defaults besides.
                    */}
                    {document.document_type.is_required === false ? (
                      <Badge>Optional</Badge>
                    ) : (
                      <Badge tone="info">Required</Badge>
                    )}
                    {document.version > 1 ? (
                      <Badge
                        tone="info"
                        tooltip="A re-upload. Earlier versions are kept so a past decision stays explainable by the file the reviewer actually saw."
                      >
                        {`v${document.version}`}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="m-0 text-12 text-fg-muted">
                    Uploaded on <span className="tabular">{formatDate(document.createdAt)}</span>
                  </p>
                </div>
              </div>

              <span className="flex-none pt-[2px]">
                <StatusDot domain="document" status={document.verification_status} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
};

export const ApplicationReview = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isSuperAdmin, roles } = usePermissions();

  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [stages, setStages] = useState<ApprovalStage[]>([]);
  /**
   * `application.max_resubmissions`, carried on the workflow because a reviewer
   * cannot read `SystemSettings` (super admin only). `0` = unlimited. Defaults to
   * `0` while the workflow is loading or if it failed, which reads as "no limit"
   * — the honest answer when the number is not known, and one that never claims
   * an application is about to close when it is not.
   */
  const [maxResubmissions, setMaxResubmissions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DisplayError | null>(null);
  const [conflict, setConflict] = useState<DisplayError | null>(null);

  /**
   * The two drawers. This page owns nothing but whether each is open — what is
   * inside them belongs to the drawers themselves, which is the point of moving
   * them out of the column.
   */
  const [docsOpen, setDocsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await ApplicationsService.detail(id);
      setApplication(result.data);
    } catch (caught) {
      setError(asDisplayError(caught));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // The workflow supplies the stage trail, the "what happens next" copy and the
    // reassign targets. It needs `workflow.view`; a reviewer without it keeps the
    // screen and loses the trail, which is the right trade.
    ApplicationsService.workflow()
      .then((result) => {
        setStages(result.data.stages);
        setMaxResubmissions(result.data.max_resubmissions);
      })
      .catch(() => {
        setStages([]);
        setMaxResubmissions(0);
      });
  }, []);

  useEffect(() => {
    // A conflict banner belongs to one application, not to the tab. So does an
    // open drawer: navigating from one application to the next in a queue must
    // not leave the previous record's documents on screen.
    setConflict(null);
    setDocsOpen(false);
    setHistoryOpen(false);
  }, [id]);

  // Stable, or `usePageTitle`'s effect would re-fire — and re-register the
  // back handler with the shell — on every render of this page.
  const goBack = useCallback(() => navigate(-1), [navigate]);

  /**
   * The shell header names the record — "Virali & Sons", with the application
   * number beside it — and the page therefore carries no `<h1>` of its own.
   * One visible title per screen (design-system.md §5a); the client chose the
   * header as the place it should live. The back arrow stays in the shell too,
   * above this page's own scroll: a way back that can be scrolled out of reach
   * is not one.
   *
   * **Null-safe, and it has to be.** Hooks run before the loading guard below,
   * so on the first render of a cold load `application` is still null. Reading
   * a field off it here blanks the whole screen — React unmounts the tree on a
   * render-phase throw, and an error with no boundary above it shows as nothing
   * at all rather than as a message.
   */
  usePageTitle(application?.company_name ?? null, {
    onBack: goBack,
    meta: application?.application_number ?? null,
    status: application ? { domain: 'application', value: application.status } : null,
  });

  if (loading && !application) {
    return <Skeleton variant="detail" />;
  }

  if (error || !application) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <ErrorState
          title="This application could not be loaded"
          description={error?.message ?? 'The record is not available.'}
          {...(error?.requestId ? { requestId: error.requestId } : {})}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  const stage = application.current_stage;

  /**
   * Does one of this reviewer's roles own the current stage?
   *
   * Known client-side, so the screen can say whose queue this is *before* a
   * click rather than only after a 403. The buttons stay live regardless: the
   * server owns the answer, and its refusal names the stage and the role.
   */
  const ownsStage = Boolean(stage && (isSuperAdmin || roles.includes(stage.approver_role.code)));

  const open = isActionable(application.status);

  /**
   * The same score the Actions card obeys and the drawer clears, derived here
   * from the same `application.documents` with the same function rather than
   * passed between components — two derivations of one array cannot drift; two
   * copies in state can.
   */
  const score = scoreDocuments(application.documents);

  return (
    <div className="flex flex-col">
      {/* Contributes the hidden h1 only — the visible name is in the header
          block below, and the shell header no longer repeats it. */}
      <PageHeader title={application.company_name} />

      {/*
        **The page header block is gone, at the client's request** — all of it:
        the breadcrumb, the status chip, the submitted date, the stage line and
        the history icon. Nothing renders here now, so the block is commented
        rather than left as an empty `div` with a margin, which would have held
        open a gap above the stage trail for no reason.

        Where each piece went, so this is recoverable rather than merely deleted:
          - company name and application number → the shell header
            (`usePageTitle(..., { meta })`), with the back arrow beside them;
          - status → the stage trail below, which draws position, owner and SLA
            for every stage instead of naming one of them;
          - history icon → the Actions card header (`DecisionBar`), beside the
            decision it informs.

        Restoring the block needs `Breadcrumbs`, `StatusChip`, `CalendarDays`,
        `Clock`, `History` and `formatDateTime` imported again.

        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Breadcrumbs
              items={[
                { label: 'Applications', to: '/applications' },
                { label: application.application_number ?? 'Draft application' },
              ]}
            />

            <div className="mt-2 flex flex-wrap items-center gap-2 text-12 text-fg-muted">
              <StatusChip domain="application" status={application.status} />
              <span className="inline-flex items-center gap-[6px]">
                <CalendarDays size={14} strokeWidth={1.5} aria-hidden />
                {application.submitted_at
                  ? `Submitted on ${formatDateTime(application.submitted_at)}`
                  : 'Not submitted yet'}
              </span>
              {stage ? (
                <span className="inline-flex items-center gap-[6px]">
                  <Clock size={14} strokeWidth={1.5} aria-hidden />
                  {`Stage ${stage.sequence} of ${stages.length || stage.sequence} : ${stage.name}`}
                </span>
              ) : null}
            </div>
          </div>

          <Button
            variant="ghost"
            aria-label="Activity history"
            icon={<History size={18} strokeWidth={1.5} />}
            onClick={() => setHistoryOpen(true)}
          />
        </div>
      */}

      {/*
        Two columns, two different relationships with the page's scroll. The
        left one — stage trail, alerts, the verification banner, the full
        claimed-and-recorded snapshot — is the reading order and scrolls with
        the page like anything else. The right one is Actions and the Documents
        Summary together, `sticky` so it travels with the reader rather than
        being left behind: a decision is the point of this screen, and the
        control for it should never be a scroll away from whatever the reviewer
        is currently reading. It gets its own `overflow-y-auto`, capped to the
        viewport, only so that IF its own stack is taller than the screen it
        scrolls internally rather than pushing the page wider than one screen's
        worth of sticky content ever should — the single scroll region is still
        the page's own (layout.md); this is the same bounded-internal-scroll
        `DataTable`'s own body already uses, not a second one competing with it.
      */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-4">
        <div className="flex flex-col gap-4 xl:col-span-3">
          {stages.length > 0 ? (
            <Card>
              {/*
                How many corrections this application has already been through,
                against the association's limit — the one number that decides
                what the Reject button in the right-hand column will do, and the
                only place on the left of the screen it appears. Hidden at zero:
                a first-time application has nothing to say here, and a chip that
                reads "0 / 3" on every record teaches the eye to skip it.
              */}
              {application.resubmission_count > 0 ? (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge
                    tone="warning"
                    tooltip="Corrections the applicant has already made. When these run out, a rejection closes the application permanently. The earlier rounds are on the Activity timeline."
                  >
                    {maxResubmissions > 0
                      ? `Correction ${application.resubmission_count} of ${maxResubmissions}`
                      : `Corrected ${application.resubmission_count} time${application.resubmission_count === 1 ? '' : 's'}`}
                  </Badge>
                  {maxResubmissions > 0 &&
                  application.resubmission_count >= maxResubmissions &&
                  open ? (
                    <span className="text-supporting text-status-danger-fg">
                      No corrections left — the next rejection closes this application.
                    </span>
                  ) : null}
                </div>
              ) : null}

              <StageTrail
                stages={stages}
                currentStageId={application.current_stage_id}
                status={application.status}
              />
            </Card>
          ) : null}

          {/*
            Only while there is genuinely something to verify AND the application
            can still be acted on. On a closed record the marks are history, and
            on a fully verified one the outstanding work is nil — a banner in
            either case would be announcing a job that is not there.
          */}
          {open && score.outstanding > 0 ? (
            <VerificationBanner outstanding={score.outstanding} onOpen={() => setDocsOpen(true)} />
          ) : null}

          {/*
            A conflict that left the application open was not a race — the dialog
            has already shown its message and the reviewer can act on it. A
            conflict that closed it was, and it needs a banner that outlives the
            dialog it killed.
          */}
          {conflict && !open ? (
            <Alert
              variant="danger"
              message={conflict.message}
              description="The screen has been reloaded with what actually happened. The activity history has the decision and who made it."
            />
          ) : null}

          {open && !ownsStage && stage ? (
            <Alert
              variant="info"
              message={`This application is at ${stage.name}, which the ${stage.approver_role.name} role decides. It is not in your queue.`}
              description="You can read it and verify its documents. A decision will be refused with the same message, because the permission you hold says what you may do and the stage's role says whose work it is."
            />
          ) : null}

          <SnapshotPanel application={application} />
        </div>

        <div className="sticky top-0 flex max-h-[calc(100vh-var(--header-height)-24px)] flex-col gap-4 overflow-y-auto">
          <DecisionBar
            application={application}
            stages={stages}
            maxResubmissions={maxResubmissions}
            onDecided={load}
            onConflict={setConflict}
            onOpenHistory={() => setHistoryOpen(true)}
          />
          {/*
            Directly under Actions, and only on a closed application (spec D-18).
            It renders nothing at all otherwise — including for an admin without
            `settings.manage`, which is the one thing on this screen that is
            hidden rather than refused, because reopening is not a reviewer's
            decision at all rather than one they are merely not holding today.
          */}
          <ReopenApplicationCard
            application={application}
            maxResubmissions={maxResubmissions}
            onReopened={load}
          />
          <DocumentsSummaryCard
            documents={application.documents}
            onOpen={() => setDocsOpen(true)}
          />
        </div>
      </div>

      <DocumentVerificationDrawer
        open={docsOpen}
        onClose={() => setDocsOpen(false)}
        applicationId={application.id}
        documents={application.documents}
        status={application.status}
        onChanged={load}
      />

      <ActivityDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        application={application}
      />

      {/* Async state changes are announced, not just animated (ux-principles §9). */}
      <div className="sr-only" role="status" aria-live="polite">
        {loading ? 'Refreshing application' : ''}
      </div>
    </div>
  );
};

export default ApplicationReview;
