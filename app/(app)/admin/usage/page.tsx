import Link from "next/link";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getAdminUsageDashboard } from "@/lib/admin/usage-stats";
import { UsageAccountsTable } from "@/components/admin/UsageAccountsTable";
import { UsageSummaryStrip } from "@/components/admin/UsageSummaryStrip";

export const dynamic = "force-dynamic";

export default async function AdminUsagePage() {
  await requireAdmin();
  const { summary, accounts } = await getAdminUsageDashboard();

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Admin</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Usage &amp; abuse
        </h1>
        <p className="max-w-3xl text-sm text-muted">
          Per-account credit consumption from the append-only ledger. Read-only — no balance
          mutations from this view.
        </p>
      </header>

      <UsageSummaryStrip summary={summary} />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">
            Accounts ({accounts.length})
          </h2>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/admin/approvals" className="text-accent hover:underline">
              Pending approvals
            </Link>
            <Link href="/credits" className="text-accent hover:underline">
              Your credits
            </Link>
          </div>
        </div>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted">No accounts yet.</p>
        ) : (
          <UsageAccountsTable accounts={accounts} />
        )}
      </section>
    </div>
  );
}
