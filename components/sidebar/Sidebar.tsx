"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/series", label: "Shorts" },
  { href: "/ai-training", label: "AI Training" },
  { href: "/utilities", label: "Utilities" },
  { href: "/favorites", label: "Favorites" },
];

interface SidebarProps {
  userEmail?: string | null;
  onNavigate?: () => void;
}

export function Sidebar({ userEmail, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border px-6 py-8">
        <p className="brand-wordmark font-display text-2xl font-bold tracking-tight">
          <span className="text-foreground">Reel</span>
          <span className="text-accent">Walia</span>
        </p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Studio
        </p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-6">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : item.href === "/projects"
                ? pathname === "/projects" ||
                  (pathname.startsWith("/projects/") && pathname !== "/projects/new")
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
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
