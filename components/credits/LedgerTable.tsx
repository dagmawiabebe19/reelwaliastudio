import { formatCredits } from "@/lib/credits/format";
import type { CreditLedgerEntry } from "@/lib/credits/types";

function formatLedgerType(type: string): string {
  return type.replace(/_/g, " ");
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

interface LedgerTableProps {
  entries: CreditLedgerEntry[];
}

export function LedgerTable({ entries }: LedgerTableProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted">No ledger entries.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border bg-surface-elevated text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">When</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Amount</th>
            <th className="px-4 py-3 font-medium">Balance after</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Reference</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((entry) => (
            <tr key={entry.id} className="bg-surface">
              <td className="whitespace-nowrap px-4 py-3 text-muted">
                {formatWhen(entry.created_at)}
              </td>
              <td className="px-4 py-3 capitalize text-foreground">
                {formatLedgerType(entry.type)}
              </td>
              <td
                className={`px-4 py-3 font-medium tabular-nums ${
                  entry.amount >= 0 ? "text-emerald-600" : "text-foreground"
                }`}
              >
                {entry.amount >= 0 ? "+" : ""}
                {formatCredits(entry.amount)}
              </td>
              <td className="px-4 py-3 tabular-nums text-foreground">
                {formatCredits(entry.balance_after)}
              </td>
              <td className="px-4 py-3 capitalize text-muted">{entry.status}</td>
              <td
                className="max-w-[240px] truncate px-4 py-3 text-muted"
                title={entry.reference ?? undefined}
              >
                {entry.reference ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
