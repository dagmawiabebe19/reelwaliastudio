"use server";

import { revalidatePath } from "next/cache";
import { getActiveUserId } from "@/lib/auth/active-user";
import { createProject } from "@/lib/db/projects";

export async function createProjectAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Project name is required." };
  }

  try {
    await getActiveUserId();
    await createProject(name);
    revalidatePath("/projects");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create project." };
  }
}
