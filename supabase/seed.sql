-- ============================================================
-- MovieFlix Dashboard — Seed Data
-- ============================================================

-- Default subscription plans
insert into public.plans (name, price, currency, duration_days, description, active) values
  ('Basic Plan',      150.00, 'MVR', 30,  'Standard quality, 1 device', true),
  ('Standard Plan',   250.00, 'MVR', 30,  'HD quality, 2 devices', true),
  ('Premium Plan',    350.00, 'MVR', 30,  '4K quality, 4 devices', true),
  ('3-Month Basic',   400.00, 'MVR', 90,  'Basic plan for 3 months', true),
  ('3-Month Standard',650.00, 'MVR', 90,  'Standard plan for 3 months', true),
  ('3-Month Premium', 900.00, 'MVR', 90,  'Premium plan for 3 months', true),
  ('1-Year Basic',    1200.00, 'MVR', 365, 'Basic plan for 1 year', true),
  ('1-Year Premium',  2500.00, 'MVR', 365, 'Premium plan for 1 year', true)
on conflict do nothing;
