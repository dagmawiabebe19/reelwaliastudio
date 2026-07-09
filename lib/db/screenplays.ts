import "server-only";

import { getActiveUserId } from "@/lib/auth/getUser";
import { getDbClient } from "@/lib/db/client";
import type { ServiceDbClient } from "@/lib/db/service-client";
import { verifySeriesOwnership } from "@/lib/db/ingredients";
import type { ParsedScreenplayScene, ScreenplayFormat, ScreenplayStatus } from "@/lib/screenplay/types";
import type {
  ScreenplayAnalysisStatus,
  ScreenplayBreakdownProposal,
} from "@/lib/screenplay/analysis/types";

export type ScreenplayRow = {
  id: string;
  series_id: string;
  owner_id: string;
  title: string;
  format: ScreenplayFormat;
  storage_path: string;
  page_count_est: number | null;
  scene_count: number;
  status: ScreenplayStatus;
  fail_reason: string | null;
  analysis_status: ScreenplayAnalysisStatus | null;
  analysis_proposal: ScreenplayBreakdownProposal | null;
  analysis_fail_reason: string | null;
  created_at: string;
};

export type ScreenplaySceneRow = {
  id: string;
  screenplay_id: string;
  scene_number: number;
  slugline: string;
  location: string;
  int_ext: string;
  time_of_day: string;
  characters: string[];
  full_text: string;
  synopsis: string | null;
  sort_order: number;
  created_at: string;
};

export type ScreenplaySummary = ScreenplayRow & {
  characterCount: number;
  locationCount: number;
};

/** Load screenplay for a series (caller must verify ownership first). */
export async function queryScreenplayBySeries(
  seriesId: string,
): Promise<ScreenplaySummary | null> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("screenplays")
    .select("*")
    .eq("series_id", seriesId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return enrichScreenplaySummary(data as ScreenplayRow, supabase);
}

export async function getScreenplayBySeries(seriesId: string): Promise<ScreenplaySummary | null> {
  await verifySeriesOwnership(seriesId);
  return queryScreenplayBySeries(seriesId);
}

export async function getScreenplayById(screenplayId: string): Promise<ScreenplayRow | null> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("screenplays")
    .select("*")
    .eq("id", screenplayId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as ScreenplayRow | null) ?? null;
}

