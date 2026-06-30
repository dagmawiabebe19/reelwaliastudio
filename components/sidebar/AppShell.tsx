import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth/getUser";
import { getBalance } from "@/lib/credits/balance";
import { ShellLayout } from "@/components/sidebar/ShellLayout";

interface AppShellProps {
  children: ReactNode;
}

export async function AppShell({ children }: AppShellProps) {
  const user = await getSessionUser();
  const userEmail = user?.email ?? null;
  const creditBalance = user ? await getBalance(user.id) : null;

  return (
    <ShellLayout userEmail={userEmail} creditBalance={creditBalance}>
      {children}
    </ShellLayout>
  );
}
