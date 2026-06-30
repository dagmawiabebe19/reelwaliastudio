import "server-only";

import { getActiveUserId } from "@/lib/auth/getUser";
import { getDbClient } from "@/lib/db/client";
import { deleteStorageObjects } from "@/lib/storage/delete-files";

export async function deleteAssetsByIds(assetIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(assetIds.filter(Boolean))];
  if (!uniqueIds.length) return;

  const supabase = await getDbClient();
  const ownerId = await getActiveUserId();

  const { data, error } = await supabase
    .from("assets")
    .select("id, bucket, storage_path")
    .in("id", uniqueIds)
    .eq("owner_id", ownerId);

  if (error) throw new Error(error.message);
  if (!data?.length) return;

  await deleteStorageObjects(
    data.map((row) => ({ bucket: row.bucket, storagePath: row.storage_path })),
  );

  const { error: deleteError } = await supabase
    .from("assets")
    .delete()
    .in("id", data.map((row) => row.id));

  if (deleteError) throw new Error(deleteError.message);
}
