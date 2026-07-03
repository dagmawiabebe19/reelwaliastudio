import { formatCredits } from "@/lib/credits/format";
import type { AdminUsageSummary } from "@/lib/admin/usage-stats";

function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatShortDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${month}/${day}`;
}

interface UsageSummaryStripProps {
  summary: AdminUsageSummary;
}

export function UsageSummaryStrip({ summary }: UsageSummaryStripProps) {
  const maxSignups = Math.max(1, ...summary.signupsPerDay.map((d) => d.count));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface-elevated p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Credits granted
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {formatCredits(summary.grantedAllTime)}
          </p>
          <p className="mt-1 text-xs text-muted">
            Last 7d: {formatCredits(summary.grantedLast7Days)}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-elevated p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Credits spent (committed)
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {formatCredits(summary.spentAllTime)}
          </p>
          <p className="mt-1 text-xs text-muted">
            Last 7d: {formatCredits(summary.spentLast7Days)}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-elevated p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Est. provider cost
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {formatUsd(summary.estimatedProviderUsdAllTime)}
          </p>
          <p className="mt-1 text-xs text-muted">
            Last 7d: {formatUsd(summary.estimatedProviderUsdLast7Days)} · committed ÷ 2 ÷ 10
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-elevated p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Welcome-burned accounts
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-600">
            {summary.welcomeBurnedCount}
          </p>
          <p className="mt-1 text-xs text-muted">
            ≥90% grant spent · no purchase · inactive 3+ days
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-elevated p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Signups per day (last 14 days)
        </p>
        <div className="mt-4 flex h-24 items-end gap-1">
          {summary.signupsPerDay.map((day) => (
            <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-accent/80 transition-all"
                style={{
                  height: `${Math.max(4, (day.count / maxSignups) * 100)}%`,
                  minHeight: day.count > 0 ? "4px" : "2px",
                }}
                title={`${day.date}: ${day.count}`}
              />
              <span className="text-[10px] text-muted">{formatShortDate(day.date)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
