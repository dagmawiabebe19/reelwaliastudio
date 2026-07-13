"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Download, Loader2, RotateCcw } from "lucide-react";
import {
  getLanguageBurnedVideoUrlAction,
  renderLanguageBurnExportsAction,
} from "@/app/(app)/captioning/actions";
import { Button } from "@/components/ui/Button";
import { ALL_LANGUAGES } from "@/lib/captioning/languages";
import { BURN_EXPORT_RESOLUTION } from "@/lib/captioning/burn-export-types";
import type { CaptionBurnedExportRow } from "@/lib/captioning/burn-export-types";
import { SOURCE_LANG } from "@/lib/captioning/types";

interface LanguageBurnExportPanelProps {
  jobId: string;
  englishApproved: boolean;
  readyLangs: string[];
  exports: CaptionBurnedExportRow[];
  perLangCredits: number;
  preset: string;
}

function statusLabel(status: string): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "rendering":
      return "Rendering…";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export function LanguageBurnExportPanel({
  jobId,
  englishApproved,
  readyLangs,
  exports: initialExports,
  perLangCredits,
  preset,
}: LanguageBurnExportPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [downloadingLang, setDownloadingLang] = useState<string | null>(null);

  const availableLangs = useMemo(() => {
    const ready = new Set([SOURCE_LANG, ...readyLangs]);
    return ALL_LANGUAGES.filter((lang) => ready.has(lang.code));
  }, [readyLangs]);

  const [selected, setSelected] = useState<string[]>(() =>
    availableLangs.map((lang) => lang.code),
  );

  const exportByLang = useMemo(() => {
    const map = new Map<string, CaptionBurnedExportRow>();
    for (const row of initialExports) {
      if (row.resolution === BURN_EXPORT_RESOLUTION) map.set(row.lang, row);
    }
    return map;
  }, [initialExports]);

  const selectedCount = selected.length;
  const totalCredits = perLangCredits * selectedCount;
  const anyProcessing = initialExports.some(
    (row) => row.status === "queued" || row.status === "rendering",
  );

  function toggle(lang: string) {
    setSelected((prev) =>
      prev.includes(lang) ? prev.filter((code) => code !== lang) : [...prev, lang],
    );
  }

  function selectAll() {
    setSelected(availableLangs.map((lang) => lang.code));
  }

  function selectNone() {
    setSelected([]);
  }

  function render(force = false) {
    setError(null);
    if (!selected.length) {
      setError("Select at least one language.");
      return;
    }
    startTransition(async () => {
      const result = await renderLanguageBurnExportsAction(jobId, selected, { force });
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function download(lang: string) {
    setError(null);
    setDownloadingLang(lang);
    try {
      const result = await getLanguageBurnedVideoUrlAction(jobId, lang);
      if (result?.error || !result?.url) {
        setError(result?.error ?? "Could not load the video.");
        return;
      }
      window.location.href = result.url;
    } finally {
      setDownloadingLang(null);
    }
  }

  return (
    <div className="studio-card p-4">
      <div className="flex items-center gap-2">
        <Clapperboard className="h-4 w-4 text-foreground" />
        <h3 className="font-display text-base text-foreground">
          Burned-in {BURN_EXPORT_RESOLUTION} exports (per language)
        </h3>
      </div>
      <p className="mt-2 text-sm text-muted">
        Render a downloadable MP4 with captions burned in for each selected language.
        Uses fal <code className="text-xs">veed/subtitles</code> with the same lower-third
        style as the English social burn. One fal job per language. Already-rendered
        languages whose video + cues are unchanged download immediately.
      </p>

      {!englishApproved ? (
        <p className="mt-4 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-muted">
          Approve English first, then translate the languages you need.
        </p>
      ) : availableLangs.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No caption languages ready yet.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" className="!min-h-7 !px-2 !text-[10px]" onClick={selectAll}>
              Select all
            </Button>
            <Button type="button" variant="ghost" className="!min-h-7 !px-2 !text-[10px]" onClick={selectNone}>
              Clear
            </Button>
            <span className="text-xs text-muted">
              {selectedCount} language{selectedCount === 1 ? "" : "s"} · ≈ {totalCredits} credits
              ({perLangCredits} × {selectedCount} fal renders) · preset <code>{preset}</code>
            </span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availableLangs.map((lang) => {
              const checked = selected.includes(lang.code);
              const row = exportByLang.get(lang.code);
              return (
                <label
                  key={lang.code}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={() => toggle(lang.code)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">
                      {lang.label}{" "}
                      <span className="text-xs font-normal text-muted">({lang.code})</span>
                    </span>
                    {row ? (
                      <span className="mt-0.5 block text-xs text-muted">
                        {statusLabel(row.status)}
                        {row.status === "failed" && row.fail_reason
                          ? ` — ${row.fail_reason}`
                          : null}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-xs text-muted">Not rendered yet</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="primary"
              className="inline-flex items-center gap-2"
              disabled={pending || anyProcessing || selectedCount === 0}
              onClick={() => render(false)}
            >
              {pending || anyProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Clapperboard className="h-4 w-4" />
              )}
              {anyProcessing
                ? "Rendering…"
                : `Render burned-in ${BURN_EXPORT_RESOLUTION}`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="inline-flex items-center gap-1 text-xs"
              disabled={pending || anyProcessing || selectedCount === 0}
              onClick={() => render(true)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Re-render selected
            </Button>
          </div>

          <div className="mt-5 space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted">Exports</p>
            {ALL_LANGUAGES.filter((lang) => exportByLang.has(lang.code) || availableLangs.some((a) => a.code === lang.code)).map(
              (lang) => {
                const row = exportByLang.get(lang.code);
                const ready = row?.status === "ready" && !!row.storage_path;
                const failed = row?.status === "failed";
                return (
                  <div
                    key={lang.code}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">
                        {lang.label}{" "}
                        <span className="text-xs text-muted">
                          · {BURN_EXPORT_RESOLUTION} · {row ? statusLabel(row.status) : "—"}
                        </span>
                      </p>
                      {failed && row?.fail_reason ? (
                        <p className="text-xs text-red-500">{row.fail_reason}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {ready ? (
                        <Button
                          type="button"
                          variant="secondary"
                          className="inline-flex !min-h-7 items-center gap-1 !px-2 !text-[10px]"
                          disabled={downloadingLang === lang.code}
                          onClick={() => download(lang.code)}
                        >
                          {downloadingLang === lang.code ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Download
                        </Button>
                      ) : null}
                      {failed ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="!min-h-7 !px-2 !text-[10px]"
                          disabled={pending || anyProcessing}
                          onClick={() => {
                            setSelected([lang.code]);
                            render(true);
                          }}
                        >
                          Retry
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              },
            )}
          </div>

          {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
        </>
      )}
    </div>
  );
}
