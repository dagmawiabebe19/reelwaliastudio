import "server-only";

import { formatGenerationError, logGenerationError } from "@/lib/ai/generation/errors";
import {
  assertHiggsfieldVideoConfig,
  extractVideoUrl,
  higgsfieldCredentials,
  higgsfieldPollVideoJob,
  higgsfieldSubmitVideoJob,
  higgsfieldVideoModelPath,
} from "@/lib/ai/video/higgsfield-api";
import {
  errorResult,
  getEnv,
  notConfiguredResult,
  successResult,
  type GenerationResult,
} from "@/lib/ai/shared";
import { persistGeneratedBuffer } from "@/lib/storage/persist-generated";
import type { GenerateVideoInput, VideoAdapter } from "./types";

export const generateVideo: VideoAdapter = async (input) => {
  if (!getEnv("HIGGSFIELD_API_KEY")) {
    return notConfiguredResult("Higgsfield", "HIGGSFIELD_API_KEY");
  }

  if (!higgsfieldVideoModelPath()) {
    return errorResult(
      "Higgsfield: HIGGSFIELD_VIDEO_MODEL is not set — add your Seedance image-to-video endpoint path.",
    );
  }

  if (!input.startImageUrl) {
    return errorResult(
      "Higgsfield: image-to-video requires a source image (star a ready storyboard take for this scene).",
    );
  }

  try {
    const { apiBase, modelPath, credentials } = assertHiggsfieldVideoConfig();

    const submit = await higgsfieldSubmitVideoJob({
      credentials,
      apiBase,
      modelPath,
      prompt: input.prompt,
      imageUrl: input.startImageUrl,
      durationSeconds: input.durationSeconds,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
    });

    const completed = await higgsfieldPollVideoJob({
      credentials,
      apiBase,
      submit,
    });

    const remoteUrl = extractVideoUrl(completed);
    if (!remoteUrl) {
      return errorResult("Higgsfield: completed job did not include a video URL.");
    }

    const videoResponse = await fetch(remoteUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download Higgsfield video (${videoResponse.status}).`);
    }

    const contentType = videoResponse.headers.get("content-type") ?? "video/mp4";
    const buffer = Buffer.from(await videoResponse.arrayBuffer());

    const stored = await persistGeneratedBuffer({
      sceneId: input.sceneId,
      buffer,
      contentType,
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
      providerJobId: submit.request_id ?? `higgsfield-${Date.now()}`,
      costEstimate: input.durationSeconds * 0.12,
    });
  } catch (error) {
    logGenerationError("higgsfield-video", error, {
      sceneId: input.sceneId,
      durationSeconds: input.durationSeconds,
      aspectRatio: input.aspectRatio,
      hasStartImage: Boolean(input.startImageUrl),
      configured: Boolean(higgsfieldCredentials()),
    });
    return errorResult(formatGenerationError(error, "Higgsfield video generation failed."));
  }
};

export async function runHiggsfield(input: GenerateVideoInput): Promise<GenerationResult> {
  return generateVideo(input);
}
