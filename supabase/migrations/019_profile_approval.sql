-- Profile approval gate: pending signups cannot use the app until admin approves.
-- Welcome credits grant on approval only (not at signup).
-- FLAG: apply manually in Supabase SQL Editor — do not auto-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- Approval columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_approval_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

COMMENT ON COLUMN public.profiles.approval_status IS
  'Access gate: pending users see waitlist only. Writable only via service-role.';

COMMENT ON COLUMN public.profiles.approved_at IS
  'When the account was approved. Writable only via service-role.';

COMMENT ON COLUMN public.profiles.approved_by IS
  'Admin user who approved the account. Writable only via service-role.';

-- Grandfather existing accounts at migration time (new signups stay pending).
UPDATE public.profiles
SET
  approval_status = 'approved',
  approved_at = COALESCE(approved_at, created_at, now())
WHERE approval_status = 'pending';

-- Owner account: always admin AND approved (match email OR uuid).
UPDATE public.profiles
SET
  is_admin = true,
  approval_status = 'approved',
  approved_at = COALESCE(approved_at, now())
WHERE email = 'dagmawiabebe19@gmail.com'
   OR id = 'aade471f-9614-46b5-8238-53225c78b0f6';

-- Test user: approved (dev bypass).
UPDATE public.profiles
SET
  approval_status = 'approved',
  approved_at = COALESCE(approved_at, now())
WHERE id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- Block self-approval: users cannot UPDATE approval fields via the client API.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_profiles_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.approval_status IS DISTINCT FROM OLD.approval_status
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
  ) THEN
    IF COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
      RETURN NEW;
    END IF;
    IF current_user IN ('postgres', 'supabase_admin') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'approval_status is read-only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profiles_approval ON public.profiles;
CREATE TRIGGER protect_profiles_approval
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_approval();

-- ---------------------------------------------------------------------------
-- Signup: create profile (pending) + zero balance — NO welcome grant until approval.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, approval_status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      split_part(NEW.email, '@', 1)
    ),
    'pending'
  );

  PERFORM public.ensure_credit_balance_row(NEW.id);

  RETURN NEW;
END;
$$;

COMMIT;
