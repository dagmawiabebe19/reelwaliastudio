"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard } from "lucide-react";
import {
  estimateEpisodeBatchAction,
  generateEpisodeBatchAction,
  type GenerateEpisodeBatchSuccess,
} from "@/app/(app)/series/[id]/episodes/[episodeId]/generation-actions";
import { getMyCreditBalanceAction } from "@/app/(app)/credits/balance-action";
import { Button } from "@/components/ui/Button";
import { CreditCostHint } from "@/components/credits/CreditCostHint";
import { InsufficientCreditsWall } from "@/components/credits/InsufficientCreditsWall";
import { usePollWhilePending } from "@/hooks/usePollWhilePending";
import type { TakeCardData } from "@/components/series/generation/TakesStrip";
import {
  resolveQualitySettings,
  type GenerationQualityMode,
} from "@/lib/ai/video/seedance-constants";
import type { SceneWithBindings } from "@/lib/storyboard/constants";

type SegmentRowStatus = "idle" | "queued" | "generating" | "done" | "failed" | "skipped";

type QueuedJob = {
  sceneId: string;
  title: string;
  takeId: string;
};

type SkippedSegment = {
  sceneId: string;
  title: string;
  status: string;
  reason: string;
};

interface EpisodeBatchGenerationPanelProps {
  seriesId: string;
  episodeId: string;
  scenes: SceneWithBindings[];
  takesByScene: Record<string, TakeCardData[]>;
  seedanceConfigured: boolean;
}

function segmentStatusForTake(take: TakeCardData | undefined): SegmentRowStatus {
  if (!take) return "idle";
  if (take.status === "pending") return "generating";
  if (take.status === "ready") return "done";
  if (take.status === "failed") return "failed";
  return "idle";
}

const STATUS_LABELS: Record<SegmentRowStatus, string> = {
  idle: "Not queued",
  queued: "Queued",
  generating: "Generating",
  done: "Done",
  failed: "Failed",
  skipped: "Skipped",
};

