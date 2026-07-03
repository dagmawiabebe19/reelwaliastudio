import Link from "next/link";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { listPendingApprovalAccounts } from "@/lib/admin/approvals";
import { PendingApprovalsTable } from "@/components/admin/PendingApprovalsTable";

export const dynamic = "force-dynamic";

export default async function AdminApprovalsPage() {
  await requireAdmin();
  const accounts = await listPendingApprovalAccounts();

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Admin</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Pending approvals
        </h1>
        <p className="max-w-3xl text-sm text-muted">
          New signups land on the waitlist until you approve them. Approving grants the welcome
          credit bundle.
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">
            Waitlist ({accounts.length})
          </h2>
          <Link href="/admin/usage" className="text-sm text-accent hover:underline">
            Usage &amp; abuse
          </Link>
        </div>
        <PendingApprovalsTable accounts={accounts} />
      </section>
    </div>
  );
}
