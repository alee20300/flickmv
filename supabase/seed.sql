-- ============================================================
-- SAMPLE USERS SEED
-- ============================================================

-- Insert auth users (each has a unique id prefix → unique auto-username)
INSERT INTO auth.users (
  id, instance_id, aud, role,
  phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, encrypted_password,
  created_at, updated_at,
  confirmation_token, recovery_token,
  email_change_token_new, email_change
) VALUES
  ('11111111-1111-1111-1111-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','+19001110001',NOW(),'{"provider":"phone","providers":["phone"]}','{}',FALSE,'',NOW(),NOW(),'','','',''),
  ('22222222-2222-2222-2222-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','+19001110002',NOW(),'{"provider":"phone","providers":["phone"]}','{}',FALSE,'',NOW(),NOW(),'','','',''),
  ('33333333-3333-3333-3333-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','+19001110003',NOW(),'{"provider":"phone","providers":["phone"]}','{}',FALSE,'',NOW(),NOW(),'','','',''),
  ('44444444-4444-4444-4444-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','+19001110004',NOW(),'{"provider":"phone","providers":["phone"]}','{}',FALSE,'',NOW(),NOW(),'','','',''),
  ('55555555-5555-5555-5555-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','+19001110005',NOW(),'{"provider":"phone","providers":["phone"]}','{}',FALSE,'',NOW(),NOW(),'','','',''),
  ('66666666-6666-6666-6666-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','+19001110006',NOW(),'{"provider":"phone","providers":["phone"]}','{}',FALSE,'',NOW(),NOW(),'','','','')
ON CONFLICT (id) DO NOTHING;

-- Update public.users profiles (trigger auto-created bare rows above)
UPDATE public.users SET username='reel_raj',    display_name='Raj Patel',      bio='Cinema is life. Scorsese fan.',   favorite_genres=ARRAY[18,80],    xp_total=5210, subscription_tier='premium_plus', onboarding_completed=TRUE WHERE id='33333333-3333-3333-3333-000000000003';
UPDATE public.users SET username='tv_queen_n',  display_name='Noor Adnan',     bio='Series over movies, always 📺',  favorite_genres=ARRAY[18,9648],  xp_total=4100, subscription_tier='premium',      onboarding_completed=TRUE WHERE id='66666666-6666-6666-6666-000000000006';
UPDATE public.users SET username='alex_mv',     display_name='Alex Morrison',  bio='Horror & thriller addict 🎬',    favorite_genres=ARRAY[27,53],    xp_total=3420, subscription_tier='premium',      onboarding_completed=TRUE WHERE id='11111111-1111-1111-1111-000000000001';
UPDATE public.users SET username='cine_omar',   display_name='Omar Farouk',    bio='Action & sci-fi nerd 🚀',        favorite_genres=ARRAY[28,878],   xp_total=2780, subscription_tier='premium',      onboarding_completed=TRUE WHERE id='55555555-5555-5555-5555-000000000005';
UPDATE public.users SET username='sara_reels',  display_name='Sara Khalid',    bio='Bollywood forever 🇮🇳✨',        favorite_genres=ARRAY[35,10749], xp_total=1850, subscription_tier='free',         onboarding_completed=TRUE WHERE id='22222222-2222-2222-2222-000000000002';
UPDATE public.users SET username='mina_films',  display_name='Mina Al-Hassan', bio='Docs & arthouse 🎞️',             favorite_genres=ARRAY[99,36],    xp_total=920,  subscription_tier='free',         onboarding_completed=TRUE WHERE id='44444444-4444-4444-4444-000000000004';

-- Sample public watchlists
INSERT INTO public.watchlists (id, owner_id, title, description, visibility, item_count) VALUES
  ('bbbb0001-0000-0000-0000-000000000001','33333333-3333-3333-3333-000000000003','Scorsese Ranked',      'Every Scorsese film ranked by Raj',   'public',12),
  ('bbbb0002-0000-0000-0000-000000000002','11111111-1111-1111-1111-000000000001','Must-Watch Horror',    'The scariest films of the decade',    'public', 8),
  ('bbbb0003-0000-0000-0000-000000000003','66666666-6666-6666-6666-000000000006','Binge-Worthy Series',  'TV shows worth losing sleep over',    'public',15),
  ('bbbb0004-0000-0000-0000-000000000004','55555555-5555-5555-5555-000000000005','Sci-Fi Essentials',    'From 2001 to Dune',                   'public',10),
  ('bbbb0005-0000-0000-0000-000000000005','22222222-2222-2222-2222-000000000002','Bollywood Classics',   'Timeless Hindi cinema',               'public', 9),
  ('bbbb0006-0000-0000-0000-000000000006','44444444-4444-4444-4444-000000000004','Docs That Changed Me', 'Documentaries everyone should watch', 'public', 7)
ON CONFLICT (id) DO NOTHING;

-- Leaderboard entries (current week + month)
INSERT INTO public.leaderboard_entries (user_id, period, xp) VALUES
  ('33333333-3333-3333-3333-000000000003','weekly_'||TO_CHAR(NOW(),'YYYY_"W"IW'), 810),
  ('66666666-6666-6666-6666-000000000006','weekly_'||TO_CHAR(NOW(),'YYYY_"W"IW'), 610),
  ('11111111-1111-1111-1111-000000000001','weekly_'||TO_CHAR(NOW(),'YYYY_"W"IW'), 420),
  ('55555555-5555-5555-5555-000000000005','weekly_'||TO_CHAR(NOW(),'YYYY_"W"IW'), 340),
  ('22222222-2222-2222-2222-000000000002','weekly_'||TO_CHAR(NOW(),'YYYY_"W"IW'), 180),
  ('44444444-4444-4444-4444-000000000004','weekly_'||TO_CHAR(NOW(),'YYYY_"W"IW'),  90),
  ('33333333-3333-3333-3333-000000000003','monthly_'||TO_CHAR(NOW(),'YYYY_MM'),   5210),
  ('66666666-6666-6666-6666-000000000006','monthly_'||TO_CHAR(NOW(),'YYYY_MM'),   4100),
  ('11111111-1111-1111-1111-000000000001','monthly_'||TO_CHAR(NOW(),'YYYY_MM'),   3420),
  ('55555555-5555-5555-5555-000000000005','monthly_'||TO_CHAR(NOW(),'YYYY_MM'),   2780),
  ('22222222-2222-2222-2222-000000000002','monthly_'||TO_CHAR(NOW(),'YYYY_MM'),   1850),
  ('44444444-4444-4444-4444-000000000004','monthly_'||TO_CHAR(NOW(),'YYYY_MM'),    920)
ON CONFLICT (user_id, period) DO UPDATE SET xp = EXCLUDED.xp;

-- Verify
SELECT username, display_name, xp_total, subscription_tier FROM public.users ORDER BY xp_total DESC;
