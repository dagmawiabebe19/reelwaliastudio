import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { getOrCreateChatSession, listChatMessages } from "@/lib/db/chat";
import { getEpisode, updateEpisodeSummary } from "@/lib/db/episodes";
import { listScenesByEpisode } from "@/lib/db/scenes";
import { getSeries } from "@/lib/db/series";
import {
  copilotTurnCreditsFromUsage,
  estimateEpisodeSummaryCredits,
} from "@/lib/credits/pricing";
import { withCredits } from "@/lib/credits/meter";

export const PRIOR_EPISODE_SUMMARY_LIMIT = 10;
export const EPISODE_SUMMARY_DEBOUNCE_MS = 45_000;
export const EPISODE_SUMMARY_MODEL = "claude-haiku-4-5-20251001" as const;

export const MEANINGFUL_EPISODE_SUMMARY_TOOLS = new Set([
  "draft_storyboard",
  "bind_identity",
  "update_series_memory",
  "update_episode_summary",
]);

const SUMMARY_SYSTEM = `You maintain short episode continuity summaries for a serialized video series.

Write markdown only:
- One heading with the episode title
- 3–8 bullet points: plot beats, character emotional/state changes, established looks/props/locations, binding decisions later episodes must honor
- Max ~350 words total — NOT a transcript

If an existing summary is provided, merge new facts and condense so the result stays short. Drop stale beats superseded by rewrites.`;

function formatEpisodeLabel(sortOrder: number, title: string): string {
  const epNum = String(sortOrder + 1).padStart(2, "0");
  return `EP_${epNum}: ${title}`;
}

function buildSummaryUserPrompt(input: {
  seriesTitle: string;
  episodeLabel: string;
  logline: string | null;
  segments: Array<{ title: string; prompt: string | null; act_label: string | null }>;
  existingSummary: string | null;
  recentDecisions: string[];
  turnNotes?: string[];
}): string {
  const segmentsBlock =
    input.segments.length > 0
      ? input.segments
          .map(
            (s, i) =>
              `${i + 1}. ${s.title}${s.act_label ? ` (${s.act_label})` : ""}\n${s.prompt ?? "(no prompt)"}`,
          )
          .join("\n\n")
      : "(no segments yet)";

  const decisions =
    [...(input.turnNotes ?? []), ...input.recentDecisions].filter(Boolean).slice(-12).join("\n") ||
    "(none)";

  return `Series: ${input.seriesTitle}
Episode: ${input.episodeLabel}
Logline: ${input.logline?.trim() || "(none)"}

## Storyboard segments
${segmentsBlock}

## Recent co-pilot decisions (this session)
${decisions}

## Existing summary (merge + condense)
${input.existingSummary?.trim() || "(none — write fresh)"}`;
}

async function collectRecentDecisions(episodeId: string): Promise<string[]> {
  const session = await getOrCreateChatSession("episode", episodeId);
  const messages = await listChatMessages(session.id);
  return messages
    .filter((m) => m.role === "tool" || m.role === "assistant")
    .slice(-24)
    .map((m) => {
      if (m.role === "tool" && m.tool_name) {
        return `[${m.tool_name}] ${m.content}`.trim();
      }
      const text = m.content.trim();
      return text.length > 400 ? `${text.slice(0, 400)}…` : text;
    })
    .filter(Boolean);
}

export async function generateAndStoreEpisodeSummary(input: {
  episodeId: string;
  userId: string;
  turnNotes?: string[];
  force?: boolean;
}): Promise<{ updated: boolean; summary_markdown: string | null; skipped?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { updated: false, summary_markdown: null, skipped: "no_api_key" };
  }

  const episode = await getEpisode(input.episodeId);
  if (!episode) {
    return { updated: false, summary_markdown: null, skipped: "episode_not_found" };
  }

  if (
    !input.force &&
    episode.summary_markdown?.trim() &&
    episode.updated_at &&
    Date.now() - new Date(episode.updated_at).getTime() < EPISODE_SUMMARY_DEBOUNCE_MS
  ) {
    return {
      updated: false,
      summary_markdown: episode.summary_markdown,
      skipped: "debounced",
    };
  }

  const [series, scenes, recentDecisions] = await Promise.all([
    getSeries(episode.series_id),
    listScenesByEpisode(input.episodeId),
    collectRecentDecisions(input.episodeId),
  ]);

  if (!series) {
    return { updated: false, summary_markdown: null, skipped: "series_not_found" };
  }

  const episodeLabel = formatEpisodeLabel(episode.sort_order, episode.title);
  const userPrompt = buildSummaryUserPrompt({
    seriesTitle: series.title,
    episodeLabel,
    logline: episode.logline,
    segments: scenes.map((s) => ({
      title: s.title,
      prompt: s.prompt,
      act_label: s.act_label,
    })),
    existingSummary: episode.summary_markdown,
    recentDecisions,
    turnNotes: input.turnNotes,
  });

  const estimate = estimateEpisodeSummaryCredits();

  const summary = await withCredits(
    input.userId,
    estimate,
    `episode-summary:${input.episodeId}`,
    async () => {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: EPISODE_SUMMARY_MODEL,
        max_tokens: 700,
        system: SUMMARY_SYSTEM,
        messages: [{ role: "user", content: userPrompt }],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();

      if (!text) {
        throw new Error("Episode summary generation returned empty text.");
      }

      const actualCredits = copilotTurnCreditsFromUsage(EPISODE_SUMMARY_MODEL, response.usage);
      return { result: text, actualCredits: Math.max(1, actualCredits) };
    },
    { episodeId: input.episodeId },
  );

  const updated = await updateEpisodeSummary(input.episodeId, summary);
  console.log("[episode-summary]", {
    episodeId: input.episodeId,
    chars: summary.length,
    forced: input.force === true,
  });

  return { updated: true, summary_markdown: updated.summary_markdown };
}

/** Fire-and-forget refresh after build passes or meaningful co-pilot turns. */
export function scheduleEpisodeSummaryRefresh(input: {
  episodeId: string;
  userId: string;
  turnNotes?: string[];
  force?: boolean;
}): void {
  after(async () => {
    try {
      await generateAndStoreEpisodeSummary(input);
    } catch (error) {
      console.error("[episode-summary] background refresh failed", {
        episodeId: input.episodeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export function formatPriorEpisodeSummariesBlock(
  summaries: Array<{ sort_order: number; title: string; summary_markdown: string }>,
): string {
  if (!summaries.length) {
    return "(no prior episodes summarized yet)";
  }

  return summaries
    .map((ep) => {
      const label = formatEpisodeLabel(ep.sort_order, ep.title);
      return `### ${label}\n${ep.summary_markdown.trim()}`;
    })
    .join("\n\n");
}
