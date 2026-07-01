import "server-only";

import { revalidatePath } from "next/cache";
import { commitReservation, releaseReservation } from "@/lib/credits/mutations";
import {
  findOpenReservationByReference,
  isReservationOpen,
} from "@/lib/credits/reservations";
import { estimateVideoCredits } from "@/lib/credits/pricing";
import { finalizeTakeFromRemoteVideo } from "@/lib/ai/generation/take-completion";
import {
  extractRequestIdFromText,
  getSeedanceQueueResult,
  getSeedanceQueueStatus,
  inferSeedanceEndpointsForTake,
  listFalRequestsByEndpoint,
  matchFalRequestsToTakes,
  waitForSeedanceQueueCompletion,
  type FalQueueStatus,
} from "@/lib/ai/video/seedance-api";
import { getScene } from "@/lib/db/scenes";
import {
  getTake,
  isTakeProviderSchemaError,
  listStuckPendingTakes,
  logTakeProviderSchemaWarning,
  markTakeFailed,
  setTakeProviderJob,
  type TakeWithAsset,
} from "@/lib/db/takes";

export const STUCK_TAKE_THRESHOLD_MINUTES = 15;

export type ReconcileTakeOutcome =
  | { takeId: string; result: "already_ready" }
  | { takeId: string; result: "rescued"; requestId: string; endpoint: string; creditsCommitted: number }
  | { takeId: string; result: "reattached"; requestId: string; endpoint: string; falStatus: FalQueueStatus }
  | { takeId: string; result: "failed_per_fal"; requestId: string; error: string; refunded: boolean }
  | { takeId: string; result: "unmatched"; reason: string }
  | { takeId: string; result: "skipped"; reason: string };

const activeWatchers = new Set<string>();

