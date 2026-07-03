import { formatCredits } from "@/lib/credits/format";

interface CreditBalanceBadgeProps {
  available: number;
  reserved?: number;
  compact?: boolean;
  /** Admin accounts: show lifetime usage instead of spendable balance. */
  adminMode?: boolean;
}

export function CreditBalanceBadge({
  available,
  reserved = 0,
  compact = false,
  adminMode = false,
}: CreditBalanceBadgeProps) {
  const displayAmount = adminMode ? Math.abs(available) : available;

  if (compact) {
    return (
      <span className="font-medium tabular-nums text-foreground">
        {formatCredits(displayAmount)}
      </span>
    );
  }

  return (
    <div className="rounded-md border border-border bg-surface-elevated px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {adminMode ? "Admin usage meter" : "Credits"}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
        {formatCredits(displayAmount)}
      </p>
      {adminMode ? (
        <p className="mt-0.5 text-xs text-muted">lifetime usage (unlimited)</p>
      ) : null}
      {reserved > 0 ? (
        <p className="mt-0.5 text-xs text-muted">
          {formatCredits(reserved)} reserved
        </p>
      ) : null}
    </div>
  );
}
