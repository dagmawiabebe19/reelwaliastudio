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

const MODEL_HELPERS: Record<string, string> = {
  "openai-image": "OpenAI Image — storyboard stills from your prompt and identity locks.",
  seedream: "Seedream — image stills via Fal.",
  "nano-banana": "Nano Banana — image stills via Fal.",
  grok: "Grok Image — NSFW-capable still generation.",
  seedance: "Seedance — animates a source still; set clip length below.",
  higgsfield: "Higgsfield DoP — animates your source still into a short cinematic clip.",
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

function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <label className="block studio-section-label">{children}</label>
      {hint ? <p className="mt-0.5 text-[10px] text-muted">{hint}</p> : null}
    </div>
  );
}

function ControlGroup({
  title,
  subtitle,
  inactive,
  children,
}: {
  title: string;
  subtitle?: string;
  inactive?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`space-y-3 rounded-md border border-border/60 bg-background/30 p-3 ${
        inactive ? "studio-field-inactive" : ""
      }`}
    >
      <div>
        <p className="studio-section-label">{title}</p>
        {subtitle ? <p className="mt-0.5 text-[10px] text-muted">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

const selectClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60";

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
  const isImage = selected?.kind === "image";
  const isHiggsfield = modelId === "higgsfield";
  const videoSourceTake = useMemo(() => resolveVideoSourceTake(takes), [takes]);
  const canGenerateVideo = Boolean(videoSourceTake?.assetUrl);
  const modelHelper = MODEL_HELPERS[modelId] ?? `${selected?.label ?? "Model"} — generate for this segment.`;

  useEffect(() => {
    setShotIntent(
      normalizeShotIntent(initialShotIntent) ??
        inferDefaultShotIntent(scenePrompt ?? ""),
    );
  }, [sceneId, initialShotIntent, scenePrompt]);

  useEffect(() => {
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
  }, []);

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
      <div className="space-y-1">
        <span className="studio-segment-panel-badge">This segment</span>
        <h3 className="studio-section-label mt-2">New take</h3>
        <p className="text-[10px] leading-relaxed text-muted">
          Generates one segment only — not the batch stills control in Segments above.
        </p>
      </div>

      <div className="space-y-2">
        <FieldLabel>Model</FieldLabel>
        <select
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className={selectClass}
        >
          {allModels.map((model) => (
            <option key={model.id} value={model.id} disabled={!model.configured}>
              {model.label} · {model.kind} · {model.safety.toUpperCase()}
              {!model.configured ? " (not configured)" : ""}
            </option>
          ))}
        </select>
        <p className="text-xs leading-relaxed text-muted">{modelHelper}</p>
      </div>

      <ControlGroup
        title="Image still"
        subtitle={isImage ? "Active for this model" : "Not used — switch to an image model"}
        inactive={!isImage}
      >
        <div>
          <FieldLabel hint="1–5 stills per run">Take count</FieldLabel>
          <input
            type="number"
            min={1}
            max={5}
            value={count}
            disabled={!isImage}
            onChange={(e) => setCount(Number(e.target.value))}
            className={selectClass}
          />
        </div>
      </ControlGroup>

      <ControlGroup
        title="Video clip"
        subtitle={isVideo ? "Active for this model" : "Not used — switch to a video model"}
        inactive={!isVideo}
      >
        <div>
          <FieldLabel>Source frame</FieldLabel>
          {videoSourceTake ? (
            <p className="text-sm text-foreground">
              Take #{videoSourceTake.take_number}
              {videoSourceTake.starred ? " ★ starred" : " (latest ready)"}
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-muted">
              Generate a storyboard still first, then star it (or use the latest ready image).
            </p>
          )}
        </div>

        <div>
          <FieldLabel>Shot intent</FieldLabel>
          <select
            value={shotIntent}
            disabled={!isVideo}
            onChange={(e) => setShotIntent(e.target.value as ShotIntent)}
            className={selectClass}
          >
            {SHOT_INTENTS.map((intent) => (
              <option key={intent} value={intent}>
                {SHOT_INTENT_LABELS[intent]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel hint={!isHiggsfield ? "Higgsfield DoP only" : undefined}>DoP variant</FieldLabel>
          <select
            value={dopModel}
            disabled={!isVideo || !isHiggsfield}
            onChange={(e) => setDopModel(e.target.value)}
            className={selectClass}
          >
            {DOP_MODEL_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel hint={!isHiggsfield ? "Higgsfield DoP only" : undefined}>Camera motion</FieldLabel>
          <select
            value={motionId}
            disabled={!isVideo || !isHiggsfield}
            onChange={(e) => setMotionId(e.target.value)}
            className={selectClass}
          >
            <option value="">None</option>
            {motions.map((motion) => (
              <option key={motion.id} value={motion.id}>
                {motion.name}
              </option>
            ))}
          </select>
          {motionsError && isHiggsfield ? (
            <p className="mt-1 text-xs text-muted">{motionsError}</p>
          ) : null}
        </div>

        <div>
          <FieldLabel hint={isHiggsfield ? "Seedance only — DoP uses model quality" : undefined}>
            Clip length
          </FieldLabel>
          <select
            value={String(duration)}
            disabled={!isVideo || isHiggsfield}
            onChange={(e) => setDuration(Number(e.target.value) as 6 | 7 | 8)}
            className={selectClass}
          >
            <option value="6">6 seconds</option>
            <option value="7">7 seconds</option>
            <option value="8">8 seconds</option>
          </select>
        </div>
      </ControlGroup>

      <div>
        <FieldLabel hint="Applies to image stills; passed for video where supported">
          Resolution / quality
        </FieldLabel>
        <select
          value={resolution}
          onChange={(e) => setResolution(e.target.value as "480p" | "720p")}
          className={selectClass}
        >
          <option value="480p">480p</option>
          <option value="720p">720p</option>
        </select>
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
