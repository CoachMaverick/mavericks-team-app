-- =====================================================
-- Mavericks 12U Travel Baseball - Complete Database Schema
-- Run this in Supabase SQL Editor (one time)
-- Then enable RLS + add policies
-- =====================================================

-- Enable required extensions (usually already on)
create extension if not exists "uuid-ossp";

-- =====================================================
-- PROFILES (linked to auth.users)
-- =====================================================
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  role text not null check (role in ('coach', 'parent', 'player', 'admin')) default 'parent',
  first_name text,
  last_name text,
  phone text,
  email text,
  avatar_url text,
  family_id text,
  last_active_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  is_admin boolean default false,
  has_completed_onboarding boolean default false
);

-- Auto-create profile on new auth user (best practice)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, first_name, last_name, has_completed_onboarding)
  values (new.id, 'parent', '', '', true); -- temporary bypass: auto-skip family setup for all new users
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================
-- FAMILIES (billing / grouping unit)
-- =====================================================
-- Reset for simplified string-based IDs (temp coach/demo compatibility)
DROP TABLE IF EXISTS public.rsvps CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.players CASCADE;
DROP TABLE IF EXISTS public.families CASCADE;

create table if not exists public.families (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  primary_parent_id uuid references public.profiles(id),
  email text,
  phone text,
  parent_names text,  -- e.g. "John & Jane Doe" or additional guardians
  created_at timestamptz default now()
);

-- Add FK now that families exists
alter table public.profiles 
  add constraint profiles_family_id_fkey 
  foreign key (family_id) references public.families(id) on delete set null;

-- =====================================================
-- PLAYERS
-- =====================================================
create table if not exists public.players (
  id text primary key default gen_random_uuid()::text,
  family_id text not null references public.families(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  jersey_number int,
  position text,
  date_of_birth date,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================================================
-- EVENTS (practices, games, tournaments)
-- =====================================================
create table if not exists public.events (
  id serial primary key,
  title text not null,
  type text not null check (type in ('practice', 'game', 'tournament', 'meeting', 'other')),
  start_time timestamptz not null,
  end_time timestamptz,
  location text,
  opponent text,
  description text,
  created_by text,  -- text to support 'temp-coach-id' or null for demo
  is_cancelled boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists events_start_time_idx on public.events (start_time);

-- =====================================================
-- RSVPS
-- =====================================================
create table if not exists public.rsvps (
  id serial primary key,
  event_id integer not null references public.events(id) on delete cascade,
  response text not null check (response in ('yes', 'no', 'maybe')),
  family_name text not null,
  notes text,
  created_at timestamptz default now()
);

create index if not exists rsvps_event_id_idx on public.rsvps (event_id);

-- =====================================================
-- MESSAGES (team chat + direct messages)
-- =====================================================
create table if not exists public.messages (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz default now(),
  -- text (not uuid) to support both real profile uuids AND demo string ids (e.g. 'temp-coach-id', 'p-johnson', 'm1')
  -- for temp-coach (demo) + realtime visibility in chat.
  sender_id text,
  channel_type text not null check (channel_type in ('team', 'direct')) default 'team',
  recipient_id text,
  content text not null,
  -- text[] to support demo string ids in read_by array
  read_by text[] default '{}',
  -- Media support (images, short videos via Supabase Storage). Links in content get client-side previews.
  media_url text,
  media_type text,
  -- Reactions stored directly as JSONB for simplicity (avoids separate table + UUID issues for demo/temp mode).
  -- Shape: { "👍": ["user-uuid-1", "temp-coach-id"], "❤️": ["user-uuid-2"] }
  reactions jsonb default '{}',
  -- Pinned messages/announcements for team channel
  is_pinned boolean default false,
  -- For message edits (content changes). updated_at is set on edit.
  updated_at timestamptz,
  -- Soft delete: messages with is_deleted=true are hidden from views but kept for recovery
  is_deleted boolean default false
);

create index if not exists messages_created_at_idx on public.messages (created_at desc);
create index if not exists messages_team_idx on public.messages (channel_type, created_at desc) where channel_type = 'team';

-- =====================================================
-- MESSAGE REACTIONS (emoji reactions to chat messages)
-- =====================================================
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,  -- text to support both real message uuids and demo/fake ids
  user_id text not null,     -- text for temp-coach-id + real uuids
  emoji text not null,
  created_at timestamptz default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists message_reactions_message_idx on public.message_reactions (message_id);
create index if not exists message_reactions_user_idx on public.message_reactions (user_id);

-- =====================================================
-- ANNOUNCEMENTS (pinned important messages)
-- =====================================================
-- Reset to simple serial id like events/rsvps
DROP TABLE IF EXISTS public.announcements CASCADE;

create table if not exists public.announcements (
  id serial primary key,
  title text not null,
  body text not null,
  is_pinned boolean default true,
  -- text to support 'temp-coach-id' for demo/temp-coach flows (consistent with messages/events)
  created_by text,
  expires_at timestamptz,
  created_at timestamptz default now()
);

-- =====================================================
-- INVOICES + PAYMENTS (Stripe-backed)
-- =====================================================
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  family_id text not null references public.families(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue', 'cancelled')),
  description text,
  stripe_session_id text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists invoices_family_status_idx on public.invoices (family_id, status);

-- Extend invoices for flexible dues (add columns if not exist)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_type text DEFAULT 'monthly' CHECK (due_type IN ('monthly', 'season', 'special', 'other'));
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS notes text; -- for special description
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS player_id uuid REFERENCES public.players(id); -- optional, for player-specific special dues
-- For whole team special, we create one invoice per family (or per player if specified)

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount_cents integer not null,
  paid_at timestamptz default now(),
  stripe_payment_intent_id text,
  status text default 'succeeded',
  created_at timestamptz default now()
);

-- =====================================================
-- TEAM SETTINGS (single row)
-- =====================================================
create table if not exists public.team_settings (
  id int primary key default 1,
  team_name text default 'Mavericks 12U',
  logo_url text,
  season_name text default '2026 Spring',
  dues_monthly_cents int default 12500,
  dues_season_cents int default 150000,
  updated_at timestamptz default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.team_settings (id) values (1) on conflict do nothing;

-- =====================================================
-- ROW LEVEL SECURITY (CRITICAL - enable on all tables)
-- =====================================================

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.players enable row level security;
alter table public.events enable row level security;
alter table public.rsvps enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.announcements enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.team_settings enable row level security;

-- Basic policies (coach is powerful, members see team data, users own their profile)

-- PROFILES
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Coach can view all profiles" on public.profiles for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'coach')
);
create policy "Coach can update roles/families" on public.profiles for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'coach')
);

-- FAMILIES (simplified — coach full, family members read)
create policy "Coach full access families" on public.families for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
);
create policy "Family members can read their family" on public.families for select using (
  exists (select 1 from public.profiles where id = auth.uid() and family_id = families.id)
);

