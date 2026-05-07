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
