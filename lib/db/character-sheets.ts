import "server-only";

import { getDbClient } from "@/lib/db/client";
import type {
  CharacterSheet,
  CharacterSheetStatus,
  SheetAngle,
  TablesInsert,
} from "@/lib/db/database.types";

export type CharacterSheetWithDetails = CharacterSheet & {
  angles: Array<{
    id: string;
    angle_label: SheetAngle;
    asset_id: string;
    assets: { bucket: string; storage_path: string; media_type: string } | null;
  }>;
  episode_ids: string[];
  character: { id: string; name: string; ref_tag: string } | null;
  costume: { id: string; name: string; ref_tag: string } | null;
};

export async function listCharacterSheetsBySeries(seriesId: string): Promise<CharacterSheetWithDetails[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("character_sheets")
    .select(
      `*, angles:character_sheet_angles(id, angle_label, asset_id, assets:asset_id(bucket, storage_path, media_type)),
       episodes:character_sheet_episodes(episode_id),
       character:character_id(id, name, ref_tag),
       costume:costume_id(id, name, ref_tag)`,
    )
    .eq("series_id", seriesId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    ...(row as CharacterSheet),
    angles: ((row as { angles?: CharacterSheetWithDetails["angles"] }).angles ?? []).sort((a, b) =>
      a.angle_label.localeCompare(b.angle_label),
    ),
    episode_ids: ((row as { episodes?: { episode_id: string }[] }).episodes ?? []).map((e) => e.episode_id),
    character: (row as { character?: CharacterSheetWithDetails["character"] }).character ?? null,
    costume: (row as { costume?: CharacterSheetWithDetails["costume"] }).costume ?? null,
  }));
}

export async function listCharacterSheetsByCharacter(characterId: string): Promise<CharacterSheetWithDetails[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("character_sheets")
    .select(
      `*, angles:character_sheet_angles(id, angle_label, asset_id, assets:asset_id(bucket, storage_path, media_type)),
       episodes:character_sheet_episodes(episode_id),
       character:character_id(id, name, ref_tag),
       costume:costume_id(id, name, ref_tag)`,
    )
    .eq("character_id", characterId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    ...(row as CharacterSheet),
    angles: ((row as { angles?: CharacterSheetWithDetails["angles"] }).angles ?? []),
    episode_ids: ((row as { episodes?: { episode_id: string }[] }).episodes ?? []).map((e) => e.episode_id),
    character: (row as { character?: CharacterSheetWithDetails["character"] }).character ?? null,
    costume: (row as { costume?: CharacterSheetWithDetails["costume"] }).costume ?? null,
  }));
}