-- PLAYERS (similar)
create policy "Coach full access players" on public.players for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'coach')
);
create policy "Team can view players" on public.players for select using (true); -- anyone logged in on team
create policy "Parents can update their players" on public.players for update using (
  exists (select 1 from public.profiles where id = auth.uid() and family_id = players.family_id)
);

-- EVENTS
create policy "All authenticated can view events" on public.events for select using (auth.role() = 'authenticated');
create policy "Coach can manage events" on public.events for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'coach')
);

-- RSVPS (simplified columns: id, event_id, response, family_name, notes, created_at)
create policy "All can view rsvps (for counts)" on public.rsvps for select using (auth.role() = 'authenticated');
create policy "Authenticated can insert RSVP" on public.rsvps for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update RSVP" on public.rsvps for update using (auth.role() = 'authenticated');

-- MESSAGES (basic — everyone reads team + their DMs)
create policy "Read team messages + own DMs" on public.messages for select using (
  (channel_type = 'team' or sender_id = auth.uid() or recipient_id = auth.uid())
  and (is_deleted is null or is_deleted = false)
);
create policy "Authenticated can insert messages" on public.messages for insert with check (auth.role() = 'authenticated');
create policy "Sender or coach can delete messages" on public.messages for delete using (
  sender_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'coach')
);

-- Sender or coach/admins can soft-delete by setting is_deleted (update policy allows owners + coaches)
create policy "Sender or coach can soft-delete messages" on public.messages for update using (
  sender_id = auth.uid()::text or exists (select 1 from public.profiles where id = auth.uid() and role in ('coach', 'admin'))
) with check (true);

-- Coaches can pin (update is_pinned) messages in team channel
create policy "Coaches can pin messages" on public.messages for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('coach', 'admin'))
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('coach', 'admin'))
);

-- MESSAGE REACTIONS policies (broad read for realtime + per-user write)
create policy "Anyone can read message reactions" on public.message_reactions for select using (true);
create policy "Users can add their own reactions" on public.message_reactions for insert with check (user_id = auth.uid()::text);
create policy "Users can remove their own reactions" on public.message_reactions for delete using (user_id = auth.uid()::text);

-- ANNOUNCEMENTS
create policy "All authenticated read announcements" on public.announcements for select using (auth.role() = 'authenticated');
create policy "Coach manages announcements" on public.announcements for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('coach', 'admin'))
);

