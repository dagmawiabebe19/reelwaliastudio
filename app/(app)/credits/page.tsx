import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireUser } from "@/lib/auth/getUser";
import { isAdmin } from "@/lib/auth/isAdmin";
import { getBalance, getLedgerHistory } from "@/lib/credits";
import { formatCredits } from "@/lib/credits/format";
import { CreditBalanceBadge } from "@/components/credits/CreditBalanceBadge";
import { EmptyState } from "@/components/ui/EmptyState";

function formatLedgerType(type: string): string {
  return type.replace(/_/g, " ");
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default async function CreditsPage() {
  const user = await requireUser();
  const [balance, ledger, userIsAdmin] = await Promise.all([
    getBalance(user.id),
    getLedgerHistory(user.id, 50),
    isAdmin(user.id),
  ]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Credits
        </h1>
        <p className="max-w-2xl text-sm text-muted">
          Your balance is derived from an append-only ledger. Purchases and generation
          charges will appear here in a future update.
        </p>
      </header>

      <div className="max-w-xs space-y-2">
        {userIsAdmin ? (
          <p className="text-sm font-medium text-accent">Admin — unlimited (metering still runs)</p>
        ) : null}
        <CreditBalanceBadge
          available={balance.available}
          reserved={balance.reserved}
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Recent activity</h2>
        {ledger.length === 0 ? (
          <EmptyState
            variant="panel"
            icon={Receipt}
            title="No activity yet"
            description="Generation charges and purchases will appear here as you use the studio."
          />
        ) : (
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
                {ledger.map((entry) => (
                  <tr key={entry.id} className="bg-surface">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
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
                    <td className="max-w-[200px] truncate px-4 py-3 text-muted" title={entry.reference ?? undefined}>
                      {entry.reference ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-sm text-muted">
        Need more credits?{" "}
        <span className="text-foreground">Purchases coming soon.</span>{" "}
        <Link href="/" className="text-accent hover:underline">
          Back to studio
        </Link>
      </p>
    </div>
  );
}
