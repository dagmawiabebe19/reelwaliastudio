-- Admin role on profiles + allow negative credit balance for admins (metering still runs)
-- Apply manually in Supabase SQL Editor.

BEGIN;

-- ---------------------------------------------------------------------------
-- profiles.is_admin
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_admin IS
  'Admin users are never blocked by insufficient credits; ledger metering still applies. Writable only via service-role.';

-- Block self-promotion: users cannot UPDATE is_admin via the client API.
CREATE OR REPLACE FUNCTION public.protect_profiles_is_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    IF COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
      RETURN NEW;
    END IF;
    IF current_user IN ('postgres', 'supabase_admin') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'is_admin is read-only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profiles_is_admin ON public.profiles;
CREATE TRIGGER protect_profiles_is_admin
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_is_admin();

-- ---------------------------------------------------------------------------
-- Helper: admin check inside credit RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.profile_is_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = p_user_id),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.profile_is_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_is_admin(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admins may have negative available balance (real spend is still recorded)
-- ---------------------------------------------------------------------------

ALTER TABLE public.credit_balances
  DROP CONSTRAINT IF EXISTS credit_balances_available_nonneg;

-- ---------------------------------------------------------------------------
-- reserve_credits: skip insufficient_credits block for admins
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_reference TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available INTEGER;
  v_reserved INTEGER;
  v_total INTEGER;
  v_reservation_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'reserve_amount_must_be_positive';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_is_admin := public.profile_is_admin(p_user_id);

  PERFORM public.ensure_credit_balance_row(p_user_id);

  SELECT available, reserved
  INTO v_available, v_reserved
  FROM public.credit_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT v_is_admin AND v_available < p_amount THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  v_reservation_id := gen_random_uuid();
  v_available := v_available - p_amount;
  v_reserved := v_reserved + p_amount;
  v_total := v_available + v_reserved;

  INSERT INTO public.credit_ledger (
    user_id,
    amount,
    balance_after,
    type,
    status,
    reservation_id,
    reference,
    metadata
  )
  VALUES (
    p_user_id,
    -p_amount,
    v_total,
    'reservation',
    'reserved',
    v_reservation_id,
    p_reference,
    p_metadata
  );

  UPDATE public.credit_balances
  SET available = v_available, reserved = v_reserved, updated_at = now()
  WHERE user_id = p_user_id;

  RETURN v_reservation_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- commit_reservation: allow admin balance to go negative on extra debit
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.commit_reservation(
  p_reservation_id UUID,
  p_actual_amount INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_held INTEGER;
  v_available INTEGER;
  v_reserved INTEGER;
  v_total INTEGER;
  v_extra_needed INTEGER;
  v_is_admin BOOLEAN;
BEGIN
  IF p_actual_amount IS NULL OR p_actual_amount < 0 THEN
    RAISE EXCEPTION 'actual_amount_must_be_non_negative';
  END IF;

  IF NOT public.credit_reservation_is_open(p_reservation_id) THEN
    RETURN;
  END IF;

  SELECT user_id, abs(amount)
  INTO v_user_id, v_held
  FROM public.credit_ledger
  WHERE reservation_id = p_reservation_id
    AND type = 'reservation'
    AND status = 'reserved'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  v_is_admin := public.profile_is_admin(v_user_id);

  PERFORM public.ensure_credit_balance_row(v_user_id);

  SELECT available, reserved
  INTO v_available, v_reserved
  FROM public.credit_balances
  WHERE user_id = v_user_id
  FOR UPDATE;

  v_extra_needed := GREATEST(0, p_actual_amount - v_held);
  IF NOT v_is_admin AND v_available < v_extra_needed THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  v_available := v_available + v_held - p_actual_amount;
  v_reserved := v_reserved - v_held;
  v_total := v_available + v_reserved;

  INSERT INTO public.credit_ledger (
    user_id,
    amount,
    balance_after,
    type,
    status,
    reservation_id,
    reference,
    metadata
  )
  VALUES (
    v_user_id,
    -p_actual_amount,
    v_total,
    'commit',
    'settled',
    p_reservation_id,
    NULL,
    jsonb_build_object('held_amount', v_held, 'actual_amount', p_actual_amount)
  );

  UPDATE public.credit_balances
  SET available = v_available, reserved = v_reserved, updated_at = now()
  WHERE user_id = v_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Promote studio owner (adjust email if needed)
-- ---------------------------------------------------------------------------

UPDATE public.profiles
SET is_admin = true
WHERE email = 'dagmawiabebe19@gmail.com';

COMMIT;
