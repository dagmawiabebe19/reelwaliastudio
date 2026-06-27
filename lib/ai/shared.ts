import "server-only";

export interface GenerationResult {
  assetUrls: string[];
  providerJobId: string | null;
  costEstimate: number | null;
  configured: boolean;
  error?: string;
}

export function notConfiguredResult(provider: string, envVar: string): GenerationResult {
  return {
    assetUrls: [],
    providerJobId: null,
    costEstimate: null,
    configured: false,
    error: `${provider}: provider not configured — set ${envVar} to enable.`,
  };
}

export function pendingIntegrationResult(provider: string): GenerationResult {
  return {
    assetUrls: [],
    providerJobId: null,
    costEstimate: null,
    configured: true,
    error: `${provider}: API integration pending — endpoint not wired yet.`,
  };
}

export function getEnv(key: string): string | null {
  const value = process.env[key]?.trim();
  return value || null;
}
