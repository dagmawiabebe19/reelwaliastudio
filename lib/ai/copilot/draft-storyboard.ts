import "server-only";

import type { Episode } from "@/lib/db/database.types";
import {
  runWithConcurrencySettled,
  SEGMENT_SETUP_CONCURRENCY,
} from "@/lib/ai/generation/concurrency";
import {
  inferAudioModeFromPrompt,
  normalizeGenerationTier,
  normalizeSeedanceAudioMode,
} from "@/lib/ai/video/seedance-constants";
import { normalizeShotIntent } from "@/lib/production/prompts";
import { createScenesBatch, reorderScenes, updateScene } from "@/lib/db/scenes";
import { assessSegmentLock } from "@/lib/production/reference-readiness";
import { resolveSceneReferences } from "@/lib/production/resolve-references";
import { resolveActLabelForEpisode } from "@/lib/storyboard/episode-buckets";

type SegmentRecord = Record<string, unknown>;

type ParsedSegment = {
  sceneId: string | null;
  title: string;
  prompt: string;
  actLabel: string;
  shotIntent: ReturnType<typeof normalizeShotIntent>;
  audioMode: NonNullable<ReturnType<typeof normalizeSeedanceAudioMode>> | ReturnType<typeof inferAudioModeFromPrompt>;
  generationTier: NonNullable<ReturnType<typeof normalizeGenerationTier>>;
  durationSeconds: number | undefined;
  orientation: "portrait" | "landscape" | null;
};

function parseSegment(episode: Episode, segment: SegmentRecord): ParsedSegment | null {
  const title = String(segment.title ?? "").trim();
  if (!title) return null;

  const prompt = String(segment.prompt ?? "").trim();
  const actLabel = resolveActLabelForEpisode(episode, segment.act_label);
  const shotIntent = normalizeShotIntent(
    typeof segment.shot_intent === "string" ? segment.shot_intent : null,
  );
  const audioMode =
    normalizeSeedanceAudioMode(
      typeof segment.audio_mode === "string" ? segment.audio_mode : null,
    ) ?? inferAudioModeFromPrompt(prompt);
  const generationTier =
    normalizeGenerationTier(
      typeof segment.generation_tier === "string" ? segment.generation_tier : null,
    ) ?? "fast";
  const durationSeconds =
    typeof segment.duration_seconds === "number"
      ? Math.min(15, Math.max(4, Math.round(segment.duration_seconds)))
      : undefined;

  return {
    sceneId: segment.scene_id ? String(segment.scene_id) : null,
    title,
    prompt,
    actLabel,
    shotIntent,
    audioMode,
    generationTier,
    durationSeconds,
    orientation:
      segment.orientation === "portrait" || segment.orientation === "landscape"
        ? segment.orientation
        : null,
  };
}

export type DraftStoryboardProgress = (detail: string, step?: number, total?: number) => void;

export async function executeDraftStoryboard(input: {
  episode: Episode;
  episodeId: string;
  seriesId: string;
  segments: SegmentRecord[];
  emitProgress: DraftStoryboardProgress;
}) {
  const parsed = input.segments
    .map((segment) => parseSegment(input.episode, segment))
    .filter((segment): segment is ParsedSegment => segment !== null);

  const total = parsed.length;
  input.emitProgress("running…", 0, total || 1);

  const existingSceneIds = new Set(
    parsed.map((segment) => segment.sceneId).filter((id): id is string => Boolean(id)),
  );

  const toCreate = parsed.filter((segment) => !segment.sceneId);
  const created: string[] = [];

  if (toCreate.length > 0) {
    const newScenes = await createScenesBatch(
      input.episodeId,
      toCreate.map((segment) => ({ title: segment.title, actLabel: segment.actLabel })),
    );
    let createIndex = 0;
    for (const segment of parsed) {
      if (!segment.sceneId) {
        const scene = newScenes[createIndex];
        createIndex += 1;
        if (!scene) {
          throw new Error(`Could not create segment "${segment.title}".`);
        }
        segment.sceneId = scene.id;
        created.push(scene.id);
      }
    }
  }

  const updated = parsed
    .map((segment) => segment.sceneId)
    .filter((id): id is string => typeof id === "string" && existingSceneIds.has(id));

  let completed = 0;
  const builtSceneIds: string[] = [];

  const settled = await runWithConcurrencySettled(
    parsed,
    SEGMENT_SETUP_CONCURRENCY,
    async (segment) => {
      if (!segment.sceneId) {
        throw new Error(`Missing scene for segment "${segment.title}".`);
      }

      await updateScene(segment.sceneId, {
        title: segment.title,
        prompt: segment.prompt,
        act_label: segment.actLabel,
        shot_intent: segment.shotIntent,
        audio_mode: segment.audioMode,
        generation_tier: segment.generationTier,
        duration_seconds: segment.durationSeconds ?? null,
        orientation: segment.orientation,
      });

      const references = await resolveSceneReferences({
        sceneId: segment.sceneId,
        seriesId: input.seriesId,
        episodeId: input.episodeId,
        autoBind: true,
      });

      return { sceneId: segment.sceneId, references };
    },
  );

  const resolved: Array<{ scene_id: string; references: unknown[] }> = [];

  for (let i = 0; i < settled.length; i++) {
    const segment = parsed[i];
    const outcome = settled[i];
    completed += 1;

    if (outcome.status === "rejected") {
      const message =
        outcome.reason instanceof Error ? outcome.reason.message : "Segment setup failed.";
      input.emitProgress(
        `segment ${completed}/${total} failed: ${segment.title} — ${message}`,
        completed,
        total,
      );
      throw outcome.reason instanceof Error ? outcome.reason : new Error(message);
    }

    builtSceneIds.push(outcome.value.sceneId);
    resolved.push({ scene_id: outcome.value.sceneId, references: outcome.value.references });
    input.emitProgress(`built segment ${completed}/${total}: ${segment.title}…`, completed, total);
  }

  if (builtSceneIds.length > 0) {
    await reorderScenes(input.episodeId, builtSceneIds);
  }

  const lockReport = await Promise.all(
    builtSceneIds.map((sceneId) =>
      assessSegmentLock({ sceneId, seriesId: input.seriesId, episodeId: input.episodeId }),
    ),
  );

  return {
    episode_id: input.episodeId,
    created,
    updated,
    count: created.length + updated.length,
    resolved,
    lock_report: lockReport,
    fully_locked_count: lockReport.filter((row) => row.fully_locked).length,
    segment_count: lockReport.length,
  };
}
