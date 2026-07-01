import "server-only";

import { getStorageClient } from "@/lib/storage/client";

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
