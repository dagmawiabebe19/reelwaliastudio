-- FLAG: apply manually in Supabase SQL Editor — do not auto-run.
-- Co-pilot defaults for Seedance generation (audio + suggested tier).

ALTER TABLE scenes ADD COLUMN IF NOT EXISTS audio_mode text;

ALTER TABLE scenes ADD COLUMN IF NOT EXISTS generation_tier text;

ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_audio_mode_check;
ALTER TABLE scenes ADD CONSTRAINT scenes_audio_mode_check
  CHECK (audio_mode IS NULL OR audio_mode IN ('off', 'full', 'ambient'));

ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_generation_tier_check;
ALTER TABLE scenes ADD CONSTRAINT scenes_generation_tier_check
  CHECK (generation_tier IS NULL OR generation_tier IN ('standard', 'fast'));

COMMENT ON COLUMN scenes.audio_mode IS
  'Co-pilot default Seedance audio: off, full (dialogue lip-sync), ambient (SFX/atmosphere).';

COMMENT ON COLUMN scenes.generation_tier IS
  'Co-pilot suggested tier (standard = hero beats, fast = coverage). Overridden by Draft/Final at generation.';
