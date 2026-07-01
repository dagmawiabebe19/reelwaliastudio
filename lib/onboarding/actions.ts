"use server";

import { revalidatePath } from "next/cache";
import { getActiveUserId } from "@/lib/auth/getUser";
import { getDbClient } from "@/lib/db/client";

/** Mark first-run guidance complete — persists on profile (all devices). */
export async function completeOnboardingAction(): Promise<{ ok: true } | { error: string }> {
  let userId: string;
  try {
    userId = await getActiveUserId();
  } catch {
    return { error: "Not authenticated." };
  }

  const supabase = await getDbClient();
  const { error } = await supabase
    .from("profiles")
    .update({ has_completed_onboarding: true, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    if (error.message.includes("has_completed_onboarding")) {
      return { error: "Onboarding migration not applied yet (015_profile_onboarding)." };
    }
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
