-- ============================================================
-- CREDIT COMMAND CENTER — Database Schema
-- ============================================================
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- This creates all tables, security policies, and seed data.
-- ============================================================

-- ============================================================
-- 1. PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  notification_mode TEXT DEFAULT 'standard' CHECK (notification_mode IN ('standard', 'aggressive', 'funny', 'smokey')),
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '07:00',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 2. COLLECTIONS (debts, charge-offs, settlements)
-- ============================================================
CREATE TABLE public.collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  original_creditor TEXT,
  collector TEXT,
  original_balance NUMERIC(10,2) NOT NULL,
  current_balance NUMERIC(10,2) NOT NULL,
  settlement_amount NUMERIC(10,2),
  discount_percent NUMERIC(5,2),
  payment_plan_length INTEGER,           -- number of payments
  payment_amount NUMERIC(10,2),          -- per-payment amount
  payment_frequency TEXT DEFAULT 'monthly' CHECK (payment_frequency IN ('weekly', 'biweekly', 'monthly', 'one_time')),
  next_payment_date DATE,
  status TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'active_plan', 'settled', 'paid', 'disputed', 'waiting')),
  expected_report_behavior TEXT,         -- e.g. "should be removed after paid"
  notes TEXT,
  proof_uploaded BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own collections" ON public.collections FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_collections_user ON public.collections(user_id);
CREATE INDEX idx_collections_next_payment ON public.collections(next_payment_date);
CREATE INDEX idx_collections_status ON public.collections(status);


-- ============================================================
-- 3. PAYMENTS (individual payment records for collections)
-- ============================================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  due_date DATE NOT NULL,
  paid_date DATE,
  status TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'late', 'skipped')),
  confirmation_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own payments" ON public.payments FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_payments_collection ON public.payments(collection_id);
CREATE INDEX idx_payments_due_date ON public.payments(due_date);
CREATE INDEX idx_payments_status ON public.payments(status);


-- ============================================================
-- 4. CREDIT CARDS
-- ============================================================
CREATE TABLE public.credit_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_name TEXT NOT NULL,
  issuer TEXT,
  credit_limit NUMERIC(10,2) NOT NULL,
  current_balance NUMERIC(10,2) DEFAULT 0,
  annual_fee NUMERIC(10,2) DEFAULT 0,
  apr NUMERIC(5,2),
  statement_close_day INTEGER NOT NULL CHECK (statement_close_day BETWEEN 1 AND 31),
  due_date_day INTEGER NOT NULL CHECK (due_date_day BETWEEN 1 AND 31),
  target_reported_balance_low NUMERIC(10,2) DEFAULT 0,
  target_reported_balance_high NUMERIC(10,2),
  autopay_enabled BOOLEAN DEFAULT false,
  rewards_categories TEXT,               -- e.g. "gas, groceries, streaming"
  allowed_uses TEXT,                     -- what to use this card for
  forbidden_uses TEXT,                   -- what NOT to use it for
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cards" ON public.credit_cards FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_cards_user ON public.credit_cards(user_id);


-- ============================================================
-- 5. PAYCHECKS
-- ============================================================
CREATE TABLE public.paychecks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paycheck_label TEXT NOT NULL,          -- e.g. "Payday A", "Payday B"
  pay_date DATE NOT NULL,
  expected_amount NUMERIC(10,2),
  actual_amount NUMERIC(10,2),
  is_recurring BOOLEAN DEFAULT true,
  recurrence_rule TEXT,                  -- e.g. "biweekly_friday"
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.paychecks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own paychecks" ON public.paychecks FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_paychecks_user ON public.paychecks(user_id);
CREATE INDEX idx_paychecks_date ON public.paychecks(pay_date);


-- ============================================================
-- 6. BILLS (recurring obligations assigned to paychecks)
-- ============================================================
CREATE TABLE public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bill_name TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  due_day INTEGER CHECK (due_day BETWEEN 1 AND 31),
  due_date DATE,                         -- for one-time bills
  is_recurring BOOLEAN DEFAULT true,
  autopay BOOLEAN DEFAULT false,
  pay_method TEXT,                       -- e.g. "bank", "Credit One", "cash"
  category TEXT,                         -- e.g. "phone", "internet", "rent"
  priority INTEGER DEFAULT 5,           -- 1 = highest
  assigned_paycheck_label TEXT,          -- e.g. "Payday A"
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bills" ON public.bills FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_bills_user ON public.bills(user_id);


-- ============================================================
-- 7. NOTIFICATIONS LOG
-- ============================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'payday_checklist',
    'debt_payment_due',
    'debt_payment_success',
    'debt_account_completed',
    'statement_closing_soon',
    'due_date_soon',
    'high_utilization_warning',
    'weekly_summary',
    'monthly_reset',
    'custom'
  )),
  message TEXT NOT NULL,
  related_table TEXT,                    -- e.g. "collections", "credit_cards"
  related_id UUID,                       -- FK to the related record
  channel TEXT DEFAULT 'sms' CHECK (channel IN ('sms', 'email', 'push')),
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'queued', 'skipped')),
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service inserts notifications" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_type ON public.notifications(notification_type);
CREATE INDEX idx_notifications_sent ON public.notifications(sent_at);


