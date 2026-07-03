import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireUser } from "@/lib/auth/getUser";
import { isAdmin } from "@/lib/auth/isAdmin";
import { getBalance, getLedgerHistory } from "@/lib/credits";
import { CreditBalanceBadge } from "@/components/credits/CreditBalanceBadge";
import { LedgerTable } from "@/components/credits/LedgerTable";
import { EmptyState } from "@/components/ui/EmptyState";

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
        {userIsAdmin ? (
          <Link href="/admin/usage" className="inline-block text-sm text-accent hover:underline">
            Admin: usage &amp; abuse dashboard →
          </Link>
        ) : null}
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
          <LedgerTable entries={ledger} />
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
