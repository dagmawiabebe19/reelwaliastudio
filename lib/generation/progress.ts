/** Shared progress callback for multi-step generation (sheets, takes, ingredients). */
export type GenerationProgressCallback = (
  message: string,
  step?: number,
  total?: number,
) => void;

export const GENERATION_ETA_HINT = "~30–90s";
