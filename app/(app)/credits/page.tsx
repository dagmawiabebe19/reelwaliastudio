import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireUser } from "@/lib/auth/getUser";
import { isAdmin } from "@/lib/auth/isAdmin";
import { getBalance, getLedgerHistory } from "@/lib/credits";
import { getSpendSummaryLast30Days } from "@/lib/credits/spend-summary";
import { formatCredits } from "@/lib/credits/format";
import { CreditBalanceBadge } from "@/components/credits/CreditBalanceBadge";
import { LedgerTable } from "@/components/credits/LedgerTable";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function CreditsPage() {
  const user = await requireUser();
  const [balance, ledger, userIsAdmin, spendSummary] = await Promise.all([
    getBalance(user.id),
    getLedgerHistory(user.id, 50),
    isAdmin(user.id),
    getSpendSummaryLast30Days(user.id),
  ]);

  const hasSpend =
    spendSummary.video > 0 || spendSummary.images > 0 || spendSummary.copilot > 0;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Credits
        </h1>
        <p className="max-w-2xl text-sm text-muted">
          Your balance is derived from an append-only ledger. Generation charges and
          purchases appear below as they occur.
        </p>
        {userIsAdmin ? (
          <Link href="/admin/usage" className="inline-block text-sm text-accent hover:underline">
            Admin: usage &amp; abuse dashboard →
          </Link>
        ) : null}
      </header>

      <div className="max-w-xs space-y-2">
        <CreditBalanceBadge
          available={balance.available}
          reserved={balance.reserved}
          adminMode={userIsAdmin}
        />
      </div>

      {hasSpend ? (
        <section className="rounded-lg border border-border bg-surface px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">Spend last 30 days</h2>
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <dt className="inline text-muted">Video </dt>
              <dd className="inline font-medium tabular-nums text-foreground">
                {formatCredits(spendSummary.video)}
              </dd>
            </div>
            <div>
              <dt className="inline text-muted">Images </dt>
              <dd className="inline font-medium tabular-nums text-foreground">
                {formatCredits(spendSummary.images)}
              </dd>
            </div>
            <div>
              <dt className="inline text-muted">Co-pilot </dt>
              <dd className="inline font-medium tabular-nums text-foreground">
                {formatCredits(spendSummary.copilot)}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

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
          <LedgerTable entries={ledger} />
        )}
      </section>

      <p className="text-sm text-muted">
        Need more credits?{" "}
        <span className="text-foreground">Purchases coming soon.</span>{" "}
        <Link href="/" className="text-accent hover:underline">
          Back to home
        </Link>
      </p>
    </div>
  );
}