export async function getCharacterSheet(id: string): Promise<CharacterSheetWithDetails | null> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("character_sheets")
    .select(
      `*, angles:character_sheet_angles(id, angle_label, asset_id, assets:asset_id(bucket, storage_path, media_type)),
       episodes:character_sheet_episodes(episode_id),
       character:character_id(id, name, ref_tag),
       costume:costume_id(id, name, ref_tag)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    ...(data as CharacterSheet),
    angles: ((data as { angles?: CharacterSheetWithDetails["angles"] }).angles ?? []),
    episode_ids: ((data as { episodes?: { episode_id: string }[] }).episodes ?? []).map((e) => e.episode_id),
    character: (data as { character?: CharacterSheetWithDetails["character"] }).character ?? null,
    costume: (data as { costume?: CharacterSheetWithDetails["costume"] }).costume ?? null,
  };
}

export async function createCharacterSheet(input: {
  seriesId: string;
  characterId: string;
  costumeId?: string | null;
  name: string;
  episodeIds: string[];
}): Promise<CharacterSheet> {
  const supabase = await getDbClient();
  const payload: TablesInsert<"character_sheets"> = {
    series_id: input.seriesId,
    character_id: input.characterId,
    costume_id: input.costumeId ?? null,
    name: input.name,
    status: "draft",
  };

  const { data, error } = await supabase.from("character_sheets").insert(payload).select().single();
  if (error) throw new Error(error.message);

  if (input.episodeIds.length) {
    const { error: epError } = await supabase.from("character_sheet_episodes").insert(
      input.episodeIds.map((episodeId) => ({ sheet_id: data.id, episode_id: episodeId })),
    );
    if (epError) throw new Error(epError.message);
  }

  return data;
}

export async function updateCharacterSheetStatus(
  id: string,
  status: CharacterSheetStatus,
  errorMessage?: string | null,
): Promise<void> {
  const supabase = await getDbClient();
  const { error } = await supabase
    .from("character_sheets")
    .update({ status, generation_error: errorMessage ?? null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addSheetAngle(input: {
  sheetId: string;
  assetId: string;
  angleLabel: SheetAngle;
}): Promise<void> {
  const supabase = await getDbClient();
  const { error } = await supabase.from("character_sheet_angles").insert({
    sheet_id: input.sheetId,
    asset_id: input.assetId,
    angle_label: input.angleLabel,
  });
  if (error) throw new Error(error.message);
}

export async function listCharacterSheetsByCostume(costumeId: string): Promise<CharacterSheetWithDetails[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("character_sheets")
    .select(
      `*, angles:character_sheet_angles(id, angle_label, asset_id, assets:asset_id(bucket, storage_path, media_type)),
       episodes:character_sheet_episodes(episode_id),
       character:character_id(id, name, ref_tag),
       costume:costume_id(id, name, ref_tag)`,
    )
    .eq("costume_id", costumeId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    ...(row as CharacterSheet),
    angles: ((row as { angles?: CharacterSheetWithDetails["angles"] }).angles ?? []),
    episode_ids: ((row as { episodes?: { episode_id: string }[] }).episodes ?? []).map((e) => e.episode_id),
    character: (row as { character?: CharacterSheetWithDetails["character"] }).character ?? null,
    costume: (row as { costume?: CharacterSheetWithDetails["costume"] }).costume ?? null,
  }));
}

/** Prefer ready sheets linked to the episode, then newest by created_at. Never returns failed/pending. */
export function pickBestReadySheet(
  sheets: CharacterSheetWithDetails[],
  options?: { episodeId?: string; costumeId?: string | null; label?: string },
): { sheet: CharacterSheetWithDetails | null; ambiguous: boolean } {
  let candidates = sheets.filter(
    (sheet) =>
      sheet.status === "ready" &&
      (sheet.angles ?? []).some((angle) => angle.assets),
  );

  if (options?.episodeId) {
    const linked = candidates.filter((sheet) => sheet.episode_ids.includes(options.episodeId!));
    if (linked.length) candidates = linked;
  }

  if (options?.costumeId !== undefined) {
    const costumeMatches = candidates.filter(
      (sheet) => (sheet.costume_id ?? null) === (options.costumeId ?? null),
    );
    if (costumeMatches.length) candidates = costumeMatches;
  }

  if (options?.label) {
    const normalized = options.label.trim().toLowerCase();
    const labelMatches = candidates.filter(
      (sheet) => sheet.name.trim().toLowerCase() === normalized,
    );
    if (labelMatches.length) candidates = labelMatches;
  }

  if (!candidates.length) {
    return { sheet: null, ambiguous: false };
  }

  const sorted = [...candidates].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return { sheet: sorted[0], ambiguous: sorted.length > 1 };
}

export async function findSheetForEpisodeCharacter(input: {
  episodeId: string;
  characterId: string;
  costumeId?: string | null;
  label?: string;
}): Promise<CharacterSheetWithDetails | null> {
  const sheets = await listCharacterSheetsByCharacter(input.characterId);
  const { sheet } = pickBestReadySheet(sheets, {
    episodeId: input.episodeId,
    costumeId: input.costumeId,
    label: input.label,
  });
  if (sheet) return sheet;

  const { sheet: fallback } = pickBestReadySheet(sheets, {
    costumeId: input.costumeId,
    label: input.label,
  });
  return fallback;
}

export async function listFailedSheetsByCharacter(
  characterId: string,
): Promise<CharacterSheetWithDetails[]> {
  const sheets = await listCharacterSheetsByCharacter(characterId);
  return sheets.filter((sheet) => sheet.status === "failed");
}
