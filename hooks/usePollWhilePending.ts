"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Poll server data while async generation jobs are in flight. */
export function usePollWhilePending(active: boolean, intervalMs = 3000) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(interval);
  }, [active, intervalMs, router]);
}
