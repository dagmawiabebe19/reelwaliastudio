import { HomeDashboard } from "@/components/home/HomeDashboard";
import { requireUser } from "@/lib/auth/getUser";
import { isAdmin } from "@/lib/auth/isAdmin";
import { getHomeDashboardData } from "@/lib/dashboard/home-data";
import type { HomeDashboardData } from "@/lib/dashboard/home-data";

const EMPTY_HOME: HomeDashboardData = {
  recentEpisodes: [],
  generatingTakes: [],
  balance: { available: 0, reserved: 0 },
};

export default async function HomePage() {
  const user = await requireUser();
  const [data, userIsAdmin] = await Promise.all([
    getHomeDashboardData(user.id).catch((error) => {
      console.error("[home-page] dashboard load failed", {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return EMPTY_HOME;
    }),
    isAdmin(user.id),
  ]);

  return (
    <HomeDashboard
      recentEpisodes={data.recentEpisodes}
      generatingTakes={data.generatingTakes}
      balance={data.balance}
      isAdmin={userIsAdmin}
    />
  );
}
