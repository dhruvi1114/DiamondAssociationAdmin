export interface MoneyTextProps {
  /**
   * Amount as a STRING with 2 decimals, exactly as the API sends it
   * (api-conventions.md §1). Passing a number would reintroduce the float drift
   * the Decimal(14,2) column exists to prevent.
   */
  amount: string | null | undefined;
  currency?: string;
  /** Renders struck through — a cancelled invoice or a reversed payment. */
  cancelled?: boolean;
  className?: string;
}

const SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

/**
 * Money, formatted once and identically everywhere: grouped thousands, always
 * 2 decimals, tabular figures so columns line up (design-system.md §4).
 */
export const MoneyText = ({
  amount,
  currency = 'INR',
  cancelled = false,
  className = '',
}: MoneyTextProps) => {
  if (amount === null || amount === undefined || amount === '') {
    return <span className={`tabular text-fg-muted ${className}`.trim()}>&mdash;</span>;
  }

  const numeric = Number(amount);
  const formatted = Number.isFinite(numeric)
    ? numeric.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : amount;

  return (
    <span
      className={`tabular whitespace-nowrap ${cancelled ? 'text-fg-muted line-through' : ''} ${className}`.trim()}
    >
      {SYMBOLS[currency] ?? `${currency} `}
      {formatted}
    </span>
  );
};

export default MoneyText;
