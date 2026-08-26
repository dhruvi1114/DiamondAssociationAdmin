import { useCallback, useState } from 'react';

export interface UseConfirmResult<T> {
  /** The record awaiting confirmation, or null when the dialog is shut. */
  target: T | null;
  /** True while the confirmed action is in flight. */
  busy: boolean;
  /** Open the dialog for a record. */
  ask: (target: T) => void;
  /** Close without acting. Ignored mid-flight, so a stray click cannot orphan the request. */
  cancel: () => void;
  /** Run the action for the pending record, then close. Errors are left to the caller's own handler. */
  confirm: (run: (target: T) => Promise<unknown>) => Promise<void>;
}

/**
 * The state every confirmation needs: which record, and is it running yet.
 *
 * Without it each screen keeps its own `pending` and `busy` pair and they drift
 * — one forgets to clear on error and leaves a dialog that cannot be shut, one
 * forgets `busy` and lets a double-click send the delete twice.
 */
export const useConfirm = <T>(): UseConfirmResult<T> => {
  const [target, setTarget] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);

  const cancel = useCallback(() => {
    setBusy((running) => {
      if (!running) setTarget(null);

      return running;
    });
  }, []);

  const confirm = useCallback(
    async (run: (value: T) => Promise<unknown>) => {
      if (target === null) return;

      setBusy(true);

      try {
        await run(target);
      } finally {
        // Always, including on failure: the error belongs on the page behind
        // this, where it can be read next to the row it is about.
        setBusy(false);
        setTarget(null);
      }
    },
    [target],
  );

  return { target, busy, ask: setTarget, cancel, confirm };
};
