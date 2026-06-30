import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth/getUser";
import { isAdmin } from "@/lib/auth/isAdmin";
import { getBalance } from "@/lib/credits/balance";
import { ShellLayout } from "@/components/sidebar/ShellLayout";

interface AppShellProps {
  children: ReactNode;
}

export async function AppShell({ children }: AppShellProps) {
  const user = await getSessionUser();
  const userEmail = user?.email ?? null;
  const [creditBalance, userIsAdmin] = user
    ? await Promise.all([getBalance(user.id), isAdmin(user.id)])
    : [null, false];

  return (
    <ShellLayout
      userEmail={userEmail}
      creditBalance={creditBalance}
      isAdmin={userIsAdmin}
    >
      {children}
    </ShellLayout>
  );
}
