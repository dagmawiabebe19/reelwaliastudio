# Supabase migrations checklist

Apply migrations **manually** in the Supabase SQL Editor (or `psql`). Do not auto-apply from CI.

Run live drift check:

```bash
node scripts/audit-migration-drift.mjs
```

| # | File | Description | Applied (live) |
|---|------|-------------|----------------|
| 001 | `001_profiles.sql` | `profiles` table + RLS | ☐ verify |
| 002 | `002_profiles_avatar.sql` | `profiles.avatar_url` | ☐ verify |
| 003 | `003_data_model.sql` | Core series/episodes/scenes model | ☐ verify |
| 004 | `004_dev_profile_seed.sql` | Dev seed profile (local only) | ☐ optional |
| 005 | `005_storage_buckets.sql` | `assets` / `references` / `audio` buckets | ☐ verify |
| 006 | `006_generation_engine.sql` | Takes + assets | ☐ verify |
| 007 | `007_production_pipeline.sql` | Ingredients + character sheets | ☐ verify |
| 008 | `008_delete_cascades.sql` | Delete cascades | ☐ verify |
| 009 | `009_series_memory.sql` | `series.memory_markdown` | ☐ verify |
| 010 | `010_scene_shot_intent.sql` | `scenes.shot_intent` | ☐ verify |
| 011 | `011_take_has_audio.sql` | `takes.has_audio` | ☐ verify |
| 012 | `012_credits.sql` | Credit ledger + RPCs | ☐ verify |
| 013 | `013_admin_profiles.sql` | Admin profiles + admin credit RPCs | ☐ verify |
| 014 | `014_scene_generation_defaults.sql` | Scene generation defaults | ☐ verify |
| 015 | `015_profile_onboarding.sql` | Onboarding fields | ☐ verify |
| 016 | `016_episode_summary.sql` | Episode summary markdown | ☐ verify |
| 017 | `017_take_provider_request.sql` | Take provider request metadata | ☐ verify |
| 018 | `018_security_credit_rpc_grants.sql` | **Revoke `reserve_credits` from authenticated** | ☐ verify |

## Post-apply verification

1. `node scripts/audit-migration-drift.mjs` — all column probes should show `applied`.
2. Migration 018: `reserve_credits` should be executable by `service_role` only.
3. `node scripts/audit-orphans.mjs` — baseline orphan counts (read-only).
4. `npm run build` — production build passes.

## Regenerate types (local Supabase CLI)

```bash
npm run gen:types
```

Update this checklist after each production apply (change ☐ to ☑ with date in commit message or ops log).
