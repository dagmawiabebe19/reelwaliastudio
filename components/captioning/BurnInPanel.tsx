"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Download, Loader2 } from "lucide-react";
import {
  generateBurnInAction,
  getBurnedVideoUrlAction,
} from "@/app/(app)/captioning/actions";
import { Button } from "@/components/ui/Button";
import type { BurnStatus } from "@/lib/db/captioning";

interface BurnInPanelProps {
  jobId: string;
  englishApproved: boolean;
  burnStatus: BurnStatus;
  burnFailReason: string | null;
  hasBurnedVideo: boolean;
  estimateCredits: number;
  preset: string;
  position: string;
}

export function BurnInPanel({
  jobId,
  englishApproved,
  burnStatus,
  burnFailReason,
  hasBurnedVideo,
  estimateCredits,
  preset,
  position,
}: BurnInPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const processing = burnStatus === "processing";
  const ready = burnStatus === "ready" && hasBurnedVideo;

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await generateBurnInAction(jobId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function download() {
    setError(null);
    setDownloading(true);
    try {
      const result = await getBurnedVideoUrlAction(jobId);
      if (result?.error || !result?.url) {
        setError(result?.error ?? "Could not load the video.");
        return;
      }
      window.location.href = result.url;
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="studio-card p-4">
      <div className="flex items-center gap-2">
        <Clapperboard className="h-4 w-4 text-foreground" />
        <h3 className="font-display text-base text-foreground">
          Burned-in English MP4 (social)
        </h3>
      </div>
      <p className="mt-2 text-sm text-muted">
        A vertical-friendly video with the approved English captions baked into the
        picture — open captions for muted autoplay on Instagram/TikTok. Rendered on fal
        (<code className="text-xs">veed/subtitles</code>), styled bottom-safe, bold, high
        contrast. The <code className="text-xs">.vtt</code> export above is unchanged; this
        is an additional output.
      </p>

      {!englishApproved ? (
        <p className="mt-4 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-muted">
          Approve English first — the burn uses your reviewed cues.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {ready ? (
              <Button
                type="button"
                variant="primary"
                className="inline-flex items-center gap-2"
                disabled={downloading}
                onClick={download}
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download social MP4
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                className="inline-flex items-center gap-2"
                disabled={pending || processing}
                onClick={generate}
              >
                {pending || processing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Clapperboard className="h-4 w-4" />
                )}
                {processing
                  ? "Generating…"
                  : burnStatus === "failed"
                    ? "Retry burn-in"
                    : "Generate burned-in English video"}
              </Button>
            )}

            {ready ? (
              <Button
                type="button"
                variant="ghost"
                className="text-xs"
                disabled={pending || processing}
                onClick={generate}
              >
                Regenerate
              </Button>
            ) : null}

            <span className="text-xs text-muted">
              ≈ {estimateCredits} credits · preset <code>{preset}</code> · {position}
            </span>
          </div>

          {processing ? (
            <p className="mt-3 text-sm text-muted">
              Rendering on fal — this takes a few minutes for a full episode. You can leave
              this page; it will keep going and recover after a restart.
            </p>
          ) : null}

          {burnStatus === "failed" && burnFailReason ? (
            <p className="mt-3 text-sm text-red-500">{burnFailReason}</p>
          ) : null}

          {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}

          <p className="mt-4 text-xs text-muted">
            Prefer multi-language 720p burns below when you need several languages. This
            English social button remains for the one-click EN-only path.
          </p>
        </>
      )}
    </div>
  );
}
