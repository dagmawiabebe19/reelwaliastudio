import "server-only";

import { getActiveUserId } from "@/lib/auth/getUser";
import { getDbClient } from "@/lib/db/client";
import type { Project, TablesInsert } from "@/lib/db/database.types";

export async function listProjects(): Promise<Project[]> {
  const supabase = await getDbClient();
  const ownerId = await getActiveUserId();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getProject(id: string): Promise<Project | null> {
  const supabase = await getDbClient();
  const ownerId = await getActiveUserId();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function createProject(name: string): Promise<Project> {
  const supabase = await getDbClient();
  const ownerId = await getActiveUserId();
  const payload: TablesInsert<"projects"> = { owner_id: ownerId, name };

  const { data, error } = await supabase.from("projects").insert(payload).select().single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateProject(id: string, name: string): Promise<Project> {
  const supabase = await getDbClient();
  const ownerId = await getActiveUserId();
  const { data, error } = await supabase
    .from("projects")
    .update({ name })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  const supabase = await getDbClient();
  const ownerId = await getActiveUserId();
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId);

  if (error) throw new Error(error.message);
}
