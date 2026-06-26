"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createProject } from "@/lib/db/projects";

export async function createProjectAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Project name is required." };
  }

  let project;
  try {
    project = await createProject(name);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create project." };
  }

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}
