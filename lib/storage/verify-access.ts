import "server-only";

import { getActiveUserId } from "@/lib/auth/getUser";
import { getDbClient } from "@/lib/db/client";

/** Ensures the authenticated user owns the storage object before signing URLs. */
export async function verifyStorageObjectAccess(
  bucket: string,
  storagePath: string,
): Promise<void> {
  const ownerId = await getActiveUserId();
  const pathOwner = storagePath.split("/")[0];
  if (pathOwner === ownerId) {
    return;
  }

  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("assets")
    .select("id")
    .eq("bucket", bucket)
    .eq("storage_path", storagePath)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Asset not found.");
}
