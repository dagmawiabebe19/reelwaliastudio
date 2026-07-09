"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Sparkles, Upload } from "lucide-react";
import {
  analyzeScreenplayAction,
  estimateScreenplayAnalysisAction,
} from "@/app/(app)/series/[id]/screenplay-actions";
import { ScreenplayBreakdownReview } from "@/components/series/ScreenplayBreakdownReview";
import { uploadScreenplayFromClient } from "@/lib/storage/screenplay-upload";
import type { ScreenplayBreakdownProposal } from "@/lib/screenplay/analysis/types";
import type { ScreenplayAnalysisStatus } from "@/lib/screenplay/analysis/types";
import type { ScreenplayFormat, ScreenplayStatus } from "@/lib/screenplay/types";

export type ScreenplayCardData = {
  id: string;
  title: string;
  format: ScreenplayFormat;
  status: ScreenplayStatus;
  failReason: string | null;
  sceneCount: number;
  pageCountEst: number | null;
  characterCount: number;
  locationCount: number;
  createdAt: string;
  analysisStatus: ScreenplayAnalysisStatus | null;
  analysisFailReason: string | null;
  analysisProposal: ScreenplayBreakdownProposal | null;
};

interface ScreenplaySectionProps {
  seriesId: string;
  screenplay: ScreenplayCardData | null;
}

const STATUS_LABELS: Record<ScreenplayStatus, string> = {
  uploaded: "Uploaded — parsing soon",
  reading_pdf: "Reading PDF…",
  parsing: "Parsing screenplay…",
  parsed: "Parsed",
  failed: "Import failed",
};

const ANALYSIS_LABELS: Record<ScreenplayAnalysisStatus, string> = {
  analyzing: "Analyzing…",
  proposed: "Proposal ready",
  failed: "Analysis failed",
  approved: "Breakdown approved",
};

const FORMAT_LABELS: Record<ScreenplayFormat, string> = {
  pdf: "PDF",
  fdx: "Final Draft (.fdx)",
  fountain: "Fountain",
  txt: "Plain text",
};

