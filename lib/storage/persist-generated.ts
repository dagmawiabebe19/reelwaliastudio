import "server-only";

import { randomUUID } from "crypto";
import { getActiveUserId } from "@/lib/auth/getUser";
import { buildGeneratedAssetPath } from "@/lib/db/assets";
import { detectMediaType } from "@/lib/storage/buckets";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStorageClient } from "@/lib/storage/client";
import { getSignedUrl } from "@/lib/storage/signed-url";

const GENERATED_BUCKET = "assets" as const;

function extensionFromContentType(contentType: string, fallback = "bin"): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("quicktime")) return "mov";
  return fallback;
}

function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split(".").pop();
    if (ext && ext.length <= 5) return ext;
  } catch {
    // ignore
  }
  return "bin";
}

export async function persistGeneratedBuffer(input: {
  sceneId: string;
  buffer: Buffer;
  contentType: string;
  width?: number | null;
  height?: number | null;
  /** Ops/script backfill: explicit owner + service-role storage (no cookies). */
  ownerId?: string;
}): Promise<{
  bucket: string;
  storagePath: string;
  mediaType: ReturnType<typeof detectMediaType>;
  signedUrl: string;
}> {
  const ownerId = input.ownerId ?? (await getActiveUserId());
  const ext = extensionFromContentType(input.contentType, "png");
  const storagePath = buildGeneratedAssetPath(ownerId, input.sceneId, ext, randomUUID());
  const mediaType = detectMediaType(input.contentType);

  const supabase = input.ownerId ? createAdminClient() : await getStorageClient();
  const { error } = await supabase.storage.from(GENERATED_BUCKET).upload(storagePath, input.buffer, {
    contentType: input.contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const signedUrl = await getSignedUrl(GENERATED_BUCKET, storagePath);
  if (!signedUrl) {
    throw new Error("Failed to create signed URL for generated asset.");
  }

  return { bucket: GENERATED_BUCKET, storagePath, mediaType, signedUrl };
}

export async function persistRemoteAsset(input: {
  sceneId: string;
  remoteUrl: string;
  contentType?: string;
  model?: string;
  prompt?: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  /** Ops reconcile: explicit owner + service-role storage (no cookies). */
  ownerId?: string;
}): Promise<{ bucket: string; storagePath: string; mediaType: ReturnType<typeof detectMediaType> }> {
  const ownerId = input.ownerId ?? (await getActiveUserId());
  const response = await fetch(input.remoteUrl);
  if (!response.ok) {
    throw new Error(`Failed to download generated asset (${response.status}).`);
  }

  const contentType =
    input.contentType ?? response.headers.get("content-type") ?? "application/octet-stream";
  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = extensionFromContentType(contentType, extensionFromUrl(input.remoteUrl));
  const storagePath = buildGeneratedAssetPath(ownerId, input.sceneId, ext, randomUUID());
  const mediaType = detectMediaType(contentType);

  const supabase = input.ownerId ? createAdminClient() : await getStorageClient();
  const { error } = await supabase.storage.from(GENERATED_BUCKET).upload(storagePath, buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  return { bucket: GENERATED_BUCKET, storagePath, mediaType };
}
