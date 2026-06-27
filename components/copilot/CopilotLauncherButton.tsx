"use client";

import { useCopilotWorkspace } from "@/components/copilot/CopilotWorkspaceProvider";

export function CopilotLauncherButton() {
  const { toggleCollapsed, prefs } = useCopilotWorkspace();

  if (!prefs.collapsed) return null;

  return (
    <button
      type="button"
      onClick={toggleCollapsed}
      className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-accent/40 bg-accent text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
      title="Open co-pilot"
      aria-label="Open co-pilot"
    >
      AI
    </button>
  );
}
