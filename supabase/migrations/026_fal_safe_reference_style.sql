-- fal-safe reference restyle pipeline
-- Series-level style token for character image prompts + fal-safe flags on refs.
--
-- FLAGGED FOR MANUAL APPLY in Supabase Studio (project dxtieidijudvekuwljrs).
-- Do not assume this has been applied until you run it in the SQL editor.

alter table public.series
  add column if not exists reference_style text;

alter table public.series
  add column if not exists restyle_cascade jsonb;

alter table public.ingredients
  add column if not exists fal_safe_styled boolean not null default false;

alter table public.character_sheets
  add column if not exists fal_safe_styled boolean not null default false;

comment on column public.series.reference_style is
  'Style descriptor appended to all character image generation prompts for this series (fal-safe restyle).';

comment on column public.series.restyle_cascade is
  'Gated batch restyle state: which characters remain, pause-after-first, draft-test confirmation.';

comment on column public.ingredients.fal_safe_styled is
  'True when this character headshot was regenerated with the series fal-safe reference_style.';

comment on column public.character_sheets.fal_safe_styled is
  'True when sheet angles were regenerated from a fal-safe restyled headshot.';

-- Crown of Ashes (main series) default style token
update public.series
set reference_style = 'high-end cinematic film still, subtle painterly rendering, matte stylized skin texture, fictional person not resembling any real individual'
where id = '08541783-49fc-4abb-beb7-9a926267c6ab'
  and (reference_style is null or btrim(reference_style) = '');
