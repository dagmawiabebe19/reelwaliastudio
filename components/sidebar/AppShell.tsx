import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth/getUser";
import { ShellLayout } from "@/components/sidebar/ShellLayout";

interface AppShellProps {
  children: ReactNode;
}

export async function AppShell({ children }: AppShellProps) {
  const user = await getSessionUser();
  const userEmail = user?.email ?? null;

  return <ShellLayout userEmail={userEmail}>{children}</ShellLayout>;
}
