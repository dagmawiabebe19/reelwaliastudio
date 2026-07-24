"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Legacy full-tree poller for pages that still need RSC refresh (home, captioning, series library).
 * Episode studio must NOT use this for takes — use useStatusPoll + targeted fetches instead.
 *
 * Stops when `active` is false. Also self-stops after maxStagnantTicks so zombie
 * pending rows cannot refresh the page forever.
 */
export function usePollWhilePending(
  active: boolean,
  intervalMs = 3000,
  options?: { maxStagnantTicks?: number },
) {
  const router = useRouter();
  const maxStagnantTicks = options?.maxStagnantTicks ?? 40;
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!active) setGaveUp(false);
  }, [active]);

  useEffect(() => {
    if (!active || gaveUp) return;

    let ticks = 0;
    const interval = window.setInterval(() => {
      ticks += 1;
      if (ticks > maxStagnantTicks) {
        setGaveUp(true);
        window.clearInterval(interval);
        return;
      }
      router.refresh();
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [active, gaveUp, intervalMs, maxStagnantTicks, router]);
}
