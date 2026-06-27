export const DEFAULT_VIDEO_ENDPOINT = "/v1/image2video/dop";
export const DEFAULT_DOP_MODEL = "dop-turbo";

export const DOP_MODEL_OPTIONS = [
  { id: "dop-turbo", label: "DoP Turbo (fast)" },
  { id: "dop-lite", label: "DoP Lite" },
  { id: "dop-standard", label: "DoP Standard (best quality)" },
] as const;

export type DopModelId = (typeof DOP_MODEL_OPTIONS)[number]["id"];
