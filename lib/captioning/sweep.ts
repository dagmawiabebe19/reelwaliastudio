import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceDbClient } from "@/lib/db/service-client";
import { listPendingTranscriptionJobIds, listPendingTranslations } from "@/lib/db/captioning";
import { runTranscription } from "@/lib/captioning/transcribe";
import { runTranslation } from "@/lib/captioning/translate";

export type CaptioningOps = { db: ServiceDbClient };

function logError(label: string, error: unknown, context?: Record<string, unknown>): void {
  console.error(`[captioning] ${label} failed`, {
    ...context,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

function runDetached(
  label: string,
  task: () => Promise<void>,
  context?: Record<string, unknown>,
): void {
  void Promise.resolve()
    .then(task)
    .catch((error) => logError(label, error, context));
}

export async function reconcilePendingTranscriptions(input?: {
  ops?: CaptioningOps;
}): Promise<{ processed: number }> {
  const db = input?.ops?.db ?? createAdminClient();
  const ids = await listPendingTranscriptionJobIds(db);
  for (const id of ids) {
    try {
      await runTranscription({ jobId: id, db });
    } catch (error) {
      logError("transcription reconcile", error, { jobId: id });
    }
  }
  return { processed: ids.length };
}

export async function reconcilePendingTranslations(input?: {
  ops?: CaptioningOps;
}): Promise<{ processed: number }> {
  const db = input?.ops?.db ?? createAdminClient();
  const pending = await listPendingTranslations(db);
  for (const row of pending) {
    try {
      await runTranslation({ jobId: row.job_id, lang: row.lang, db });
    } catch (error) {
      logError("translation reconcile", error, row);
    }
  }
  return { processed: pending.length };
}

export function scheduleTranscription(jobId: string): void {
  const db = createAdminClient();
  runDetached(
    "transcription",
    async () => {
      const outcome = await runTranscription({ jobId, db });
      if (outcome.status !== "skipped") {
        console.log("[captioning] transcription finished", { jobId, outcome });
      }
    },
    { jobId },
  );
}

export function scheduleTranslation(jobId: string, lang: string): void {
  const db = createAdminClient();
  runDetached(
    "translation",
    async () => {
      const outcome = await runTranslation({ jobId, lang, db });
      if (outcome.status !== "skipped") {
        console.log("[captioning] translation finished", { jobId, lang, outcome });
      }
    },
    { jobId, lang },
  );
}

export function scheduleTranslations(jobId: string, langs: string[]): void {
  const db = createAdminClient();
  runDetached(
    "translations batch",
    async () => {
      for (const lang of langs) {
        await runTranslation({ jobId, lang, db });
      }
      const { setJobStatus } = await import("@/lib/db/captioning");
      await setJobStatus(db, jobId, "ready");
      console.log("[captioning] all translations finished", { jobId, langs });
    },
    { jobId, langs },
  );
}

export function scheduleStartupCaptioningSweep(): void {
  const ops: CaptioningOps = { db: createAdminClient() };
  runDetached("startup sweep", async () => {
    const t = await reconcilePendingTranscriptions({ ops });
    const tr = await reconcilePendingTranslations({ ops });
    if (t.processed > 0 || tr.processed > 0) {
      console.log(
        `[captioning] startup sweep transcriptions:${t.processed} translations:${tr.processed}`,
      );
    }
  });
}
