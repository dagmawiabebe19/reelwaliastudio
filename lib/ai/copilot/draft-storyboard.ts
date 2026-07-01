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
import { createScenesBatch, getScene, reorderScenes, updateScene } from "@/lib/db/scenes";
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
  const title = String(
    segment.title ?? segment.name ?? segment.segment_title ?? "",
  ).trim();
  if (!title) return null;

  const prompt = String(segment.prompt ?? segment.description ?? "").trim();
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

/** Coerce tool args into a segments array (models sometimes nest or omit the array). */
export function normalizeStoryboardSegments(args: Record<string, unknown>): SegmentRecord[] {
  const raw = args.segments;
  if (Array.isArray(raw)) {
    return raw as SegmentRecord[];
  }
  if (raw && typeof raw === "object") {
    const nested = (raw as { items?: unknown; segments?: unknown }).items;
    if (Array.isArray(nested)) {
      return nested as SegmentRecord[];
    }
    const nestedSegments = (raw as { segments?: unknown }).segments;
    if (Array.isArray(nestedSegments)) {
      return nestedSegments as SegmentRecord[];
    }
  }
  return [];
}

async function resolveSegmentSceneIds(
  segments: ParsedSegment[],
  episodeId: string,
): Promise<void> {
  await Promise.all(
    segments.map(async (segment) => {
      if (!segment.sceneId) return;
      const scene = await getScene(segment.sceneId);
      if (!scene || scene.episode_id !== episodeId) {
        segment.sceneId = null;
      }
    }),
  );
}

function sceneBatchPayload(segment: ParsedSegment) {
  return {
    title: segment.title,
    actLabel: segment.actLabel,
    prompt: segment.prompt,
    shotIntent: segment.shotIntent,
    audioMode: segment.audioMode,
    generationTier: segment.generationTier,
    durationSeconds: segment.durationSeconds ?? null,
    orientation: segment.orientation,
  };
}

export async function executeDraftStoryboard(input: {
  episode: Episode;
  episodeId: string;
  seriesId: string;
  segments: SegmentRecord[];
  emitProgress: DraftStoryboardProgress;
}) {
  const rawCount = input.segments.length;
  const parsed = input.segments
    .map((segment) => parseSegment(input.episode, segment))
    .filter((segment): segment is ParsedSegment => segment !== null);

  if (!parsed.length) {
    if (rawCount > 0) {
      throw new Error(
        `Could not parse any of ${rawCount} segments — each needs a title (and prompt). Check segment field names.`,
      );
    }
    throw new Error(
      "No segments provided — draft_storyboard requires a segments array. Episode plans in chat text alone do not create storyboard cards.",
    );
  }

  const total = parsed.length;
  input.emitProgress(`creating ${total} segments…`, 0, total);

  await resolveSegmentSceneIds(parsed, input.episodeId);

  const existingSceneIds = new Set(
    parsed.map((segment) => segment.sceneId).filter((id): id is string => Boolean(id)),
  );

  const toCreate = parsed.filter((segment) => !segment.sceneId);
  const created: string[] = [];

  if (toCreate.length > 0) {
    input.emitProgress(`inserting ${toCreate.length} segment rows…`, 0, total);
    const newScenes = await createScenesBatch(
      input.episodeId,
      toCreate.map((segment) => sceneBatchPayload(segment)),
    );
    let createIndex = 0;
    for (const segment of parsed) {
      if (!segment.sceneId) {
        const scene = newScenes[createIndex];
        createIndex += 1;
        if (!scene) {
          throw new Error(
            `Batch insert failed for segment "${segment.title}" — no row returned.`,
          );
        }
        segment.sceneId = scene.id;
        created.push(scene.id);
      }
    }
  }

  const updated = parsed
    .map((segment) => segment.sceneId)
    .filter((id): id is string => typeof id === "string" && existingSceneIds.has(id));

  // Phase 1: persist metadata on existing rows (new rows already inserted with full payload).
  if (updated.length > 0) {
    input.emitProgress(`updating ${updated.length} existing segments…`, 0, total);
    const updateOutcomes = await runWithConcurrencySettled(
      parsed.filter((segment) => segment.sceneId && existingSceneIds.has(segment.sceneId)),
      SEGMENT_SETUP_CONCURRENCY,
      async (segment) => {
        await updateScene(segment.sceneId!, {
          title: segment.title,
          prompt: segment.prompt,
          act_label: segment.actLabel,
          shot_intent: segment.shotIntent,
          audio_mode: segment.audioMode,
          generation_tier: segment.generationTier,
          duration_seconds: segment.durationSeconds ?? null,
          orientation: segment.orientation,
        });
      },
    );

    const updateFailure = updateOutcomes.find((outcome) => outcome.status === "rejected");
    if (updateFailure?.status === "rejected") {
      const reason =
        updateFailure.reason instanceof Error
          ? updateFailure.reason.message
          : "Segment update failed.";
      throw new Error(
        created.length > 0
          ? `${reason} (${created.length} new segment${created.length === 1 ? "" : "s"} were created — refresh the storyboard.)`
          : reason,
      );
    }
  }

  const builtSceneIds = parsed
    .map((segment) => segment.sceneId)
    .filter((id): id is string => Boolean(id));

  if (builtSceneIds.length !== total) {
    throw new Error(
      `Segment setup incomplete: expected ${total} scene ids, got ${builtSceneIds.length}.`,
    );
  }

  await reorderScenes(input.episodeId, builtSceneIds);

  // Phase 2: bind references after all rows are committed.
  input.emitProgress(`binding references for ${total} segments…`, 0, total);
  let completed = 0;
  const bindOutcomes = await runWithConcurrencySettled(
    parsed,
    SEGMENT_SETUP_CONCURRENCY,
    async (segment) => {
      const references = await resolveSceneReferences({
        sceneId: segment.sceneId!,
        seriesId: input.seriesId,
        episodeId: input.episodeId,
        autoBind: true,
      });
      return { sceneId: segment.sceneId!, references };
    },
  );

  const resolved: Array<{ scene_id: string; references: unknown[] }> = [];

  for (let i = 0; i < bindOutcomes.length; i++) {
    const segment = parsed[i];
    const outcome = bindOutcomes[i];
    completed += 1;

    if (outcome.status === "rejected") {
      const message =
        outcome.reason instanceof Error ? outcome.reason.message : "Reference binding failed.";
      input.emitProgress(
        `binding ${completed}/${total} failed: ${segment.title} — ${message}`,
        completed,
        total,
      );
      throw new Error(
        `${message} (${builtSceneIds.length} segment${builtSceneIds.length === 1 ? "" : "s"} exist — refresh, then re-run draft_storyboard or bind_identity to retry bindings.)`,
      );
    }

    resolved.push({ scene_id: outcome.value.sceneId, references: outcome.value.references });
    input.emitProgress(`built segment ${completed}/${total}: ${segment.title}…`, completed, total);
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
