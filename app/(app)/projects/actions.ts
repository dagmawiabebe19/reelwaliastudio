"use server";

import { revalidatePath } from "next/cache";
import { createProject } from "@/lib/db/projects";
import { createClient } from "@/lib/supabase/server";

export async function createProjectAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Project name is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  try {
    await createProject(user.id, name);
    revalidatePath("/projects");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create project." };
  }
}
