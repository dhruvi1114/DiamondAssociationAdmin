import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Card, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import ApplicationsService, { type ApprovalWorkflow } from '@/services/applicationsService';
import { asDisplayError, type DisplayError } from '@/utils/apiError';

/**
 * A-33 — the approval workflow, read-only.
 *
 * This screen exists to answer one question an approver asks constantly: *why is
 * this application not in my queue?* The answer is here, as data — how many
 * stages there are, in what order, and which role owns each one.
 *
 * That is why **switched-off stages are listed, not filtered out**
 * (stage-toggle D-10). A stage can be taken out of the flow without being
 * deleted, and when it is, this question gets asked about it far more often than
 * about the stages still running — so hiding it would delete the answer and
 * leave a workflow whose numbering has a hole in it and nothing to explain it.
 *
 * There are **no disabled controls**. The editor is M10 (ADR-011: a workflow
 * builder is a week of UI the federation will use approximately twice), and a
 * row of greyed-out buttons would tell the reader the feature exists and they
 * lack permission — which is a different, wrong story. The page says plainly
 * what is editable, by whom, and when the screen for it arrives
 * (ux-principles.md §4).
 */

export const Workflow = () => {
  const [workflow, setWorkflow] = useState<ApprovalWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DisplayError | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await ApplicationsService.workflow();
      setWorkflow(result.data);
    } catch (caught) {
      setError(asDisplayError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !workflow) {
    return <Skeleton variant="detail" />;
  }

  if (error || !workflow) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <ErrorState
          title="The approval workflow could not be loaded"
          description={
            error?.message ?? 'No active workflow is configured for membership applications.'
          }
          {...(error?.requestId ? { requestId: error.requestId } : {})}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  /*
    A stage can be switched off without being deleted (stage-toggle D-1), and the
    API returns the switched-off ones with everything else. They are listed here
    rather than filtered out: this is the screen that answers "why is this
    application not in my queue?", and the answer is usually that the stage the
    reader is thinking of is off (stage-toggle D-10).
  */
  const offCount = workflow.stages.filter((stage) => !stage.is_active).length;
  const onCount = workflow.stages.length - offCount;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Approval Workflow"
        subtitle={`${workflow.name} · version ${workflow.version} · ${
          workflow.is_active ? 'in use now' : 'not in use'
        }. ${
          offCount > 0
            ? `An application follows the ${onCount === 1 ? 'one stage' : `${onCount} stages`} still in the flow, in order; the ${offCount === 1 ? 'one marked Off is' : `${offCount} marked Off are`} skipped.`
            : 'Every membership application follows these stages in order.'
        }`}
      />

      <Alert
        className="mb-4"
        variant="info"
        message="This is a read-only view. Editing arrives in M10."
        description="Stages, their order, their owning roles and their targets are configuration rows, not code — changing one is a data change today, applied by a super admin at the database. The screen for editing them ships with the rest of the configuration screens."
      />

      <div className="flex flex-col gap-3">
        {workflow.stages.map((stage) => {
          const off = !stage.is_active;

          return (
            <Card key={stage.id}>
              <div className="flex flex-wrap items-start gap-4">
                {/*
                  The number stays the stage's own `sequence`, gap and all
                  (stage-toggle D-3). This is the configuration, not an
                  application's progress through it, and 1 · 2 · 3 with two of
                  them off is precisely what a reader has come here to see —
                  renumbering to 1 would hide that a position is being held open.
                */}
                <span
                  className={`grid h-8 w-8 flex-none place-items-center rounded-full bg-raised text-13 font-semibold ${
                    off ? 'text-fg-subtle' : 'text-fg'
                  }`}
                >
                  {stage.sequence}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      className={`m-0 text-16 font-semibold ${off ? 'text-fg-muted' : 'text-fg'}`}
                    >
                      {stage.name}
                    </h2>
                    {/*
                      The catalogue's Badge, so "Off" looks like every other
                      qualifier in the app and this page sets no colour of its
                      own. `neutral` deliberately: a stage that is off is a
                      configuration choice, not a fault or a warning.
                    */}
                    {off ? (
                      <Badge
                        tone="neutral"
                        tooltip="Switched off in the workflow configuration. The stage and its decision history are kept; only the flow ignores it."
                      >
                        Off
                      </Badge>
                    ) : null}
                    {stage.is_final ? <Badge tone="success">Final stage</Badge> : null}
                  </div>

                  <dl className="m-0 mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-[2px]">
                      <dt className="m-0 text-11 font-medium uppercase tracking-[0.04em] text-fg-muted">
                        Decided by
                      </dt>
                      <dd className={`m-0 text-13 ${off ? 'text-fg-muted' : 'text-fg'}`}>
                        {stage.approver_role.name}{' '}
                        <span className="font-mono text-11 text-fg-muted">
                          {stage.approver_role.code}
                        </span>
                      </dd>
                    </div>

                    <div className="flex flex-col gap-[2px]">
                      <dt className="m-0 text-11 font-medium uppercase tracking-[0.04em] text-fg-muted">
                        Target turnaround
                      </dt>
                      <dd className={`m-0 text-13 ${off ? 'text-fg-muted' : 'text-fg'}`}>
                        {stage.sla_hours !== null ? (
                          <>
                            {stage.sla_hours} hours{' '}
                            <span className="text-12 text-fg-muted">
                              {off
                                ? '— not counted against anything while the stage is off'
                                : '— shown as an overdue badge in the queue, never enforced'}
                            </span>
                          </>
                        ) : (
                          <span className="text-fg-subtle">No target set</span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  {/*
                    What this stage does, or — when it is off — what happens
                    instead of it. The "off" sentence is the point of listing the
                    stage at all: it says the flow skips it, that an approval at
                    the stage before jumps past it, and that nothing was thrown
                    away, which is the answer to "where did my step go?".
                  */}
                  <p className="m-0 mt-3 text-12 text-fg-muted">
                    {off
                      ? 'Switched off, so the flow skips it: nothing is ever queued here and an approval at the stage before goes straight to the next stage that is on. The stage is kept rather than deleted, so its past decisions stay readable and switching it back on restores this position.'
                      : stage.is_final
                        ? 'Approving here creates the member record and its membership number, opens the term and raises the membership invoice — in one transaction. Nothing is created if any part of it fails.'
                        : 'Approving here moves the application to the next stage and tells the applicant it advanced. No member or invoice is created yet.'}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="m-0 mt-6 max-w-[80ch] text-12 text-fg-subtle">
        An application enters the first stage that is on when it is submitted, and each approval
        advances it to the next one that is on. A return sends it back to the applicant and, on
        resubmission, back to that first stage — a correction made for a later stage can invalidate
        what an earlier one checked. An application already sitting on a stage that was switched off
        stays where it is and moves on normally when it is decided. Holding{' '}
        <code className="rounded-sm bg-surface-subtle px-[4px] py-[1px] font-mono">
          application.approve
        </code>{' '}
        is not enough to decide a stage: one of your roles must also be the role named above.
      </p>
    </div>
  );
};

export default Workflow;