export function EpisodeBatchGenerationPanel({
  seriesId,
  episodeId,
  scenes,
  takesByScene,
  seedanceConfigured,
}: EpisodeBatchGenerationPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [quality, setQuality] = useState<GenerationQualityMode>("final");
  const [estimate, setEstimate] = useState<{
    totalEstimate: number;
    readyCount: number;
    segmentCount: number;
    availableCredits: number;
    skipped: SkippedSegment[];
    readySceneIds: string[];
  } | null>(null);
  const [queuedJobs, setQueuedJobs] = useState<QueuedJob[]>([]);
  const [availableCredits, setAvailableCredits] = useState<number | null>(null);
  const [userIsAdmin, setUserIsAdmin] = useState(false);
  const [insufficientCredits, setInsufficientCredits] = useState<{
    needed: number;
    available: number;
  } | null>(null);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);

  const jobByScene = useMemo(
    () => new Map(queuedJobs.map((job) => [job.sceneId, job])),
    [queuedJobs],
  );

  const skippedByScene = useMemo(
    () => new Map((estimate?.skipped ?? []).map((segment) => [segment.sceneId, segment])),
    [estimate?.skipped],
  );

  const segmentRows = useMemo(() => {
    return scenes.map((scene) => {
      const skipped = skippedByScene.get(scene.id);
      const job = jobByScene.get(scene.id);
      const takes = takesByScene[scene.id] ?? [];
      const trackedTake = job ? takes.find((take) => take.id === job.takeId) : undefined;
      const latestTake = takes[takes.length - 1];

      let status: SegmentRowStatus = "idle";
      if (skipped && !job) {
        status = "skipped";
      } else if (job && !trackedTake) {
        status = "queued";
      } else if (job && trackedTake) {
        status = segmentStatusForTake(trackedTake);
      } else if (estimate?.readySceneIds.includes(scene.id)) {
        status = "idle";
      }

      const displayTake = trackedTake ?? latestTake;
      const errorMessage =
        status === "failed" ? displayTake?.error_message ?? "Generation failed." : null;

      return {
        sceneId: scene.id,
        title: scene.title,
        status,
        errorMessage,
        skippedReason: skipped?.reason ?? null,
      };
    });
  }, [scenes, skippedByScene, jobByScene, takesByScene, estimate?.readySceneIds]);

  const hasPendingBatch = segmentRows.some((row) => row.status === "generating" || row.status === "queued");
  usePollWhilePending(hasPendingBatch);

  useEffect(() => {
    if (!seedanceConfigured || scenes.length === 0) {
      setEstimate(null);
      return;
    }

    void estimateEpisodeBatchAction({ seriesId, episodeId, quality }).then((result) => {
      if ("error" in result && result.error) return;
      if (!("totalEstimate" in result)) return;
      setEstimate({
        totalEstimate: result.totalEstimate,
        readyCount: result.ready.length,
        segmentCount: result.segmentCount,
        availableCredits: result.availableCredits,
        skipped: result.skipped,
        readySceneIds: result.ready.map((segment) => segment.sceneId),
      });
      setAvailableCredits(result.availableCredits);
    });
  }, [seriesId, episodeId, quality, seedanceConfigured, scenes.length]);

  useEffect(() => {
    void getMyCreditBalanceAction().then((result) => {
      if (result.balance) setAvailableCredits(result.balance.available);
      if (result.isAdmin) setUserIsAdmin(true);
    });
  }, []);

  const canGenerate =
    seedanceConfigured &&
    Boolean(estimate && estimate.readyCount > 0) &&
    !hasPendingBatch;

  function handleGenerateEpisode() {
    if (!estimate || estimate.readyCount === 0) return;

    const confirmed = window.confirm(
      `Generate video for ${estimate.readyCount} locked segment${estimate.readyCount === 1 ? "" : "s"}?\n\nThis episode ≈ ${estimate.totalEstimate} credits. You have ${availableCredits ?? estimate.availableCredits}.`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      setBatchMessage(null);
      setInsufficientCredits(null);

      const result = await generateEpisodeBatchAction({
        seriesId,
        episodeId,
        quality,
        generationApproved: true,
      });

      if ("status" in result && result.status === "pending") {
        const success = result as GenerateEpisodeBatchSuccess;
        const count = success.queuedCount ?? success.jobs.length;
        setQueuedJobs(success.jobs);
        setBatchMessage(`Generating ${count} segment${count === 1 ? "" : "s"} concurrently…`);
      } else if ("error" in result) {
        if ("insufficientCredits" in result && result.insufficientCredits) {
          setInsufficientCredits(result.insufficientCredits);
        } else if (result.error) {
          alert(result.error);
        }
        return;
      }

      const balance = await getMyCreditBalanceAction();
      if (balance.balance) setAvailableCredits(balance.balance.available);
      if (balance.isAdmin) setUserIsAdmin(true);
      router.refresh();
    });
  }

  if (!seedanceConfigured || scenes.length === 0) return null;

  return (
    <section className="studio-panel-calm mb-6 space-y-4 rounded-lg border border-border/80 bg-surface-elevated/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Clapperboard className="size-4 text-accent" strokeWidth={1.75} aria-hidden />
            <h3 className="studio-section-label">Generate episode</h3>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Queue every fully locked segment at once. Segments with missing or generating references are skipped and reported.
          </p>
        </div>
        <div className="studio-segmented">
          {(["draft", "final"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setQuality(mode)}
              className={`studio-segmented-item studio-segmented-item--accent capitalize ${
                quality === mode ? "studio-segmented-item--active" : ""
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {estimate ? (
        <CreditCostHint
          cost={estimate.totalEstimate}
          available={availableCredits}
          isAdmin={userIsAdmin}
          label={`${estimate.readyCount} of ${estimate.segmentCount} locked segments · ${resolveQualitySettings(quality).resolution}`}
        />
      ) : null}

      {insufficientCredits ? (
        <InsufficientCreditsWall
          needed={insufficientCredits.needed}
          available={insufficientCredits.available}
        />
      ) : null}

      <ul className="space-y-2">
        {segmentRows.map((row) => (
          <li
            key={row.sceneId}
            className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-background/30 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{row.title}</p>
              {row.skippedReason ? (
                <p className="mt-0.5 text-xs text-muted">{row.skippedReason}</p>
              ) : null}
              {row.errorMessage ? (
                <p className="mt-0.5 text-xs text-red-300">{row.errorMessage}</p>
              ) : null}
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                row.status === "done"
                  ? "bg-emerald-500/10 text-emerald-300"
                  : row.status === "failed"
                    ? "bg-red-500/10 text-red-300"
                    : row.status === "generating" || row.status === "queued"
                      ? "bg-amber-500/10 text-amber-200"
                      : row.status === "skipped"
                        ? "bg-surface text-muted"
                        : "bg-surface text-muted"
              }`}
            >
              {STATUS_LABELS[row.status]}
            </span>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        onClick={handleGenerateEpisode}
        disabled={pending || !canGenerate}
        className="w-full"
      >
        {pending
          ? "Starting episode batch…"
          : estimate && estimate.readyCount > 0
            ? `Generate episode (${estimate.readyCount} segments)`
            : "Generate episode"}
      </Button>

      {batchMessage ? <p className="text-center text-xs text-status-progress">{batchMessage}</p> : null}

      {estimate && estimate.readyCount === 0 ? (
        <p className="text-center text-xs text-muted">
          No segments are fully locked yet. Finish the co-pilot lock report before generating video.
        </p>
      ) : null}
    </section>
  );
}
