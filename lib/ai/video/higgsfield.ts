import "server-only";

import {
  AuthenticationError,
  BadInputError,
  NotEnoughCreditsError,
  ValidationError,
  APIError,
  InputImage,
  inputMotion,
  higgsfield,
} from "@higgsfield/client/v2";
import { formatGenerationError, logGenerationError } from "@/lib/ai/generation/errors";
import { downloadVideoSourceImage } from "@/lib/ai/generation/video-source";
import {
  assertCompletedVideoResponse,
  assertHiggsfieldVideoConfig,
  configureHiggsfieldSdk,
  createHiggsfieldUploadClient,
  higgsfieldCredentials,
  higgsfieldCredentialsConfigured,
  higgsfieldDopModel,
} from "@/lib/ai/video/higgsfield-api";
import {
  errorResult,
  notConfiguredResult,
  successResult,
  type GenerationResult,
} from "@/lib/ai/shared";
import { persistGeneratedBuffer } from "@/lib/storage/persist-generated";
import type { GenerateVideoInput, VideoAdapter } from "./types";

function imageUploadFormat(contentType: string): "jpeg" | "png" | "webp" {
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("png")) return "png";
  return "jpeg";
}

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

function formatHiggsfieldError(error: unknown): string {
  if (error instanceof AuthenticationError) {
    return error.message || "Higgsfield: authentication failed — check HIGGSFIELD_API_KEY.";
  }
  if (error instanceof NotEnoughCreditsError) {
    return error.message || "Higgsfield: not enough credits.";
  }
  if (error instanceof BadInputError || error instanceof ValidationError) {
    return error.message || "Higgsfield: invalid input.";
  }
  if (error instanceof APIError) {
    return error.message || `Higgsfield API error (${error.statusCode}).`;
  }
  return formatGenerationError(error, "Higgsfield video generation failed.");
}

export const generateVideo: VideoAdapter = async (input) => {
  if (!higgsfieldCredentialsConfigured()) {
    return notConfiguredResult(
      "Higgsfield",
      "HIGGSFIELD_API_KEY, HF_CREDENTIALS, or HF_KEY",
    );
  }

  if (!input.startImageBucket || !input.startImageStoragePath) {
    return errorResult(
      "Higgsfield: image-to-video requires a source image (star a ready storyboard take for this scene).",
    );
  }

  try {
    const { credentials, endpoint } = assertHiggsfieldVideoConfig();

    console.log('[higgsfield-cred-debug]', JSON.stringify({
      hasHF_CREDENTIALS: !!process.env.HF_CREDENTIALS,
      credLen: process.env.HF_CREDENTIALS?.length ?? 0,
      colonCount: (process.env.HF_CREDENTIALS?.match(/:/g) || []).length,
      startsOrEndsWithQuote: /^["']|["']$/.test(process.env.HF_CREDENTIALS ?? ''),
      hasHF_KEY: !!process.env.HF_KEY,
      hasHF_API_KEY: !!process.env.HF_API_KEY,
      hasHF_API_SECRET: !!process.env.HF_API_SECRET,
      hasHIGGSFIELD_API_KEY: !!process.env.HIGGSFIELD_API_KEY,
    }));

    configureHiggsfieldSdk(credentials);

    const { buffer, contentType } = await downloadVideoSourceImage({
      bucket: input.startImageBucket,
      storagePath: input.startImageStoragePath,
    });

    const uploadClient = createHiggsfieldUploadClient(credentials);
    const cdnImageUrl = await uploadClient.uploadImage(
      buffer,
      imageUploadFormat(contentType),
    );

    const dopInput: Record<string, unknown> = {
      model: higgsfieldDopModel(input.dopModel),
      prompt: input.prompt,
      input_images: [InputImage.fromUrl(cdnImageUrl)],
    };

    if (input.motionId) {
      dopInput.motions = [inputMotion(input.motionId, input.motionStrength ?? 1)];
    }

    const response = await higgsfield.subscribe(endpoint, {
      input: dopInput,
      withPolling: true,
    });

    const remoteUrl = assertCompletedVideoResponse(response);

    const videoResponse = await fetch(remoteUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download Higgsfield video (${videoResponse.status}).`);
    }

    const videoContentType = videoResponse.headers.get("content-type") ?? "video/mp4";
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    const durationSeconds = probeMp4DurationSeconds(videoBuffer);

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
      providerJobId: response.request_id ?? `higgsfield-${Date.now()}`,
      costEstimate: null,
      videoDurationSeconds: durationSeconds,
    });
  } catch (error) {
    logGenerationError("higgsfield-video", error, {
      sceneId: input.sceneId,
      dopModel: input.dopModel,
      motionId: input.motionId,
      hasStartImage: Boolean(input.startImageBucket && input.startImageStoragePath),
      configured: Boolean(higgsfieldCredentials()),
    });
    return errorResult(formatHiggsfieldError(error));
  }
};

export async function runHiggsfield(input: GenerateVideoInput): Promise<GenerationResult> {
  return generateVideo(input);
}

export async function listHiggsfieldMotions() {
  const credentials = higgsfieldCredentials();
  if (!credentials) {
    throw new Error(
      "Higgsfield is not configured — set HIGGSFIELD_API_KEY, HF_CREDENTIALS, or HF_KEY.",
    );
  }

  const client = createHiggsfieldUploadClient(credentials);
  const motions = await client.getMotions();
  return motions.map((motion) => ({
    id: motion.id,
    name: motion.name,
    description: motion.description ?? null,
  }));
}
