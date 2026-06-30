import { formatCredits } from "@/lib/credits/format";

interface CreditBalanceBadgeProps {
  available: number;
  reserved?: number;
  compact?: boolean;
}

export function CreditBalanceBadge({
  available,
  reserved = 0,
  compact = false,
}: CreditBalanceBadgeProps) {
  if (compact) {
    return (
      <span className="font-medium tabular-nums text-foreground">
        {formatCredits(available)}
      </span>
    );
  }

  return (
    <div className="rounded-md border border-border bg-surface-elevated px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Credits</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
        {formatCredits(available)}
      </p>
      {reserved > 0 ? (
        <p className="mt-0.5 text-xs text-muted">
          {formatCredits(reserved)} reserved
        </p>
      ) : null}
    </div>
  );
}
