"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type PollTickResult = "continue" | "transition" | "stop";

type UseStatusPollOptions = {
  /** When false, polling is fully idle (no timers). */
  active: boolean;
  intervalMs?: number;
  /**
   * Targeted fetch. Return:
   * - continue: still in-flight, no UI-visible transition
   * - transition: status changed — caller already updated local state; hook may router.refresh once
   * - stop: no in-flight work; stop polling
   */
  onPoll: () => Promise<PollTickResult>;
  /** Refresh the RSC tree only when onPoll reports a real transition. */
  refreshOnTransition?: boolean;
  /** Stop after this many consecutive continue ticks with no transition (zombie pending). */
  maxStagnantTicks?: number;
};

/**
 * Shared status poller: idle when inactive, targeted fetch on tick,
 * router.refresh only on actual status transitions.
 */
export function useStatusPoll({
  active,
  intervalMs = 3000,
  onPoll,
  refreshOnTransition = true,
  maxStagnantTicks = 40,
}: UseStatusPollOptions): void {
  const router = useRouter();
  const onPollRef = useRef(onPoll);
  onPollRef.current = onPoll;
  const stagnantRef = useRef(0);
  const inFlightRef = useRef(false);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!active) {
      stagnantRef.current = 0;
      setGaveUp(false);
    }
  }, [active]);

  const tick = useCallback(async (): Promise<PollTickResult> => {
    if (inFlightRef.current) return "continue";
    inFlightRef.current = true;
    try {
      const result = await onPollRef.current();
      if (result === "stop") {
        stagnantRef.current = 0;
        return result;
      }
      if (result === "transition") {
        stagnantRef.current = 0;
        if (refreshOnTransition) {
          router.refresh();
        }
        return result;
      }
      stagnantRef.current += 1;
      if (stagnantRef.current >= maxStagnantTicks) {
        setGaveUp(true);
        return "stop";
      }
      return result;
    } finally {
      inFlightRef.current = false;
    }
  }, [maxStagnantTicks, refreshOnTransition, router]);

  useEffect(() => {
    if (!active || gaveUp) {
      return;
    }

    void tick();
    const interval = window.setInterval(() => {
      void tick();
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [active, gaveUp, intervalMs, tick]);
}
