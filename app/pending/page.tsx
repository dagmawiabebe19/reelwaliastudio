import { redirect } from "next/navigation";
import { PendingScreen } from "@/components/auth/PendingScreen";
import { getUserApprovalProfile } from "@/lib/auth/requireApprovedAppAccess";
import { isOwnerAccount } from "@/lib/auth/approval";
import { isAdmin } from "@/lib/auth/isAdmin";
import { getSessionUser } from "@/lib/auth/getUser";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  if (isOwnerAccount(user)) {
    redirect("/");
  }

  try {
    if (await isAdmin(user.id)) {
      redirect("/");
    }
    const profile = await getUserApprovalProfile(user.id);
    if (profile.isAdmin || profile.approvalStatus === "approved") {
      redirect("/");
    }
    return (
      <PendingScreen
        email={user.email}
        status={profile.approvalStatus === "rejected" ? "rejected" : "pending"}
      />
    );
  } catch {
    return <PendingScreen email={user.email} status="pending" />;
  }
}
