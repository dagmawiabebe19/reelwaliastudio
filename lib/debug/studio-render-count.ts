/**
 * Lightweight render-count instrumentation for studio freeze diagnosis.
 * Enable: localStorage.setItem("studio_render_debug","1") then reload.
 * After 10s with no further renders, dumps counts to console as [studio-render-report].
 */

const counts = new Map<string, number>();
let dumpTimer: number | null = null;
let enabled: boolean | null = null;

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (enabled == null) {
    enabled = window.localStorage.getItem("studio_render_debug") === "1";
  }
  return enabled;
}

export function noteStudioRender(component: string): void {
  if (!isEnabled()) return;
  counts.set(component, (counts.get(component) ?? 0) + 1);

  if (dumpTimer != null) {
    window.clearTimeout(dumpTimer);
  }
  dumpTimer = window.setTimeout(() => {
    const report = Object.fromEntries(
      [...counts.entries()].sort((a, b) => b[1] - a[1]),
    );
    console.info("[studio-render-report] 10s idle counts", report);
    dumpTimer = null;
  }, 10_000);
}

export function getStudioRenderCounts(): Record<string, number> {
  return Object.fromEntries(counts.entries());
}

export function resetStudioRenderCounts(): void {
  counts.clear();
}
