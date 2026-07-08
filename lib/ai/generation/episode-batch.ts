import "server-only";

import { estimateVideoCredits } from "@/lib/credits/pricing";
import {
  resolveQualitySettings,
  normalizeSeedanceAudioMode,
  type GenerationQualityMode,
} from "@/lib/ai/video/seedance-constants";
import { normalizeShotIntent } from "@/lib/production/prompts";
import { assessSegmentLock } from "@/lib/production/reference-readiness";
import { validateSeedanceVideoGeneration } from "@/lib/ai/generation/video-source";
import { SEGMENT_VIDEO_MODEL_ID } from "@/lib/ai/registry";
import type { GenerateTakeParams } from "@/lib/ai/generation/run";
import { getScene } from "@/lib/db/scenes";
import { listTakesByScene } from "@/lib/db/takes";

export type EpisodeBatchSegmentStatus =
  | "ready"
  | "skipped_not_locked"
  | "skipped_references"
  | "skipped_pending_take"
  | "skipped_no_scenes";

export type EpisodeBatchSegmentPlan = {
  sceneId: string;
  title: string;
  status: "ready";
  estimateCredits: number;
  params: GenerateTakeParams;
};

export type EpisodeBatchSkippedSegment = {
  sceneId: string;
  title: string;
  status: Exclude<EpisodeBatchSegmentStatus, "ready">;
  reason: string;
};

export type EpisodeBatchPlan = {
  ready: EpisodeBatchSegmentPlan[];
  skipped: EpisodeBatchSkippedSegment[];
  totalEstimate: number;
  lockedCount: number;
  segmentCount: number;
};

function sceneQualityMode(
  scene: { generation_tier?: string | null },
  fallback: GenerationQualityMode,
): GenerationQualityMode {
  if (scene.generation_tier === "standard") return "final";
  if (scene.generation_tier === "fast") return "draft";
  return fallback;
}

export async function planEpisodeBatchGeneration(input: {
  seriesId: string;
  episodeId: string;
  quality: GenerationQualityMode;
  sceneIds?: string[];
}): Promise<EpisodeBatchPlan> {
  const { listScenesByEpisode } = await import("@/lib/db/scenes");
  const scenes = await listScenesByEpisode(input.episodeId);
  const filtered = input.sceneIds?.length
    ? scenes.filter((scene) => input.sceneIds!.includes(scene.id))
    : scenes;

  const ready: EpisodeBatchSegmentPlan[] = [];
  const skipped: EpisodeBatchSkippedSegment[] = [];

  if (filtered.length === 0) {
    return {
      ready,
      skipped,
      totalEstimate: 0,
      lockedCount: 0,
      segmentCount: 0,
    };
  }

  for (const scene of filtered) {
    const lock = await assessSegmentLock({
      sceneId: scene.id,
      seriesId: input.seriesId,
      episodeId: input.episodeId,
    });

    if (!lock.fully_locked) {
      skipped.push({
        sceneId: scene.id,
        title: scene.title,
        status: "skipped_not_locked",
        reason:
          lock.missing.length > 0
            ? lock.missing.join("; ")
            : "References are not fully locked for this segment.",
      });
      continue;
    }

    const seedanceCheck = await validateSeedanceVideoGeneration(scene.id, {
      seriesId: input.seriesId,
      episodeId: input.episodeId,
    });
    if (!seedanceCheck.ok) {
      skipped.push({
        sceneId: scene.id,
        title: scene.title,
        status: "skipped_references",
        reason: seedanceCheck.error,
      });
      continue;
    }

    const takes = await listTakesByScene(scene.id);
    if (takes.some((take) => take.status === "pending")) {
      skipped.push({
        sceneId: scene.id,
        title: scene.title,
        status: "skipped_pending_take",
        reason: "A take is already generating for this segment.",
      });
      continue;
    }

    const quality = sceneQualityMode(scene, input.quality);
    const { tier, resolution } = resolveQualitySettings(quality);
    const rawDuration = scene.duration_seconds ?? 6;
    const durationSeconds = Math.min(12, Math.max(4, Math.round(rawDuration)));
    const shotIntent = normalizeShotIntent(scene.shot_intent);
    const seedanceAudioMode =
      normalizeSeedanceAudioMode(scene.audio_mode) ?? ("ambient" as const);

    const estimateCredits = estimateVideoCredits({
      tier,
      resolution,
      durationSeconds,
    });

    ready.push({
      sceneId: scene.id,
      title: scene.title,
      status: "ready",
      estimateCredits,
      params: {
        sceneId: scene.id,
        seriesId: input.seriesId,
        episodeId: input.episodeId,
        modelId: SEGMENT_VIDEO_MODEL_ID,
        resolution,
        durationSeconds,
        seedanceTier: tier,
        seedanceAudioMode,
        shotIntent,
        takeCount: 1,
      },
    });
  }

  const totalEstimate = ready.reduce((sum, segment) => sum + segment.estimateCredits, 0);

  return {
    ready,
    skipped,
    totalEstimate,
    lockedCount: ready.length,
    segmentCount: filtered.length,
  };
}

export async function assertEpisodeBatchScene(input: {
  sceneId: string;
  episodeId: string;
  seriesId: string;
}): Promise<{ scene: NonNullable<Awaited<ReturnType<typeof getScene>>> } | { error: string }> {
  const scene = await getScene(input.sceneId);
  if (!scene || scene.episode_id !== input.episodeId) {
    return { error: "Scene not found." };
  }
  return { scene };
}
