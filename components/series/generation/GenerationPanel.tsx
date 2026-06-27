"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generateTakesAction,
  listHiggsfieldMotionsAction,
} from "@/app/(app)/series/[id]/episodes/[episodeId]/generation-actions";
import { Button } from "@/components/ui/Button";
import type { TakeCardData } from "@/components/series/generation/TakesStrip";
import { DOP_MODEL_OPTIONS } from "@/lib/ai/video/higgsfield-constants";

export type ModelCatalogEntry = {
  id: string;
  label: string;
  kind: "image" | "video" | "voice";
  safety: "sfw" | "nsfw";
  configured: boolean;
};

type HiggsfieldMotion = {
  id: string;
  name: string;
  description: string | null;
};

interface GenerationPanelProps {
  sceneId: string;
  seriesId: string;
  episodeId: string;
  models: ModelCatalogEntry[];
  takes?: TakeCardData[];
}

function resolveVideoSourceTake(takes: TakeCardData[]): TakeCardData | null {
  const readyImages = takes.filter(
    (take) => take.media_type === "image" && take.status === "ready" && take.assetUrl,
  );
  if (!readyImages.length) return null;
  return readyImages.find((take) => take.starred) ?? readyImages[readyImages.length - 1];
}

export function GenerationPanel({
  sceneId,
  seriesId,
  episodeId,
  models,
  takes = [],
}: GenerationPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const imageModels = models.filter((m) => m.kind === "image");
  const videoModels = models.filter((m) => m.kind === "video");
  const allModels = [...imageModels, ...videoModels];

  const [modelId, setModelId] = useState(allModels.find((m) => m.configured)?.id ?? allModels[0]?.id ?? "");
  const [count, setCount] = useState(1);
  const [resolution, setResolution] = useState<"480p" | "720p">("720p");
  const [duration, setDuration] = useState<6 | 7 | 8>(6);
  const [dopModel, setDopModel] = useState<string>(DOP_MODEL_OPTIONS[0].id);
  const [motionId, setMotionId] = useState<string>("");
  const [motions, setMotions] = useState<HiggsfieldMotion[]>([]);
  const [motionsError, setMotionsError] = useState<string | null>(null);
  const [startedMessage, setStartedMessage] = useState<string | null>(null);

  const selected = allModels.find((m) => m.id === modelId);
  const isVideo = selected?.kind === "video";
  const isHiggsfield = modelId === "higgsfield";
  const videoSourceTake = useMemo(() => resolveVideoSourceTake(takes), [takes]);
  const canGenerateVideo = Boolean(videoSourceTake?.assetUrl);

  useEffect(() => {
    if (!isHiggsfield) return;

    let cancelled = false;
    void listHiggsfieldMotionsAction().then((result) => {
      if (cancelled) return;
      if ("error" in result && result.error) {
        setMotions([]);
        setMotionsError(result.error);
        return;
      }
      setMotionsError(null);
      setMotions(result.motions ?? []);
    });

    return () => {
      cancelled = true;
    };
  }, [isHiggsfield]);

  function handleGenerate() {
    if (!modelId || !selected?.configured) return;
    if (isVideo && !canGenerateVideo) return;

    startTransition(async () => {
      setStartedMessage(null);
      const result = await generateTakesAction({
        sceneId,
        seriesId,
        episodeId,
        modelId,
        count: isVideo ? 1 : count,
        resolution,
        durationSeconds: isVideo && !isHiggsfield ? duration : undefined,
        dopModel: isHiggsfield ? dopModel : undefined,
        motionId: isHiggsfield && motionId ? motionId : undefined,
        motionStrength: isHiggsfield && motionId ? 1 : undefined,
      });

      if ("error" in result && result.error) {
        alert(result.error);
      } else {
        const n = isVideo ? 1 : count;
        setStartedMessage(
          isVideo
            ? `Generating video from take #${videoSourceTake?.take_number}… may take several minutes`
            : `Generating ${n} take${n === 1 ? "" : "s"}… ~30–90s — refresh automatically`,
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface-elevated p-4">
      <h3 className="studio-column-heading-sm font-display text-foreground">New Take</h3>

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
                {model.label} ({model.kind.toUpperCase()}, {model.safety.toUpperCase()})
                {!model.configured ? " — not configured" : ""}
              </option>
            ))}
          </select>
        </div>

        {isVideo ? (
          <>
            <div>
              <label className="mb-1 block text-xs text-muted">Source image</label>
              {videoSourceTake ? (
                <p className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
                  Take #{videoSourceTake.take_number}
                  {videoSourceTake.starred ? " ★ starred" : " (latest ready)"}
                </p>
              ) : (
                <p className="rounded-md border border-accent/30 bg-accent-muted/10 px-3 py-2 text-xs text-accent">
                  Generate a storyboard image first, then star it (or use the latest ready take) as the
                  source frame.
                </p>
              )}
            </div>

            {isHiggsfield ? (
              <>
                <div>
                  <label className="mb-1 block text-xs text-muted">DoP variant</label>
                  <select
                    value={dopModel}
                    onChange={(e) => setDopModel(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {DOP_MODEL_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-muted">Camera motion (optional)</label>
                  <select
                    value={motionId}
                    onChange={(e) => setMotionId(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">None</option>
                    {motions.map((motion) => (
                      <option key={motion.id} value={motion.id}>
                        {motion.name}
                      </option>
                    ))}
                  </select>
                  {motionsError ? (
                    <p className="mt-1 text-xs text-muted">{motionsError}</p>
                  ) : null}
                </div>
              </>
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
          </>
        ) : (
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
        )}

        {!isHiggsfield ? (
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
        ) : null}
      </div>

      <Button
        type="button"
        onClick={handleGenerate}
        disabled={pending || !selected?.configured || (isVideo && !canGenerateVideo)}
        className="w-full"
      >
        {pending ? "Starting…" : isVideo ? "Generate video" : "Generate"}
      </Button>

      {startedMessage ? (
        <p className="text-xs text-amber-400">{startedMessage}</p>
      ) : null}

      {selected && !selected.configured ? (
        <p className="text-xs text-accent">This model&apos;s API key is not set in the environment.</p>
      ) : null}
    </div>
  );
}
