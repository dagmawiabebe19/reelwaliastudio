import "server-only";

import type { ServiceDbClient } from "@/lib/db/service-client";
import {
  claimScreenplayForParsing,
  insertScreenplayScenes,
  markScreenplayFailed,
  markScreenplayParsed,
  setScreenplayParseStatus,
} from "@/lib/db/screenplays";
import { parseScreenplayBuffer } from "@/lib/screenplay/parse-content";
import type { ScreenplayFormat } from "@/lib/screenplay/types";

const SCREENPLAY_BUCKET = "references";

export type ScreenplayParseOutcome =
  | { status: "parsed"; sceneCount: number; unrecognizedBlocksPct: number }
  | { status: "failed"; reason: string }
  | { status: "skipped" };

export async function runScreenplayParse(input: {
  screenplayId: string;
  db: ServiceDbClient;
}): Promise<ScreenplayParseOutcome> {
  const claimed = await claimScreenplayForParsing(input.db, input.screenplayId);
  if (!claimed) return { status: "skipped" };

  const { data: fileData, error: downloadError } = await input.db.storage
    .from(SCREENPLAY_BUCKET)
    .download(claimed.storage_path);

  if (downloadError || !fileData) {
    await markScreenplayFailed(input.db, input.screenplayId, "Could not download the uploaded file.");
    return { status: "failed", reason: "Could not download the uploaded file." };
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const format = claimed.format as ScreenplayFormat;

  const parsed = await parseScreenplayBuffer(format, buffer, {
    onPhase: async (phase) => {
      if (format !== "pdf") return;
      if (phase === "reading") {
        await setScreenplayParseStatus(input.db, input.screenplayId, "reading_pdf");
      } else if (phase === "structuring") {
        await setScreenplayParseStatus(input.db, input.screenplayId, "parsing");
      }
    },
  });

  if ("error" in parsed) {
    await markScreenplayFailed(input.db, input.screenplayId, parsed.error);
    return { status: "failed", reason: parsed.error };
  }

  await insertScreenplayScenes(input.db, input.screenplayId, parsed.scenes);
  await markScreenplayParsed(input.db, input.screenplayId, {
    sceneCount: parsed.scenes.length,
    pageCountEst: parsed.pageCountEst,
  });

  console.log("[screenplay-parse] parsed screenplay", {
    screenplayId: input.screenplayId,
    seriesId: claimed.series_id,
    format: claimed.format,
    sceneCount: parsed.scenes.length,
    characterCount: parsed.characterNames.length,
    locationCount: parsed.locationNames.length,
    unrecognizedBlocksPct: parsed.unrecognizedBlocksPct,
  });

  return {
    status: "parsed",
    sceneCount: parsed.scenes.length,
    unrecognizedBlocksPct: parsed.unrecognizedBlocksPct,
  };
}
