import "server-only";

import { getSignedUrl } from "@/lib/storage/signed-url";

export async function resolveAssetUrl(
  asset: { bucket: string; storage_path: string } | null | undefined,
): Promise<string | null> {
  if (!asset) return null;
  return getSignedUrl(asset.bucket, asset.storage_path);
}

export async function resolveAssetUrls<
  T extends { assets?: { bucket: string; storage_path: string } | null },
>(items: T[]): Promise<(T & { assetUrl: string | null })[]> {
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      assetUrl: await resolveAssetUrl(item.assets),
    })),
  );
}
