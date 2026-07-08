import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { withCredits } from "@/lib/credits/meter";
import {
  copilotTurnCreditsFromUsage,
  estimateTranslationCreditsPerLanguage,
  TRANSLATION_MODEL,
} from "@/lib/credits/pricing";
import type { AnthropicUsageLike } from "@/lib/credits/pricing";
import type { ServiceDbClient } from "@/lib/db/service-client";
import {
  claimTranslation,
  cueRowsToCues,
  getCuesForService,
  getJobForService,
  replaceCuesWith,
  setJobStatus,
  upsertTranslationStatus,
} from "@/lib/db/captioning";
import { getLanguage, TARGET_LANGUAGE_CODES } from "@/lib/captioning/languages";
import { uploadVttForLanguage } from "@/lib/captioning/export";
import { SOURCE_LANG, type CaptionCue } from "@/lib/captioning/types";
import { mergeAnthropicUsage } from "@/lib/screenplay/analysis/usage";

const CHUNK_SIZE = 40;

function buildSystemPrompt(languageLabel: string, nativeName: string): string {
  return `You are a professional subtitle translator. Translate English subtitle cues into ${languageLabel} (${nativeName}).

Return ONLY valid JSON (no markdown fences): an array of objects { "i": <cue index>, "t": "<translation>" }, one per input cue, same indices, same order, same count.

Rules:
- Natural, spoken subtitle tone — how a person actually talks, not literal word-for-word.
- Keep each cue concise enough to read on screen in the same time; do not merge or split cues.
- Preserve the meaning and emotional beat of each cue independently.
- Use the correct native script for ${languageLabel} (e.g. proper Ethiopic, Han, Hangul, Kana, Cyrillic, or Arabic characters) — never transliterate into Latin letters.
- Keep character names consistent across cues; keep proper nouns as-is unless the language has a standard localized form.
- Do not add notes, quotes around the whole array, or any text outside the JSON.`;
}

function parseTranslationJson(text: string, count: number): string[] {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("[")
    ? trimmed
    : trimmed.slice(trimmed.indexOf("["), trimmed.lastIndexOf("]") + 1);
  const parsed = JSON.parse(jsonText) as Array<{ i: number; t: string }>;

  const byIndex = new Map<number, string>();
  for (const item of parsed) {
    if (typeof item?.i === "number" && typeof item?.t === "string") {
      byIndex.set(item.i, item.t);
    }
  }

  const out: string[] = [];
  for (let i = 0; i < count; i += 1) out.push(byIndex.get(i) ?? "");
  return out;
}

/** Translate every English cue into one target language (chunked). */
export async function translateCues(input: {
  client: Anthropic;
  langCode: string;
  englishCues: CaptionCue[];
}): Promise<{ cues: CaptionCue[]; usage: AnthropicUsageLike }> {
  const language = getLanguage(input.langCode);
  if (!language) throw new Error(`Unsupported language: ${input.langCode}`);

  const system = buildSystemPrompt(language.label, language.nativeName);
  const translated: CaptionCue[] = [];
  let usage: AnthropicUsageLike | null = null;

  for (let i = 0; i < input.englishCues.length; i += CHUNK_SIZE) {
    const chunk = input.englishCues.slice(i, i + CHUNK_SIZE);
    const payload = chunk.map((cue, idx) => ({ i: idx, text: cue.text }));

    const response = await input.client.messages.create({
      model: TRANSLATION_MODEL,
      max_tokens: 4096,
      system,
      messages: [
        {
          role: "user",
          content: `Translate these ${chunk.length} cues:\n${JSON.stringify(payload)}`,
        },
      ],
    });

    usage = usage ? mergeAnthropicUsage(usage, response.usage) : response.usage;

    const textOut = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const translations = parseTranslationJson(textOut, chunk.length);
    chunk.forEach((cue, idx) => {
      translated.push({
        cueIndex: cue.cueIndex,
        startMs: cue.startMs,
        endMs: cue.endMs,
        text: translations[idx]?.trim() || cue.text,
      });
    });
  }

  return { cues: translated, usage: usage ?? {} };
}

export type TranslationOutcome =
  | { status: "ready"; lang: string; cueCount: number }
  | { status: "failed"; lang: string; reason: string }
  | { status: "skipped"; lang: string };

/** Metered translation of one language for a job (background, service-role). */
export async function runTranslation(input: {
  jobId: string;
  lang: string;
  db: ServiceDbClient;
}): Promise<TranslationOutcome> {
  const claimed = await claimTranslation(input.db, input.jobId, input.lang);
  if (!claimed) return { status: "skipped", lang: input.lang };

  const job = await getJobForService(input.db, input.jobId);
  if (!job) return { status: "skipped", lang: input.lang };

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    await upsertTranslationStatus(input.db, input.jobId, input.lang, "failed", "Translation is not configured.");
    return { status: "failed", lang: input.lang, reason: "Translation is not configured." };
  }

  const englishRows = await getCuesForService(input.db, input.jobId, SOURCE_LANG);
  const englishCues = cueRowsToCues(englishRows);
  if (englishCues.length === 0) {
    await upsertTranslationStatus(input.db, input.jobId, input.lang, "failed", "No English cues to translate.");
    return { status: "failed", lang: input.lang, reason: "No English cues to translate." };
  }

  const estimate = estimateTranslationCreditsPerLanguage(englishCues.length);

  try {
    const cueCount = await withCredits(
      job.owner_id,
      estimate,
      `caption-translate:${input.jobId}:${input.lang}`,
      async () => {
        const client = new Anthropic({ apiKey });
        const { cues, usage } = await translateCues({
          client,
          langCode: input.lang,
          englishCues,
        });

        await replaceCuesWith(input.db, input.jobId, input.lang, cues);
        await upsertTranslationStatus(input.db, input.jobId, input.lang, "ready");
        await uploadVttForLanguage(input.db, {
          ownerId: job.owner_id,
          jobId: input.jobId,
          lang: input.lang,
        });

        const actualCredits = Math.max(1, copilotTurnCreditsFromUsage(TRANSLATION_MODEL, usage));
        return { result: cues.length, actualCredits };
      },
      { jobId: input.jobId, lang: input.lang, kind: "translation" },
      { db: input.db },
    );

    return { status: "ready", lang: input.lang, cueCount };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Translation failed.";
    await upsertTranslationStatus(input.db, input.jobId, input.lang, "failed", reason);
    return { status: "failed", lang: input.lang, reason };
  }
}

/** Run selected languages sequentially, then mark the job ready. */
export async function runTranslationsForJob(input: {
  jobId: string;
  langs: string[];
  db: ServiceDbClient;
}): Promise<void> {
  const langs = input.langs.filter((l) => TARGET_LANGUAGE_CODES.includes(l));
  for (const lang of langs) {
    await runTranslation({ jobId: input.jobId, lang, db: input.db });
  }

  // Job is ready once at least one translation exists; per-language failures are
  // visible individually and can be regenerated without blocking the rest.
  const job = await getJobForService(input.db, input.jobId);
  if (job && job.status !== "failed") {
    await setJobStatus(input.db, input.jobId, "ready");
  }
}
