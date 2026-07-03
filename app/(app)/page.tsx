import { HomeDashboard } from "@/components/home/HomeDashboard";
import { requireUser } from "@/lib/auth/getUser";
import { isAdmin } from "@/lib/auth/isAdmin";
import { getHomeDashboardData } from "@/lib/dashboard/home-data";

export default async function HomePage() {
  const user = await requireUser();
  const [data, userIsAdmin] = await Promise.all([
    getHomeDashboardData(user.id),
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
