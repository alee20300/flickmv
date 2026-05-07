-- Trending media cache for landing page
create table public.trending_media (
  id            serial primary key,
  tmdb_id       text not null,
  title         text not null,
  media_type    text not null check (media_type in ('movie', 'tv')),
  poster_path   text,
  backdrop_path text,
  rating        numeric(3,1),
  category      text not null default 'trending',
  ordering      integer not null default 0,
  fetched_at    timestamptz not null default now()
);

create index idx_trending_media_category on trending_media(category, ordering);

alter table public.trending_media enable row level security;
create policy "public_read_trending" on public.trending_media for select using (true);
