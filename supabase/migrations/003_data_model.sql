-- ReelWalia core data model (idempotent, transactional)
-- Order: enums → tables → indexes → triggers → helper functions → RLS → policies

BEGIN;

-- ---------------------------------------------------------------------------
-- Enums (idempotent)
-- ---------------------------------------------------------------------------

DO $enum$ BEGIN
  CREATE TYPE public.orientation AS ENUM ('portrait', 'landscape');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE public.series_status AS ENUM ('in_progress', 'validated', 'released');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE public.episode_status AS ENUM ('active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE public.scene_status AS ENUM ('storyboard', 'active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE public.take_media_type AS ENUM ('image', 'video');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE public.take_status AS ENUM ('draft', 'ready', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE public.ingredient_kind AS ENUM (
    'character', 'voice', 'outfit', 'location', 'reference', 'prop'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE public.asset_media_type AS ENUM ('image', 'video', 'audio');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE public.asset_source AS ENUM ('generated', 'uploaded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE public.scene_ingredient_role AS ENUM ('identity_lock', 'reference');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE public.chat_scope_type AS ENUM ('series', 'episode', 'scene');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

DO $enum$ BEGIN
  CREATE TYPE public.chat_message_role AS ENUM ('user', 'assistant', 'tool');
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Section 1 — tables (foreign-key dependency order)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  media_type public.asset_media_type NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  model TEXT,
  prompt TEXT,
  source public.asset_source NOT NULL DEFAULT 'uploaded',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  brief_markdown TEXT NOT NULL DEFAULT '',
  default_orientation public.orientation NOT NULL DEFAULT 'portrait',
  status public.series_status NOT NULL DEFAULT 'in_progress',
  thumbnail_asset_id UUID REFERENCES public.assets (id) ON DELETE SET NULL,
  runtime_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT series_project_slug_unique UNIQUE (project_id, slug)
);

CREATE TABLE IF NOT EXISTS public.episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.series (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  logline TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status public.episode_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES public.episodes (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  prompt TEXT,
  orientation public.orientation,
  duration_seconds INTEGER,
  act_label TEXT,
  position INTEGER,
  status public.scene_status NOT NULL DEFAULT 'storyboard',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES public.scenes (id) ON DELETE CASCADE,
  take_number INTEGER NOT NULL DEFAULT 1,
  asset_id UUID REFERENCES public.assets (id) ON DELETE SET NULL,
  media_type public.take_media_type NOT NULL,
  model TEXT,
  resolution TEXT,
  duration_seconds NUMERIC,
  starred BOOLEAN NOT NULL DEFAULT FALSE,
  status public.take_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT takes_scene_take_number_unique UNIQUE (scene_id, take_number)
);

CREATE TABLE IF NOT EXISTS public.ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.series (id) ON DELETE CASCADE,
  kind public.ingredient_kind NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  primary_asset_id UUID REFERENCES public.assets (id) ON DELETE SET NULL,
  ref_tag TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ingredients_series_ref_tag_unique UNIQUE (series_id, ref_tag)
);

CREATE TABLE IF NOT EXISTS public.audio_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES public.episodes (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  asset_id UUID REFERENCES public.assets (id) ON DELETE SET NULL,
  ref_tag TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audio_lines_episode_ref_tag_unique UNIQUE (episode_id, ref_tag)
);

CREATE TABLE IF NOT EXISTS public.scene_ingredients (
  scene_id UUID NOT NULL REFERENCES public.scenes (id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients (id) ON DELETE CASCADE,
  role public.scene_ingredient_role NOT NULL DEFAULT 'reference',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scene_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type public.chat_scope_type NOT NULL,
  scope_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.chat_sessions (id) ON DELETE CASCADE,
  role public.chat_message_role NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tool_name TEXT,
  tool_args JSONB,
  tool_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Indexes (after tables)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON public.projects (owner_id);
CREATE INDEX IF NOT EXISTS idx_assets_owner_id ON public.assets (owner_id);
CREATE INDEX IF NOT EXISTS idx_series_project_id ON public.series (project_id);
CREATE INDEX IF NOT EXISTS idx_series_status ON public.series (status);
CREATE INDEX IF NOT EXISTS idx_episodes_series_id ON public.episodes (series_id);
CREATE INDEX IF NOT EXISTS idx_episodes_series_sort ON public.episodes (series_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_scenes_episode_id ON public.scenes (episode_id);
CREATE INDEX IF NOT EXISTS idx_scenes_episode_sort ON public.scenes (episode_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_takes_scene_id ON public.takes (scene_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_series_id ON public.ingredients (series_id);
CREATE INDEX IF NOT EXISTS idx_audio_lines_episode_id ON public.audio_lines (episode_id);
CREATE INDEX IF NOT EXISTS idx_scene_ingredients_scene_id ON public.scene_ingredients (scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_ingredients_ingredient_id ON public.scene_ingredients (ingredient_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_scope ON public.chat_sessions (scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages (session_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers (after tables + trigger function)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS set_projects_updated_at ON public.projects;
CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_assets_updated_at ON public.assets;
CREATE TRIGGER set_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_series_updated_at ON public.series;
CREATE TRIGGER set_series_updated_at
  BEFORE UPDATE ON public.series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_episodes_updated_at ON public.episodes;
CREATE TRIGGER set_episodes_updated_at
  BEFORE UPDATE ON public.episodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_scenes_updated_at ON public.scenes;
CREATE TRIGGER set_scenes_updated_at
  BEFORE UPDATE ON public.scenes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_takes_updated_at ON public.takes;
CREATE TRIGGER set_takes_updated_at
  BEFORE UPDATE ON public.takes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_ingredients_updated_at ON public.ingredients;
CREATE TRIGGER set_ingredients_updated_at
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_audio_lines_updated_at ON public.audio_lines;
CREATE TRIGGER set_audio_lines_updated_at
  BEFORE UPDATE ON public.audio_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_chat_sessions_updated_at ON public.chat_sessions;
CREATE TRIGGER set_chat_sessions_updated_at
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ownership helpers (after ALL tables — SQL bodies reference them)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_owns_project(project_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = project_uuid
      AND owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_series(series_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.series s
    JOIN public.projects p ON p.id = s.project_id
    WHERE s.id = series_uuid
      AND p.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_episode(episode_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.episodes e
    JOIN public.series s ON s.id = e.series_id
    JOIN public.projects p ON p.id = s.project_id
    WHERE e.id = episode_uuid
      AND p.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_scene(scene_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.scenes sc
    JOIN public.episodes e ON e.id = sc.episode_id
    JOIN public.series s ON s.id = e.series_id
    JOIN public.projects p ON p.id = s.project_id
    WHERE sc.id = scene_uuid
      AND p.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_chat_scope(
  scope public.chat_scope_type,
  scope_uuid UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE scope
    WHEN 'series' THEN public.user_owns_series(scope_uuid)
    WHEN 'episode' THEN public.user_owns_episode(scope_uuid)
    WHEN 'scene' THEN public.user_owns_scene(scope_uuid)
    ELSE FALSE
  END;
$$;

-- ---------------------------------------------------------------------------
-- Section 2 — enable RLS on every table
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scene_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Section 3 — policies (after tables + helper functions)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owners manage own assets" ON public.assets;
CREATE POLICY "Owners manage own assets"
  ON public.assets
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners manage own projects" ON public.projects;
CREATE POLICY "Owners manage own projects"
  ON public.projects
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners manage series via project" ON public.series;
CREATE POLICY "Owners manage series via project"
  ON public.series
  FOR ALL
  USING (public.user_owns_project(project_id))
  WITH CHECK (public.user_owns_project(project_id));

DROP POLICY IF EXISTS "Owners manage episodes via series" ON public.episodes;
CREATE POLICY "Owners manage episodes via series"
  ON public.episodes
  FOR ALL
  USING (public.user_owns_series(series_id))
  WITH CHECK (public.user_owns_series(series_id));

DROP POLICY IF EXISTS "Owners manage scenes via episode" ON public.scenes;
CREATE POLICY "Owners manage scenes via episode"
  ON public.scenes
  FOR ALL
  USING (public.user_owns_episode(episode_id))
  WITH CHECK (public.user_owns_episode(episode_id));

DROP POLICY IF EXISTS "Owners manage takes via scene" ON public.takes;
CREATE POLICY "Owners manage takes via scene"
  ON public.takes
  FOR ALL
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

DROP POLICY IF EXISTS "Owners manage ingredients via series" ON public.ingredients;
CREATE POLICY "Owners manage ingredients via series"
  ON public.ingredients
  FOR ALL
  USING (public.user_owns_series(series_id))
  WITH CHECK (public.user_owns_series(series_id));

DROP POLICY IF EXISTS "Owners manage audio lines via episode" ON public.audio_lines;
CREATE POLICY "Owners manage audio lines via episode"
  ON public.audio_lines
  FOR ALL
  USING (public.user_owns_episode(episode_id))
  WITH CHECK (public.user_owns_episode(episode_id));

DROP POLICY IF EXISTS "Owners manage scene ingredients" ON public.scene_ingredients;
CREATE POLICY "Owners manage scene ingredients"
  ON public.scene_ingredients
  FOR ALL
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

DROP POLICY IF EXISTS "Owners manage chat sessions via scope" ON public.chat_sessions;
CREATE POLICY "Owners manage chat sessions via scope"
  ON public.chat_sessions
  FOR ALL
  USING (public.user_owns_chat_scope(scope_type, scope_id))
  WITH CHECK (public.user_owns_chat_scope(scope_type, scope_id));

DROP POLICY IF EXISTS "Owners manage chat messages via session" ON public.chat_messages;
CREATE POLICY "Owners manage chat messages via session"
  ON public.chat_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions cs
      WHERE cs.id = session_id
        AND public.user_owns_chat_scope(cs.scope_type, cs.scope_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_sessions cs
      WHERE cs.id = session_id
        AND public.user_owns_chat_scope(cs.scope_type, cs.scope_id)
    )
  );

COMMIT;
