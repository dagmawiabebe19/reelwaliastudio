import "server-only";

import type { AssetMediaType } from "@/lib/db/types";

export interface PersistedAssetRef {
  bucket: string;
  storagePath: string;
  mediaType: AssetMediaType;
  width?: number | null;
  height?: number | null;
}

export interface GenerationResult {
  assetUrls: string[];
  /** When the adapter already uploaded to storage, skip re-download in the orchestrator. */
  persistedAssets?: PersistedAssetRef[];
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

export function errorResult(message: string): GenerationResult {
  return {
    assetUrls: [],
    providerJobId: null,
    costEstimate: null,
    configured: true,
    error: message,
  };
}

export function successResult(input: {
  assetUrls: string[];
  persistedAssets?: PersistedAssetRef[];
  providerJobId?: string | null;
  costEstimate?: number | null;
}): GenerationResult {
  return {
    assetUrls: input.assetUrls,
    persistedAssets: input.persistedAssets,
    providerJobId: input.providerJobId ?? null,
    costEstimate: input.costEstimate ?? null,
    configured: true,
  };
}
