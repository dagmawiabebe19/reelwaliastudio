---
# ReelWalia Studio — Product & Engineering Context

## What this is
Internal production tool to build serialized AI shows (vertical 9:16 AND horizontal 16:9).
A SERIES is made of EPISODES, made of SCENES (segments). Each scene generates one or more
TAKES (image or video). Series share a library of INGREDIENTS (characters, voices, outfits,
locations, reference media). Episodes have their own AUDIO LINES. A co-pilot (Claude via
Anthropic API, tool-use) drafts storyboards and edits the sheet. The tool ships EMPTY — the
user creates all series and content inside it.

## Hard requirements
- Every series and scene supports BOTH orientations: portrait 9:16 and landscape 16:9.
  Orientation is a first-class DB field. series.default_orientation sets the default;
  scenes.orientation overrides. Generation MUST pass the correct aspect ratio + resolution.
- Scenes can BIND ingredient character sheets as identity locks (the @mention pattern);
  generation prompts inject the bound reference assets.
- Multi-model generation: image/video providers are swappable per generation, tagged SFW/NSFW.
  Never hardcode one provider.

## Stack (do not deviate)
Next.js 15 App Router + TypeScript + Tailwind + pnpm. Supabase (Postgres, Auth, Storage, RLS,
Edge Functions). Vercel hosting. Anthropic API for co-pilot. Image/video/voice via a
provider-adapter layer.

## Provider-adapter layer
- lib/ai/image/ adapters (openai-image, seedream, nano-banana, grok), interface:
  generateImage({ prompt, refImageUrls, aspectRatio, count, resolution, safety }).
- lib/ai/video/ adapters (seedance, higgsfield), interface:
  generateVideo({ prompt, startImageUrl, durationSeconds, aspectRatio, resolution }).
- lib/ai/voice/ adapter: azure only. DO NOT add ElevenLabs.
- lib/ai/registry.ts lists models { id, label, kind, safety }. Each adapter reads its key
  from env, is server-only, returns { assetUrls[], providerJobId, costEstimate }.
- Never fabricate provider API paths. Unknown endpoint = typed stub + clear TODO.

## MIGRATION DISCIPLINE (read every time you touch the schema)
1. Every schema change is a NEW numbered file in supabase/migrations/. Never edit an applied one.
2. NEVER assume a migration is applied remotely. The local file existing != the column existing.
3. At the END of any prompt that changed a migration, print a block titled
   "⚠️ MANUAL STEP — APPLY IN SUPABASE SQL EDITOR" with the exact copy-pasteable SQL.
4. Regenerate and commit TypeScript types after schema changes.

## Conventions
Server Components by default; no business logic in components; all Supabase writes go through
typed helpers in lib/db/. Media in Supabase Storage buckets: assets, references, audio (signed
URLs via lib/storage/). Ingredients render a mono ref tag ([image10], [voice4], [line92]) used
as @mention handles.

## Design language
Editorial serif display headings, Inter UI, mono for ref tags. Generous whitespace, hairline
rules, near-black on light-gray. Black primary buttons. Status dots: amber=in progress,
blue=validated, green=released/approved, gray=open. Light + dark mode. Left sidebar: Home,
Projects, Shorts (series), AI Training, Utilities, Favorites, New Project, theme toggle, Logout.
---