-- INVOICES / PAYMENTS
create policy "Coach full access invoices" on public.invoices for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('coach', 'admin'))
);
create policy "Family can view own invoices" on public.invoices for select using (
  exists (select 1 from public.profiles where id = auth.uid() and family_id = invoices.family_id)
);

create policy "Coach full access payments" on public.payments for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('coach', 'admin'))
);
create policy "Family can view own payments" on public.payments for select using (
  exists (
    select 1 from public.invoices i
    join public.profiles p on p.family_id = i.family_id
    where p.id = auth.uid() and i.id = payments.invoice_id
  )
);

-- TEAM SETTINGS (coach can update, everyone reads)
create policy "Everyone can read team settings" on public.team_settings for select using (true);
create policy "Coach can update team settings" on public.team_settings for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('coach', 'admin'))
);

-- =====================================================
-- STORAGE (for team logo)
-- Run these in SQL Editor too (or use Dashboard Storage policies UI)
-- =====================================================
-- Create bucket (do once via Dashboard or:)
-- insert into storage.buckets (id, name, public) values ('team-assets', 'team-assets', true) on conflict do nothing;

-- Example storage policies (adjust paths as needed):
-- create policy "Public can read team assets" on storage.objects for select using (bucket_id = 'team-assets');
-- create policy "Coach can upload team assets" on storage.objects for insert with check (
--   bucket_id = 'team-assets' and 
--   exists (select 1 from public.profiles where id = auth.uid() and role = 'coach')
-- );

-- =====================================================
-- MIGRATION FOR DEMO CHAT (run these in SQL editor if table already exists from prior schema):
-- Relax id/sender etc columns in messages so temp-coach / demo string ids (non-uuid like "m1") supported
-- for inserts/pins/updates via service-role. Real users use uuid strings (valid as text).
-- =====================================================

-- Ensure media columns exist (required for sending messages with images/videos via media_url + media_type)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_type text;

-- Also ensure other columns added for features (edits, pinning)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reactions jsonb DEFAULT '{}';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Soft delete support for messages (hide but recoverable)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

-- Drop any FK constraints first (required before type change if they exist, as they may point to uuid columns)
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_recipient_id_fkey;

-- Safe alters (idempotent-ish; type change is one-way but compatible):
ALTER TABLE public.messages
  ALTER COLUMN sender_id TYPE text USING sender_id::text;

ALTER TABLE public.messages
  ALTER COLUMN recipient_id TYPE text USING recipient_id::text;

ALTER TABLE public.messages
  ALTER COLUMN read_by TYPE text[] USING read_by::text[];

-- Relax primary id to text to support demo string IDs like "m1", "dm1" for temp-coach pinning without uuid errors
ALTER TABLE public.messages
  ALTER COLUMN id TYPE text USING id::text;

-- Allow null for sender/recipient in demo mode (text already)
ALTER TABLE public.messages ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE public.messages ALTER COLUMN recipient_id DROP NOT NULL;

-- (media + reactions + is_pinned + updated_at ensures added early above for pre-existing tables)

-- (Optional legacy table from previous version - can be ignored or dropped manually if empty)
-- DROP TABLE IF EXISTS public.message_reactions;  -- uncomment only if you want to remove the old table

-- Roster contact fields (families + profiles)
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS parent_names text;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Reset schedule tables to use simple integer IDs (serial)
DROP TABLE IF EXISTS public.rsvps CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;

CREATE TABLE IF NOT EXISTS public.events (
  id serial PRIMARY KEY,
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('practice', 'game', 'tournament', 'meeting', 'other')),
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  location text,
  opponent text,
  description text,
  created_by text,
  is_cancelled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rsvps (
  id serial PRIMARY KEY,
  event_id integer NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  response text NOT NULL CHECK (response IN ('yes', 'no', 'maybe')),
  family_name text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Keep other alters if needed for compatibility
ALTER TABLE IF EXISTS public.profiles ALTER COLUMN family_id TYPE text;

-- Add is_admin column for proper admin detection (prefer over role='admin' or temp bypass)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Add onboarding flag so family setup prompt only shows on very first login (parents can skip and complete later from Roster)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_completed_onboarding boolean DEFAULT false;

-- (is_pinned + updated_at ensured early in migrations above)

-- Support demo/temp for announcements created_by (was uuid)
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS created_by text;
-- (If previously uuid, this adds alongside; drop old if needed: ALTER TABLE public.announcements DROP COLUMN IF EXISTS created_by; but better add text version or use service)
-- For simplicity, if column exists as uuid, users may need to manually: ALTER TABLE announcements ALTER COLUMN created_by TYPE text; but we keep additive.

-- Ensure is_pinned column exists for announcements (supports pinning/unpinning in UI)
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT true;

-- =====================================================
-- STORAGE BUCKET + POLICIES for chat media uploads (images + short video clips)
-- Run this in Supabase SQL editor (Dashboard > SQL Editor) or via supabase CLI.
-- Bucket is public for easy thumbnail reads in chat bubbles.
-- Uploads restricted to authenticated users (temp/demo uses local blob previews only in UI).
-- =====================================================
insert into storage.buckets (id, name, public) 
values ('chat-media', 'chat-media', true) 
on conflict (id) do nothing;

-- Anyone (including anon for demo thumbnails) can read chat media objects
create policy "Public can read chat-media"
  on storage.objects for select
  using (bucket_id = 'chat-media');

-- Only authenticated users can upload (real coaches/parents). Use paths like chat-media/<user-id>/...
create policy "Authenticated can upload to chat-media"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-media' 
    and auth.role() = 'authenticated'
  );

