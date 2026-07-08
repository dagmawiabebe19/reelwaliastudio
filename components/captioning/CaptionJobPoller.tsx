"use client";

import { usePollWhilePending } from "@/hooks/usePollWhilePending";

export function CaptionJobPoller({ active }: { active: boolean }) {
  usePollWhilePending(active);
  return null;
}