export function ScreenplaySection({ seriesId, screenplay }: ScreenplaySectionProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [estimateCredits, setEstimateCredits] = useState<number | null>(null);

  useEffect(() => {
    if (!screenplay || screenplay.status !== "parsed") {
      setEstimateCredits(null);
      return;
    }
    void estimateScreenplayAnalysisAction(seriesId, screenplay.id).then((result) => {
      if ("estimateCredits" in result && typeof result.estimateCredits === "number") {
        setEstimateCredits(result.estimateCredits);
      }
    });
  }, [seriesId, screenplay]);

  function handleUpload(file: File) {
    setError(null);
    setProgress(0);
    startTransition(async () => {
      try {
        await uploadScreenplayFromClient(seriesId, file, ({ percent }) => {
          setProgress(percent);
        });
        setProgress(null);
        router.refresh();
      } catch (err) {
        setProgress(null);
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  function handleAnalyze() {
    if (!screenplay) return;
    setError(null);
    startTransition(async () => {
      const result = await analyzeScreenplayAction(seriesId, screenplay.id);
      if ("error" in result) {
        setError(result.error ?? "Screenplay analysis failed.");
        return;
      }
      router.refresh();
    });
  }

  const isProcessing =
    screenplay?.status === "uploaded" ||
    screenplay?.status === "reading_pdf" ||
    screenplay?.status === "parsing";
  const isAnalyzing = screenplay?.analysisStatus === "analyzing";

  useEffect(() => {
    if (!isProcessing && !isAnalyzing) return;
    const timer = window.setInterval(() => {
      router.refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [isProcessing, isAnalyzing, router]);

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg text-foreground">Screenplay</h2>
          <p className="mt-1 text-sm text-muted">
            Import a full script for structured breakdown.{" "}
            <span className="text-foreground/80">.fdx or .fountain gives the most accurate import.</span>
          </p>
        </div>
        <button
          type="button"
          disabled={pending || isProcessing}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-elevated disabled:opacity-50"
        >
          <Upload className="size-4" strokeWidth={1.75} aria-hidden />
          Import screenplay
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.fdx,.fountain,.txt,application/pdf,text/plain"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) handleUpload(file);
        }}
      />

      {progress !== null ? (
        <p className="mt-4 text-sm text-muted">Uploading… {progress}%</p>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {screenplay ? (
        <div className="mt-5 rounded-md border border-border/80 bg-surface-elevated p-4">
          <div className="flex flex-wrap items-start gap-3">
            <FileText className="mt-0.5 size-5 text-accent" strokeWidth={1.75} aria-hidden />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-foreground">{screenplay.title}</p>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                  {FORMAT_LABELS[screenplay.format]}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    screenplay.status === "parsed"
                      ? "bg-emerald-500/10 text-emerald-300"
                      : screenplay.status === "failed"
                        ? "bg-red-500/10 text-red-300"
                        : "bg-amber-500/10 text-amber-200"
                  }`}
                >
                  {STATUS_LABELS[screenplay.status]}
                </span>
                {screenplay.analysisStatus ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                    {ANALYSIS_LABELS[screenplay.analysisStatus]}
                  </span>
                ) : null}
              </div>

              {screenplay.status === "parsed" ? (
                <p className="text-sm text-muted">
                  {screenplay.sceneCount} scenes · {screenplay.characterCount} characters ·{" "}
                  {screenplay.locationCount} locations
                  {screenplay.pageCountEst ? ` · ~${screenplay.pageCountEst} pages` : null}
                </p>
              ) : null}

              {screenplay.status === "failed" && screenplay.failReason ? (
                <p className="text-sm text-red-300">{screenplay.failReason}</p>
              ) : null}

              {screenplay.analysisStatus === "failed" && screenplay.analysisFailReason ? (
                <p className="text-sm text-red-300">{screenplay.analysisFailReason}</p>
              ) : null}

              {isProcessing ? (
                <p className="text-sm text-muted">
                  {screenplay.status === "reading_pdf"
                    ? "Reading PDF text… scanned scripts use vision OCR and may take up to a minute."
                    : "Parsing scenes, characters, and locations…"}
                </p>
              ) : null}

              {isAnalyzing ? (
                <p className="text-sm text-muted">
                  Running chunked analysis across your scenes. This may take a minute for long scripts.
                </p>
              ) : null}

              {screenplay.status === "parsed" &&
              screenplay.analysisStatus !== "analyzing" &&
              screenplay.analysisStatus !== "proposed" &&
              screenplay.analysisStatus !== "approved" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleAnalyze}
                  className="mt-2 inline-flex items-center gap-2 rounded-md border border-accent/40 px-3 py-1.5 text-sm text-accent hover:bg-accent/10 disabled:opacity-50"
                >
                  <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />
                  Analyze screenplay
                  {estimateCredits !== null ? (
                    <span className="text-muted">(~{estimateCredits} credits)</span>
                  ) : null}
                </button>
              ) : null}
            </div>
          </div>

          {(screenplay.analysisStatus === "proposed" || screenplay.analysisStatus === "approved") &&
          screenplay.analysisProposal ? (
            <ScreenplayBreakdownReview
              seriesId={seriesId}
              screenplayId={screenplay.id}
              proposal={screenplay.analysisProposal}
              readOnly={screenplay.analysisStatus === "approved"}
            />
          ) : screenplay.analysisStatus === "proposed" && !screenplay.analysisProposal ? (
            <p className="mt-4 text-sm text-amber-300">
              Analysis marked ready but breakdown data is missing. Run Analyze screenplay again.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">
          Accepts .pdf (text-based), .fdx, .fountain, or .txt up to 50 MB.
        </p>
      )}
    </section>
  );
}
