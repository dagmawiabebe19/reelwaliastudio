import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth/getUser";
import { isAdmin } from "@/lib/auth/isAdmin";
import { countPendingApprovals } from "@/lib/admin/approvals";
import { getBalance } from "@/lib/credits/balance";
import { ShellLayout } from "@/components/sidebar/ShellLayout";

interface AppShellProps {
  children: ReactNode;
}

export async function AppShell({ children }: AppShellProps) {
  const user = await getSessionUser();
  const userEmail = user?.email ?? null;
  let creditBalance = null;
  let userIsAdmin = false;
  let pendingApprovalsCount = 0;

  if (user) {
    userIsAdmin = await isAdmin(user.id);
    const [balance, pendingCount] = await Promise.all([
      getBalance(user.id),
      userIsAdmin ? countPendingApprovals() : Promise.resolve(0),
    ]);
    creditBalance = balance;
    pendingApprovalsCount = pendingCount;
  }

  return (
    <ShellLayout
      userEmail={userEmail}
      creditBalance={creditBalance}
      isAdmin={userIsAdmin}
      pendingApprovalsCount={pendingApprovalsCount}
    >
      {children}
    </ShellLayout>
  );
}
