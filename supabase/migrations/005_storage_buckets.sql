-- Private storage buckets: assets, references, audio (owner-scoped paths)

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('assets', 'assets', false, 52428800),
  ('references', 'references', false, 104857600),
  ('audio', 'audio', false, 52428800)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- Path convention: {owner_id}/{series_id or episode_id}/{filename}

DROP POLICY IF EXISTS "Owners insert storage objects" ON storage.objects;
CREATE POLICY "Owners insert storage objects"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id IN ('assets', 'references', 'audio')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Owners select storage objects" ON storage.objects;
CREATE POLICY "Owners select storage objects"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id IN ('assets', 'references', 'audio')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Owners update storage objects" ON storage.objects;
CREATE POLICY "Owners update storage objects"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id IN ('assets', 'references', 'audio')
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN ('assets', 'references', 'audio')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Owners delete storage objects" ON storage.objects;
CREATE POLICY "Owners delete storage objects"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id IN ('assets', 'references', 'audio')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
