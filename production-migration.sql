-- ============================================================
-- MovieFlix Dashboard — Database Schema
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── Enums ───────────────────────────────────────────────────
create type subscription_status as enum (
  'pending', 'approved', 'rejected', 'active'
);

create type media_request_status as enum (
  'pending', 'approved', 'downloading', 'available', 'rejected'
);

create type registration_status as enum (
  'otp_sent', 'email_verified', 'pending', 'approved', 'rejected'
);

create type user_role as enum (
  'admin', 'user'
);

create type sender_role as enum (
  'admin', 'user'
);

-- ── Profiles / Users ────────────────────────────────────────
-- Extends Supabase auth.users with app-specific fields
create table public.profiles (
  id              uuid primary key default uuid_generate_v4(),
  email           text,
  phone           text,
  name            text not null default '',
  emby_user_id    text,
  role            user_role not null default 'user',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── Settings ────────────────────────────────────────────────
-- Single-row configuration table
create table public.settings (
  id                      integer primary key default 1 check (id = 1),
  emby_url                text not null default '',
  emby_api_key            text not null default '',
  seer_url                text not null default '',
  seer_api_key            text not null default '',
  sonarr_url              text not null default '',
  sonarr_api_key          text not null default '',
  radarr_url              text not null default '',
  radarr_api_key          text not null default '',
  resend_api_key          text not null default '',
  resend_from             text not null default 'MovieFlix <onboarding@resend.dev>',
  public_dashboard_url    text not null default 'https://movieflixhd.cloud',
  telegram_bot_token      text not null default '',
  telegram_admin_ids      text not null default '',
  admin_usernames         text[] not null default '{}',
  disable_auto_trial      boolean not null default false,
  registration_verification_mode text not null default 'both' check (registration_verification_mode in ('email', 'sms', 'both')),
  msgowl_api_key          text not null default '',
  msgowl_otp_api_key      text not null default '',
  msgowl_otp_base_url     text not null default 'https://otp.msgowl.com',
  msgowl_sender           text not null default 'MovieFlix',
  media_webhook_token     text not null default '',
  bank_accounts           jsonb not null default '[]',
  instructions            text not null default '',
  allow_user_theme_toggle boolean not null default true,
  updated_at              timestamptz not null default now()
);

-- Insert default settings row
insert into public.settings (id) values (1) on conflict do nothing;

-- ── Plans ───────────────────────────────────────────────────
create table public.plans (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  price         numeric(10,2) not null,
  currency      text not null default 'MVR',
  duration_days integer not null,
  description   text not null default '',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Subscriptions ───────────────────────────────────────────
create table public.subscriptions (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             text not null,           -- Emby user ID
  username            text not null,           -- Email / username
  email               text,
  phone               text,
  name                text,
  plan_id             text not null,
  plan_name           text not null,
  duration_days       integer not null,
  price               numeric(10,2) not null default 0,
  final_amount        numeric(10,2),
  discount_amount     numeric(10,2),
  currency            text not null default 'MVR',
  status              subscription_status not null default 'pending',
  is_trial            boolean not null default false,
  source              text not null default 'manual',
  slip_file_path      text,                     -- Supabase Storage path
  submitted_at        timestamptz not null default now(),
  approved_at         timestamptz,
  reviewed_at         timestamptz,
  start_date          timestamptz,
  end_date            timestamptz,
  playback_disabled_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_subscriptions_user_id on subscriptions(user_id);
create index idx_subscriptions_status on subscriptions(status);
create index idx_subscriptions_end_date on subscriptions(end_date);
create index idx_subscriptions_created_at on subscriptions(created_at);

-- ── Registrations ───────────────────────────────────────────
create table public.registrations (
  id                        uuid primary key default uuid_generate_v4(),
  name                      text not null,
  email                     text not null,
  phone                     text not null,
  status                    registration_status not null default 'pending',
  emby_user_id              text,
  otp_hash                  text,
  otp_expires_at            timestamptz,
  otp_email                 text,
  sms_otp_request_id        text,
  sms_otp_sent_at           timestamptz,
  sms_otp_verified_at       timestamptz,
  requires_email_otp        boolean not null default false,
  requires_sms_otp          boolean not null default false,
  forgot_otp_hash           text,
  forgot_otp_expires_at     timestamptz,
  forgot_otp_email          text,
  forgot_requested_at       timestamptz,
  forgot_reset_at           timestamptz,
  credentials_sms_sent_at   timestamptz,
  credentials_email_sent_at timestamptz,
  credentials_email_error   text,
  requested_at              timestamptz not null default now(),
  verified_at               timestamptz,
  approved_at               timestamptz,
  rejected_at               timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index idx_registrations_email on registrations(email);
create index idx_registrations_phone on registrations(phone);
create index idx_registrations_status on registrations(status);

-- ── Media Requests ──────────────────────────────────────────
create table public.media_requests (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               text not null,
  username              text,
  title                 text not null,
  media_type            text not null check (media_type in ('tv', 'movie')),
  tmdb_id               text,
  imdb_id               text,
  poster_path           text,
  poster_url            text,
  language              text,
  status                media_request_status not null default 'pending',
  jellyseerr_request_id text,
  download_progress     integer,
  release_status        text,
  available_at          timestamptz,
  notes                 text,
  root_folder           text,
  profile_id            text,
  requested_at          timestamptz not null default now(),
  approved_at           timestamptz,
  rejected_at           timestamptz,
  available_email_sent_at timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_media_requests_user_id on media_requests(user_id);
create index idx_media_requests_status on media_requests(status);
create index idx_media_requests_tmdb_id on media_requests(tmdb_id);

-- ── Unlimited Users ─────────────────────────────────────────
create table public.unlimited_users (
  id        uuid primary key default uuid_generate_v4(),
  user_id   text not null unique,
  username  text not null default '',
  enabled   boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_unlimited_users_user_id on unlimited_users(user_id);

-- ── User Tags ───────────────────────────────────────────────
create table public.user_tags (
  id        uuid primary key default uuid_generate_v4(),
  user_id   text not null,
  tag       text not null,
  created_at timestamptz not null default now(),
  unique(user_id, tag)
);

create index idx_user_tags_user_id on user_tags(user_id);

-- ── User Contacts ───────────────────────────────────────────
create table public.user_contacts (
  id        uuid primary key default uuid_generate_v4(),
  user_id   text not null unique,
  email     text,
  phone     text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_user_contacts_email on user_contacts(email);
create index idx_user_contacts_phone on user_contacts(phone);

-- ── Chat ────────────────────────────────────────────────────
create table public.chat_conversations (
  id               uuid primary key default uuid_generate_v4(),
  user_id          text not null,
  username         text not null,
  display_name     text,
  email            text,
  phone            text,
  unread_for_admin integer not null default 0,
  unread_for_user  integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_chat_conversations_user_id on chat_conversations(user_id);
create index idx_chat_conversations_updated_at on chat_conversations(updated_at desc);

create table public.chat_messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  sender_role     sender_role not null,
  sender_name     text not null,
  body            text not null default '',
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  via             text,
  created_at      timestamptz not null default now()
);

create index idx_chat_messages_conversation_id on chat_messages(conversation_id);
create index idx_chat_messages_created_at on chat_messages(conversation_id, created_at);

-- ── Telegram State ──────────────────────────────────────────
create table public.telegram_state (
  id              uuid primary key default uuid_generate_v4(),
  entity_type     text not null check (entity_type in ('payment', 'media')),
  entity_id       text not null,
  chat_id         text not null,
  message_id      text,
  has_photo       boolean not null default false,
  created_at      timestamptz not null default now()
);

create index idx_telegram_state_entity on telegram_state(entity_type, entity_id);

-- ── Emby Guide Images ───────────────────────────────────────
create table public.emby_guide_images (
  slot      integer primary key check (slot between 1 and 10),
  file_path text not null,
  mime_type text not null,
  updated_at timestamptz not null default now()
);

-- ── Audit Log ──────────────────────────────────────────────
create table public.audit_log (
  id        bigint generated always as identity primary key,
  actor     text,
  action    text not null,
  details   jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_log_created_at on audit_log(created_at desc);
create index idx_audit_log_actor on audit_log(actor);
-- ============================================================
-- MovieFlix Dashboard — Row-Level Security Policies
-- ============================================================

-- ── Helper Functions ────────────────────────────────────────

-- Check if the authenticated user is an admin
create or replace function public.is_admin()
returns boolean
language plpgsql security definer
as $$
begin
  return coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
end;
$$;

-- Get the current user's Emby user ID from JWT
create or replace function public.current_emby_user_id()
returns text
language plpgsql security definer
as $$
begin
  return auth.jwt() -> 'app_metadata' ->> 'emby_user_id';
end;
$$;

-- Check if the given user_id matches the authenticated user
create or replace function public.is_self(user_id text)
returns boolean
language plpgsql security definer
as $$
begin
  return coalesce(
    public.current_emby_user_id() = user_id,
    false
  );
end;
$$;

-- ── Enable RLS on all tables ────────────────────────────────

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.registrations enable row level security;
alter table public.media_requests enable row level security;
alter table public.unlimited_users enable row level security;
alter table public.user_tags enable row level security;
alter table public.user_contacts enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.telegram_state enable row level security;
alter table public.emby_guide_images enable row level security;
alter table public.audit_log enable row level security;

-- ── profiles ────────────────────────────────────────────────
-- Users can read own profile; admins can read all
create policy "users_read_own_profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

-- Users can update own profile (except role); admins can update all
create policy "users_update_own_profile"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- Only admins can delete profiles
create policy "admins_delete_profiles"
  on public.profiles for delete
  using (public.is_admin());

-- ── settings ────────────────────────────────────────────────
-- Anyone (including anon) can read settings
create policy "public_read_settings"
  on public.settings for select
  using (true);

-- Only admins can update settings
create policy "admins_update_settings"
  on public.settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── plans ───────────────────────────────────────────────────
-- Anyone (including anon) can read active plans
create policy "public_read_plans"
  on public.plans for select
  using (true);

-- Only admins can insert/update/delete plans
create policy "admins_manage_plans"
  on public.plans for insert
  with check (public.is_admin());

create policy "admins_update_plans"
  on public.plans for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins_delete_plans"
  on public.plans for delete
  using (public.is_admin());

-- ── subscriptions ───────────────────────────────────────────
-- Users can read their own subscriptions; admins can read all
create policy "users_read_own_subscriptions"
  on public.subscriptions for select
  using (public.is_self(user_id) or public.is_admin());

-- Users can insert their own subscriptions (for payment submissions)
create policy "users_insert_own_subscriptions"
  on public.subscriptions for insert
  with check (
    public.is_self(user_id) or public.is_admin()
  );

-- Users can update own subscriptions (limited); admins can update all
create policy "admins_update_subscriptions"
  on public.subscriptions for update
  using (public.is_admin())
  with check (public.is_admin());

-- Only admins can delete subscriptions
create policy "admins_delete_subscriptions"
  on public.subscriptions for delete
  using (public.is_admin());

-- ── registrations ───────────────────────────────────────────
-- Allow anonymous inserts (for signup flow: OTP request, verify, forgot)
create policy "public_insert_registrations"
  on public.registrations for insert
  with check (true);

-- Allow reading own registration by email (during OTP verification flow)
create policy "public_read_own_registration"
  on public.registrations for select
  using (
    public.is_admin()
    or email = current_setting('request.jwt.claims', true)::jsonb ->> 'email'
  );

-- Allow updating own registration (OTP verification steps)
create policy "public_update_own_registration"
  on public.registrations for update
  using (
    public.is_admin()
    or email = current_setting('request.jwt.claims', true)::jsonb ->> 'email'
  );

-- Only admins can delete registrations
create policy "admins_delete_registrations"
  on public.registrations for delete
  using (public.is_admin());

-- ── media_requests ──────────────────────────────────────────
-- Users can read own requests; admins can read all
create policy "users_read_own_requests"
  on public.media_requests for select
  using (public.is_self(user_id) or public.is_admin());

-- Users can insert their own requests
create policy "users_insert_own_requests"
  on public.media_requests for insert
  with check (public.is_self(user_id) or public.is_admin());

-- Users can update own requests (e.g. cancel); admins can update all
create policy "users_update_own_requests"
  on public.media_requests for update
  using (public.is_self(user_id) or public.is_admin())
  with check (public.is_self(user_id) or public.is_admin());

-- Users can delete own pending requests; admins can delete all
create policy "users_delete_own_requests"
  on public.media_requests for delete
  using (public.is_self(user_id) or public.is_admin());

-- ── unlimited_users ─────────────────────────────────────────
-- Only admins can manage unlimited users
create policy "admins_manage_unlimited_users"
  on public.unlimited_users for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── user_tags ───────────────────────────────────────────────
-- Only admins can manage user tags
create policy "admins_manage_user_tags"
  on public.user_tags for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── user_contacts ───────────────────────────────────────────
-- Users can read own contact; admins can read all
create policy "users_read_own_contacts"
  on public.user_contacts for select
  using (public.is_self(user_id) or public.is_admin());

-- Users can upsert their own contact
create policy "users_insert_own_contacts"
  on public.user_contacts for insert
  with check (public.is_self(user_id) or public.is_admin());

create policy "users_update_own_contacts"
  on public.user_contacts for update
  using (public.is_self(user_id) or public.is_admin())
  with check (public.is_self(user_id) or public.is_admin());

-- Only admins can delete contacts
create policy "admins_delete_contacts"
  on public.user_contacts for delete
  using (public.is_admin());

-- ── chat_conversations ──────────────────────────────────────
-- Users can read only their own conversations; admins read all
create policy "users_read_own_conversations"
  on public.chat_conversations for select
  using (public.is_self(user_id) or public.is_admin());

-- Users can insert their own conversation
create policy "users_insert_own_conversations"
  on public.chat_conversations for insert
  with check (public.is_self(user_id) or public.is_admin());

-- Users can update their own conversation (e.g. read receipts)
create policy "users_update_own_conversations"
  on public.chat_conversations for update
  using (public.is_self(user_id) or public.is_admin());

-- ── chat_messages ───────────────────────────────────────────
-- Users can read messages in their conversations; admins read all
create policy "users_read_own_messages"
  on public.chat_messages for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.chat_conversations c
      where c.id = chat_messages.conversation_id
      and public.is_self(c.user_id)
    )
  );

-- Users can insert into their own conversations; admins can insert anywhere
create policy "users_insert_own_messages"
  on public.chat_messages for insert
  with check (
    public.is_admin()
    or exists (
      select 1 from public.chat_conversations c
      where c.id = chat_messages.conversation_id
      and public.is_self(c.user_id)
    )
  );

-- ── telegram_state ──────────────────────────────────────────
-- Only admins can manage telegram state
create policy "admins_manage_telegram_state"
  on public.telegram_state for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── emby_guide_images ───────────────────────────────────────
-- Public read for guide images
create policy "public_read_guide_images"
  on public.emby_guide_images for select
  using (true);

-- Only admins can manage guide images
create policy "admins_manage_guide_images"
  on public.emby_guide_images for insert
  with check (public.is_admin());

create policy "admins_update_guide_images"
  on public.emby_guide_images for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── audit_log ───────────────────────────────────────────────
-- Only admins can read audit logs
create policy "admins_read_audit_log"
  on public.audit_log for select
  using (public.is_admin());

-- Any authenticated user can insert audit entries (via server)
create policy "authenticated_insert_audit_log"
  on public.audit_log for insert
  with check (auth.role() = 'authenticated');
-- ============================================================
-- MovieFlix Dashboard — Triggers & Functions
-- ============================================================

-- ── updated_at auto-update trigger ──────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply to all tables with updated_at column
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_settings_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

create trigger trg_plans_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create trigger trg_registrations_updated_at
  before update on public.registrations
  for each row execute function public.set_updated_at();

create trigger trg_media_requests_updated_at
  before update on public.media_requests
  for each row execute function public.set_updated_at();

create trigger trg_user_contacts_updated_at
  before update on public.user_contacts
  for each row execute function public.set_updated_at();

create trigger trg_chat_conversations_updated_at
  before update on public.chat_conversations
  for each row execute function public.set_updated_at();

create trigger trg_emby_guide_images_updated_at
  before update on public.emby_guide_images
  for each row execute function public.set_updated_at();

-- ── Auto-update chat_conversations.updated_at on new message ─
create or replace function public.bump_conversation_on_message()
returns trigger
language plpgsql
as $$
begin
  update public.chat_conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger trg_bump_conversation
  after insert on public.chat_messages
  for each row execute function public.bump_conversation_on_message();

-- ── Auto-increment unread counters ──────────────────────────
create or replace function public.increment_unread()
returns trigger
language plpgsql
as $$
begin
  if new.sender_role = 'user' then
    update public.chat_conversations
    set unread_for_admin = unread_for_admin + 1
    where id = new.conversation_id;
  elsif new.sender_role = 'admin' then
    update public.chat_conversations
    set unread_for_user = unread_for_user + 1
    where id = new.conversation_id;
  end if;
  return new;
end;
$$;

create trigger trg_increment_unread
  after insert on public.chat_messages
  for each row execute function public.increment_unread();

-- ── Audit log helper ────────────────────────────────────────
create or replace function public.add_audit_entry(
  p_actor text,
  p_action text,
  p_details jsonb default null
)
returns void
language plpgsql security definer
as $$
begin
  insert into public.audit_log (actor, action, details)
  values (p_actor, p_action, p_details);
end;
$$;

-- ── Mark subscription active on approve ─────────────────────
create or replace function public.handle_subscription_approval()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'approved' and old.status = 'pending' then
    new.approved_at = coalesce(new.approved_at, now());
    new.reviewed_at = coalesce(new.reviewed_at, now());
    -- Calculate end_date if start_date is set
    if new.start_date is not null then
      new.end_date = new.start_date + (new.duration_days || ' days')::interval;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_subscription_approval
  before update on public.subscriptions
  for each row
  when (new.status = 'approved' and old.status = 'pending')
  execute function public.handle_subscription_approval();

-- ── Enforce single-row settings ─────────────────────────────
create or replace function public.enforce_single_row_settings()
returns trigger
language plpgsql
as $$
begin
  -- No-op: the CHECK constraint already enforces id = 1
  return new;
end;
$$;

-- ── Resolve user contact from email or phone ────────────────
create or replace function public.resolve_user_contact(
  p_query text
)
returns table(user_id text, email text, phone text)
language plpgsql security definer
as $$
begin
  return query
  select uc.user_id, uc.email, uc.phone
  from public.user_contacts uc
  where uc.email = p_query or uc.phone = p_query
  limit 1;
end;
$$;
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

-- Fix profiles table for Emby auth (no Supabase Auth dependency)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trending_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_all ON public.profiles FOR ALL USING (true) WITH CHECK (true);

-- Add TMDB API key column
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS tmdb_api_key text NOT NULL DEFAULT '';

-- Notify PostgREST
NOTIFY pgrst, 'reload schema';

-- Seed plans
INSERT INTO public.plans (name, price, currency, duration_days, description, active) VALUES
  ('Basic Plan',      150.00, 'MVR', 30,  'Standard quality, 1 device', true),
  ('Standard Plan',   250.00, 'MVR', 30,  'HD quality, 2 devices', true),
  ('Premium Plan',    350.00, 'MVR', 30,  '4K quality, 4 devices', true),
  ('3-Month Basic',   400.00, 'MVR', 90,  'Basic plan for 3 months', true),
  ('3-Month Standard',650.00, 'MVR', 90,  'Standard plan for 3 months', true),
  ('3-Month Premium', 900.00, 'MVR', 90,  'Premium plan for 3 months', true),
  ('1-Year Basic',    1200.00, 'MVR', 365, 'Basic plan for 1 year', true),
  ('1-Year Premium',  2500.00, 'MVR', 365, 'Premium plan for 1 year', true)
ON CONFLICT DO NOTHING;

-- Insert default settings row
INSERT INTO public.settings (id) VALUES (1) ON CONFLICT DO NOTHING;
