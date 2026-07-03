import "server-only";

import type { ServiceDbClient } from "@/lib/db/service-client";

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Resolve project owner for a scene — used when persisting assets from ops reconcile. */
export async function resolveOwnerIdForScene(
  sceneId: string,
  db: ServiceDbClient,
): Promise<string> {
  const { data, error } = await db
    .from("scenes")
    .select("id, episodes!inner(series!inner(projects!inner(owner_id)))")
    .eq("id", sceneId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Scene not found.");

  const episode = unwrapRelation(
    data.episodes as unknown as
      | { series: unknown }
      | { series: unknown }[],
  );
  const series = unwrapRelation(
    episode?.series as unknown as
      | { projects: unknown }
      | { projects: unknown }[],
  );
  const project = unwrapRelation(
    series?.projects as unknown as { owner_id: string } | { owner_id: string }[],
  );
  const ownerId = project?.owner_id;
  if (!ownerId) throw new Error("Could not resolve asset owner for scene.");
  return ownerId;
}
