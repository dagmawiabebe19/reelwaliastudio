-- Production pipeline: costumes linked to characters, character sheets, scene bindings

BEGIN;

-- ---------------------------------------------------------------------------
-- Ingredients: character link, generation status, voice/costume metadata
-- ---------------------------------------------------------------------------

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS character_id UUID REFERENCES public.ingredients (id) ON DELETE SET NULL;

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS generation_status TEXT NOT NULL DEFAULT 'ready';

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS generation_error TEXT;

CREATE INDEX IF NOT EXISTS idx_ingredients_character_id ON public.ingredients (character_id);

-- ---------------------------------------------------------------------------
-- Character sheets
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  CREATE TYPE public.character_sheet_status AS ENUM ('draft', 'pending', 'ready', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.sheet_angle AS ENUM (
    'front',
    'left_profile',
    'right_profile',
    'three_quarter',
    'back'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.character_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.series (id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES public.ingredients (id) ON DELETE CASCADE,
  costume_id UUID REFERENCES public.ingredients (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status public.character_sheet_status NOT NULL DEFAULT 'draft',
  generation_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.character_sheet_angles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id UUID NOT NULL REFERENCES public.character_sheets (id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets (id) ON DELETE CASCADE,
  angle_label public.sheet_angle NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT character_sheet_angles_unique UNIQUE (sheet_id, angle_label)
);

CREATE TABLE IF NOT EXISTS public.character_sheet_episodes (
  sheet_id UUID NOT NULL REFERENCES public.character_sheets (id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES public.episodes (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sheet_id, episode_id)
);

CREATE INDEX IF NOT EXISTS idx_character_sheets_series_id ON public.character_sheets (series_id);
CREATE INDEX IF NOT EXISTS idx_character_sheets_character_id ON public.character_sheets (character_id);
CREATE INDEX IF NOT EXISTS idx_character_sheet_angles_sheet_id ON public.character_sheet_angles (sheet_id);
CREATE INDEX IF NOT EXISTS idx_character_sheet_episodes_episode_id ON public.character_sheet_episodes (episode_id);

-- ---------------------------------------------------------------------------
-- Scene bindings: character sheets (identity lock) + resolved reference cache
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.scene_character_sheets (
  scene_id UUID NOT NULL REFERENCES public.scenes (id) ON DELETE CASCADE,
  character_sheet_id UUID NOT NULL REFERENCES public.character_sheets (id) ON DELETE CASCADE,
  role public.scene_ingredient_role NOT NULL DEFAULT 'identity_lock',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scene_id, character_sheet_id)
);

CREATE INDEX IF NOT EXISTS idx_scene_character_sheets_sheet_id
  ON public.scene_character_sheets (character_sheet_id);

ALTER TABLE public.scenes
  ADD COLUMN IF NOT EXISTS resolved_references JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.scenes
  ADD COLUMN IF NOT EXISTS reference_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS set_character_sheets_updated_at ON public.character_sheets;
CREATE TRIGGER set_character_sheets_updated_at
  BEFORE UPDATE ON public.character_sheets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.character_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_sheet_angles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_sheet_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scene_character_sheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage character sheets via series" ON public.character_sheets;
CREATE POLICY "Owners manage character sheets via series"
  ON public.character_sheets
  FOR ALL
  TO authenticated
  USING (public.user_owns_series(series_id))
  WITH CHECK (public.user_owns_series(series_id));

DROP POLICY IF EXISTS "Owners manage sheet angles via sheet" ON public.character_sheet_angles;
CREATE POLICY "Owners manage sheet angles via sheet"
  ON public.character_sheet_angles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.character_sheets cs
      WHERE cs.id = sheet_id AND public.user_owns_series(cs.series_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.character_sheets cs
      WHERE cs.id = sheet_id AND public.user_owns_series(cs.series_id)
    )
  );

DROP POLICY IF EXISTS "Owners manage sheet episodes via sheet" ON public.character_sheet_episodes;
CREATE POLICY "Owners manage sheet episodes via sheet"
  ON public.character_sheet_episodes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.character_sheets cs
      WHERE cs.id = sheet_id AND public.user_owns_series(cs.series_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.character_sheets cs
      WHERE cs.id = sheet_id AND public.user_owns_series(cs.series_id)
    )
  );

DROP POLICY IF EXISTS "Owners manage scene character sheets via scene" ON public.scene_character_sheets;
CREATE POLICY "Owners manage scene character sheets via scene"
  ON public.scene_character_sheets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.scenes sc
      WHERE sc.id = scene_id AND public.user_owns_episode(sc.episode_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scenes sc
      WHERE sc.id = scene_id AND public.user_owns_episode(sc.episode_id)
    )
  );

COMMIT;
