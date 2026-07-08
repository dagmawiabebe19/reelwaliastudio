import { NextResponse } from "next/server";
import { getCaptioningJob, listCues } from "@/lib/db/captioning";
import { buildVtt } from "@/lib/captioning/vtt";
import { SOURCE_LANG } from "@/lib/captioning/types";

interface RouteProps {
  params: Promise<{ jobId: string }>;
}

export async function GET(request: Request, { params }: RouteProps) {
  const { jobId } = await params;
  const { searchParams } = new URL(request.url);
  const lang = searchParams.get("lang");

  if (!lang) {
    return NextResponse.json({ error: "lang query required" }, { status: 400 });
  }

  try {
    const job = await getCaptioningJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const cues = await listCues(jobId, lang);
    if (cues.length === 0) {
      return NextResponse.json({ error: "No captions for this language" }, { status: 404 });
    }

    const vtt = buildVtt(
      cues.map((row) => ({
        cueIndex: row.cue_index,
        startMs: row.start_ms,
        endMs: row.end_ms,
        text: row.text,
      })),
    );

    const suffix = lang === SOURCE_LANG ? "en" : lang;
    const filename = `${sanitize(job.title)}-${suffix}.vtt`;

    return new NextResponse(vtt, {
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}

function sanitize(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").slice(0, 80) || "captions";
}
