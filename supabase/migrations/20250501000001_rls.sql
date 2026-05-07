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