function logReconcileError(label: string, error: unknown, context?: Record<string, unknown>): void {
  console.error(`[take-reconcile] ${label} failed`, {
    ...context,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

/** Housekeeping must never take down a page — run detached and swallow errors. */
function runDetached(label: string, task: () => Promise<void>, context?: Record<string, unknown>): void {
  void Promise.resolve()
    .then(task)
    .catch((error) => {
      if (isTakeProviderSchemaError(error)) {
        logTakeProviderSchemaWarning(`${label} skipped`);
        return;
      }
      logReconcileError(label, error, context);
    });
}

function takeCreditReference(takeId: string): string {
  return `seedance:take:${takeId}`;
}

function inferSeedanceTier(take: TakeWithAsset): "standard" | "fast" {
  if (take.resolution === "480p") return "fast";
  return "standard";
}

async function discoverRequestIdForTake(
  take: TakeWithAsset,
  manualMap?: Record<string, string>,
  timestampMatches?: Map<string, { requestId: string; endpoint: string }>,
): Promise<{ requestId: string; endpoint: string } | null> {
  if (manualMap?.[take.id]) {
    const endpoint = inferSeedanceEndpointsForTake(take)[0];
    return { requestId: manualMap[take.id], endpoint };
  }

  if (timestampMatches?.has(take.id)) {
    return timestampMatches.get(take.id)!;
  }

  if (take.provider_request_id) {
    const endpoint = inferSeedanceEndpointsForTake(take)[0];
    return { requestId: take.provider_request_id, endpoint };
  }

  const parsed = extractRequestIdFromText(take.error_message);
  if (parsed) {
    return { requestId: parsed, endpoint: inferSeedanceEndpointsForTake(take)[0] };
  }

  return null;
}

async function buildTimestampRequestMatches(
  takes: TakeWithAsset[],
): Promise<Map<string, { requestId: string; endpoint: string }>> {
  if (!takes.length) return new Map();

  const times = takes.map((take) => new Date(take.created_at).getTime());
  const windowStart = new Date(Math.min(...times) - 10 * 60_000).toISOString();
  const windowEnd = new Date(Math.max(...times) + 45 * 60_000).toISOString();
  const endpoints = new Set<string>();
  for (const take of takes) {
    for (const endpoint of inferSeedanceEndpointsForTake(take)) {
      endpoints.add(endpoint);
    }
  }

  const requests = [];
  for (const endpointId of endpoints) {
    requests.push(
      ...(await listFalRequestsByEndpoint({
        endpointId,
        start: windowStart,
        end: windowEnd,
        limit: 100,
      })),
    );
  }

  return matchFalRequestsToTakes(takes, requests);
}

async function resolveFalJob(
  take: TakeWithAsset,
  requestId: string,
  preferredEndpoint: string,
): Promise<{ endpoint: string; status: FalQueueStatus; error?: string | null } | null> {
  const endpoints = [
    preferredEndpoint,
    ...inferSeedanceEndpointsForTake(take).filter((endpoint) => endpoint !== preferredEndpoint),
  ];

  for (const endpoint of endpoints) {
    const status = await getSeedanceQueueStatus(endpoint, requestId);
    if (status.status !== "NOT_FOUND") {
      return { endpoint, status: status.status, error: status.error ?? null };
    }
  }

  return null;
}

async function commitOpenTakeReservation(
  take: TakeWithAsset,
  videoDurationSeconds: number,
): Promise<number> {
  const reservation = await findOpenReservationByReference(takeCreditReference(take.id));
  if (!reservation) return 0;

  const actualCredits = estimateVideoCredits({
    tier: inferSeedanceTier(take),
    resolution: take.resolution ?? "720p",
    durationSeconds: videoDurationSeconds,
  });

  if (await isReservationOpen(reservation.reservationId)) {
    await commitReservation(reservation.reservationId, actualCredits);
  }
  return actualCredits;
}

async function releaseOpenTakeReservation(takeId: string): Promise<boolean> {
  const reservation = await findOpenReservationByReference(takeCreditReference(takeId));
  if (!reservation) return false;
  if (await isReservationOpen(reservation.reservationId)) {
    await releaseReservation(reservation.reservationId);
    return true;
  }
  return false;
}

export async function rescueCompletedFalTake(input: {
  take: TakeWithAsset;
  requestId: string;
  endpoint: string;
}): Promise<ReconcileTakeOutcome> {
  const { take, requestId, endpoint } = input;
  if (take.status === "ready") {
    return { takeId: take.id, result: "already_ready" };
  }

  const queueResult = await getSeedanceQueueResult(endpoint, requestId);
  const scene = await getScene(take.scene_id);
  if (!scene) throw new Error("Scene not found.");

  const { videoDurationSeconds } = await finalizeTakeFromRemoteVideo({
    takeId: take.id,
    sceneId: take.scene_id,
    videoUrl: queueResult.videoUrl,
    modelId: take.model ?? undefined,
    prompt: scene.prompt,
    fallbackDurationSeconds: take.duration_seconds,
  });

  const creditsCommitted = await commitOpenTakeReservation(take, videoDurationSeconds);

  await setTakeProviderJob(take.id, {
    providerRequestId: requestId,
    providerEndpoint: endpoint,
  });

  return {
    takeId: take.id,
    result: "rescued",
    requestId,
    endpoint,
    creditsCommitted,
  };
}

export async function watchFalTakeToCompletion(input: {
  takeId: string;
  requestId: string;
  endpoint: string;
  revalidatePath?: string;
}): Promise<ReconcileTakeOutcome> {
  if (activeWatchers.has(input.takeId)) {
    return {
      takeId: input.takeId,
      result: "reattached",
      requestId: input.requestId,
      endpoint: input.endpoint,
      falStatus: "IN_PROGRESS",
    };
  }

  activeWatchers.add(input.takeId);
  try {
    const take = await getTake(input.takeId);
    if (!take) return { takeId: input.takeId, result: "skipped", reason: "take_not_found" };
    if (take.status === "ready") return { takeId: input.takeId, result: "already_ready" };

    const resolved = await resolveFalJob(take, input.requestId, input.endpoint);
    if (!resolved) {
      return { takeId: take.id, result: "unmatched", reason: "request_not_found_on_fal" };
    }

    await setTakeProviderJob(take.id, {
      providerRequestId: input.requestId,
      providerEndpoint: resolved.endpoint,
    });

    if (resolved.status === "COMPLETED") {
      return rescueCompletedFalTake({
        take,
        requestId: input.requestId,
        endpoint: resolved.endpoint,
      });
    }

    if (resolved.status === "FAILED") {
      const error = resolved.error ?? "fal reported job failed";
      await markTakeFailed(take.id, error);
      const refunded = await releaseOpenTakeReservation(take.id);
      return {
        takeId: take.id,
        result: "failed_per_fal",
        requestId: input.requestId,
        error,
        refunded,
      };
    }

    const finalStatus = await waitForSeedanceQueueCompletion(resolved.endpoint, input.requestId);
    const refreshed = await getTake(take.id);
    if (!refreshed) return { takeId: take.id, result: "skipped", reason: "take_not_found" };

    if (finalStatus.status === "COMPLETED") {
      return rescueCompletedFalTake({
        take: refreshed,
        requestId: input.requestId,
        endpoint: resolved.endpoint,
      });
    }

    if (finalStatus.status === "FAILED") {
      const error = finalStatus.error ?? "fal reported job failed";
      await markTakeFailed(refreshed.id, error);
      const refunded = await releaseOpenTakeReservation(refreshed.id);
      return {
        takeId: refreshed.id,
        result: "failed_per_fal",
        requestId: input.requestId,
        error,
        refunded,
      };
    }

    return {
      takeId: refreshed.id,
      result: "reattached",
      requestId: input.requestId,
      endpoint: resolved.endpoint,
      falStatus: finalStatus.status,
    };
  } finally {
    activeWatchers.delete(input.takeId);
    if (input.revalidatePath) {
      revalidatePath(input.revalidatePath);
    }
  }
}

export function scheduleFalTakeWatcher(input: {
  takeId: string;
  requestId: string;
  endpoint: string;
  revalidatePath?: string;
}): void {
  runDetached("watcher", () => watchFalTakeToCompletion(input).then(() => undefined), {
    takeId: input.takeId,
    requestId: input.requestId,
  });
}

export async function reconcileStuckTake(
  takeId: string,
  options?: {
    waitForCompletion?: boolean;
    manualRequestIds?: Record<string, string>;
    timestampMatches?: Map<string, { requestId: string; endpoint: string }>;
    revalidatePath?: string;
  },
): Promise<ReconcileTakeOutcome> {
  const take = await getTake(takeId);
  if (!take) return { takeId, result: "skipped", reason: "take_not_found" };
  if (take.status === "ready") return { takeId, result: "already_ready" };
  if (take.status !== "pending") {
    return { takeId, result: "skipped", reason: `status_${take.status}` };
  }

  const discovered = await discoverRequestIdForTake(
    take,
    options?.manualRequestIds,
    options?.timestampMatches,
  );
  if (!discovered) {
    return {
      takeId,
      result: "unmatched",
      reason:
        "no_request_id — paste fal request IDs from dashboard into RECONCILE_REQUEST_MAP or provider_request_id",
    };
  }

  const resolved = await resolveFalJob(take, discovered.requestId, discovered.endpoint);
  if (!resolved) {
    return { takeId, result: "unmatched", reason: "request_id_not_found_on_fal" };
  }

  await setTakeProviderJob(take.id, {
    providerRequestId: discovered.requestId,
    providerEndpoint: resolved.endpoint,
  });

  if (resolved.status === "COMPLETED") {
    return rescueCompletedFalTake({
      take,
      requestId: discovered.requestId,
      endpoint: resolved.endpoint,
    });
  }

  if (resolved.status === "FAILED") {
    const error = resolved.error ?? "fal reported job failed";
    await markTakeFailed(take.id, error);
    const refunded = await releaseOpenTakeReservation(take.id);
    return {
      takeId: take.id,
      result: "failed_per_fal",
      requestId: discovered.requestId,
      error,
      refunded,
    };
  }

  if (!options?.waitForCompletion) {
    scheduleFalTakeWatcher({
      takeId: take.id,
      requestId: discovered.requestId,
      endpoint: resolved.endpoint,
      revalidatePath: options?.revalidatePath,
    });
    return {
      takeId: take.id,
      result: "reattached",
      requestId: discovered.requestId,
      endpoint: resolved.endpoint,
      falStatus: resolved.status,
    };
  }

  return watchFalTakeToCompletion({
    takeId: take.id,
    requestId: discovered.requestId,
    endpoint: resolved.endpoint,
    revalidatePath: options?.revalidatePath,
  });
}

export async function reconcileStuckTakes(input?: {
  episodeId?: string;
  seriesId?: string;
  olderThanMinutes?: number;
  takeIds?: string[];
  waitForCompletion?: boolean;
  manualRequestIds?: Record<string, string>;
  revalidatePath?: string;
}): Promise<ReconcileTakeOutcome[]> {
  try {
    const minAge = input?.olderThanMinutes ?? STUCK_TAKE_THRESHOLD_MINUTES;
    let takes = await listStuckPendingTakes({
      episodeId: input?.episodeId,
      seriesId: input?.seriesId,
      olderThanMinutes: input?.takeIds?.length ? 0 : minAge,
      takeIds: input?.takeIds,
    });

    if (!input?.takeIds?.length && minAge > 0) {
      takes = takes.filter((take) => {
        const ageMs = Date.now() - new Date(take.created_at).getTime();
        return ageMs >= minAge * 60_000;
      });
    }

    const timestampMatches = await buildTimestampRequestMatches(takes);

    const outcomes: ReconcileTakeOutcome[] = [];
    for (const take of takes) {
      try {
        outcomes.push(
          await reconcileStuckTake(take.id, {
            waitForCompletion: input?.waitForCompletion,
            manualRequestIds: input?.manualRequestIds,
            timestampMatches,
            revalidatePath: input?.revalidatePath,
          }),
        );
      } catch (error) {
        if (isTakeProviderSchemaError(error)) {
          logTakeProviderSchemaWarning("reconcileStuckTake skipped");
          outcomes.push({ takeId: take.id, result: "skipped", reason: "provider_schema_missing" });
          continue;
        }
        logReconcileError("reconcileStuckTake", error, { takeId: take.id });
        outcomes.push({
          takeId: take.id,
          result: "skipped",
          reason: error instanceof Error ? error.message : "reconcile_error",
        });
      }
    }
    return outcomes;
  } catch (error) {
    if (isTakeProviderSchemaError(error)) {
      logTakeProviderSchemaWarning("reconcileStuckTakes skipped");
      return [];
    }
    throw error;
  }
}

export function scheduleEpisodeStuckTakeReconcile(input: {
  episodeId: string;
  seriesId: string;
}): void {
  runDetached(
    "episode sweep",
    async () => {
      await reconcileStuckTakes({
        episodeId: input.episodeId,
        olderThanMinutes: STUCK_TAKE_THRESHOLD_MINUTES,
        revalidatePath: `/series/${input.seriesId}/episodes/${input.episodeId}`,
      });
    },
    { episodeId: input.episodeId, seriesId: input.seriesId },
  );
}

export function scheduleStartupStuckTakeSweep(): void {
  runDetached("startup sweep", async () => {
    const outcomes = await reconcileStuckTakes({
      olderThanMinutes: STUCK_TAKE_THRESHOLD_MINUTES,
      waitForCompletion: false,
    });
    if (outcomes.length) {
      console.log("[take-reconcile] startup sweep", {
        count: outcomes.length,
        summary: outcomes.map((o) => `${o.takeId}:${o.result}`).join(", "),
      });
    }
  });
}

export function parseManualRequestMap(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  const map: Record<string, string> = {};
  for (const part of raw.split(/[,\s]+/)) {
    const [takeId, requestId] = part.split(":");
    if (takeId && requestId) map[takeId.trim()] = requestId.trim();
  }
  return map;
}
