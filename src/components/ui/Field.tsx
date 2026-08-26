import type { ReactNode } from 'react';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  /**
   * The same guidance as `hint`, folded into a mark beside the label instead of
   * standing under the control.
   *
   * For a rule a writer needs once — where the note goes, who reads it. Anything
   * needed *while* filling the field in stays a `hint`, because help you cannot
   * see is help most people never read.
   */
  help?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

/**
 * The label / hint / error scaffold every form control shares.
 *
 * Kept separate from the controls so `Input`, `Select`, a `DatePicker` and a
 * future `FileUpload` cannot drift into three different error treatments — the
 * error text position and the required marker are decided once, here.
 */
export const Field = ({ label, htmlFor, hint, help, error, required, children }: FieldProps) => (
  <div className="flex flex-col gap-[6px]">
    <label htmlFor={htmlFor} className="text-14 font-medium text-fg">
      {label}
      {required ? (
        <span className="ml-1 text-status-danger-fg" aria-hidden="true">
          *
        </span>
      ) : null}
      {required ? <span className="sr-only"> (required)</span> : null}
      {/*
        After the required mark, not before it: the asterisk belongs to the label
        and the mark belongs to the pair. `FieldLabel` is not reused here because
        it owns the label text itself, and this label already has an asterisk and
        a screen-reader note inside it.
      */}
      {help ? (
        <Tooltip title={help}>
          <span
            tabIndex={0}
            role="note"
            aria-label={help}
            className="ml-1.5 inline-flex cursor-help items-center rounded-full align-middle text-fg-subtle transition-colors duration-100 hover:text-fg"
          >
            <QuestionCircleOutlined aria-hidden="true" />
          </span>
        </Tooltip>
      ) : null}
    </label>

    {children}

    {hint && !error ? <p className="m-0 text-12 text-fg-muted">{hint}</p> : null}

    {error ? (
      <p role="alert" className="m-0 flex items-center gap-1 text-12 text-status-danger-fg">
        <ExclamationCircleFilled aria-hidden="true" />
        {error}
      </p>
    ) : null}
  </div>
);

export default Field;
