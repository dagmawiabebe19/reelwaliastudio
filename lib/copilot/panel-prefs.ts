import {
  DEFAULT_COPILOT_PANEL_PREFS,
  type CopilotPanelPrefs,
} from "@/lib/copilot/workspace-types";

const STORAGE_KEY = "reelwalia-copilot-panel";

export function loadCopilotPanelPrefs(): CopilotPanelPrefs {
  if (typeof window === "undefined") return DEFAULT_COPILOT_PANEL_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COPILOT_PANEL_PREFS;
    const parsed = JSON.parse(raw) as Partial<CopilotPanelPrefs>;
    return {
      ...DEFAULT_COPILOT_PANEL_PREFS,
      ...parsed,
      width: clamp(parsed.width ?? DEFAULT_COPILOT_PANEL_PREFS.width, 300, 560),
    };
  } catch {
    return DEFAULT_COPILOT_PANEL_PREFS;
  }
}

export function saveCopilotPanelPrefs(prefs: CopilotPanelPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota errors
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
