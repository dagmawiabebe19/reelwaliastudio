import type { CopilotOutputEvent, CopilotOutputItem } from "@/lib/copilot/output";
import { MAX_COPILOT_OUTPUT_HISTORY } from "@/lib/copilot/output";

export function applyCopilotOutputEvent(
  prev: CopilotOutputItem[],
  event: CopilotOutputEvent,
): CopilotOutputItem[] {
  switch (event.type) {
    case "ingredient_created": {
      const item: CopilotOutputItem = {
        type: "ingredient",
        id: event.ingredientId,
        name: event.name,
        ingredientKind: event.ingredientKind,
        refTag: event.refTag ?? null,
        status: event.status,
        generationError: event.generationError ?? null,
        assetUrl: null,
        createdAt: Date.now(),
        toolId: event.toolId,
      };
      return [item, ...prev.filter((i) => i.id !== event.ingredientId)].slice(
        0,
        MAX_COPILOT_OUTPUT_HISTORY,
      );
    }
    case "ingredient_updated":
      return prev.map((item) =>
        item.type === "ingredient" && item.id === event.ingredientId
          ? {
              ...item,
              status: event.status,
              generationError: event.generationError ?? null,
            }
          : item,
      );
    case "sheet_created": {
      const item: CopilotOutputItem = {
        type: "sheet",
        id: event.sheetId,
        name: event.name,
        characterName: event.characterName ?? null,
        costumeName: event.costumeName ?? null,
        status: event.status,
        generationError: null,
        angleUrls: {},
        angleProgress: 0,
        angleTotal: 5,
        createdAt: Date.now(),
        toolId: event.toolId,
      };
      return [item, ...prev.filter((i) => i.id !== event.sheetId)].slice(
        0,
        MAX_COPILOT_OUTPUT_HISTORY,
      );
    }
    case "sheet_progress":
      return prev.map((item) =>
        item.type === "sheet" && item.id === event.sheetId
          ? { ...item, angleProgress: event.step, angleTotal: event.total }
          : item,
      );
    case "sheet_updated":
      return prev.map((item) =>
        item.type === "sheet" && item.id === event.sheetId
          ? {
              ...item,
              status: event.status,
              generationError: event.generationError ?? null,
            }
          : item,
      );
    default:
      return prev;
  }
}

export function parseAddIngredientOutputEvent(
  toolId: string,
  args: Record<string, unknown>,
  result: Record<string, unknown>,
): CopilotOutputEvent | null {
  if (!result.ingredient_id) return null;
  const kind = String(args.kind ?? "reference");
  if (!["character", "outfit", "location", "voice"].includes(kind)) return null;

  return {
    type: "ingredient_created",
    toolId,
    ingredientId: String(result.ingredient_id),
    name: String(args.name ?? "Untitled"),
    ingredientKind: kind,
    refTag: result.ref_tag ? String(result.ref_tag) : undefined,
    status: String(result.status ?? (result.generating ? "pending" : "ready")),
    generationError: result.error ? String(result.error) : null,
  };
}

export function parseCreateSheetOutputEvent(
  toolId: string,
  result: Record<string, unknown>,
): CopilotOutputEvent | null {
  if (!result.sheet_id) return null;
  return {
    type: "sheet_created",
    toolId,
    sheetId: String(result.sheet_id),
    name: String(result.name ?? "Character sheet"),
    characterName: result.character_name ? String(result.character_name) : null,
    costumeName: result.costume_name ? String(result.costume_name) : null,
    status: String(result.status ?? "pending"),
  };
}
