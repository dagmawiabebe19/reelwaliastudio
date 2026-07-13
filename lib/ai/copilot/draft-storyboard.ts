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
import {
  createScenesBatch,
  listScenesByEpisode,
  reorderScenes,
  updateScene,
} from "@/lib/db/scenes";
import { looksLikeUuid, normalizeRefKey, resolveAmong } from "@/lib/ai/copilot/resolve-entity";
import { assessSegmentLock } from "@/lib/production/reference-readiness";
import { resolveSceneReferences } from "@/lib/production/resolve-references";
import { resolveActLabelForEpisode } from "@/lib/storyboard/episode-buckets";

type SegmentRecord = Record<string, unknown>;

type ParsedSegment = {
  sceneKey: string | null;
  sceneNumber: number | null;
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

  const sceneKeyRaw =
    segment.scene_id ??
    segment.scene_ref ??
    segment.scene_key ??
    segment.scene ??
    null;
  const sceneNumber =
    typeof segment.scene_number === "number"
      ? segment.scene_number
      : typeof segment.scene_number === "string" && /^\d+$/.test(segment.scene_number)
        ? Number(segment.scene_number)
        : null;

  return {
    sceneKey: sceneKeyRaw ? String(sceneKeyRaw).trim() : null,
    sceneNumber,
    sceneId: null,
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
export function normalizeStoryboardSegments(attrs: Record<string, unknown>): SegmentRecord[] {
  const raw = attrs.segments;
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

function sceneOptionLabel(scene: { sort_order: number; title: string }): string {
  return `scene ${scene.sort_order + 1}: ${scene.title}`;
}

/**
 * Resolve segment targeting without blind-create on bad UUID.
 * - Explicit key that fails → error (lists valid options)
 * - No key → upsert by exact title match, else create
 */
async function resolveSegmentTargets(
  segments: ParsedSegment[],
  episodeId: string,
): Promise<{ error?: string; valid_options?: string[] }> {
  const existing = await listScenesByEpisode(episodeId);
  const claimed = new Set<string>();

  for (const segment of segments) {
    const key =
      segment.sceneKey ||
      (segment.sceneNumber != null ? String(segment.sceneNumber) : null);

    if (key) {
      const resolved = resolveAmong(
        key,
        existing,
        {
          id: (s) => s.id,
          ordinal: (s) => s.sort_order,
          title: (s) => s.title,
          label: sceneOptionLabel,
        },
        "scene",
      );

      if ("error" in resolved) {
        // Truncated/mangled UUID or unknown key — never create as a side effect.
        if (looksLikeUuid(key) || segment.sceneKey) {
          return {
            error: resolved.error,
            valid_options: resolved.valid_options,
          };
        }
      } else {
        if (claimed.has(resolved.entity.id)) {
          return {
            error: `Scene "${resolved.entity.title}" was targeted by multiple segments. Use unique scene_number / title per segment.`,
            valid_options: existing.map(sceneOptionLabel),
          };
        }
        segment.sceneId = resolved.entity.id;
        claimed.add(resolved.entity.id);
        continue;
      }
    }

    // No usable key: upsert by exact title within episode.
    const titleNorm = normalizeRefKey(segment.title);
    const titleMatches = existing.filter(
      (scene) => normalizeRefKey(scene.title) === titleNorm && !claimed.has(scene.id),
    );
    if (titleMatches.length === 1) {
      segment.sceneId = titleMatches[0].id;
      claimed.add(titleMatches[0].id);
      continue;
    }
    if (titleMatches.length > 1) {
      return {
        error: `Ambiguous scene title "${segment.title}" — ${titleMatches.length} matches. Pass scene_number to disambiguate.`,
        valid_options: titleMatches.map(sceneOptionLabel),
      };
    }

    // Truly new segment — leave sceneId null for create.
  }

  return {};
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

  const resolveResult = await resolveSegmentTargets(parsed, input.episodeId);
  if (resolveResult.error) {
    const options = resolveResult.valid_options?.length
      ? ` Valid scenes: ${resolveResult.valid_options.join(" | ")}`
      : "";
    throw new Error(`${resolveResult.error}${options}`);
  }

  const existingSceneIds = new Set(
    parsed.map((segment) => segment.sceneId).filter((id): id is string => Boolean(id)),
  );

  const toCreate = parsed.filter((segment) => !segment.sceneId);
  const created: string[] = [];
  const createdRefs: Array<{ scene_number: number; title: string; scene_id: string }> = [];

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

  // Re-read sort_order after reorder for human-facing refs.
  const afterReorder = await listScenesByEpisode(input.episodeId);
  const sortById = new Map(afterReorder.map((scene) => [scene.id, scene.sort_order]));

  for (const id of created) {
    const scene = afterReorder.find((row) => row.id === id);
    if (scene) {
      createdRefs.push({
        scene_number: (sortById.get(id) ?? 0) + 1,
        title: scene.title,
        scene_id: id,
      });
    }
  }

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

  const resolved: Array<{
    scene_number: number;
    title: string;
    scene_id: string;
    references: unknown[];
  }> = [];

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

    const sortOrder = sortById.get(outcome.value.sceneId) ?? i;
    resolved.push({
      scene_number: sortOrder + 1,
      title: segment.title,
      scene_id: outcome.value.sceneId,
      references: outcome.value.references,
    });
    input.emitProgress(`built segment ${completed}/${total}: ${segment.title}…`, completed, total);
  }

  const lockReport = await Promise.all(
    builtSceneIds.map(async (sceneId) => {
      const lock = await assessSegmentLock({
        sceneId,
        seriesId: input.seriesId,
        episodeId: input.episodeId,
      });
      const sortOrder = sortById.get(sceneId) ?? 0;
      return {
        ...lock,
        scene_number: sortOrder + 1,
        // Prefer short refs for the model; keep scene_id for server clients.
      };
    }),
  );

  return {
    episode_id: input.episodeId,
    created: createdRefs.map((row) => ({
      scene_number: row.scene_number,
      title: row.title,
      ref: `scene ${row.scene_number}`,
    })),
    updated: updated.map((id) => {
      const scene = afterReorder.find((row) => row.id === id);
      const n = (sortById.get(id) ?? 0) + 1;
      return {
        scene_number: n,
        title: scene?.title ?? "",
        ref: `scene ${n}`,
      };
    }),
    count: created.length + updated.length,
    resolved: resolved.map(({ scene_number, title, references }) => ({
      scene_number,
      title,
      ref: `scene ${scene_number}`,
      references,
    })),
    lock_report: lockReport.map((row) => {
      const { scene_id: _unused, ...rest } = row as typeof row & { scene_id?: string };
      void _unused;
      return rest;
    }),
    fully_locked_count: lockReport.filter((row) => row.fully_locked).length,
    segment_count: lockReport.length,
    note: "Address scenes as scene_number or title — never copy UUIDs.",
  };
}
