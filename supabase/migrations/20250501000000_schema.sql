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
