import { PageHeader } from "@/components/ui/PageHeader";
import { SeriesIndexList } from "@/components/series/SeriesIndexList";
import { getActiveUserId } from "@/lib/auth/getUser";
import { listAllSeries } from "@/lib/db/series";
import { shouldShowOnboarding } from "@/lib/onboarding/status";
import type { OnboardingPhase } from "@/lib/onboarding/constants";

export default async function SeriesIndexPage() {
  const userId = await getActiveUserId();
  const series = await listAllSeries();

  let onboardingPhase: OnboardingPhase | null = null;
  if (series.length === 0) {
    if (await shouldShowOnboarding(userId, "create-project")) {
      onboardingPhase = "create-project";
    } else if (await shouldShowOnboarding(userId, "create-series")) {
      onboardingPhase = "create-series";
    }
  }

  return (
    <section>
      <PageHeader
        title="Shorts"
        description="All serialized series — vertical 9:16 and landscape 16:9."
      />
      <SeriesIndexList series={series} onboardingPhase={onboardingPhase} />
    </section>
  );
}
