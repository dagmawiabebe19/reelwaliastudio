import type { ScreenplayBreakdownProposal } from "@/lib/screenplay/analysis/types";

export function isNonEmptyScreenplayBreakdown(
  proposal: ScreenplayBreakdownProposal | null | undefined,
): proposal is ScreenplayBreakdownProposal {
  if (!proposal) return false;
  const hasCharacters = Array.isArray(proposal.characters) && proposal.characters.length > 0;
  const hasLocations = Array.isArray(proposal.locations) && proposal.locations.length > 0;
  const faithfulEpisodes = proposal.structures?.faithful?.episodes ?? [];
  const verticalEpisodes = proposal.structures?.vertical?.episodes ?? [];
  const hasEpisodes = faithfulEpisodes.length > 0 || verticalEpisodes.length > 0;
  return hasCharacters && hasLocations && hasEpisodes;
}

export function describeEmptyScreenplayBreakdown(
  proposal: ScreenplayBreakdownProposal | null | undefined,
): string {
  if (!proposal) return "Analysis returned no breakdown data.";
  const parts: string[] = [];
  if (!proposal.characters?.length) parts.push("characters");
  if (!proposal.locations?.length) parts.push("locations");
  const epCount =
    (proposal.structures?.faithful?.episodes?.length ?? 0) +
    (proposal.structures?.vertical?.episodes?.length ?? 0);
  if (epCount === 0) parts.push("episodes");
  return `Analysis produced an empty breakdown (missing ${parts.join(", ")}). Try again.`;
}
