-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE subscription_tier AS ENUM ('free', 'premium', 'premium_plus');
CREATE TYPE visibility_type AS ENUM ('public', 'friends', 'private');
CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'blocked');
CREATE TYPE media_type AS ENUM ('movie', 'tv');

-- ============================================================
-- USERS (extends auth.users)
-- ============================================================
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT UNIQUE,
  bio TEXT,
  favorite_genres INTEGER[] DEFAULT '{}',
  subscription_tier subscription_tier NOT NULL DEFAULT 'free',
  xp_total INTEGER NOT NULL DEFAULT 0,
  push_token TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FRIENDSHIPS
-- ============================================================
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status friendship_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
CREATE INDEX idx_friendships_addressee ON public.friendships(addressee_id);
CREATE INDEX idx_friendships_requester ON public.friendships(requester_id);

-- ============================================================
-- WATCHLISTS
-- ============================================================
CREATE TABLE public.watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  cover_tmdb_id INTEGER,
  cover_media_type media_type,
  visibility visibility_type NOT NULL DEFAULT 'private',
  is_collaborative BOOLEAN NOT NULL DEFAULT FALSE,
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_watchlists_owner ON public.watchlists(owner_id);
CREATE INDEX idx_watchlists_public ON public.watchlists(visibility, item_count DESC) WHERE visibility = 'public';

-- ============================================================
-- WATCHLIST COLLABORATORS
-- ============================================================
CREATE TABLE public.watchlist_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID NOT NULL REFERENCES public.watchlists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  can_edit BOOLEAN NOT NULL DEFAULT TRUE,
  invited_by UUID REFERENCES public.users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(watchlist_id, user_id)
);
CREATE INDEX idx_collaborators_watchlist ON public.watchlist_collaborators(watchlist_id);
CREATE INDEX idx_collaborators_user ON public.watchlist_collaborators(user_id);

-- ============================================================
-- WATCHLIST ITEMS
-- ============================================================
CREATE TABLE public.watchlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID NOT NULL REFERENCES public.watchlists(id) ON DELETE CASCADE,
  added_by UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  tmdb_id INTEGER NOT NULL,
  media_type media_type NOT NULL,
  title TEXT NOT NULL,
  poster_path TEXT,
  backdrop_path TEXT,
  overview TEXT,
  release_date DATE,
  vote_average NUMERIC(3,1),
  runtime INTEGER,
  sort_order REAL NOT NULL DEFAULT 0,
  watched BOOLEAN NOT NULL DEFAULT FALSE,
  watched_at TIMESTAMPTZ,
  watch_progress INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(watchlist_id, tmdb_id, media_type)
);
CREATE INDEX idx_items_watchlist ON public.watchlist_items(watchlist_id, sort_order);
CREATE INDEX idx_items_watched ON public.watchlist_items(watchlist_id, watched);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, read, created_at DESC);

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tier subscription_tier NOT NULL,
  store TEXT,
  product_id TEXT,
  transaction_id TEXT UNIQUE,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ============================================================
-- LEADERBOARD ENTRIES
-- ============================================================
CREATE TABLE public.leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  rank INTEGER,
  badges_earned TEXT[] DEFAULT '{}',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, period)
);
CREATE INDEX idx_leaderboard_period ON public.leaderboard_entries(period, xp DESC);

-- ============================================================
-- ACTIVITY FEED (denormalized)
-- ============================================================
CREATE TABLE public.activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  tmdb_id INTEGER,
  media_type media_type,
  media_title TEXT,
  poster_path TEXT,
  watchlist_id UUID REFERENCES public.watchlists(id) ON DELETE SET NULL,
  watchlist_title TEXT,
  target_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_activity_actor ON public.activity_feed(actor_id, created_at DESC);

-- ============================================================
-- TRIGGERS: updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_friendships_updated_at
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_watchlists_updated_at
  BEFORE UPDATE ON public.watchlists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TRIGGER: maintain watchlist item_count
CREATE OR REPLACE FUNCTION public.update_watchlist_item_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.watchlists SET item_count = item_count + 1 WHERE id = NEW.watchlist_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.watchlists SET item_count = GREATEST(0, item_count - 1) WHERE id = OLD.watchlist_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_watchlist_item_count
  AFTER INSERT OR DELETE ON public.watchlist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_watchlist_item_count();

