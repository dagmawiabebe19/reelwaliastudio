"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generateTakesAction,
  listHiggsfieldMotionsAction,
} from "@/app/(app)/series/[id]/episodes/[episodeId]/generation-actions";
import { Button } from "@/components/ui/Button";
import type { TakeCardData } from "@/components/series/generation/TakesStrip";
import { DOP_MODEL_OPTIONS } from "@/lib/ai/video/higgsfield-constants";
import {
  SHOT_INTENTS,
  SHOT_INTENT_LABELS,
  inferDefaultShotIntent,
  normalizeShotIntent,
  type ShotIntent,
} from "@/lib/production/prompts";

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
  scenePrompt?: string | null;
  shotIntent?: string | null;
}

function resolveVideoSourceTake(takes: TakeCardData[]): TakeCardData | null {
  const readyImages = takes.filter(
    (take) => take.media_type === "image" && take.status === "ready" && take.assetUrl,
  );
  if (!readyImages.length) return null;
  return readyImages.find((take) => take.starred) ?? readyImages[readyImages.length - 1];
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block studio-section-label">{children}</label>;
}

function FieldSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
    >
      {children}
    </select>
  );
}

export function GenerationPanel({
  sceneId,
  seriesId,
  episodeId,
  models,
  takes = [],
  scenePrompt = "",
  shotIntent: initialShotIntent = null,
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
  const [shotIntent, setShotIntent] = useState<ShotIntent>(
    () =>
      normalizeShotIntent(initialShotIntent) ??
      inferDefaultShotIntent(scenePrompt ?? ""),
  );
  const [startedMessage, setStartedMessage] = useState<string | null>(null);

  const selected = allModels.find((m) => m.id === modelId);
  const isVideo = selected?.kind === "video";
  const isHiggsfield = modelId === "higgsfield";
  const videoSourceTake = useMemo(() => resolveVideoSourceTake(takes), [takes]);
  const canGenerateVideo = Boolean(videoSourceTake?.assetUrl);

  useEffect(() => {
    setShotIntent(
      normalizeShotIntent(initialShotIntent) ??
        inferDefaultShotIntent(scenePrompt ?? ""),
    );
  }, [sceneId, initialShotIntent, scenePrompt]);

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
        shotIntent: isVideo ? shotIntent : undefined,
      });

      if ("error" in result && result.error) {
        alert(result.error);
      } else {
        const n = isVideo ? 1 : count;
        setStartedMessage(
          isVideo
            ? `Generating video from take #${videoSourceTake?.take_number}… may take several minutes`
            : `Generating ${n} take${n === 1 ? "" : "s"}… ~30–90s`,
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="studio-panel-calm space-y-5">
      <div>
        <h3 className="studio-section-label">New take</h3>
        <p className="mt-1 text-xs text-muted">Choose model and settings, then generate.</p>
      </div>

      <div className="space-y-4">
        <div>
          <FieldLabel>Model</FieldLabel>
          <FieldSelect value={modelId} onChange={setModelId}>
            {allModels.map((model) => (
              <option key={model.id} value={model.id} disabled={!model.configured}>
                {model.label} · {model.kind} · {model.safety.toUpperCase()}
                {!model.configured ? " (not configured)" : ""}
              </option>
            ))}
          </FieldSelect>
        </div>

        {isVideo ? (
          <div className="space-y-4 rounded-md border border-border/60 bg-background/40 p-3">
            <div>
              <FieldLabel>Source frame</FieldLabel>
              {videoSourceTake ? (
                <p className="text-sm text-foreground">
                  Take #{videoSourceTake.take_number}
                  {videoSourceTake.starred ? " ★" : ""}
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-muted">
                  Generate a storyboard still first, then star it (or use the latest ready image).
                </p>
              )}
            </div>

            <div>
              <FieldLabel>Shot intent</FieldLabel>
              <FieldSelect value={shotIntent} onChange={(v) => setShotIntent(v as ShotIntent)}>
                {SHOT_INTENTS.map((intent) => (
                  <option key={intent} value={intent}>
                    {SHOT_INTENT_LABELS[intent]}
                  </option>
                ))}
              </FieldSelect>
            </div>

            {isHiggsfield ? (
              <>
                <div>
                  <FieldLabel>DoP variant</FieldLabel>
                  <FieldSelect value={dopModel} onChange={setDopModel}>
                    {DOP_MODEL_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </FieldSelect>
                </div>
                <div>
                  <FieldLabel>Camera motion</FieldLabel>
                  <FieldSelect value={motionId} onChange={setMotionId}>
                    <option value="">None</option>
                    {motions.map((motion) => (
                      <option key={motion.id} value={motion.id}>
                        {motion.name}
                      </option>
                    ))}
                  </FieldSelect>
                  {motionsError ? (
                    <p className="mt-1 text-xs text-muted">{motionsError}</p>
                  ) : null}
                </div>
              </>
            ) : (
              <div>
                <FieldLabel>Duration</FieldLabel>
                <FieldSelect value={String(duration)} onChange={(v) => setDuration(Number(v) as 6 | 7 | 8)}>
                  <option value="6">6 seconds</option>
                  <option value="7">7 seconds</option>
                  <option value="8">8 seconds</option>
                </FieldSelect>
              </div>
            )}
          </div>
        ) : (
          <div>
            <FieldLabel>Take count</FieldLabel>
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
            <FieldLabel>Resolution</FieldLabel>
            <FieldSelect value={resolution} onChange={(v) => setResolution(v as "480p" | "720p")}>
              <option value="480p">480p</option>
              <option value="720p">720p</option>
            </FieldSelect>
          </div>
        ) : null}
      </div>

      <Button
        type="button"
        onClick={handleGenerate}
        disabled={pending || !selected?.configured || (isVideo && !canGenerateVideo)}
        className="w-full"
      >
        {pending ? "Starting…" : isVideo ? "Generate video" : "Generate still"}
      </Button>

      {startedMessage ? (
        <p className="text-center text-xs text-status-progress">{startedMessage}</p>
      ) : null}

      {selected && !selected.configured ? (
        <p className="text-center text-xs text-muted">API key not configured for this model.</p>
      ) : null}
    </div>
  );
}
