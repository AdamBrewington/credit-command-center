-- ============================================================
-- MARK COLLECTION PAYMENT PAID RPC
-- ============================================================
-- Replaces the mark-paid Edge Function for the dashboard MVP.
-- This function intentionally performs ownership checks with auth.uid()
-- and does not send SMS or other notifications.
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_collection_payment_paid(payment_id_input UUID)
RETURNS TABLE (
  payment_id UUID,
  collection_id UUID,
  amount_paid NUMERIC,
  new_balance NUMERIC,
  already_paid BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  payment_record RECORD;
  adjusted_balance NUMERIC(10,2);
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    p.id AS payment_id,
    p.collection_id,
    p.amount,
    p.status,
    c.current_balance
  INTO payment_record
  FROM public.payments p
  JOIN public.collections c ON c.id = p.collection_id
  WHERE p.id = payment_id_input
    AND p.user_id = current_user_id
    AND c.user_id = current_user_id
  FOR UPDATE OF p, c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found for current user';
  END IF;

  IF payment_record.status = 'paid' THEN
    RETURN QUERY
    SELECT
      payment_record.payment_id,
      payment_record.collection_id,
      payment_record.amount,
      payment_record.current_balance,
      TRUE;
    RETURN;
  END IF;

  adjusted_balance := GREATEST(0, payment_record.current_balance - payment_record.amount);

  UPDATE public.payments
  SET
    status = 'paid',
    paid_date = CURRENT_DATE
  WHERE id = payment_record.payment_id
    AND user_id = current_user_id;

  UPDATE public.collections
  SET
    current_balance = adjusted_balance,
    status = CASE WHEN adjusted_balance <= 0 THEN 'paid' ELSE 'active_plan' END
  WHERE id = payment_record.collection_id
    AND user_id = current_user_id;

  RETURN QUERY
  SELECT
    payment_record.payment_id,
    payment_record.collection_id,
    payment_record.amount,
    adjusted_balance,
    FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_collection_payment_paid(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_collection_payment_paid(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_collection_payment_paid(UUID) TO authenticated;
