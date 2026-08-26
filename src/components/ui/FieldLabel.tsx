import { Tooltip } from 'antd';
import { CircleHelp } from 'lucide-react';

export interface FieldLabelProps {
  label: string;
  /** The rule or consequence a first-time user needs; shown on hover and focus. */
  help: string;
  /** Typography for the label text. Defaults to inheriting from the parent. */
  className?: string;
  /** Glyph size in px. Scale it up beside a heading, or the mark reads as dirt. */
  iconSize?: number;
}

/**
 * A field label with its guidance folded into a hover target.
 *
 * Standing help text under every input turns a short form into a wall — the
 * reader scans six lines to find four fields. A mark beside the label keeps the
 * form scannable and puts the rule one hover away.
 *
 * The trade is real: help you cannot see is help most people never read, so this
 * is for rules you need *once* (a code's character set, an irreversible choice),
 * not for anything required to fill the field correctly every time.
 *
 * `tabIndex` is what keeps that honest — hover alone would hide the text from
 * anyone driving by keyboard — and the sr-only copy means a screen reader gets
 * it without needing the tooltip to open at all.
 */
export const FieldLabel = ({ label, help, className = '', iconSize = 14 }: FieldLabelProps) => (
  <span className={`inline-flex items-center gap-1.5 ${className}`.trim()}>
    {label}
    <Tooltip title={help}>
      <span
        tabIndex={0}
        role="note"
        aria-label={help}
        className="inline-flex cursor-help items-center rounded-full text-fg-subtle transition-colors duration-100 hover:text-fg"
      >
        <CircleHelp size={iconSize} strokeWidth={1.5} aria-hidden />
      </span>
    </Tooltip>
  </span>
);

export default FieldLabel;
