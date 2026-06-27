import "server-only";

import { getStorageClient } from "@/lib/storage/client";

export async function deleteStorageObject(bucket: string, storagePath: string): Promise<void> {
  const supabase = await getStorageClient();
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);
  if (error) throw new Error(error.message);
}

export async function deleteStorageObjects(
  objects: Array<{ bucket: string; storagePath: string }>,
): Promise<void> {
  const byBucket = new Map<string, string[]>();
  for (const obj of objects) {
    if (!obj.storagePath) continue;
    const paths = byBucket.get(obj.bucket) ?? [];
    paths.push(obj.storagePath);
    byBucket.set(obj.bucket, paths);
  }

  const supabase = await getStorageClient();
  for (const [bucket, paths] of byBucket) {
    if (!paths.length) continue;
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) throw new Error(error.message);
  }
}
