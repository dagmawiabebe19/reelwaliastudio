import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import {
  copilotTurnCreditsFromUsage,
  estimateScreenplayAnalysisCredits,
} from "@/lib/credits/pricing";
import { withCredits } from "@/lib/credits/meter";
import {
  getScreenplayById,
  listScreenplayScenes,
  setScreenplayAnalysisFailed,
  setScreenplayAnalysisProposed,
  setScreenplayAnalysisStarted,
  updateScreenplaySceneSynopses,
} from "@/lib/db/screenplays";
import {
  mapScreenplayChunk,
  SCREENPLAY_MAP_CHUNK_SIZE,
  SCREENPLAY_MAP_MODEL,
} from "@/lib/screenplay/analysis/map-chunk";
import {
  reduceScreenplayBreakdown,
  SCREENPLAY_REDUCE_MODEL,
} from "@/lib/screenplay/analysis/reduce";
import type { MapChunkSceneResult, ScreenplayBreakdownProposal } from "@/lib/screenplay/analysis/types";
import { mergeAnthropicUsage } from "@/lib/screenplay/analysis/usage";
import type { AnthropicUsageLike } from "@/lib/credits/pricing";

export async function runScreenplayAnalysis(input: {
  screenplayId: string;
  userId: string;
}): Promise<ScreenplayBreakdownProposal> {
  const screenplay = await getScreenplayById(input.screenplayId);
  if (!screenplay) throw new Error("Screenplay not found.");
  if (screenplay.status !== "parsed") {
    throw new Error("Screenplay must be parsed before analysis.");
  }
  if (screenplay.analysis_status === "analyzing") {
    throw new Error("Analysis already in progress.");
  }

  const scenes = await listScreenplayScenes(input.screenplayId);
  if (scenes.length === 0) {
    throw new Error("No parsed scenes to analyze.");
  }

  const estimate = estimateScreenplayAnalysisCredits(scenes.length);
  const reference = `screenplay-analysis:${input.screenplayId}`;

  return withCredits(
    input.userId,
    estimate,
    reference,
    async () => {
      await setScreenplayAnalysisStarted(input.screenplayId);

      const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
      if (!apiKey) {
        throw new Error("Screenplay analysis is not configured.");
      }

      const client = new Anthropic({ apiKey });
      let mapUsage: AnthropicUsageLike | null = null;
      const mapNotes: MapChunkSceneResult[] = [];
      const synopsisUpdates: Array<{ sortOrder: number; synopsis: string }> = [];

      try {
        for (let i = 0; i < scenes.length; i += SCREENPLAY_MAP_CHUNK_SIZE) {
          const chunk = scenes.slice(i, i + SCREENPLAY_MAP_CHUNK_SIZE);
          const { result, usage } = await mapScreenplayChunk({ client, scenes: chunk });
          mapUsage = mapUsage ? mergeAnthropicUsage(mapUsage, usage) : usage;

          for (const scene of result.scenes) {
            mapNotes.push(scene);
            if (scene.synopsis?.trim()) {
              synopsisUpdates.push({
                sortOrder: scene.sort_order,
                synopsis: scene.synopsis.trim(),
              });
            }
          }
        }

        if (synopsisUpdates.length > 0) {
          await updateScreenplaySceneSynopses(input.screenplayId, synopsisUpdates);
        }

        const enrichedScenes = scenes.map((scene) => ({
          ...scene,
          synopsis:
            synopsisUpdates.find((s) => s.sortOrder === scene.sort_order)?.synopsis ??
            scene.synopsis,
        }));

        const { proposal, usage: reduceUsage } = await reduceScreenplayBreakdown({
          client,
          title: screenplay.title,
          scenes: enrichedScenes,
          mapNotes,
        });

        await setScreenplayAnalysisProposed(input.screenplayId, proposal);

        const mapCredits = copilotTurnCreditsFromUsage(SCREENPLAY_MAP_MODEL, mapUsage ?? {});
        const reduceCredits = copilotTurnCreditsFromUsage(SCREENPLAY_REDUCE_MODEL, reduceUsage);
        const actualCredits = Math.max(1, mapCredits + reduceCredits);

        console.log("[screenplay-analysis] completed", {
          screenplayId: input.screenplayId,
          sceneCount: scenes.length,
          chunks: Math.ceil(scenes.length / SCREENPLAY_MAP_CHUNK_SIZE),
          characters: proposal.characters.length,
          locations: proposal.locations.length,
          credits: actualCredits,
        });

        return { result: proposal, actualCredits };
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "Screenplay analysis failed.";
        await setScreenplayAnalysisFailed(input.screenplayId, reason);
        throw error;
      }
    },
    { screenplayId: input.screenplayId, sceneCount: scenes.length },
  );
}