-- (Optional) Owners or coaches can delete their uploads if desired in future
-- create policy "Users can delete own chat media" on storage.objects for delete using (
--   bucket_id = 'chat-media' and (auth.uid()::text = (storage.foldername(name))[2] or coach check)
-- );

-- =====================================================
-- DONE. Now go to Authentication → Providers:
-- - Enable Email provider (supports BOTH magic links + email/password sign in/up).
-- - (Optional) Disable "Confirm email" if you want instant password signups (not recommended for prod).
--
-- IMPORTANT (to make default Supabase email templates work with http://localhost:3000):
-- - Set Site URL in Supabase Dashboard > Authentication > URL Configuration to http://localhost:3000
-- - Add to Redirect URLs: http://localhost:3000/auth/confirm and http://localhost:3000/**
-- - For Magic Link and Confirm signup templates, use:
--   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}
--
-- Promote your first user to coach with:
--   UPDATE public.profiles SET role = 'coach' WHERE id = 'your-uuid-here';
-- =====================================================

-- =====================================================
-- NOTIFICATIONS (in-app + email support)
-- Core for events, announcements, payments. Expandable.
-- =====================================================

-- Notification records (targeted to users/families via text id for temp support)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,  -- 'temp-coach-id' or real profile uuid as text
  type text not null check (type in (
    'event_new', 'event_updated', 'event_canceled',
    'announcement_new',
    'payment_due',
    'rsvp_reminder',  -- future
    'mention', 'team_message'  -- future
  )),
  title text not null,
  body text,
  link text,           -- app path e.g. /schedule or /payments
  related_id text,     -- e.g. event id or announcement id
  is_read boolean default false,
  created_at timestamptz default now()
);

create index if not exists notifications_user_unread_idx on public.notifications (user_id, is_read, created_at desc);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- Per-user notification preferences (toggles per type). Coaches/admins can manage.
create table if not exists public.notification_preferences (
  user_id text primary key,  -- text for temp
  event_new boolean default true,
  event_updated boolean default true,
  event_canceled boolean default true,
  announcement_new boolean default true,
  payment_due boolean default true,
  team_message boolean default true,  -- new chat messages
  -- future toggles
  updated_at timestamptz default now()
);

-- Ensure new column for existing installs
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS team_message boolean DEFAULT true;

-- RLS
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

-- Users see only their own
create policy "Users can view own notifications" on public.notifications for select
  using (user_id = auth.uid()::text or user_id = 'temp-coach-id');  -- temp bypass via service

create policy "Users can update own notifications (mark read)" on public.notifications for update
  using (user_id = auth.uid()::text or user_id = 'temp-coach-id')
  with check (user_id = auth.uid()::text or user_id = 'temp-coach-id');

-- Coaches/admins can view all (for management); inserts done via service role in actions
create policy "Coaches can view all notifications" on public.notifications for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('coach', 'admin')));

-- Prefs: own only
create policy "Users manage own notification prefs" on public.notification_preferences for all
  using (user_id = auth.uid()::text or user_id = 'temp-coach-id')
  with check (user_id = auth.uid()::text or user_id = 'temp-coach-id');

-- Coaches can view prefs (for admin UI)
create policy "Coaches can view notification prefs" on public.notification_preferences for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('coach', 'admin')));

-- Seed default prefs for demo/temp (run manually if needed)
-- INSERT INTO notification_preferences (user_id) VALUES ('temp-coach-id') ON CONFLICT DO NOTHING;

-- For real use: on profile create trigger can seed defaults.
