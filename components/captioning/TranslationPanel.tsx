"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerateLanguageAction } from "@/app/(app)/captioning/actions";
import { ALL_LANGUAGES } from "@/lib/captioning/languages";
import { SOURCE_LANG } from "@/lib/captioning/types";
import { Button } from "@/components/ui/Button";
import type { CaptionTranslationRow } from "@/lib/db/captioning";

interface TranslationPanelProps {
  jobId: string;
  englishApproved: boolean;
  translations: CaptionTranslationRow[];
}

const STATUS_COPY: Record<string, string> = {
  pending: "Queued",
  translating: "Translating…",
  ready: "Ready",
  failed: "Failed",
};

export function TranslationPanel({
  jobId,
  englishApproved,
  translations,
}: TranslationPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!englishApproved) {
    return (
      <p className="text-sm text-muted">
        Approve English first — we translate from your reviewed cues, not the raw Whisper output.
      </p>
    );
  }

  const byLang = new Map(translations.map((t) => [t.lang, t]));

  function regenerate(lang: string) {
    startTransition(async () => {
      await regenerateLanguageAction(jobId, lang);
      router.refresh();
    });
  }

  return (
    <div className="studio-card p-4">
      <h3 className="font-display text-base text-foreground">Translations</h3>
      <ul className="mt-3 divide-y divide-border">
        {ALL_LANGUAGES.filter((l) => l.code !== SOURCE_LANG).map((lang) => {
          const row = byLang.get(lang.code);
          const status = row?.status ?? "pending";
          return (
            <li key={lang.code} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-[140px]">
                <p className="text-sm font-medium text-foreground">{lang.label}</p>
                <p className="text-xs text-muted">{lang.nativeName}</p>
              </div>
              <span
                className={`text-xs font-medium ${
                  status === "ready"
                    ? "text-green-600"
                    : status === "failed"
                      ? "text-red-500"
                      : "text-muted"
                }`}
              >
                {STATUS_COPY[status] ?? status}
              </span>
              {row?.fail_reason ? (
                <span className="text-xs text-red-500">{row.fail_reason}</span>
              ) : null}
              <div className="ml-auto flex gap-2">
                {status === "ready" ? (
                  <a
                    href={`/api/captioning/${jobId}/download?lang=${lang.code}`}
                    className="studio-btn studio-btn-ghost text-xs"
                  >
                    Download .vtt
                  </a>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  disabled={pending || status === "translating"}
                  onClick={() => regenerate(lang.code)}
                >
                  Regenerate
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
