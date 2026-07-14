/** Default fal-safe style appended to character image prompts when a series has none set. */
export const DEFAULT_REFERENCE_STYLE =
  "high-end cinematic film still, subtle painterly rendering, matte stylized skin texture, fictional person not resembling any real individual";

export type RestyleCascadeStatus =
  | "idle"
  | "restyling_headshot"
  | "awaiting_sheet_approval"
  | "restyling_sheets"
  | "awaiting_draft_test"
  | "complete"
  | "cancelled";

export type RestyleCascadeState = {
  status: RestyleCascadeStatus;
  characterIds: string[];
  index: number;
  currentCharacterId: string | null;
  draftTestSceneId?: string | null;
  draftTestEpisodeId?: string | null;
  lastDraftTakeId?: string | null;
  updatedAt?: string;
};

export type FalSafeRestylePhase =
  | "headshot_pending"
  | "awaiting_sheet_approval"
  | "sheets_pending"
  | "ready_for_draft_test"
  | "complete";

export type FalSafeRestyleMeta = {
  phase: FalSafeRestylePhase;
  startedAt?: string;
  headshotReadyAt?: string;
  sheetsReadyAt?: string;
};

export function normalizeReferenceStyle(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed || DEFAULT_REFERENCE_STYLE;
}

export function appendReferenceStyle(prompt: string, referenceStyle: string | null | undefined): string {
  const style = normalizeReferenceStyle(referenceStyle);
  if (!style) return prompt;
  const base = prompt.trim().replace(/\.+$/, "");
  return `${base}. Style: ${style}.`;
}

export function parseRestyleCascade(value: unknown): RestyleCascadeState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.status !== "string" || !Array.isArray(raw.characterIds)) return null;
  return {
    status: raw.status as RestyleCascadeStatus,
    characterIds: raw.characterIds.filter((id): id is string => typeof id === "string"),
    index: typeof raw.index === "number" ? raw.index : 0,
    currentCharacterId: typeof raw.currentCharacterId === "string" ? raw.currentCharacterId : null,
    draftTestSceneId: typeof raw.draftTestSceneId === "string" ? raw.draftTestSceneId : null,
    draftTestEpisodeId: typeof raw.draftTestEpisodeId === "string" ? raw.draftTestEpisodeId : null,
    lastDraftTakeId: typeof raw.lastDraftTakeId === "string" ? raw.lastDraftTakeId : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
  };
}

export function getFalSafeRestyleMeta(metadata: unknown): FalSafeRestyleMeta | null {
  if (!metadata || typeof metadata !== "object") return null;
  const restyle = (metadata as Record<string, unknown>).fal_safe_restyle;
  if (!restyle || typeof restyle !== "object") return null;
  const phase = (restyle as Record<string, unknown>).phase;
  if (typeof phase !== "string") return null;
  return restyle as FalSafeRestyleMeta;
}

export function withFalSafeRestyleMeta(
  metadata: unknown,
  restyle: FalSafeRestyleMeta | null,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  if (!restyle) {
    delete base.fal_safe_restyle;
  } else {
    base.fal_safe_restyle = restyle;
  }
  return base;
}
