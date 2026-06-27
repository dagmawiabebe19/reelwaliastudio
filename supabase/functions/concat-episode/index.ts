// Supabase Edge Function: concat-episode
// Deploy with: supabase functions deploy concat-episode
// Requires ffmpeg in the Deno environment or an external transcoding service.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const { episode_id, series_id, take_paths, orientation } = await req.json();

    if (!episode_id || !take_paths?.length) {
      return new Response(JSON.stringify({ error: "episode_id and take_paths required." }), {
        status: 400,
      });
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
