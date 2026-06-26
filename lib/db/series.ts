import "server-only";

import { getDbClient } from "@/lib/db/client";
import type {
  Orientation,
  Series,
  SeriesStats,
  SeriesStatus,
  TablesInsert,
} from "@/lib/db/database.types";

export async function listSeriesByProject(projectId: string): Promise<Series[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("series")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSeries(id: string): Promise<Series | null> {
  const supabase = await getDbClient();
  const { data, error } = await supabase.from("series").select("*").eq("id", id).maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function createSeries(
  projectId: string,
  input: { title: string; slug: string; brief_markdown?: string },
): Promise<Series> {
  const supabase = await getDbClient();
  const payload: TablesInsert<"series"> = {
    project_id: projectId,
    title: input.title,
    slug: input.slug,
    brief_markdown: input.brief_markdown ?? "",
  };

  const { data, error } = await supabase.from("series").insert(payload).select().single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateSeries(
  id: string,
  patch: Partial<
    Pick<
      Series,
      | "title"
      | "slug"
      | "brief_markdown"
      | "default_orientation"
      | "status"
      | "runtime_seconds"
      | "thumbnail_asset_id"
    >
  >,
): Promise<Series> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("series")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateSeriesBrief(id: string, briefMarkdown: string): Promise<Series> {
  return updateSeries(id, { brief_markdown: briefMarkdown });
}

export async function updateSeriesOrientation(
  id: string,
  orientation: Orientation,
): Promise<Series> {
  return updateSeries(id, { default_orientation: orientation });
}

export async function updateSeriesStatus(id: string, status: SeriesStatus): Promise<Series> {
  return updateSeries(id, { status });
}

export async function deleteSeries(id: string): Promise<void> {
  const supabase = await getDbClient();
  const { error } = await supabase.from("series").delete().eq("id", id);

  if (error) throw new Error(error.message);
}

export async function getSeriesStats(seriesId: string): Promise<SeriesStats> {
  const supabase = await getDbClient();

  const [seriesResult, episodesResult, ingredientsResult] = await Promise.all([
    supabase.from("series").select("runtime_seconds").eq("id", seriesId).maybeSingle(),
    supabase
      .from("episodes")
      .select("id", { count: "exact", head: true })
      .eq("series_id", seriesId),
    supabase
      .from("ingredients")
      .select("id", { count: "exact", head: true })
      .eq("series_id", seriesId),
  ]);

  if (seriesResult.error) throw new Error(seriesResult.error.message);
  if (episodesResult.error) throw new Error(episodesResult.error.message);
  if (ingredientsResult.error) throw new Error(ingredientsResult.error.message);

  return {
    episodeCount: episodesResult.count ?? 0,
    ingredientCount: ingredientsResult.count ?? 0,
    runtimeSeconds: seriesResult.data?.runtime_seconds ?? null,
  };
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export type SeriesWithProject = Series & {
  projects: { name: string } | null;
};

export async function listAllSeries(): Promise<SeriesWithProject[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("series")
    .select("*, projects(name)")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as SeriesWithProject[];
}
