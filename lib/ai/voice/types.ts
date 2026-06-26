export interface GenerateVoiceInput {
  text: string;
  voiceId: string;
  locale?: string;
}

export interface GenerationResult {
  assetUrls: string[];
  providerJobId: string | null;
  costEstimate: number | null;
}

export type VoiceAdapter = (input: GenerateVoiceInput) => Promise<GenerationResult>;
