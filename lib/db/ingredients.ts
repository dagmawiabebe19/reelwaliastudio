import "server-only";

import { getActiveUserId } from "@/lib/auth/getUser";
import { getDbClient } from "@/lib/db/client";
import type { AssetMediaType, Ingredient, IngredientKind, TablesInsert } from "@/lib/db/database.types";
import {
  formatRefTag,
  nextRefNumber,
  refPrefixForIngredient,
} from "@/lib/ingredients/ref-tags";

export type IngredientWithAsset = Ingredient & {
  assets: { id: string; bucket: string; storage_path: string; media_type: AssetMediaType } | null;
};

const KIND_SECTIONS: { key: IngredientKind | "reference"; label: string; kinds: IngredientKind[] }[] =
  [
    { key: "character", label: "Characters", kinds: ["character"] },
    { key: "voice", label: "Voices", kinds: ["voice"] },
    { key: "outfit", label: "Outfits", kinds: ["outfit"] },
    { key: "location", label: "Locations", kinds: ["location"] },
    { key: "reference", label: "Reference Media", kinds: ["reference", "prop"] },
  ];

export { KIND_SECTIONS };

export async function listIngredientsBySeries(seriesId: string): Promise<IngredientWithAsset[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select("*, assets:primary_asset_id(id, bucket, storage_path, media_type)")
    .eq("series_id", seriesId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as IngredientWithAsset[];
}

export async function getIngredientCounts(seriesId: string) {
  const ingredients = await listIngredientsBySeries(seriesId);
  return {
    total: ingredients.length,
    characters: ingredients.filter((i) => i.kind === "character").length,
    voices: ingredients.filter((i) => i.kind === "voice").length,
    outfits: ingredients.filter((i) => i.kind === "outfit").length,
    locations: ingredients.filter((i) => i.kind === "location").length,
    reference: ingredients.filter((i) => i.kind === "reference" || i.kind === "prop").length,
  };
}

export async function allocateRefTag(
  seriesId: string,
  kind: IngredientKind,
  mediaType: AssetMediaType = "image",
): Promise<string> {
  const ingredients = await listIngredientsBySeries(seriesId);
  const prefix = refPrefixForIngredient(kind, mediaType);
  const next = nextRefNumber(
    ingredients.map((i) => i.ref_tag),
    prefix,
  );
  return formatRefTag(prefix, next);
}

export async function createIngredient(input: {
  seriesId: string;
  kind: IngredientKind;
  name: string;
  description?: string;
  primaryAssetId?: string | null;
  mediaType?: AssetMediaType;
  characterId?: string | null;
  generationStatus?: string;
}): Promise<Ingredient> {
  const supabase = await getDbClient();
  const refTag = await allocateRefTag(
    input.seriesId,
    input.kind,
    input.mediaType ?? "image",
  );

  const { count } = await supabase
    .from("ingredients")
    .select("id", { count: "exact", head: true })
    .eq("series_id", input.seriesId);

  const payload: TablesInsert<"ingredients"> = {
    series_id: input.seriesId,
    kind: input.kind,
    name: input.name,
    description: input.description ?? null,
    primary_asset_id: input.primaryAssetId ?? null,
    ref_tag: refTag,
    sort_order: count ?? 0,
    character_id: input.characterId ?? null,
    generation_status: input.generationStatus ?? "ready",
  };

  const { data, error } = await supabase.from("ingredients").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getIngredient(id: string): Promise<IngredientWithAsset | null> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select("*, assets:primary_asset_id(id, bucket, storage_path, media_type)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as IngredientWithAsset | null;
}

export async function listCostumesByCharacter(characterId: string): Promise<IngredientWithAsset[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select("*, assets:primary_asset_id(id, bucket, storage_path, media_type)")
    .eq("character_id", characterId)
    .eq("kind", "outfit")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as IngredientWithAsset[];
}

export async function updateIngredient(
  id: string,
  patch: Partial<
    Pick<
      Ingredient,
      "name" | "description" | "primary_asset_id" | "character_id" | "generation_status" | "generation_error"
    >
  >,
): Promise<Ingredient> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("ingredients")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function listFailedIngredientsBySeries(
  seriesId: string,
  kind?: IngredientKind,
): Promise<IngredientWithAsset[]> {
  const ingredients = await listIngredientsBySeries(seriesId);
  return ingredients.filter(
    (item) =>
      item.generation_status === "failed" && (kind === undefined || item.kind === kind),
  );
}

export async function deleteIngredient(id: string): Promise<void> {
  const supabase = await getDbClient();
  const { error } = await supabase.from("ingredients").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function verifySeriesOwnership(seriesId: string): Promise<void> {
  const supabase = await getDbClient();
  const ownerId = await getActiveUserId();
  const { data, error } = await supabase
    .from("series")
    .select("id, projects!inner(owner_id)")
    .eq("id", seriesId)
    .eq("projects.owner_id", ownerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Series not found");
}
