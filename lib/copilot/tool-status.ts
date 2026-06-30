/**
 * Client-safe friendly labels for co-pilot tool activity (presentation only).
 */

export type ToolStatusIconKey =
  | "sparkles"
  | "image-plus"
  | "layout-grid"
  | "link"
  | "clapperboard"
  | "book-marked"
  | "map-pin"
  | "shirt"
  | "volume-2"
  | "library"
  | "loader"
  | "check";

export type ToolStatusContext = {
  ingredients?: Array<{ id: string; name: string }>;
};

export type FriendlyToolLabel = {
  message: string;
  icon: ToolStatusIconKey;
  failed?: boolean;
};

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function resolveCharacterName(
  characterId: string | undefined,
  ctx: ToolStatusContext,
  result?: Record<string, unknown> | null,
): string | null {
  const fromResult = str(result?.character_name);
  if (fromResult) return fromResult;
  if (characterId && ctx.ingredients?.length) {
    const match = ctx.ingredients.find((item) => item.id === characterId);
    if (match) return match.name;
  }
  return null;
}

function ingredientKind(args: Record<string, unknown> | null | undefined): string {
  return str(args?.kind) ?? "";
}

function isGenerating(args: Record<string, unknown> | null | undefined): boolean {
  return args?.generate === true;
}

function progressSuffix(step?: number, total?: number): string {
  if (step && total && total > 1) return ` (${step}/${total})`;
  return "";
}

/** Present-tense status while a tool is running. */
export function friendlyToolRunning(
  name: string,
  args: Record<string, unknown> | null | undefined,
  ctx: ToolStatusContext = {},
  options?: { step?: number; total?: number; detail?: string },
): FriendlyToolLabel {
  const stepSuffix = progressSuffix(options?.step, options?.total);
  const itemName = str(args?.name);
  const characterId = str(args?.character_id) ?? undefined;
  const character = resolveCharacterName(characterId, ctx);
  const kind = ingredientKind(args);

  switch (name) {
    case "add_ingredient": {
      if (kind === "outfit" && isGenerating(args)) {
        const costume = itemName ?? "costume";
        return character
          ? {
              message: `Designing ${character}'s ${costume}…${stepSuffix}`,
              icon: "shirt",
            }
          : { message: `Designing ${costume}…${stepSuffix}`, icon: "shirt" };
      }
      if (kind === "voice") {
        return {
          message: itemName ? `Setting up ${itemName}'s voice…${stepSuffix}` : `Setting up voice…${stepSuffix}`,
          icon: "volume-2",
        };
      }
      if (kind === "location" && isGenerating(args)) {
        return {
          message: itemName ? `Generating ${itemName}…${stepSuffix}` : `Generating location…${stepSuffix}`,
          icon: "map-pin",
        };
      }
      if (isGenerating(args)) {
        return {
          message: itemName ? `Generating ${itemName}…${stepSuffix}` : `Generating image…${stepSuffix}`,
          icon: "sparkles",
        };
      }
      return {
        message: itemName ? `Adding ${itemName} to library…${stepSuffix}` : `Adding to library…${stepSuffix}`,
        icon: "library",
      };
    }
    case "create_character_sheet": {
      const label = character ?? itemName ?? "character";
      return {
        message: `Building ${label}'s character sheet…${stepSuffix}`,
        icon: "layout-grid",
      };
    }
    case "bind_identity":
      return { message: `Binding references…${stepSuffix}`, icon: "link" };
    case "draft_storyboard":
      return {
        message: `Building segments…${stepSuffix}`,
        icon: "clapperboard",
      };
    case "update_series_memory":
      return { message: `Updating series notes…${stepSuffix}`, icon: "book-marked" };
    default:
      return { message: `Working…${stepSuffix}`, icon: "loader" };
  }
}

