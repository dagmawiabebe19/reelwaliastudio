"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveEnglishAndTranslateAction,
  estimateTranslationAction,
  getCaptionVideoUrlAction,
  saveEnglishCuesAction,
} from "@/app/(app)/captioning/actions";
import { Button } from "@/components/ui/Button";
import { formatVttTimestamp } from "@/lib/captioning/vtt";
import type { CaptionCueRow, CaptioningJobRow } from "@/lib/db/captioning";

type EditableCue = { startMs: number; endMs: number; text: string };

interface CaptionReviewPanelProps {
  job: CaptioningJobRow;
  initialCues: CaptionCueRow[];
}

export function CaptionReviewPanel({ job, initialCues }: CaptionReviewPanelProps) {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [cues, setCues] = useState<EditableCue[]>(() =>
    initialCues.map((c) => ({ startMs: c.start_ms, endMs: c.end_ms, text: c.text })),
  );
  const [error, setError] = useState<string | null>(null);
  const [estimateCredits, setEstimateCredits] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    if (!node) return;
    (window as unknown as { __captionVideo?: HTMLVideoElement }).__captionVideo = node;
  }, []);

  const locked = !!job.english_approved_at;
  const canReview =
    job.status === "transcribed" || job.status === "ready" || job.status === "translating";

  useEffect(() => {
    void getCaptionVideoUrlAction(job.id).then((r) => {
      if ("url" in r && r.url) setVideoUrl(r.url);
    });
  }, [job.id]);

  useEffect(() => {
    if (!canReview || locked) return;
    void estimateTranslationAction(job.id).then((r) => {
      if ("estimateCredits" in r && typeof r.estimateCredits === "number") {
        setEstimateCredits(r.estimateCredits);
      }
    });
  }, [job.id, canReview, locked]);

  function seekTo(ms: number) {
    const v = (window as unknown as { __captionVideo?: HTMLVideoElement }).__captionVideo;
    if (v) {
      v.currentTime = ms / 1000;
      void v.play().catch(() => {});
    }
  }

  function updateCue(index: number, patch: Partial<EditableCue>) {
    setCues((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function addCue() {
    const lastEnd = cues.length > 0 ? cues[cues.length - 1].endMs : 0;
    setCues((prev) => [
      ...prev,
      { startMs: lastEnd, endMs: lastEnd + 2000, text: "" },
    ]);
  }

  function removeCue(index: number) {
    setCues((prev) => prev.filter((_, i) => i !== index));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveEnglishCuesAction(job.id, cues);
      if ("error" in result) {
        setError(result.error ?? "Save failed.");
        return;
      }
      router.refresh();
    });
  }

  function approve() {
    setError(null);
    startTransition(async () => {
      const saveResult = await saveEnglishCuesAction(job.id, cues);
      if ("error" in saveResult) {
        setError(saveResult.error ?? "Save failed.");
        return;
      }
      const result = await approveEnglishAndTranslateAction(job.id);
      if ("error" in result) {
        setError(result.error ?? "Approval failed.");
        return;
      }
      router.refresh();
    });
  }

  if (!canReview && job.status !== "failed") {
    return (
      <p className="text-sm text-muted">
        Transcription in progress… English cues will appear here when ready.
      </p>
    );
  }

  if (job.status === "failed") {
    return (
      <div className="studio-card border-red-500/30 p-4">
        <p className="text-sm text-red-500">{job.fail_reason ?? "Transcription failed."}</p>
        <p className="mt-2 text-xs text-muted">
          If the clip has little or no speech, add cues manually after re-uploading, or edit a
          recovered job once transcription completes with sparse results.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="studio-card overflow-hidden p-0">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="aspect-video w-full bg-black"
            playsInline
          />
        ) : (
          <div className="flex aspect-video items-center justify-center bg-surface-elevated text-sm text-muted">
            Loading video…
          </div>
        )}
        <p className="border-t border-border px-4 py-2 text-xs text-muted">
          Scrub the video and fix any misheard lines before translating.
        </p>
      </div>

      <div className="studio-card flex max-h-[70vh] flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-base text-foreground">English cues</h3>
          {!locked ? (
            <Button type="button" variant="ghost" className="text-xs" onClick={addCue}>
              + Add cue
            </Button>
          ) : null}
        </div>

        {cues.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No speech detected. Use <strong>Add cue</strong> to write subtitles manually, then
            approve to translate.
          </p>
        ) : (
          <ul className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
            {cues.map((cue, index) => (
              <li
                key={index}
                className="rounded-lg border border-border bg-surface-elevated p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <button
                    type="button"
                    className="font-mono text-accent hover:underline"
                    onClick={() => seekTo(cue.startMs)}
                  >
                    {formatVttTimestamp(cue.startMs)}
                  </button>
                  <span>→</span>
                  <button
                    type="button"
                    className="font-mono text-accent hover:underline"
                    onClick={() => seekTo(cue.endMs)}
                  >
                    {formatVttTimestamp(cue.endMs)}
                  </button>
                  {!locked ? (
                    <button
                      type="button"
                      className="ml-auto text-red-500 hover:underline"
                      onClick={() => removeCue(index)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                {!locked ? (
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <label className="text-[10px] uppercase text-muted">
                      Start (ms)
                      <input
                        type="number"
                        className="studio-input mt-0.5 w-full font-mono text-xs"
                        value={cue.startMs}
                        onChange={(e) =>
                          updateCue(index, { startMs: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label className="text-[10px] uppercase text-muted">
                      End (ms)
                      <input
                        type="number"
                        className="studio-input mt-0.5 w-full font-mono text-xs"
                        value={cue.endMs}
                        onChange={(e) => updateCue(index, { endMs: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                ) : null}
                <textarea
                  className="studio-input w-full resize-y text-sm"
                  rows={2}
                  readOnly={locked}
                  value={cue.text}
                  onChange={(e) => updateCue(index, { text: e.target.value })}
                />
              </li>
            ))}
          </ul>
        )}

        {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}

        {!locked ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" disabled={pending} onClick={save}>
              Save English
            </Button>
            <Button type="button" disabled={pending} onClick={approve}>
              Approve English & translate
            </Button>
            {estimateCredits != null ? (
              <span className="self-center text-xs text-muted">
                Translation ≈ {estimateCredits.toLocaleString()} credits (all languages)
              </span>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 border-t border-border pt-4 text-xs text-muted">
            English approved {new Date(job.english_approved_at!).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
