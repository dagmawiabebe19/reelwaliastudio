import "server-only";

import { getStorageClient } from "@/lib/storage/client";

export async function getSignedUrl(
  bucket: string,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const supabase = await getStorageClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) throw new Error(error.message);
  return data?.signedUrl ?? null;
}
