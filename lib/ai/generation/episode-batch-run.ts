import "server-only";

import { isInsufficientCreditsError } from "@/lib/credits/errors";
import { logGenerationError } from "@/lib/ai/generation/errors";
import { EPISODE_BATCH_GENERATION_CONCURRENCY } from "@/lib/ai/generation/episode-batch-constants";
import { runWithConcurrencySettled } from "@/lib/ai/generation/concurrency";
import {
  executeGenerationJob,
  type GenerateTakeParams,
  type GenerationJobOutcome,
} from "@/lib/ai/generation/run";
import { markTakeFailed } from "@/lib/db/takes";

export type EpisodeBatchJobItem = {
  sceneId: string;
  title: string;
  params: GenerateTakeParams;
  takeId: string;
};

export type EpisodeBatchJobOutcome = {
  results: Array<{
    sceneId: string;
    title: string;
    takeId: string;
    outcome: GenerationJobOutcome | null;
    error: string | null;
  }>;
  ready: number;
  failed: number;
  pending: number;
};

export async function executeEpisodeBatchJob(input: {
  userId: string;
  jobs: EpisodeBatchJobItem[];
  concurrency?: number;
}): Promise<EpisodeBatchJobOutcome> {
  const limit = input.concurrency ?? EPISODE_BATCH_GENERATION_CONCURRENCY;

  const settled = await runWithConcurrencySettled(input.jobs, limit, async (job) => {
    return executeGenerationJob(job.params, [job.takeId], undefined, { userId: input.userId });
  });

  const results: EpisodeBatchJobOutcome["results"] = [];
  let ready = 0;
  let failed = 0;
  let pending = 0;

  for (let i = 0; i < input.jobs.length; i += 1) {
    const job = input.jobs[i]!;
    const outcome = settled[i];

    if (outcome.status === "rejected") {
      const reason =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : "Segment generation failed.";
      if (isInsufficientCreditsError(outcome.reason)) {
        await markTakeFailed(
          job.takeId,
          `Not enough credits (need ${outcome.reason.needed}, have ${outcome.reason.available}).`,
        );
      } else {
        logGenerationError("episode-batch-segment", outcome.reason, {
          sceneId: job.sceneId,
          takeId: job.takeId,
        });
        await markTakeFailed(job.takeId, reason).catch(() => undefined);
      }
      failed += 1;
      results.push({
        sceneId: job.sceneId,
        title: job.title,
        takeId: job.takeId,
        outcome: null,
        error: reason,
      });
      continue;
    }

    const jobOutcome = outcome.value;
    ready += jobOutcome.ready;
    failed += jobOutcome.failed;
    pending += jobOutcome.pending;
    results.push({
      sceneId: job.sceneId,
      title: job.title,
      takeId: job.takeId,
      outcome: jobOutcome,
      error: jobOutcome.failed > 0 ? "Generation failed." : null,
    });
  }

  console.log("[episode-batch] completed", {
    segments: input.jobs.length,
    ready,
    failed,
    pending,
    concurrency: limit,
  });

  return { results, ready, failed, pending };
}
