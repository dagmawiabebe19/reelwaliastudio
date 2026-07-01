import "server-only";

import { formatGenerationError, logGenerationError } from "@/lib/ai/generation/errors";
import { downloadVideoSourceImage } from "@/lib/ai/generation/video-source";
import {
  errorResult,
  notConfiguredResult,
  successResult,
} from "@/lib/ai/shared";
import {
  seedanceGenerateAudio,
  type SeedanceAudioMode,
} from "@/lib/ai/video/seedance-constants";
import {
  buildSeedancePromptWithImageRefs,
  falCredentialsConfigured,
  formatFalError,
  submitSeedanceJobWithReferenceRetries,
} from "@/lib/ai/video/seedance-api";
import { persistGeneratedBuffer } from "@/lib/storage/persist-generated";
import type { GenerateVideoInput, VideoAdapter } from "./types";

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

function normalizeResolution(resolution: string): "480p" | "720p" {
  return resolution === "480p" ? "480p" : "720p";
}

function normalizeDurationSeconds(durationSeconds: number): string {
  const clamped = Math.min(15, Math.max(4, Math.round(durationSeconds)));
  return String(clamped);
}

export const generateVideo: VideoAdapter = async (input) => {
  if (!falCredentialsConfigured()) {
    return notConfiguredResult("Seedance 2.0", "FAL_KEY");
  }

  const references = input.referenceImages;
  if (!references.length) {
    return errorResult(
      "Seedance: reference-to-video requires bound reference images (character sheet and/or location) for this segment.",
    );
  }

  try {
    const referenceSources = references.map((ref) => ({
      label: ref.label,
      bucket: ref.bucket,
      storagePath: ref.storagePath,
    }));

    const prompt = buildSeedancePromptWithImageRefs(
      input.prompt,
      references.map((ref) => ref.label),
    );

    const audioMode: SeedanceAudioMode = input.seedanceAudioMode ?? "off";
    const generate_audio = seedanceGenerateAudio(audioMode);

    const { videoUrl, requestId } = await submitSeedanceJobWithReferenceRetries(
      input.seedanceTier,
      {
        sceneId: input.sceneId,
        references: referenceSources,
        download: downloadVideoSourceImage,
        hint: input.providerHint,
        onEnqueue: input.onFalEnqueued,
        falInput: {
          prompt,
          resolution: normalizeResolution(input.resolution),
          duration: normalizeDurationSeconds(input.durationSeconds),
          aspect_ratio: input.aspectRatio,
          generate_audio,
        },
      },
    );

    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download Seedance video (${videoResponse.status}).`);
    }

    const videoContentType = videoResponse.headers.get("content-type") ?? "video/mp4";
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    const videoDurationSeconds = probeMp4DurationSeconds(videoBuffer);

    const stored = await persistGeneratedBuffer({
      sceneId: input.sceneId,
      buffer: videoBuffer,
      contentType: videoContentType,
    });

    return successResult({
      assetUrls: [stored.signedUrl],
      persistedAssets: [
        {
          bucket: stored.bucket,
          storagePath: stored.storagePath,
          mediaType: "video",
        },
      ],
      providerJobId: requestId ?? `seedance-${Date.now()}`,
      costEstimate: null,
      videoDurationSeconds,
    });
  } catch (error) {
    logGenerationError("seedance-video", error, {
      sceneId: input.sceneId,
      seedanceTier: input.seedanceTier,
      durationSeconds: input.durationSeconds,
      resolution: input.resolution,
      configured: falCredentialsConfigured(),
    });
    return errorResult(formatFalError(error) || formatGenerationError(error, "Seedance video generation failed."));
  }
};

export async function runSeedance(input: GenerateVideoInput) {
  return generateVideo(input);
}
