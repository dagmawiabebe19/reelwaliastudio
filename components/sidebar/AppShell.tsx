import type { ReactNode } from "react";
import { isDevNoAuth } from "@/lib/auth/dev";
import { getActiveUserId } from "@/lib/auth/active-user";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar/Sidebar";

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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar userEmail={userEmail} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-10 py-12">{children}</div>
      </main>
    </div>
  );
}
