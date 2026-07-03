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
import { getSceneBasic } from "@/lib/db/scenes";
import { resolveOwnerIdForScene } from "@/lib/db/resolve-owner";
import type { ServiceDbClient } from "@/lib/db/service-client";
import {
  getTake,
  isTakeProviderSchemaError,
  listStuckPendingTakes,
  logTakeProviderSchemaWarning,
  markTakeFailed,
  setTakeProviderJob,
  type TakeWithAsset,
} from "@/lib/db/takes";
import { createAdminClient } from "@/lib/supabase/admin";

export const STUCK_TAKE_THRESHOLD_MINUTES = 15;

export type ReconcileTakeOutcome =
  | { takeId: string; result: "already_ready" }
  | { takeId: string; result: "rescued"; requestId: string; endpoint: string; creditsCommitted: number }
  | { takeId: string; result: "reattached"; requestId: string; endpoint: string; falStatus: FalQueueStatus }
  | { takeId: string; result: "failed_per_fal"; requestId: string; error: string; refunded: boolean }
  | { takeId: string; result: "unmatched"; reason: string }
  | { takeId: string; result: "skipped"; reason: string };

const activeWatchers = new Set<string>();

/** Service-role reconcile context for startup / detached sweeps (no request cookies). */
export type ReconcileOps = {
  db: ServiceDbClient;
};

type ReconcileCallOptions = {
  waitForCompletion?: boolean;
  manualRequestIds?: Record<string, string>;
  timestampMatches?: Map<string, { requestId: string; endpoint: string }>;
  revalidatePath?: string;
  /** When set, all DB/storage access uses the service-role client. */
  ops?: ReconcileOps;
  /** Ops sweeps only: mark failed + release reservation when no fal job can be found. */
  releaseUnmatchedReservation?: boolean;
};

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

function getReconcileAdminDb(): ServiceDbClient {
  return createAdminClient();
}

function opsFromOptions(options?: ReconcileCallOptions): ReconcileOps | undefined {
  return options?.ops;
}

