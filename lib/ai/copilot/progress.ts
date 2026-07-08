/** Client-safe tool summary formatters for co-pilot session log. */

export function formatToolRunningLabel(name: string, detail?: string): string {
  const base = toolDisplayName(name);
  return detail ? `${base} — ${detail}` : `${base} — running…`;
}

export function formatToolDoneSummary(name: string, result: Record<string, unknown>): string {
  if (result.error && typeof result.error === "string") {
    return `${toolDisplayName(name)} — failed: ${result.error}`;
  }

  switch (name) {
    case "draft_storyboard": {
      const created = Array.isArray(result.created) ? result.created.length : 0;
      const updated = Array.isArray(result.updated) ? result.updated.length : 0;
      const locked = Number(result.fully_locked_count ?? 0);
      const total = Number(result.segment_count ?? created + updated);
      const parts: string[] = [];
      if (created) parts.push(`Built ${created} segment${created === 1 ? "" : "s"}`);
      if (updated) parts.push(`Updated ${updated} scene${updated === 1 ? "" : "s"}`);
      if (total) parts.push(`${locked}/${total} fully locked`);
      return parts.length
        ? `${toolDisplayName(name)} — ${parts.join(", ")} — output LOCK REPORT`
        : `${toolDisplayName(name)} — no scenes changed`;
    }
    case "add_ingredient": {
      const ref = result.ref_tag ? String(result.ref_tag) : "";
      const generating = result.generating === true;
      if (generating && result.status === "ready") {
        return `Added ${ref} — image ready`;
      }
      if (generating) {
        return `Added ${ref} — generation queued (poll library for status)`;
      }
      return `Added ingredient ${ref || ""}`.trim();
    }
    case "bind_identity": {
      const sheets = Number(result.bound_sheets ?? 0);
      const ings = Number(result.bound_ingredients ?? 0);
      const parts: string[] = [];
      if (sheets) parts.push(`${sheets} sheet${sheets === 1 ? "" : "s"}`);
      if (ings) parts.push(`${ings} ingredient${ings === 1 ? "" : "s"}`);
      return parts.length
        ? `Bound ${parts.join(" + ")}`
        : "No bindings applied";
    }
    case "create_character_sheet": {
      if (result.error && typeof result.error === "string") {
        return `Character sheet — failed: ${result.error}`;
      }
      const label = result.character_name ? String(result.character_name) : "Character";
      return result.status === "ready"
        ? `Generated 5-angle sheet for ${label} — ready`
        : `Character sheet for ${label} — ${result.status ?? "pending"}`;
    }
    case "update_series_memory": {
      const entry = result.entry ? String(result.entry) : "entry";
      const section = result.section === "world" ? "world" : "preferences";
      return `Saved to series memory (${section}): ${entry.slice(0, 80)}${entry.length > 80 ? "…" : ""}`;
    }
    case "update_episode_summary": {
      if (result.skipped === "debounced") {
        return "Episode summary — already fresh";
      }
      const chars = result.summary_markdown ? String(result.summary_markdown).length : 0;
      return result.updated
        ? `Episode summary refreshed (${chars} chars)`
        : "Episode summary — unchanged";
    }
    case "get_screenplay_scenes": {
      const count = Array.isArray(result.scenes) ? result.scenes.length : 0;
      return `Loaded ${count} screenplay scene${count === 1 ? "" : "s"}`;
    }
    default:
      return `${toolDisplayName(name)} — done`;
  }
}

function toolDisplayName(name: string): string {
  switch (name) {
    case "draft_storyboard":
      return "draft_storyboard";
    case "add_ingredient":
      return "add_ingredient";
    case "bind_identity":
      return "bind_identity";
    case "create_character_sheet":
      return "create_character_sheet";
    case "update_series_memory":
      return "update_series_memory";
    case "update_episode_summary":
      return "update_episode_summary";
    case "get_screenplay_scenes":
      return "get_screenplay_scenes";
    default:
      return name;
  }
}
