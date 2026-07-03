"use client";

import { useRouter } from "next/navigation";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { createClient } from "@/lib/supabase/client";

type PendingScreenProps = {
  email: string | null;
  status: "pending" | "rejected";
};

export function PendingScreen({ email, status }: PendingScreenProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isRejected = status === "rejected";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-8 rounded-lg border border-border bg-surface p-10 shadow-sm">
        <header className="text-center">
          <BrandWordmark />
          <p className="mt-4 text-sm text-muted">
            {isRejected
              ? "Your account was not approved for access."
              : "You're on the waitlist."}
          </p>
        </header>

        <div className="space-y-3 text-center text-sm text-muted">
          {isRejected ? (
            <p>
              If you think this was a mistake, contact the team. You can sign out and try a
              different account below.
            </p>
          ) : (
            <p>
              Your account is pending approval — we&apos;ll let you know when you&apos;re in.
            </p>
          )}
          {email ? (
            <p className="font-medium text-foreground">{email}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-md border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-accent"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
