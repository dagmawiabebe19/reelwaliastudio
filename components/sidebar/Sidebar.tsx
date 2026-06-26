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
}

export function Sidebar({ userEmail }: SidebarProps) {
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
        <p className="font-display text-2xl tracking-tight text-foreground">ReelWalia</p>
        <p className="mt-1 text-xs uppercase tracking-widest text-muted">Studio</p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-6">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-surface-elevated font-medium text-foreground"
                  : "text-muted hover:bg-surface-elevated hover:text-foreground"
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
          className="block rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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
          className="w-full rounded-md border border-border px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