-- TRIGGER: auto-create user profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, username, phone)
  VALUES (
    NEW.id,
    'user_' || substr(NEW.id::text, 1, 8),
    NEW.phone
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- XP AWARD FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.award_xp(p_user_id UUID, p_amount INTEGER, p_reason TEXT DEFAULT '')
RETURNS VOID AS $$
DECLARE
  v_week TEXT := 'weekly_' || TO_CHAR(NOW(), 'YYYY_"W"IW');
  v_month TEXT := 'monthly_' || TO_CHAR(NOW(), 'YYYY_MM');
BEGIN
  UPDATE public.users SET xp_total = xp_total + p_amount WHERE id = p_user_id;
  INSERT INTO public.leaderboard_entries (user_id, period, xp)
    VALUES (p_user_id, v_week, p_amount)
    ON CONFLICT (user_id, period) DO UPDATE SET xp = leaderboard_entries.xp + p_amount;
  INSERT INTO public.leaderboard_entries (user_id, period, xp)
    VALUES (p_user_id, v_month, p_amount)
    ON CONFLICT (user_id, period) DO UPDATE SET xp = leaderboard_entries.xp + p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;

-- USERS
CREATE POLICY "Users can read all profiles" ON public.users FOR SELECT USING (TRUE);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- FRIENDSHIPS
CREATE POLICY "Read own friendships" ON public.friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "Create friend requests" ON public.friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Update own friendships" ON public.friendships FOR UPDATE
  USING (auth.uid() = addressee_id OR auth.uid() = requester_id);
CREATE POLICY "Delete own friendships" ON public.friendships FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- HELPER FUNCTIONS for RLS
CREATE OR REPLACE FUNCTION public.is_friends_with(other_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = auth.uid() AND addressee_id = other_user_id)
        OR (addressee_id = auth.uid() AND requester_id = other_user_id))
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.can_access_watchlist(wl_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.watchlists w
    WHERE w.id = wl_id AND (
      w.owner_id = auth.uid()
      OR w.visibility = 'public'
      OR (w.visibility = 'friends' AND public.is_friends_with(w.owner_id))
      OR EXISTS (
        SELECT 1 FROM public.watchlist_collaborators wc
        WHERE wc.watchlist_id = w.id AND wc.user_id = auth.uid()
      )
    )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- WATCHLISTS
CREATE POLICY "Read watchlists by visibility" ON public.watchlists FOR SELECT
  USING (public.can_access_watchlist(id));
CREATE POLICY "Owner can create watchlist" ON public.watchlists FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner can update watchlist" ON public.watchlists FOR UPDATE
  USING (auth.uid() = owner_id);
CREATE POLICY "Owner can delete watchlist" ON public.watchlists FOR DELETE
  USING (auth.uid() = owner_id);

-- WATCHLIST ITEMS
CREATE POLICY "Read items of accessible watchlists" ON public.watchlist_items FOR SELECT
  USING (public.can_access_watchlist(watchlist_id));
CREATE POLICY "Owner or editor can insert items" ON public.watchlist_items FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.watchlists w WHERE w.id = watchlist_id AND w.owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.watchlist_collaborators wc
      WHERE wc.watchlist_id = watchlist_id AND wc.user_id = auth.uid() AND wc.can_edit = TRUE
    )
  );
CREATE POLICY "Owner or editor can update items" ON public.watchlist_items FOR UPDATE
  USING (public.can_access_watchlist(watchlist_id));
CREATE POLICY "Owner or adder can delete items" ON public.watchlist_items FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.watchlists w WHERE w.id = watchlist_id AND w.owner_id = auth.uid())
    OR added_by = auth.uid()
  );

-- COLLABORATORS
CREATE POLICY "Read collaborators of accessible watchlists" ON public.watchlist_collaborators FOR SELECT
  USING (public.can_access_watchlist(watchlist_id));
CREATE POLICY "Owner can add collaborators" ON public.watchlist_collaborators FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.watchlists w WHERE w.id = watchlist_id AND w.owner_id = auth.uid())
  );
CREATE POLICY "Owner or self can remove collaborator" ON public.watchlist_collaborators FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.watchlists w WHERE w.id = watchlist_id AND w.owner_id = auth.uid())
    OR user_id = auth.uid()
  );

-- NOTIFICATIONS
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Anyone can insert notifications" ON public.notifications FOR INSERT
  WITH CHECK (TRUE);

-- SUBSCRIPTIONS
CREATE POLICY "Users read own subscription" ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- LEADERBOARD
CREATE POLICY "Anyone can read leaderboard" ON public.leaderboard_entries FOR SELECT
  USING (TRUE);

-- ACTIVITY FEED
CREATE POLICY "Friends can read activity" ON public.activity_feed FOR SELECT
  USING (actor_id = auth.uid() OR public.is_friends_with(actor_id));
CREATE POLICY "Users can insert own activity" ON public.activity_feed FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

-- ============================================================
-- ENABLE REALTIME
-- (Run in Supabase dashboard: Database → Replication)
-- Tables: watchlist_items, watchlist_collaborators, notifications, activity_feed
-- ============================================================
