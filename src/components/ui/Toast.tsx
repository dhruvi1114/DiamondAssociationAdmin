import type { CSSProperties } from 'react';
import { Toaster, toast as sonnerToast } from 'sonner';
import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAppSelector } from '@/store';

/**
 * Transient feedback (design-system.md §2): success/error, ~4s, optional action
 * link ("View invoice").
 *
 * Built on `sonner` rather than AntD's `message` because it supports an action
 * affordance and stacking without an imperative context holder — and a toast the
 * user cannot act on is usually a toast that should have been an Alert.
 *
 * Rule of thumb: Toast for the result of something the user just did; Alert for
 * a condition of the record that persists.
 */

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

/**
 * One row per meaning, and the ONLY place a toast's colour is decided.
 *
 * Both values come from the status pair the whole system uses, so a toast and
 * the row, tag or alert reporting the same outcome are never two different
 * greens. Colour is never alone: every variant carries its own glyph, because
 * colour alone fails WCAG 1.4.1 and these screens get photographed and printed.
 */
const VARIANTS: Record<ToastVariant, { icon: LucideIcon; fg: string; bg: string }> = {
  success: { icon: CircleCheck, fg: 'var(--status-success-fg)', bg: 'var(--status-success-bg)' },
  error: { icon: CircleX, fg: 'var(--status-danger-fg)', bg: 'var(--status-danger-bg)' },
  warning: { icon: TriangleAlert, fg: 'var(--status-warning-fg)', bg: 'var(--status-warning-bg)' },
  info: { icon: Info, fg: 'var(--status-info-fg)', bg: 'var(--status-info-bg)' },
};

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** The second line: what to do about it, or why it happened. */
  description?: string;
  action?: ToastAction;
  /** Milliseconds. `Infinity` pins the toast until dismissed. */
  duration?: number;
}

interface StatusToastProps extends ToastOptions {
  id: string | number;
  variant: ToastVariant;
  message: string;
}

/**
 * The toast itself.
 *
 * `color-mix` derives the border and the icon well from the variant's own
 * foreground, so a tint can never drift out of step with the text it frames —
 * and adding a fifth status means adding one row above, not three colours.
 *
 * `role="status"` with `aria-live="polite"`: a toast reports something that has
 * already happened, so it waits for a natural pause rather than interrupting
 * whatever the screen reader is mid-sentence on. An error the user MUST act on
 * belongs in an Alert beside the control, not here.
 */
const StatusToast = ({ id, variant, message, description, action }: StatusToastProps) => {
  const { icon: Icon, fg, bg } = VARIANTS[variant];

  /*
    A one-line toast centres against its icon; a two-line one hangs from the top
    so the icon sits beside the headline rather than floating between the lines.
    Same component, because the alternative is two that drift apart.
  */
  const stacked = Boolean(description || action);

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'flex w-full gap-3 rounded-xl border p-3 shadow-overlay',
        stacked ? 'items-start' : 'items-center',
      ].join(' ')}
      style={{ background: bg, borderColor: `color-mix(in srgb, ${fg} 24%, transparent)` }}
    >
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${fg} 14%, transparent)`, color: fg }}
      >
        <Icon size={18} strokeWidth={1.75} aria-hidden />
      </span>

      <div className={['min-w-0 flex-1', stacked ? 'pt-1' : ''].join(' ')}>
        <p className="m-0 text-supporting font-medium text-fg">{message}</p>

        {description ? <p className="m-0 mt-0.5 text-13 text-fg-muted">{description}</p> : null}

        {action ? (
          <button
            type="button"
            onClick={() => {
              action.onClick();
              sonnerToast.dismiss(id);
            }}
            className="mt-2 cursor-pointer rounded-md border-0 bg-transparent p-0 text-13 font-medium underline underline-offset-2"
            style={{ color: fg }}
          >
            {action.label}
          </button>
        ) : null}
      </div>

      {/*
        A real dismiss control, not `sonner`'s hover-revealed one. These carry
        errors that a user may want to keep on screen while they retype a field,
        and a close button you have to find by hovering is one you cannot use on
        a touch screen at all.
      */}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => sonnerToast.dismiss(id)}
        className="-m-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md border-0 bg-transparent !text-fg-muted transition-colors duration-100 hover:!bg-surface-hover hover:!text-fg"
      >
        <X size={16} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
};

export const ToastHost = () => {
  const themeMode = useAppSelector((state) => state.ui.themeMode);

  return (
    <Toaster
      position="top-right"
      duration={4000}
      theme={themeMode}
      /*
        `unstyled` because every toast here is `toast.custom`. Without it sonner
        paints its own white, bordered, shadowed box AROUND the card below — a
        second frame, visible as a pale halo on the tinted variants.
      */
      /*
        One width, declared once on the container; the two elements inside it
        both stretch. `unstyled` is what makes the `w-full` necessary — it strips
        sonner's own width rule off the list item, which then collapses to its
        content and drags the card in with it. Sizing the card instead is the
        trap: at 400px inside sonner's 356px slot it hung off the right of the
        viewport.
      */
      style={{ '--width': '400px' } as CSSProperties}
      toastOptions={{
        unstyled: true,
        className: 'w-full',
        style: { fontFamily: 'var(--font-sans)' },
      }}
    />
  );
};

const show =
  (variant: ToastVariant) =>
  (message: string, options: ToastOptions | ToastAction = {}) => {
    // Historic call sites pass a bare action object as the second argument.
    const opts: ToastOptions =
      'label' in options && 'onClick' in options ? { action: options } : options;

    return sonnerToast.custom(
      (id) => <StatusToast id={id} variant={variant} message={message} {...opts} />,
      { duration: opts.duration },
    );
  };

export const toast = {
  success: show('success'),
  error: show('error'),
  warning: show('warning'),
  info: show('info'),
  /** Ties a toast to a promise — the standard save/submit affordance. */
  promise: <T,>(
    promise: Promise<T>,
    messages: { loading: string; success: string; error: string },
  ) => sonnerToast.promise(promise, messages),
};

export default toast;
