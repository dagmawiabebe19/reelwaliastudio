export interface GenerateVoiceInput {
  text: string;
  voiceId: string;
  locale?: string;
  /** Timbre, age, accent, pace — for consistency across episodes. */
  description?: string;
  characterId?: string | null;
}

export interface GenerationResult {
  assetUrls: string[];
  providerJobId: string | null;
  costEstimate: number | null;
}

export type VoiceAdapter = (input: GenerateVoiceInput) => Promise<GenerationResult>;
