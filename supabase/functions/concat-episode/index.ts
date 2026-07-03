// Supabase Edge Function: concat-episode
// Deploy with: supabase functions deploy concat-episode
// Requires ffmpeg in the Deno environment or an external transcoding service.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function userOwnsEpisode(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  episodeId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("episodes")
    .select("id, series!inner(id, projects!inner(owner_id))")
    .eq("id", episodeId)
    .eq("series.projects.owner_id", userId)
    .maybeSingle();

  return !error && Boolean(data);
}

function jwtRole(authHeader: string): string | null {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(JSON.stringify({ error: "Supabase env not configured." }), {
        status: 500,
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { episode_id, series_id, take_paths, orientation } = await req.json();

    if (!episode_id || !take_paths?.length) {
      return new Response(JSON.stringify({ error: "episode_id and take_paths required." }), {
        status: 400,
      });
    }

    const role = jwtRole(authHeader);
    if (role !== "service_role") {
      const ownsEpisode = await userOwnsEpisode(userClient, user.id, episode_id);
      if (!ownsEpisode) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
      }
    }

    void series_id;
    void orientation;

    // TODO: Wire ffmpeg concat when runtime supports it.
    // For now return a clear not-configured response so callers can fall back.
    return new Response(
      JSON.stringify({
        error:
          "concat-episode edge function: ffmpeg concat not wired yet. Server-side fallback will be used.",
        episode_id,
        take_count: take_paths.length,
      }),
      { status: 501, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "concat failed" }),
      { status: 500 },
    );
  }
});
