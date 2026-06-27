import type { ReactNode } from "react";
import { isDevNoAuth } from "@/lib/auth/dev";
import { getActiveUserId } from "@/lib/auth/active-user";
import { createClient } from "@/lib/supabase/server";
import { ShellLayout } from "@/components/sidebar/ShellLayout";

interface AppShellProps {
  children: ReactNode;
}

export async function AppShell({ children }: AppShellProps) {
  let userEmail: string | null = null;

  if (isDevNoAuth()) {
    userEmail = `dev:${await getActiveUserId()}`;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  }

  return <ShellLayout userEmail={userEmail}>{children}</ShellLayout>;
}
