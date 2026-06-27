import type { CopilotRegistration } from "@/lib/copilot/workspace-types";

/** Stable fingerprint for copilot registration — excludes function refs and chat history. */
export function registrationSignature(reg: CopilotRegistration | null): string {
  if (!reg) return "null";

  const ws = reg.context.workspace;
  return JSON.stringify({
    scopeType: reg.scopeType,
    scopeId: reg.scopeId,
    seriesId: reg.context.seriesId,
    episodeId: reg.context.episodeId,
    sceneId: reg.context.sceneId,
    view: ws?.view,
    viewLabel: ws?.viewLabel,
    episodeTitle: ws?.episodeTitle,
    sceneTitle: ws?.sceneTitle,
    scenePrompt: ws?.scenePrompt,
    sceneActLabel: ws?.sceneActLabel,
    activeTakeSummary: ws?.activeTakeSummary,
    selectedCharacterName: ws?.selectedCharacterName,
    selectedIngredientName: ws?.selectedIngredientName,
    briefMarkdown: reg.context.briefMarkdown,
    seriesMemoryMarkdown: reg.context.seriesMemoryMarkdown,
    ingredientIds: reg.ingredients.map((i) => i.id).join(","),
    suggestionIds: (reg.suggestions ?? []).map((s) => s.id).join(","),
    hasOutputHandler: Boolean(reg.onOutputEvent),
    imageModelIds: reg.imageModels.map((m) => m.id).join(","),
    sceneIds: (reg.context.scenes ?? []).map((s) => s.id).join(","),
  });
}
