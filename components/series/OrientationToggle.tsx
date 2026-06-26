"use client";

import { useTransition } from "react";
import { updateSeriesOrientationAction } from "@/app/(app)/series/[id]/actions";
import type { Orientation } from "@/lib/db/types";

interface OrientationToggleProps {
  seriesId: string;
  value: Orientation;
}

const options: { value: Orientation; label: string }[] = [
  { value: "portrait", label: "Portrait 9:16" },
  { value: "landscape", label: "Landscape 16:9" },
];

export function OrientationToggle({ seriesId, value }: OrientationToggleProps) {
  const [pending, startTransition] = useTransition();

  function handleSelect(next: Orientation) {
    if (next === value || pending) return;
    startTransition(async () => {
      await updateSeriesOrientationAction(seriesId, next);
    });
  }

  return (
    <div className="inline-flex rounded-md border border-border bg-surface p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={pending}
            onClick={() => handleSelect(option.value)}
            className={`rounded px-3 py-1.5 text-sm transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted hover:text-accent"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