async function resolveOpsOwnerId(sceneId: string, ops: ReconcileOps): Promise<string> {
  return resolveOwnerIdForScene(sceneId, ops.db);
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
  ops?: ReconcileOps;
}): Promise<ReconcileTakeOutcome> {
  const { take, requestId, endpoint, ops } = input;
  const db = ops?.db;
  if (take.status === "ready") {
    return { takeId: take.id, result: "already_ready" };
  }

  const queueResult = await getSeedanceQueueResult(endpoint, requestId);
  const scene = db
    ? await getSceneBasic(take.scene_id, db)
    : await getSceneBasic(take.scene_id);
  if (!scene) throw new Error("Scene not found.");

  const ownerId = ops ? await resolveOpsOwnerId(take.scene_id, ops) : undefined;

  const { videoDurationSeconds } = await finalizeTakeFromRemoteVideo({
    takeId: take.id,
    sceneId: take.scene_id,
    videoUrl: queueResult.videoUrl,
    modelId: take.model ?? undefined,
    prompt: scene.prompt,
    fallbackDurationSeconds: take.duration_seconds,
    ops: ops && ownerId ? { db: ops.db, ownerId } : undefined,
  });

  const creditsCommitted = await commitOpenTakeReservation(take, videoDurationSeconds);

  await setTakeProviderJob(
    take.id,
    {
      providerRequestId: requestId,
      providerEndpoint: endpoint,
    },
    db,
  );

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
  ops?: ReconcileOps;
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

  const db = input.ops?.db;
  activeWatchers.add(input.takeId);
  try {
    const take = await getTake(input.takeId, db);
    if (!take) return { takeId: input.takeId, result: "skipped", reason: "take_not_found" };
    if (take.status === "ready") return { takeId: input.takeId, result: "already_ready" };

    const resolved = await resolveFalJob(take, input.requestId, input.endpoint);
    if (!resolved) {
      return { takeId: take.id, result: "unmatched", reason: "request_not_found_on_fal" };
    }

    await setTakeProviderJob(
      take.id,
      {
        providerRequestId: input.requestId,
        providerEndpoint: resolved.endpoint,
      },
      db,
    );

    if (resolved.status === "COMPLETED") {
      return rescueCompletedFalTake({
        take,
        requestId: input.requestId,
        endpoint: resolved.endpoint,
        ops: input.ops,
      });
    }

    if (resolved.status === "FAILED") {
      const error = resolved.error ?? "fal reported job failed";
      await markTakeFailed(take.id, error, db);
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
    const refreshed = await getTake(take.id, db);
    if (!refreshed) return { takeId: take.id, result: "skipped", reason: "take_not_found" };

    if (finalStatus.status === "COMPLETED") {
      return rescueCompletedFalTake({
        take: refreshed,
        requestId: input.requestId,
        endpoint: resolved.endpoint,
        ops: input.ops,
      });
    }

    if (finalStatus.status === "FAILED") {
      const error = finalStatus.error ?? "fal reported job failed";
      await markTakeFailed(refreshed.id, error, db);
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
  ops?: ReconcileOps;
}): void {
  runDetached("watcher", () => watchFalTakeToCompletion(input).then(() => undefined), {
    takeId: input.takeId,
    requestId: input.requestId,
  });
}

export async function reconcileStuckTake(
  takeId: string,
  options?: ReconcileCallOptions,
): Promise<ReconcileTakeOutcome> {
  const ops = opsFromOptions(options);
  const db = ops?.db;
  const take = await getTake(takeId, db);
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
    if (options?.releaseUnmatchedReservation) {
      const reason =
        "No provider job found — generation may have failed before submit. Credits released.";
      await markTakeFailed(take.id, reason, db);
      const refunded = await releaseOpenTakeReservation(take.id);
      return {
        takeId,
        result: "failed_per_fal",
        requestId: "",
        error: reason,
        refunded,
      };
    }
    return {
      takeId,
      result: "unmatched",
      reason:
        "no_request_id — paste fal request IDs from dashboard into RECONCILE_REQUEST_MAP or provider_request_id",
    };
  }

  const resolved = await resolveFalJob(take, discovered.requestId, discovered.endpoint);
  if (!resolved) {
    if (options?.releaseUnmatchedReservation) {
      const reason = "Provider job not found on fal — credits released.";
      await markTakeFailed(take.id, reason, db);
      const refunded = await releaseOpenTakeReservation(take.id);
      return {
        takeId: take.id,
        result: "failed_per_fal",
        requestId: discovered.requestId,
        error: reason,
        refunded,
      };
    }
    return { takeId, result: "unmatched", reason: "request_id_not_found_on_fal" };
  }

  await setTakeProviderJob(
    take.id,
    {
      providerRequestId: discovered.requestId,
      providerEndpoint: resolved.endpoint,
    },
    db,
  );

  if (resolved.status === "COMPLETED") {
    return rescueCompletedFalTake({
      take,
      requestId: discovered.requestId,
      endpoint: resolved.endpoint,
      ops,
    });
  }

  if (resolved.status === "FAILED") {
    const error = resolved.error ?? "fal reported job failed";
    await markTakeFailed(take.id, error, db);
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
      ops,
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
    ops,
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
  ops?: ReconcileOps;
}): Promise<ReconcileTakeOutcome[]> {
  try {
    const minAge = input?.olderThanMinutes ?? STUCK_TAKE_THRESHOLD_MINUTES;
    const adminDb = input?.ops?.db ?? (input?.ops ? getReconcileAdminDb() : undefined);
    const listDb = adminDb ?? undefined;
    let takes = await listStuckPendingTakes(
      {
        episodeId: input?.episodeId,
        seriesId: input?.seriesId,
        olderThanMinutes: input?.takeIds?.length ? 0 : minAge,
        takeIds: input?.takeIds,
      },
      listDb,
    );

    if (!input?.takeIds?.length && minAge > 0) {
      takes = takes.filter((take) => {
        const ageMs = Date.now() - new Date(take.created_at).getTime();
        return ageMs >= minAge * 60_000;
      });
    }

    const timestampMatches = await buildTimestampRequestMatches(takes);

    const reconcileOps = input?.ops ?? (adminDb ? { db: adminDb } : undefined);
    const releaseUnmatched = Boolean(input?.ops);

    const outcomes: ReconcileTakeOutcome[] = [];
    for (const take of takes) {
      try {
        outcomes.push(
          await reconcileStuckTake(take.id, {
            waitForCompletion: input?.waitForCompletion,
            manualRequestIds: input?.manualRequestIds,
            timestampMatches,
            revalidatePath: input?.revalidatePath,
            ops: reconcileOps,
            releaseUnmatchedReservation: releaseUnmatched,
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
  const ops: ReconcileOps = { db: getReconcileAdminDb() };
  runDetached(
    "episode sweep",
    async () => {
      await reconcileStuckTakes({
        episodeId: input.episodeId,
        olderThanMinutes: STUCK_TAKE_THRESHOLD_MINUTES,
        revalidatePath: `/series/${input.seriesId}/episodes/${input.episodeId}`,
        ops,
      });
    },
    { episodeId: input.episodeId, seriesId: input.seriesId },
  );
}

export function scheduleStartupStuckTakeSweep(): void {
  const ops: ReconcileOps = { db: getReconcileAdminDb() };
  runDetached("startup sweep", async () => {
    const outcomes = await reconcileStuckTakes({
      olderThanMinutes: STUCK_TAKE_THRESHOLD_MINUTES,
      waitForCompletion: false,
      ops,
    });
    console.log(`[take-reconcile] startup sweep: checked ${outcomes.length} takes`);
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
