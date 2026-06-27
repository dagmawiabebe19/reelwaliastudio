-- Cascade deletes: character → costumes; costume ingredient → character sheets

BEGIN;

ALTER TABLE public.ingredients
  DROP CONSTRAINT IF EXISTS ingredients_character_id_fkey;

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_character_id_fkey
  FOREIGN KEY (character_id)
  REFERENCES public.ingredients (id)
  ON DELETE CASCADE;

ALTER TABLE public.character_sheets
  DROP CONSTRAINT IF EXISTS character_sheets_costume_id_fkey;

ALTER TABLE public.character_sheets
  ADD CONSTRAINT character_sheets_costume_id_fkey
  FOREIGN KEY (costume_id)
  REFERENCES public.ingredients (id)
  ON DELETE CASCADE;

COMMIT;
