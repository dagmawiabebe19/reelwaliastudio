"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { CreditBalanceBadge } from "@/components/credits/CreditBalanceBadge";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  ADMIN_NAV_ITEM,
  COMING_SOON_NAV_HIDDEN,
  PRIMARY_NAV_ITEMS,
} from "@/lib/nav/constants";
import type { CreditBalance } from "@/lib/credits/types";

interface SidebarProps {
  userEmail?: string | null;
  creditBalance?: CreditBalance | null;
  isAdmin?: boolean;
  onNavigate?: () => void;
}

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/projects") {
    return (
      pathname === "/projects" ||
      (pathname.startsWith("/projects/") && pathname !== "/projects/new") ||
      /^\/series\/[^/]+/.test(pathname)
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ userEmail, creditBalance, isAdmin = false, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    ...PRIMARY_NAV_ITEMS,
    ...(isAdmin ? [ADMIN_NAV_ITEM] : []),
  ].filter((item) => !COMING_SOON_NAV_HIDDEN.has(item.href));

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border px-6 py-8">
        <BrandWordmark onNavigate={onNavigate} />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-6">
        {navItems.map((item) => {
          const active = isNavActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-accent-muted font-medium text-accent"
                  : "text-muted hover:bg-surface-elevated hover:text-accent"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-border px-3 py-4">
        <Link
          href="/projects/new"
          onClick={onNavigate}
          className={`block rounded-md px-3 py-2 text-center text-sm font-medium transition-colors ${
            pathname === "/projects/new"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          New Project
        </Link>
        <ThemeToggle />
        {creditBalance ? (
          <Link
            href="/credits"
            onClick={onNavigate}
            className="block rounded-md border border-border bg-surface-elevated px-3 py-2 transition-colors hover:border-accent/40"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {isAdmin ? "Admin usage" : "Credits"}
            </p>
            {isAdmin ? (
              <p className="mt-0.5 text-[10px] font-medium text-accent">Unlimited</p>
            ) : null}
            <p className={`mt-0.5 ${!isAdmin && creditBalance.available < 0 ? "text-amber-600" : ""}`}>
              <CreditBalanceBadge
                available={creditBalance.available}
                adminMode={isAdmin}
                compact
              />
            </p>
            {creditBalance.reserved > 0 ? (
              <p className="mt-0.5 text-xs text-muted">
                {creditBalance.reserved.toLocaleString()} reserved
              </p>
            ) : null}
          </Link>
        ) : null}
        {userEmail ? (
          <p className="truncate px-3 text-xs text-muted" title={userEmail}>
            {userEmail}
          </p>
        ) : null}
        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-md border border-border px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-surface-elevated hover:text-accent"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
