"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProject } from "@/lib/db/projects";
import { createSeries, slugifyTitle } from "@/lib/db/series";

export async function createSeriesAction(projectId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    return { error: "Series title is required." };
  }

  const project = await getProject(projectId);
  if (!project) {
    return { error: "Project not found." };
  }

  const slugInput = String(formData.get("slug") ?? "").trim();
  const slug = slugInput || slugifyTitle(title);
  if (!slug) {
    return { error: "Could not generate a valid slug." };
  }

  let series;
  try {
    series = await createSeries(projectId, { title, slug });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create series." };
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/series");
  redirect(`/series/${series.id}`);
}