-- ============================================================
-- 8. UPDATED_AT TRIGGER (auto-update timestamps)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.credit_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.paychecks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ============================================================
-- 9. HELPER VIEWS
-- ============================================================

-- Collections summary
CREATE VIEW public.collections_summary AS
SELECT
  user_id,
  COUNT(*) AS total_accounts,
  COUNT(*) FILTER (WHERE status = 'paid' OR status = 'settled') AS accounts_cleared,
  COALESCE(SUM(original_balance), 0) AS total_original_debt,
  COALESCE(SUM(current_balance), 0) AS total_remaining,
  COALESCE(SUM(original_balance) - SUM(current_balance), 0) AS total_paid,
  CASE
    WHEN SUM(original_balance) > 0
    THEN ROUND(((SUM(original_balance) - SUM(current_balance)) / SUM(original_balance)) * 100, 1)
    ELSE 100
  END AS percent_complete,
  MIN(next_payment_date) FILTER (WHERE status IN ('unpaid', 'active_plan')) AS next_payment_due,
  MIN(current_balance) FILTER (WHERE status IN ('unpaid', 'active_plan') AND current_balance > 0) AS smallest_remaining
FROM public.collections
GROUP BY user_id;

-- Credit card utilization
CREATE VIEW public.card_utilization AS
SELECT
  id,
  user_id,
  card_name,
  credit_limit,
  current_balance,
  CASE
    WHEN credit_limit > 0
    THEN ROUND((current_balance / credit_limit) * 100, 1)
    ELSE 0
  END AS utilization_percent,
  target_reported_balance_high,
  CASE
    WHEN current_balance > COALESCE(target_reported_balance_high, credit_limit * 0.09)
    THEN ROUND(current_balance - COALESCE(target_reported_balance_high, credit_limit * 0.09), 2)
    ELSE 0
  END AS amount_to_pay_down,
  statement_close_day,
  due_date_day
FROM public.credit_cards;


-- ============================================================
-- 10. SEED DATA (your actual debts)
-- ============================================================
-- NOTE: Run this AFTER you create your account and sign in.
-- Replace 'YOUR_USER_ID' with your actual auth.users id from Supabase.
-- You can find it in Authentication > Users in the Supabase dashboard.
-- ============================================================

-- Uncomment and run after signup:

/*
-- Set your user ID
DO $$ DECLARE uid UUID := 'YOUR_USER_ID'; BEGIN

-- Collections
INSERT INTO public.collections (user_id, account_name, original_creditor, collector, original_balance, current_balance, settlement_amount, discount_percent, payment_plan_length, payment_amount, payment_frequency, status, notes, sort_order) VALUES
(uid, 'Kikoff Charge-Off', 'Kikoff', NULL, 100.00, 100.00, 100.00, 0, 1, 100.00, 'one_time', 'unpaid', 'Pay in full. Smallest debt — quick win.', 1),
(uid, 'Resurgent 3956', NULL, 'Resurgent', 248.17, 248.17, 210.94, 15.00, 2, 105.47, 'monthly', 'unpaid', '15% discount. 2 payments of $105.47.', 2),
(uid, 'Sequium/Comcast #1', 'Comcast', 'Sequium', 192.00, 192.00, NULL, NULL, NULL, NULL, 'monthly', 'waiting', 'Discount unknown — negotiate before paying.', 3),
(uid, 'Sequium/Comcast #2', 'Comcast', 'Sequium', 201.00, 201.00, NULL, NULL, NULL, NULL, 'monthly', 'waiting', 'Discount unknown — negotiate before paying.', 4),
(uid, 'Resurgent 4583', NULL, 'Resurgent', 436.55, 436.55, 327.41, 25.00, 2, 163.71, 'monthly', 'unpaid', '25% discount. 2 payments of ~$163.71.', 5),
(uid, 'Jefferson/Verizon', 'Verizon', 'Jefferson Capital', 636.00, 636.00, NULL, NULL, NULL, NULL, 'monthly', 'waiting', 'Verify balance and legitimacy before paying. Largest debt.', 6);

-- Credit One card
INSERT INTO public.credit_cards (user_id, card_name, issuer, credit_limit, current_balance, annual_fee, statement_close_day, due_date_day, target_reported_balance_low, target_reported_balance_high, autopay_enabled, allowed_uses, forbidden_uses, notes) VALUES
(uid, 'Credit One X5', 'Credit One', 1000.00, 0.00, 95.00, 15, 10, 25.00, 80.00, false, 'Visible, MetroPCS, Xfinity, gas, Kroger direct', 'Impulse spending, auctions, games, random Amazon', 'Keep utilization under 9%. Pay down before statement close.');

END $$;
*/
