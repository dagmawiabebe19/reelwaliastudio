"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSceneAction } from "@/app/(app)/series/[id]/episodes/[episodeId]/actions";
import type { Orientation } from "@/lib/db/types";
import type { SceneWithBindings } from "@/lib/storyboard/constants";

interface SceneMetaControlsProps {
  scene: SceneWithBindings;
  seriesId: string;
  episodeId: string;
  defaultOrientation: Orientation;
}

export function SceneMetaControls({
  scene,
  seriesId,
  episodeId,
  defaultOrientation,
}: SceneMetaControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [duration, setDuration] = useState(String(scene.duration_seconds ?? ""));
  const [orientation, setOrientation] = useState<Orientation | "">(scene.orientation ?? "");

  useEffect(() => {
    setDuration(String(scene.duration_seconds ?? ""));
    setOrientation(scene.orientation ?? "");
  }, [scene.id, scene.duration_seconds, scene.orientation]);

  function saveMeta() {
    startTransition(async () => {
      const result = await updateSceneAction(scene.id, episodeId, seriesId, {
        duration_seconds: duration ? Number(duration) : null,
        orientation: orientation === "" ? null : orientation,
      });
      if (result.error) alert(result.error);
      else router.refresh();
    });
  }

  const sceneNumber = scene.position ?? scene.sort_order + 1;

  return (
    <div className="flex flex-wrap items-end gap-4 border-b border-border pb-4">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs text-muted">Scene {sceneNumber}</p>
        <h2 className="studio-column-heading font-display text-foreground">{scene.title}</h2>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted">Duration (s)</label>
          <input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-20 rounded-md border border-border bg-surface-elevated px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Orientation</label>
          <select
            value={orientation}
            onChange={(e) => setOrientation(e.target.value as Orientation | "")}
            className="rounded-md border border-border bg-surface-elevated px-2 py-1.5 text-sm"
          >
            <option value="">Default ({defaultOrientation})</option>
            <option value="portrait">Portrait 9:16</option>
            <option value="landscape">Landscape 16:9</option>
          </select>
        </div>
        <button
          type="button"
          onClick={saveMeta}
          disabled={pending}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-accent hover:border-accent/50 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
