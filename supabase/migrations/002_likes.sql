-- ============================================================
-- MOVIE / TV LIKES
-- ============================================================
CREATE TABLE public.movie_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  media_type media_type NOT NULL,
  title TEXT NOT NULL,
  poster_path TEXT,
  genre_ids INTEGER[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tmdb_id, media_type)
);

CREATE INDEX idx_movie_likes_user ON public.movie_likes(user_id, created_at DESC);

ALTER TABLE public.movie_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own likes" ON public.movie_likes FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own likes" ON public.movie_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own likes" ON public.movie_likes FOR DELETE
  USING (auth.uid() = user_id);
