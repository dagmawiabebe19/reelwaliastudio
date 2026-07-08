import "server-only";

import { runScreenplayParse } from "@/lib/screenplay/parse-job";
import type { ServiceDbClient } from "@/lib/db/service-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPendingScreenplayIds } from "@/lib/db/screenplays";

export type ScreenplayParseOps = {
  db: ServiceDbClient;
};

function logScreenplayParseError(
  label: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  console.error(`[screenplay-parse] ${label} failed`, {
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
    .catch((error) => {
      logScreenplayParseError(label, error, context);
    });
}

export async function reconcilePendingScreenplayParses(input?: {
  ops?: ScreenplayParseOps;
}): Promise<{ processed: number; parsed: number; failed: number }> {
  const db = input?.ops?.db ?? createAdminClient();
  const ids = await listPendingScreenplayIds(db);

  let parsed = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      const outcome = await runScreenplayParse({ screenplayId: id, db });
      if (outcome.status === "parsed") parsed += 1;
      if (outcome.status === "failed") failed += 1;
    } catch (error) {
      failed += 1;
      logScreenplayParseError("parse screenplay", error, { screenplayId: id });
    }
  }

  return { processed: ids.length, parsed, failed };
}

export function scheduleScreenplayParse(screenplayId: string): void {
  const ops: ScreenplayParseOps = { db: createAdminClient() };
  runDetached(
    "screenplay parse",
    async () => {
      const outcome = await runScreenplayParse({ screenplayId, db: ops.db });
      if (outcome.status !== "skipped") {
        console.log("[screenplay-parse] finished", { screenplayId, outcome });
      }
    },
    { screenplayId },
  );
}

export function scheduleStartupScreenplayParseSweep(): void {
  const ops: ScreenplayParseOps = { db: createAdminClient() };
  runDetached("startup sweep", async () => {
    const result = await reconcilePendingScreenplayParses({ ops });
    if (result.processed > 0) {
      console.log(
        `[screenplay-parse] startup sweep processed ${result.processed} ` +
          `(parsed:${result.parsed} failed:${result.failed})`,
      );
    }
  });
}
