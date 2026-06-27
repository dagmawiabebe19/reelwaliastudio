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
      const parts: string[] = [];
      if (created) parts.push(`Created ${created} scene${created === 1 ? "" : "s"}`);
      if (updated) parts.push(`Updated ${updated} scene${updated === 1 ? "" : "s"}`);
      return parts.length
        ? `${toolDisplayName(name)} — ${parts.join(", ")}`
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
    case "generate_take": {
      const ids = Array.isArray(result.take_ids) ? result.take_ids.length : 0;
      const ready = Number(result.ready_count ?? 0);
      const failed = Number(result.failed_count ?? 0);
      if (ready > 0 && failed === 0) {
        return `Generated ${ready} take${ready === 1 ? "" : "s"} — ready`;
      }
      if (failed > 0) {
        return `Takes: ${ready} ready, ${failed} failed`;
      }
      return ids
        ? `Queued ${ids} take${ids === 1 ? "" : "s"} — generating`
        : "Take generation started";
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
    case "generate_take":
      return "generate_take";
    default:
      return name;
  }
}