export async function listScreenplayScenes(screenplayId: string): Promise<ScreenplaySceneRow[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("screenplay_scenes")
    .select("*")
    .eq("screenplay_id", screenplayId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ScreenplaySceneRow[];
}

export async function setScreenplayAnalysisStarted(screenplayId: string): Promise<void> {
  const supabase = await getDbClient();
  const { error } = await supabase
    .from("screenplays")
    .update({
      analysis_status: "analyzing",
      analysis_fail_reason: null,
      analysis_proposal: null,
    })
    .eq("id", screenplayId);

  if (error) throw new Error(error.message);
}

export async function setScreenplayAnalysisProposed(
  screenplayId: string,
  proposal: ScreenplayBreakdownProposal,
): Promise<void> {
  const supabase = await getDbClient();
  const { error } = await supabase
    .from("screenplays")
    .update({
      analysis_status: "proposed",
      analysis_proposal: proposal,
      analysis_fail_reason: null,
    })
    .eq("id", screenplayId);

  if (error) throw new Error(error.message);
}

export async function setScreenplayAnalysisFailed(
  screenplayId: string,
  reason: string,
): Promise<void> {
  const supabase = await getDbClient();
  const { error } = await supabase
    .from("screenplays")
    .update({
      analysis_status: "failed",
      analysis_fail_reason: reason,
      analysis_proposal: null,
    })
    .eq("id", screenplayId);

  if (error) throw new Error(error.message);
}

export async function setScreenplayAnalysisApproved(screenplayId: string): Promise<void> {
  const supabase = await getDbClient();
  const { error } = await supabase
    .from("screenplays")
    .update({ analysis_status: "approved" })
    .eq("id", screenplayId);

  if (error) throw new Error(error.message);
}

export async function updateScreenplaySceneSynopses(
  screenplayId: string,
  updates: Array<{ sortOrder: number; synopsis: string }>,
): Promise<void> {
  const supabase = await getDbClient();

  for (const update of updates) {
    const { error } = await supabase
      .from("screenplay_scenes")
      .update({ synopsis: update.synopsis })
      .eq("screenplay_id", screenplayId)
      .eq("sort_order", update.sortOrder);

    if (error) throw new Error(error.message);
  }
}

export async function getScreenplayScenesInRange(input: {
  screenplayId: string;
  fromScene: number;
  toScene: number;
}): Promise<ScreenplaySceneRow[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("screenplay_scenes")
    .select("*")
    .eq("screenplay_id", input.screenplayId)
    .gte("sort_order", input.fromScene)
    .lte("sort_order", input.toScene)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ScreenplaySceneRow[];
}

async function enrichScreenplaySummary(
  row: ScreenplayRow,
  supabase: Awaited<ReturnType<typeof getDbClient>>,
): Promise<ScreenplaySummary> {
  if (row.status !== "parsed" || row.scene_count === 0) {
    return { ...row, characterCount: 0, locationCount: 0 };
  }

  const { data: scenes, error } = await supabase
    .from("screenplay_scenes")
    .select("characters, location")
    .eq("screenplay_id", row.id);

  if (error) throw new Error(error.message);

  const characters = new Set<string>();
  const locations = new Set<string>();
  for (const scene of scenes ?? []) {
    for (const name of scene.characters ?? []) {
      if (name) characters.add(name);
    }
    if (scene.location) locations.add(scene.location);
  }

  return {
    ...row,
    characterCount: characters.size,
    locationCount: locations.size,
  };
}

export async function createScreenplay(input: {
  seriesId: string;
  title: string;
  format: ScreenplayFormat;
  storagePath: string;
}): Promise<ScreenplayRow> {
  const ownerId = await getActiveUserId();
  await verifySeriesOwnership(input.seriesId);
  const supabase = await getDbClient();

  const { data, error } = await supabase
    .from("screenplays")
    .insert({
      series_id: input.seriesId,
      owner_id: ownerId,
      title: input.title,
      format: input.format,
      storage_path: input.storagePath,
      status: "uploaded",
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as ScreenplayRow;
}

export async function listPendingScreenplayIds(db: ServiceDbClient): Promise<string[]> {
  const { data, error } = await db
    .from("screenplays")
    .select("id")
    .in("status", ["uploaded", "parsing"])
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id);
}

export async function claimScreenplayForParsing(
  db: ServiceDbClient,
  screenplayId: string,
): Promise<ScreenplayRow | null> {
  const { data: current, error: readError } = await db
    .from("screenplays")
    .select("*")
    .eq("id", screenplayId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);
  if (!current || !["uploaded", "parsing"].includes(current.status)) return null;

  const { data, error } = await db
    .from("screenplays")
    .update({ status: "parsing" })
    .eq("id", screenplayId)
    .in("status", ["uploaded", "parsing"])
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as ScreenplayRow | null) ?? null;
}

export async function markScreenplayFailed(
  db: ServiceDbClient,
  screenplayId: string,
  reason: string,
): Promise<void> {
  const { error } = await db
    .from("screenplays")
    .update({ status: "failed", fail_reason: reason, scene_count: 0 })
    .eq("id", screenplayId);

  if (error) throw new Error(error.message);

  await db.from("screenplay_scenes").delete().eq("screenplay_id", screenplayId);
}

export async function markScreenplayParsed(
  db: ServiceDbClient,
  screenplayId: string,
  input: { sceneCount: number; pageCountEst: number | null },
): Promise<void> {
  const { error } = await db
    .from("screenplays")
    .update({
      status: "parsed",
      fail_reason: null,
      scene_count: input.sceneCount,
      page_count_est: input.pageCountEst,
    })
    .eq("id", screenplayId);

  if (error) throw new Error(error.message);
}

export async function insertScreenplayScenes(
  db: ServiceDbClient,
  screenplayId: string,
  scenes: ParsedScreenplayScene[],
): Promise<void> {
  await db.from("screenplay_scenes").delete().eq("screenplay_id", screenplayId);

  if (scenes.length === 0) return;

  const rows = scenes.map((scene) => ({
    screenplay_id: screenplayId,
    scene_number: scene.sceneNumber,
    slugline: scene.slugline,
    location: scene.location,
    int_ext: scene.intExt,
    time_of_day: scene.timeOfDay,
    characters: scene.characters,
    full_text: scene.fullText,
    sort_order: scene.sortOrder,
  }));

  const { error } = await db.from("screenplay_scenes").insert(rows);
  if (error) throw new Error(error.message);
}
