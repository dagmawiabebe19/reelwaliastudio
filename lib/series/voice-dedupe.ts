import type { IngredientCardData } from "@/lib/production/types";

export type VoiceRow = Pick<
  IngredientCardData,
  "id" | "name" | "characterId" | "ref_tag"
> & { createdAt: string };

export type VoiceDuplicateGroup = {
  id: string;
  reason: "same_name" | "same_character";
  label: string;
  keepId: string;
  mergeIds: string[];
  voices: VoiceRow[];
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function pickNewest(voices: VoiceRow[]): VoiceRow {
  return [...voices].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0]!;
}

export function detectVoiceDuplicateGroups(
  voices: VoiceRow[],
  characterNames: Map<string, string>,
): VoiceDuplicateGroup[] {
  const groups: VoiceDuplicateGroup[] = [];
  const usedIds = new Set<string>();

  const byName = new Map<string, VoiceRow[]>();
  for (const voice of voices) {
    const key = normalizeName(voice.name);
    const list = byName.get(key) ?? [];
    list.push(voice);
    byName.set(key, list);
  }

  for (const [nameKey, group] of byName) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const keep = sorted[0]!;
    const mergeIds = sorted.slice(1).map((v) => v.id);
    if (mergeIds.every((id) => usedIds.has(id))) continue;
    mergeIds.forEach((id) => usedIds.add(id));
    usedIds.add(keep.id);
    groups.push({
      id: `name:${nameKey}`,
      reason: "same_name",
      label: `Same name: “${group[0]!.name}”`,
      keepId: keep.id,
      mergeIds,
      voices: sorted,
    });
  }

  const byCharacter = new Map<string, VoiceRow[]>();
  for (const voice of voices) {
    if (!voice.characterId) continue;
    const list = byCharacter.get(voice.characterId) ?? [];
    list.push(voice);
    byCharacter.set(voice.characterId, list);
  }

  for (const [characterId, group] of byCharacter) {
    if (group.length < 2) continue;
    const alreadyGrouped = group.every((v) => usedIds.has(v.id));
    if (alreadyGrouped) continue;

    const sorted = [...group].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const keep = pickNewest(sorted);
    const mergeIds = sorted.filter((v) => v.id !== keep.id).map((v) => v.id);
    if (mergeIds.length === 0) continue;

    mergeIds.forEach((id) => usedIds.add(id));
    usedIds.add(keep.id);

    const charName = characterNames.get(characterId) ?? "character";
    groups.push({
      id: `char:${characterId}`,
      reason: "same_character",
      label: `Same character: ${charName}`,
      keepId: keep.id,
      mergeIds,
      voices: sorted,
    });
  }

  return groups;
}
