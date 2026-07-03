import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getAdminLedgerHistory, getAdminProfileEmail } from "@/lib/admin/admin-ledger";
import { LedgerTable } from "@/components/credits/LedgerTable";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ userId: string }>;
}

export default async function AdminUsageAccountPage({ params }: PageProps) {
  await requireAdmin();
  const { userId } = await params;

  const [email, ledger] = await Promise.all([
    getAdminProfileEmail(userId),
    getAdminLedgerHistory(userId, 100),
  ]);

  if (!email && ledger.length === 0) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Link href="/admin/usage" className="text-sm text-accent hover:underline">
          ← Usage dashboard
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          {email ?? userId}
        </h1>
        <p className="text-sm text-muted">
          Admin read-only ledger view for this account.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Ledger history</h2>
        <LedgerTable entries={ledger} />
      </section>
    </div>
  );
}
