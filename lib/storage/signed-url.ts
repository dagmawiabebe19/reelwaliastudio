import "server-only";

import { getStorageClient } from "@/lib/storage/client";

/** List/card thumbnails — 2× for retina at size-14 (56px). */
export const THUMBNAIL_WIDTH = 112;

export async function getSignedUrl(
  bucket: string,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  try {
    const supabase = await getStorageClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error) {
      console.warn("[storage] signed URL failed", {
        bucket,
        storagePath,
        message: error.message,
      });
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (error) {
    console.warn("[storage] signed URL exception", {
      bucket,
      storagePath,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Signed URL with storage resize transform — same path as References panel, thumbnail width. */
export async function getThumbnailSignedUrl(
  bucket: string,
  storagePath: string,
  width = THUMBNAIL_WIDTH,
  expiresInSeconds = 3600,
): Promise<string | null> {
  try {
    const supabase = await getStorageClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, expiresInSeconds, {
        transform: { width, resize: "cover", quality: 80 },
      });

    if (error) {
      // Non-image assets may reject transforms — fall back to full signed URL.
      return getSignedUrl(bucket, storagePath, expiresInSeconds);
    }
    return data?.signedUrl ?? null;
  } catch {
    return getSignedUrl(bucket, storagePath, expiresInSeconds);
  }
}
