import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import {
  runWithConcurrencySettled,
  SETUP_GENERATION_CONCURRENCY,
} from "@/lib/ai/generation/concurrency";

/** Wave 0: metered image generation. Wave 1: free/metadata. Wave 2: binding/storyboard (needs ready refs). */
export type CopilotToolWave = 0 | 1 | 2;

export function isMeteredGenerationTool(name: string, args: Record<string, unknown>): boolean {
  if (name === "create_character_sheet") return true;
  if (name === "add_ingredient") return args.generate === true;
  return false;
}

export function copilotToolWave(name: string, args: Record<string, unknown>): CopilotToolWave {
  if (isMeteredGenerationTool(name, args)) return 0;
  if (name === "bind_identity" || name === "draft_storyboard") return 2;
  return 1;
}

export function groupCopilotToolsByWave(
  tools: Anthropic.ToolUseBlock[],
): Map<CopilotToolWave, Anthropic.ToolUseBlock[]> {
  const groups = new Map<CopilotToolWave, Anthropic.ToolUseBlock[]>();
  for (const tool of tools) {
    const args = tool.input as Record<string, unknown>;
    const wave = copilotToolWave(tool.name, args);
    const list = groups.get(wave) ?? [];
    list.push(tool);
    groups.set(wave, list);
  }
  return groups;
}

export const SETUP_WAVE_ORDER: CopilotToolWave[] = [0, 1, 2];

/** Run independent setup tools concurrently within a wave (allSettled semantics). */
export async function runCopilotToolWave<T>(
  tools: Anthropic.ToolUseBlock[],
  limit: number,
  runner: (tool: Anthropic.ToolUseBlock) => Promise<T>,
): Promise<Array<{ tool: Anthropic.ToolUseBlock; result: T | null; error: unknown | null }>> {
  const settled = await runWithConcurrencySettled(tools, limit, async (tool) => runner(tool));

  return tools.map((tool, index) => {
    const outcome = settled[index];
    if (outcome.status === "fulfilled") {
      return { tool, result: outcome.value, error: null };
    }
    return { tool, result: null, error: outcome.reason };
  });
}

export { SETUP_GENERATION_CONCURRENCY };

/** Respect prerequisites: headshots before costume edits; costumes before costumed sheets. */
export function splitGenerationSubWaves(
  tools: Anthropic.ToolUseBlock[],
): Anthropic.ToolUseBlock[][] {
  const pass1: Anthropic.ToolUseBlock[] = [];
  const pass2: Anthropic.ToolUseBlock[] = [];
  const pass3: Anthropic.ToolUseBlock[] = [];

  for (const tool of tools) {
    const args = tool.input as Record<string, unknown>;
    if (tool.name === "create_character_sheet") {
      pass3.push(tool);
    } else if (tool.name === "add_ingredient" && args.generate === true && args.kind === "outfit") {
      pass2.push(tool);
    } else {
      pass1.push(tool);
    }
  }

  return [pass1, pass2, pass3].filter((pass) => pass.length > 0);
}
