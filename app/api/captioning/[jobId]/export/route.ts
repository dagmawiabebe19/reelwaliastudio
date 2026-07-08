import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getCaptioningJob, listCues, listTranslations } from "@/lib/db/captioning";
import { ALL_LANGUAGES } from "@/lib/captioning/languages";
import { buildVtt } from "@/lib/captioning/vtt";
import { SOURCE_LANG } from "@/lib/captioning/types";

interface RouteProps {
  params: Promise<{ jobId: string }>;
}

export async function GET(_request: Request, { params }: RouteProps) {
  const { jobId } = await params;

  try {
    const job = await getCaptioningJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const translations = await listTranslations(jobId);
    const readyLangs = new Set(
      translations.filter((t) => t.status === "ready").map((t) => t.lang),
    );

    const zip = new JSZip();
    let fileCount = 0;

    for (const lang of ALL_LANGUAGES) {
      if (lang.code !== SOURCE_LANG && !readyLangs.has(lang.code)) continue;

      const cues = await listCues(jobId, lang.code);
      if (cues.length === 0) continue;

      const vtt = buildVtt(
        cues.map((row) => ({
          cueIndex: row.cue_index,
          startMs: row.start_ms,
          endMs: row.end_ms,
          text: row.text,
        })),
      );

      const filename = `${sanitize(job.title)}-${lang.code}.vtt`;
      zip.file(filename, vtt);
      fileCount += 1;
    }

    if (fileCount === 0) {
      return NextResponse.json({ error: "No caption files ready to export" }, { status: 404 });
    }

    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const zipName = `${sanitize(job.title)}-captions.zip`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

function sanitize(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").slice(0, 80) || "captions";
}
