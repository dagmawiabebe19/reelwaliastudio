"use client";

import type { ReactNode } from "react";
import { CopilotLauncherButton } from "@/components/copilot/CopilotLauncherButton";
import { DockableCopilotPanel } from "@/components/copilot/DockableCopilotPanel";
import { useCopilotWorkspace } from "@/components/copilot/CopilotWorkspaceProvider";

interface CopilotShellHostProps {
  children: ReactNode;
  layout: "episode-studio" | "sidebar";
}

export function CopilotShellHost({ children, layout }: CopilotShellHostProps) {
  const { active, prefs } = useCopilotWorkspace();
  const showDockedPanel = active && !prefs.collapsed && prefs.mode === "docked";

  const inner = (
    <div className="flex min-h-0 min-w-0 flex-1">
      {showDockedPanel && prefs.dock === "left" ? <DockableCopilotPanel /> : null}
      {children}
      {showDockedPanel && prefs.dock === "right" ? <DockableCopilotPanel /> : null}
    </div>
  );

  return (
    <>
      {layout === "episode-studio" ? (
        <div className="flex min-h-0 flex-1 flex-col">{inner}</div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1">{inner}</div>
      )}
      {active && prefs.mode === "float" && !prefs.collapsed ? <DockableCopilotPanel /> : null}
      {active ? <CopilotLauncherButton /> : null}
    </>
  );
}
