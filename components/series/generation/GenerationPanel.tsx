"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateTakesAction } from "@/app/(app)/series/[id]/episodes/[episodeId]/generation-actions";
import { Button } from "@/components/ui/Button";

export type ModelCatalogEntry = {
  id: string;
  label: string;
  kind: "image" | "video" | "voice";
  safety: "sfw" | "nsfw";
  configured: boolean;
};

interface GenerationPanelProps {
  sceneId: string;
  seriesId: string;
  episodeId: string;
  models: ModelCatalogEntry[];
}

export function GenerationPanel({ sceneId, seriesId, episodeId, models }: GenerationPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const imageModels = models.filter((m) => m.kind === "image");
  const videoModels = models.filter((m) => m.kind === "video");
  const allModels = [...imageModels, ...videoModels];

  const [modelId, setModelId] = useState(allModels.find((m) => m.configured)?.id ?? allModels[0]?.id ?? "");
  const [count, setCount] = useState(1);
  const [resolution, setResolution] = useState<"480p" | "720p">("720p");
  const [duration, setDuration] = useState<6 | 7 | 8>(6);

  const selected = allModels.find((m) => m.id === modelId);
  const isVideo = selected?.kind === "video";

  function handleGenerate() {
    if (!modelId || !selected?.configured) return;

    startTransition(async () => {
      const result = await generateTakesAction({
        sceneId,
        seriesId,
        episodeId,
        modelId,
        count: isVideo ? 1 : count,
        resolution,
        durationSeconds: isVideo ? duration : undefined,
      });

      if ("error" in result && result.error) {
        alert(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface-elevated p-4">
      <h3 className="font-display text-lg text-foreground">New Take</h3>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-muted">Model</label>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {allModels.map((model) => (
              <option key={model.id} value={model.id} disabled={!model.configured}>
                {model.label} ({model.safety.toUpperCase()})
                {!model.configured ? " — not configured" : ""}
              </option>
            ))}
          </select>
        </div>

        {!isVideo ? (
          <div>
            <label className="mb-1 block text-xs text-muted">Takes (1–5)</label>
            <input
              type="number"
              min={1}
              max={5}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs text-muted">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) as 6 | 7 | 8)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value={6}>6s</option>
              <option value={7}>7s</option>
              <option value={8}>8s</option>
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs text-muted">Resolution</label>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as "480p" | "720p")}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="480p">480p</option>
            <option value="720p">720p</option>
          </select>
        </div>
      </div>

      <Button
        type="button"
        onClick={handleGenerate}
        disabled={pending || !selected?.configured}
        className="w-full"
      >
        {pending ? "Starting…" : "Generate"}
      </Button>

      {selected && !selected.configured ? (
        <p className="text-xs text-accent">This model&apos;s API key is not set in the environment.</p>
      ) : null}
    </div>
  );
}
