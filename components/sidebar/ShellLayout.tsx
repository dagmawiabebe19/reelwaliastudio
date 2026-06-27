"use client";

import { useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { StudioNavProvider } from "@/components/sidebar/studio-nav-context";
import { CopilotShellHost } from "@/components/copilot/CopilotShellHost";
import { CopilotWorkspaceProvider } from "@/components/copilot/CopilotWorkspaceProvider";

const EPISODE_STUDIO_PATH = /^\/series\/[^/]+\/episodes\/[^/]+\/?$/;

interface ShellLayoutProps {
  children: ReactNode;
  userEmail: string | null;
}

export function ShellLayout({ children, userEmail }: ShellLayoutProps) {
  const pathname = usePathname();
  const isEpisodeStudio = EPISODE_STUDIO_PATH.test(pathname);
  const [navOpen, setNavOpen] = useState(false);

  const navContext = useMemo(
    () => ({
      openNav: () => setNavOpen(true),
    }),
    [],
  );

  if (isEpisodeStudio) {
    return (
      <CopilotWorkspaceProvider>
        <StudioNavProvider value={navContext}>
          <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            {navOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 bg-black/60"
                  onClick={() => setNavOpen(false)}
                  aria-label="Close navigation"
                />
                <div className="fixed inset-y-0 left-0 z-50 shadow-2xl">
                  <Sidebar userEmail={userEmail} onNavigate={() => setNavOpen(false)} />
                </div>
              </>
            ) : null}
            <CopilotShellHost layout="episode-studio">
              <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
            </CopilotShellHost>
          </div>
        </StudioNavProvider>
      </CopilotWorkspaceProvider>
    );
  }

  return (
    <CopilotWorkspaceProvider>
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar userEmail={userEmail} />
        <CopilotShellHost layout="sidebar">
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl px-10 py-12">{children}</div>
          </main>
        </CopilotShellHost>
      </div>
    </CopilotWorkspaceProvider>
  );
}
