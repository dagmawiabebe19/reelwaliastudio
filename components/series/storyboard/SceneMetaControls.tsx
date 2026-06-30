"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSceneAction } from "@/app/(app)/series/[id]/episodes/[episodeId]/actions";
import type { Orientation } from "@/lib/db/types";
import type { SceneWithBindings } from "@/lib/storyboard/constants";
import { effectiveOrientation } from "@/lib/storyboard/orientation";

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
  const resolvedOrientation = effectiveOrientation(scene.orientation, defaultOrientation);

  return (
    <header className="space-y-4 border-b border-border/80 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="studio-meta-pill font-mono">
              Seg {String(sceneNumber).padStart(2, "0")}
            </span>
            {scene.act_label ? (
              <span className="studio-meta-pill">{scene.act_label.replace("_", " ")}</span>
            ) : null}
            <span className="studio-meta-pill">
              {resolvedOrientation === "portrait" ? "9:16" : "16:9"}
            </span>
            {scene.duration_seconds ? (
              <span className="studio-meta-pill">{scene.duration_seconds}s</span>
            ) : null}
          </div>
          <h1 className="studio-scene-title">{scene.title}</h1>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex items-center gap-2">
            <span className="studio-section-label">Duration</span>
            <input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="—"
              className="studio-input w-14 !min-h-8 !px-2 !py-1 !text-sm"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="studio-section-label">Frame</span>
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as Orientation | "")}
              className="studio-select !w-auto !min-h-8 !py-1 !pr-8 !text-sm"
            >
              <option value="">Series default</option>
              <option value="portrait">9:16</option>
              <option value="landscape">16:9</option>
            </select>
          </label>
          <button
            type="button"
            onClick={saveMeta}
            disabled={pending}
            className="focus-ring studio-btn studio-btn-ghost !min-h-8 !px-3 !py-1 !text-xs"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </header>
  );
}
