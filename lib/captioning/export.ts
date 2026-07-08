import "server-only";

import type { ServiceDbClient } from "@/lib/db/service-client";
import { getCuesForService } from "@/lib/db/captioning";
import { SOURCE_LANG } from "@/lib/captioning/types";
import { buildVtt } from "@/lib/captioning/vtt";
import { cueRowsToCues } from "@/lib/db/captioning";

export const CAPTIONING_BUCKET = "captioning";

export function captionVttPath(ownerId: string, jobId: string, lang: string): string {
  return `${ownerId}/${jobId}/captions/${lang}.vtt`;
}

/** Write a language's cues to storage as a WebVTT file. */
export async function uploadVttForLanguage(
  db: ServiceDbClient,
  input: { ownerId: string; jobId: string; lang: string },
): Promise<string> {
  const rows = await getCuesForService(db, input.jobId, input.lang);
  const vtt = buildVtt(cueRowsToCues(rows));
  const path = captionVttPath(input.ownerId, input.jobId, input.lang);

  const { error } = await db.storage.from(CAPTIONING_BUCKET).upload(path, vtt, {
    contentType: "text/vtt; charset=utf-8",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

/** Upload English + every ready translation VTT for a job. */
export async function uploadAllVtts(
  db: ServiceDbClient,
  input: { ownerId: string; jobId: string; langs: string[] },
): Promise<Record<string, string>> {
  const paths: Record<string, string> = {};
  const allLangs = [SOURCE_LANG, ...input.langs];
  for (const lang of allLangs) {
    paths[lang] = await uploadVttForLanguage(db, {
      ownerId: input.ownerId,
      jobId: input.jobId,
      lang,
    });
  }
  return paths;
}
