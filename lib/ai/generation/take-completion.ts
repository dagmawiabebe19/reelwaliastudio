import "server-only";

import { createAsset } from "@/lib/db/assets";
import { getScene, getSceneBasic } from "@/lib/db/scenes";
import type { ServiceDbClient } from "@/lib/db/service-client";
import { getTake, markTakeReady } from "@/lib/db/takes";
import { seedanceGenerateAudio, type SeedanceAudioMode } from "@/lib/ai/video/seedance-constants";
import { persistRemoteAsset } from "@/lib/storage/persist-generated";
import { SEGMENT_VIDEO_MODEL_ID } from "@/lib/ai/registry";

function probeMp4DurationSeconds(buffer: Buffer): number | null {
  const marker = Buffer.from("mvhd");
  const idx = buffer.indexOf(marker);
  if (idx < 4) return null;

  const start = idx - 4;
  if (start + 40 > buffer.length) return null;

  const version = buffer.readUInt8(start + 8);
  if (version === 0) {
    const timescale = buffer.readUInt32BE(start + 20);
    const duration = buffer.readUInt32BE(start + 24);
    if (timescale > 0) return duration / timescale;
  } else if (version === 1 && start + 44 <= buffer.length) {
    const timescale = buffer.readUInt32BE(start + 28);
    const durationHi = buffer.readUInt32BE(start + 32);
    const durationLo = buffer.readUInt32BE(start + 36);
    const duration = durationHi * 2 ** 32 + durationLo;
    if (timescale > 0) return duration / timescale;
  }

  return null;
}

export async function finalizeTakeFromRemoteVideo(input: {
  takeId: string;
  sceneId: string;
  videoUrl: string;
  modelId?: string;
  prompt?: string | null;
  seedanceAudioMode?: SeedanceAudioMode;
  fallbackDurationSeconds?: number | null;
  /** Background ops reconcile — service-role DB, no cookies. */
  ops?: { db: ServiceDbClient; ownerId: string };
}): Promise<{ assetId: string; videoDurationSeconds: number }> {
  const db = input.ops?.db;
  const take = await getTake(input.takeId, db);
  if (!take) throw new Error("Take not found.");
  if (take.status === "ready" && take.asset_id) {
    return {
      assetId: take.asset_id,
      videoDurationSeconds: Number(take.duration_seconds ?? input.fallbackDurationSeconds ?? 6),
    };
  }

  const scene = db
    ? await getSceneBasic(input.sceneId, db)
    : await getScene(input.sceneId);
  if (!scene) throw new Error("Scene not found.");

  const videoResponse = await fetch(input.videoUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to download Seedance video (${videoResponse.status}).`);
  }

  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
  const probedDuration = probeMp4DurationSeconds(videoBuffer);
  const videoDurationSeconds =
    probedDuration ??
    Number(input.fallbackDurationSeconds ?? take.duration_seconds ?? scene.duration_seconds ?? 6);

  const stored = await persistRemoteAsset({
    sceneId: input.sceneId,
    remoteUrl: input.videoUrl,
    model: input.modelId ?? SEGMENT_VIDEO_MODEL_ID,
    prompt: input.prompt ?? scene.prompt ?? scene.title,
    ownerId: input.ops?.ownerId,
  });

  const asset = await createAsset(
    {
      bucket: stored.bucket,
      storagePath: stored.storagePath,
      mediaType: stored.mediaType,
      durationMs: videoDurationSeconds * 1000,
      source: "generated",
      model: input.modelId ?? SEGMENT_VIDEO_MODEL_ID,
      prompt: input.prompt ?? scene.prompt ?? scene.title,
    },
    input.ops ? { db: input.ops.db, ownerId: input.ops.ownerId } : undefined,
  );

  const audioMode = input.seedanceAudioMode ?? "ambient";
  await markTakeReady(
    input.takeId,
    asset.id,
    {
      duration_seconds: videoDurationSeconds,
      has_audio: seedanceGenerateAudio(audioMode),
    },
    db,
  );

  return { assetId: asset.id, videoDurationSeconds };
}
