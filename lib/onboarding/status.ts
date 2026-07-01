import "server-only";

import { getDbClient } from "@/lib/db/client";
import type { OnboardingPhase } from "@/lib/onboarding/constants";

export type OnboardingPageMeta = {
  episodeCount?: number;
  episodeSceneCount?: number;
};

async function getHasCompletedOnboarding(userId: string): Promise<boolean> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("has_completed_onboarding")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // Migration not applied yet — hide onboarding rather than break the app.
    if (error.message.includes("has_completed_onboarding")) {
      return true;
    }
    throw new Error(error.message);
  }

  return Boolean(data?.has_completed_onboarding);
}

async function getContentCounts(userId: string): Promise<{
  projectCount: number;
  seriesCount: number;
}> {
  const supabase = await getDbClient();

  const [projectsResult, seriesResult] = await Promise.all([
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId),
    supabase
      .from("series")
      .select("id, projects!inner(owner_id)", { count: "exact", head: true })
      .eq("projects.owner_id", userId),
  ]);

  if (projectsResult.error) throw new Error(projectsResult.error.message);
  if (seriesResult.error) throw new Error(seriesResult.error.message);

  return {
    projectCount: projectsResult.count ?? 0,
    seriesCount: seriesResult.count ?? 0,
  };
}

/** Whether to show onboarding for a specific phase (server-side only). */
export async function shouldShowOnboarding(
  userId: string,
  phase: OnboardingPhase,
  meta: OnboardingPageMeta = {},
): Promise<boolean> {
  if (await getHasCompletedOnboarding(userId)) {
    return false;
  }

  const counts = await getContentCounts(userId);

  switch (phase) {
    case "create-project":
      return counts.projectCount === 0 && counts.seriesCount === 0;
    case "create-series":
      return counts.projectCount > 0 && counts.seriesCount === 0;
    case "plan-episode":
      return counts.seriesCount > 0 && (meta.episodeCount ?? 0) === 0;
    case "studio-segments":
      return counts.seriesCount > 0 && (meta.episodeSceneCount ?? 0) === 0;
    default:
      return false;
  }
}
