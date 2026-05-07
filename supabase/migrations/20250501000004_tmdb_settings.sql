alter table public.settings add column if not exists tmdb_api_key text not null default '';