/** Past-tense label when a tool step completes. */
export function friendlyToolDone(
  name: string,
  args: Record<string, unknown> | null | undefined,
  result: Record<string, unknown> | null | undefined,
  ctx: ToolStatusContext = {},
): FriendlyToolLabel {
  const failed = Boolean(result?.error && typeof result.error === "string");
  const itemName = str(args?.name);
  const characterId = str(args?.character_id) ?? undefined;
  const character = resolveCharacterName(characterId, ctx, result);
  const kind = ingredientKind(args);

  if (failed) {
    return friendlyToolFailed(name, args, ctx);
  }

  switch (name) {
    case "add_ingredient": {
      if (kind === "outfit" && isGenerating(args)) {
        const costume = itemName ?? "costume";
        return character
          ? { message: `Designed ${character}'s ${costume}`, icon: "shirt" }
          : { message: `Designed ${costume}`, icon: "shirt" };
      }
      if (kind === "voice") {
        return {
          message: itemName ? `Set up ${itemName}'s voice` : "Set up voice",
          icon: "volume-2",
        };
      }
      if (isGenerating(args)) {
        return {
          message: itemName ? `Generated ${itemName}` : "Generated image",
          icon: kind === "location" ? "map-pin" : "sparkles",
        };
      }
      return {
        message: itemName ? `Added ${itemName}` : "Added to library",
        icon: "library",
      };
    }
    case "create_character_sheet": {
      const label = character ?? itemName ?? "Character";
      return { message: `Built ${label}'s character sheet`, icon: "layout-grid" };
    }
    case "bind_identity":
      return { message: "Bound references", icon: "link" };
    case "draft_storyboard": {
      const created = Array.isArray(result?.created) ? result.created.length : 0;
      const updated = Array.isArray(result?.updated) ? result.updated.length : 0;
      if (created || updated) {
        const parts: string[] = [];
        if (created) parts.push(`${created} segment${created === 1 ? "" : "s"}`);
        if (updated) parts.push(`${updated} update${updated === 1 ? "" : "s"}`);
        return { message: `Built ${parts.join(", ")}`, icon: "clapperboard" };
      }
      return { message: "Planned segments", icon: "clapperboard" };
    }
    case "update_series_memory":
      return { message: "Updated series notes", icon: "book-marked" };
    default:
      return { message: "Done", icon: "check" };
  }
}

function friendlyToolFailed(
  name: string,
  args: Record<string, unknown> | null | undefined,
  ctx: ToolStatusContext,
): FriendlyToolLabel {
  const itemName = str(args?.name);
  const character = resolveCharacterName(str(args?.character_id) ?? undefined, ctx);

  switch (name) {
    case "add_ingredient":
      return {
        message: itemName ? `Couldn't generate ${itemName}` : "Couldn't complete generation",
        icon: "sparkles",
        failed: true,
      };
    case "create_character_sheet":
      return {
        message: character
          ? `Couldn't build ${character}'s character sheet`
          : "Couldn't build character sheet",
        icon: "layout-grid",
        failed: true,
      };
    case "bind_identity":
      return { message: "Couldn't bind references", icon: "link", failed: true };
    case "draft_storyboard":
      return { message: "Couldn't build segments", icon: "clapperboard", failed: true };
    case "update_series_memory":
      return { message: "Couldn't update series notes", icon: "book-marked", failed: true };
    default:
      return { message: "Something went wrong", icon: "loader", failed: true };
  }
}

/** Infer running vs done for persisted history rows (no tool_status). */
export function inferToolStatus(
  message: {
    tool_status?: "running" | "done";
    tool_result?: Record<string, unknown> | null;
    role: string;
  },
): "running" | "done" {
  if (message.tool_status) return message.tool_status;
  if (message.role !== "tool") return "done";
  return "done";
}

/** Dev-style log line for optional details disclosure. */
export function formatToolDebugLine(
  name: string | null | undefined,
  content: string,
  args?: Record<string, unknown> | null,
  result?: Record<string, unknown> | null,
): string {
  const lines = [`Tool: ${name ?? "unknown"}`, `Log: ${content}`];
  if (args && Object.keys(args).length) {
    lines.push(`Input: ${JSON.stringify(args, null, 2)}`);
  }
  if (result && Object.keys(result).length) {
    lines.push(`Result: ${JSON.stringify(result, null, 2)}`);
  }
  return lines.join("\n\n");
}
