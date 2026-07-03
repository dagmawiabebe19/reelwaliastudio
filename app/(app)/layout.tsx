import type { ReactNode } from "react";
import { AppShell } from "@/components/sidebar/AppShell";
import { requireApprovedAppAccess } from "@/lib/auth/requireApprovedAppAccess";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await requireApprovedAppAccess();
  return <AppShell>{children}</AppShell>;
}
