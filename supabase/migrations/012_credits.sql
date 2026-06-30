-- Credit ledger + balance cache + locking RPCs (append-only ledger is source of truth)
-- Apply manually in Supabase SQL Editor.

BEGIN;

-- ---------------------------------------------------------------------------
-- Config: signup grant amount (single place to change)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.signup_credit_grant_amount()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT 100;
$$;

COMMENT ON FUNCTION public.signup_credit_grant_amount() IS
  'Free credits granted to each new user on signup. Change this value only here.';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'settled',
  reservation_id UUID,
  reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_ledger_type_check CHECK (
    type IN ('purchase', 'reservation', 'commit', 'refund', 'grant', 'adjustment')
  ),
  CONSTRAINT credit_ledger_status_check CHECK (
    status IN ('reserved', 'settled', 'released')
  )
);

CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx
  ON public.credit_ledger (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS credit_ledger_reservation_id_idx
  ON public.credit_ledger (reservation_id)
  WHERE reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_ledger_user_status_idx
  ON public.credit_ledger (user_id, status);

CREATE TABLE IF NOT EXISTS public.credit_balances (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  available INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_balances_available_nonneg CHECK (available >= 0),
  CONSTRAINT credit_balances_reserved_nonneg CHECK (reserved >= 0)
);

-- ---------------------------------------------------------------------------
-- RLS: read-own only; no client writes
-- ---------------------------------------------------------------------------

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own credit ledger" ON public.credit_ledger;
CREATE POLICY "Users read own credit ledger"
  ON public.credit_ledger
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own credit balance" ON public.credit_balances;
CREATE POLICY "Users read own credit balance"
  ON public.credit_balances
  FOR SELECT
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_credit_balance_row(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.credit_balances (user_id, available, reserved)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_reservation_is_open(p_reservation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.credit_ledger
    WHERE reservation_id = p_reservation_id
      AND type = 'reservation'
      AND status = 'reserved'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.credit_ledger
    WHERE reservation_id = p_reservation_id
      AND type IN ('commit', 'refund')
  );
$$;

-- ---------------------------------------------------------------------------
-- grant_credits
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.grant_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT,
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
  v_ledger_id UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'grant_amount_must_be_positive';
  END IF;

  IF p_type NOT IN ('purchase', 'grant', 'adjustment') THEN
    RAISE EXCEPTION 'invalid_grant_type';
  END IF;

  PERFORM public.ensure_credit_balance_row(p_user_id);

  SELECT available, reserved
  INTO v_available, v_reserved
  FROM public.credit_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_available := v_available + p_amount;
  v_total := v_available + v_reserved;

  INSERT INTO public.credit_ledger (
    user_id, amount, balance_after, type, status, reference, metadata
  )
  VALUES (
    p_user_id, p_amount, v_total, p_type, 'settled', p_reference, p_metadata
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.credit_balances
  SET available = v_available, updated_at = now()
  WHERE user_id = p_user_id;

  RETURN v_ledger_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- reserve_credits
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
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'reserve_amount_must_be_positive';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  PERFORM public.ensure_credit_balance_row(p_user_id);

  SELECT available, reserved
  INTO v_available, v_reserved
  FROM public.credit_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_available < p_amount THEN
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
-- commit_reservation
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

  PERFORM public.ensure_credit_balance_row(v_user_id);

  SELECT available, reserved
  INTO v_available, v_reserved
  FROM public.credit_balances
  WHERE user_id = v_user_id
  FOR UPDATE;

  v_extra_needed := GREATEST(0, p_actual_amount - v_held);
  IF v_available < v_extra_needed THEN
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
-- release_reservation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.release_reservation(p_reservation_id UUID)
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
BEGIN
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

  PERFORM public.ensure_credit_balance_row(v_user_id);

  SELECT available, reserved
  INTO v_available, v_reserved
  FROM public.credit_balances
  WHERE user_id = v_user_id
  FOR UPDATE;

  v_available := v_available + v_held;
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
    v_held,
    v_total,
    'refund',
    'released',
    p_reservation_id,
    NULL,
    jsonb_build_object('released_amount', v_held)
  );

  UPDATE public.credit_balances
  SET available = v_available, reserved = v_reserved, updated_at = now()
  WHERE user_id = v_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Signup grant: extend handle_new_user()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      split_part(NEW.email, '@', 1)
    )
  );

  PERFORM public.grant_credits(
    NEW.id,
    public.signup_credit_grant_amount(),
    'grant',
    'signup:welcome',
    jsonb_build_object('reason', 'new_user')
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Function grants (no direct table writes from clients)
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.signup_credit_grant_amount() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_credit_grant_amount() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ensure_credit_balance_row(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_credit_balance_row(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.credit_reservation_is_open(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_reservation_is_open(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.grant_credits(UUID, INTEGER, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_credits(UUID, INTEGER, TEXT, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.reserve_credits(UUID, INTEGER, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_credits(UUID, INTEGER, TEXT, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.commit_reservation(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_reservation(UUID, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.release_reservation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_reservation(UUID) TO service_role;

COMMIT;
