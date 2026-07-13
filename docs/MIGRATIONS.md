# Supabase migrations checklist

Apply migrations **manually** in the Supabase SQL Editor (or `psql`). Do not auto-apply from CI.

Run live drift check:

```bash
node scripts/audit-migration-drift.mjs
```

Last live probe: **2026-07-09** — all column probes **applied** on Studio Supabase (`dxtieidijudvekuwljrs`).

| # | File | Description | Applied (live) |
|---|------|-------------|------------------|
| 001 | `001_profiles.sql` | `profiles` table + RLS | ☑ 2026-07-09 |
| 002 | `002_profiles_avatar.sql` | `profiles.avatar_url` | ☑ 2026-07-09 |
| 003 | `003_data_model.sql` | Core series/episodes/scenes model | ☑ 2026-07-09 |
| 004 | `004_dev_profile_seed.sql` | Dev seed profile (local only) | ☐ optional |
| 005 | `005_storage_buckets.sql` | `assets` / `references` / `audio` buckets | ☐ manual (buckets) |
| 006 | `006_generation_engine.sql` | Takes + assets | ☑ 2026-07-09 |
| 007 | `007_production_pipeline.sql` | Ingredients + character sheets | ☑ 2026-07-09 |
| 008 | `008_delete_cascades.sql` | Delete cascades | ☐ manual (FK only) |
| 009 | `009_series_memory.sql` | `series.memory_markdown` | ☑ 2026-07-09 |
| 010 | `010_scene_shot_intent.sql` | `scenes.shot_intent` | ☑ 2026-07-09 |
| 011 | `011_take_has_audio.sql` | `takes.has_audio` | ☑ 2026-07-09 |
| 012 | `012_credits.sql` | Credit ledger + RPCs | ☑ 2026-07-09 |
| 013 | `013_admin_profiles.sql` | Admin profiles + admin credit RPCs | ☑ 2026-07-09 |
| 014 | `014_scene_generation_defaults.sql` | Scene generation defaults | ☑ 2026-07-09 |
| 015 | `015_profile_onboarding.sql` | Onboarding fields | ☑ 2026-07-09 |
| 016 | `016_episode_summary.sql` | Episode summary markdown | ☑ 2026-07-09 |
| 017 | `017_take_provider_request.sql` | Take provider request metadata | ☑ 2026-07-09 |
| 018 | `018_security_credit_rpc_grants.sql` | **Revoke `reserve_credits` from authenticated** | ☐ verify grants |
| 019 | `019_profile_approval.sql` | **Approval gate + welcome grant on approve only** | ☑ 2026-07-09 |
| 020 | `020_screenplays.sql` | Screenplay upload + scene tables | ☑ 2026-07-09 |
| 021 | `021_screenplay_analysis.sql` | Analysis columns on `screenplays` (`analysis_status`, `analysis_proposal`, `analysis_fail_reason`) — **no separate table** | ☑ 2026-07-09 |
| 022 | `022_captioning.sql` | Captioning jobs/cues/translations + bucket | ☑ 2026-07-09 |
| 023 | `023_captioning_burn_in.sql` | Burn-in columns on captioning_jobs | ☑ 2026-07-09 |
| 024 | `024_screenplay_reading_pdf_status.sql` | `reading_pdf` status for PDF import phase | ☐ apply before PDF import |
| 025 | `025_caption_burned_exports.sql` | Per-language burned-in 720p caption exports table | ☐ **apply before using multi-lang burn UI** |

## Unapplied migrations

- **024** `024_screenplay_reading_pdf_status.sql` — required for PDF import status (`reading_pdf`). Apply in Studio Supabase SQL Editor before relying on PDF upload status UI.
- **025** `025_caption_burned_exports.sql` — required for per-language burned-in 720p caption exports. Apply in **Studio** Supabase SQL Editor (`dxtieidijudvekuwljrs`).

If drift appears later, apply missing files **in numeric order** from `supabase/migrations/`.

## Post-apply verification

1. `node scripts/audit-migration-drift.mjs` — all column probes should show `applied`.
2. Migration 018: `reserve_credits` should be executable by `service_role` only.
3. `node scripts/audit-orphans.mjs` — baseline orphan counts (read-only).
4. `npm run build` — production build passes.

## Regenerate types (local Supabase CLI)

```bash
npm run gen:types
```

Update this checklist after each production apply (change ☐ to ☑ with date).
