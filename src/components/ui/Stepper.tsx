import type { ReactNode } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

export type StepState = 'done' | 'current' | 'todo' | 'stopped';

export interface Step {
  /** Stable identity for the list. */
  key: string;
  /** What this step IS — "Approved", "Document verification". */
  label: string;
  /** One line under it: who owns it, when it happened, what it is waiting on. */
  caption?: ReactNode;
  state: StepState;
}

export interface StepperProps {
  steps: Step[];
  /**
   * What to read out to a screen reader in place of the visual trail — e.g.
   * "Step 2 of 4: Paid". The circles and the rule between them are decorative;
   * the sentence is the content.
   */
  label: string;
}

/**
 * Where a record is in a fixed sequence, and what is left.
 *
 * Answers three of the four questions every workflow on this platform has to
 * answer at a glance (CLAUDE.md UX): current state, next step, expected result.
 * The fourth — the required action — is the button beside it, not here: a trail
 * that also carried a control would be two things, and the control would move
 * every time the record advanced.
 *
 * Shared rather than per-page. This was the application review page's own
 * `StageTrail`; the booking detail needed the same drawing for a different
 * sequence, and a second copy is how two screens drift into different circles,
 * different rules and a different idea of what "done" looks like.
 *
 * `stopped` is the state a progress bar usually lacks and every real workflow
 * needs. A rejected application and a cancelled booking did not finish and did
 * not fail halfway — they ENDED, at a known point, and drawing them as
 * "in progress" or quietly greying the rest says neither.
 */
export const Stepper = ({ steps, label }: StepperProps) => {
  if (steps.length === 0) return null;

  return (
    <>
      <span className="sr-only">{label}</span>
      <ol className="m-0 flex list-none items-center p-0" aria-hidden>
        {steps.map((step, index) => {
          const done = step.state === 'done';
          const current = step.state === 'current';
          const stopped = step.state === 'stopped';

          return (
            <li key={step.key} className="flex min-w-0 flex-1 items-center">
              <div className="flex min-w-0 items-center gap-2">
                {done ? (
                  <CheckCircle2
                    size={28}
                    strokeWidth={1.5}
                    className="flex-none text-status-success-fg"
                  />
                ) : stopped ? (
                  <XCircle
                    size={28}
                    strokeWidth={1.5}
                    className="flex-none text-status-danger-fg"
                  />
                ) : (
                  <span
                    className={[
                      'grid h-7 w-7 flex-none place-items-center rounded-full text-13 font-semibold',
                      current ? 'bg-primary text-primary-fg' : 'bg-sunken text-fg-subtle',
                    ].join(' ')}
                  >
                    {index + 1}
                  </span>
                )}
                <div className="min-w-0">
                  <p
                    className={[
                      'm-0 truncate text-supporting font-medium',
                      current
                        ? 'text-primary'
                        : stopped
                          ? 'text-status-danger-fg'
                          : done
                            ? 'text-fg'
                            : 'text-fg-muted',
                    ].join(' ')}
                  >
                    {step.label}
                  </p>
                  {step.caption ? (
                    <p className="m-0 truncate text-12 text-fg-muted">{step.caption}</p>
                  ) : null}
                </div>
              </div>

              {/* Connects to the next circle — the last step has nothing after it. */}
              {index < steps.length - 1 ? (
                <div className={`mx-3 h-px min-w-6 flex-1 ${done ? 'bg-primary' : 'bg-border'}`} />
              ) : null}
            </li>
          );
        })}
      </ol>
    </>
  );
};

export default Stepper;
