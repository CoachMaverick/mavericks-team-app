-- =====================================================
-- Sample seed data for Mavericks 12U (use after schema.sql)
-- Run in Supabase SQL Editor AFTER you have promoted your user to 'coach'
-- Replace the coach UUID with your own profile id.
-- =====================================================

-- IMPORTANT: Get your coach UUID first:
-- SELECT id, email FROM auth.users;
-- Then replace 'COACH_UUID_HERE' below.

-- 1. Create a couple of families
INSERT INTO public.families (id, name, primary_parent_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Johnson Family', 'COACH_UUID_HERE'),
  ('22222222-2222-2222-2222-222222222222', 'Martinez Family', null)
ON CONFLICT (id) DO NOTHING;

-- 2. Link coach to a family (update your profile)
-- UPDATE public.profiles SET family_id = '11111111-1111-1111-1111-111111111111', first_name = 'Alex', last_name = 'Coach' WHERE id = 'COACH_UUID_HERE';

-- 3. Add some parent profiles (you will normally create via magic link, then link)
-- For demo, we manually insert some profile rows (in real life the trigger creates them)
-- These are just for seed; real users sign up themselves.

-- 4. Players for Johnson family
INSERT INTO public.players (family_id, first_name, last_name, jersey_number, position, date_of_birth, is_active) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Liam', 'Johnson', 12, 'Pitcher', '2013-04-15', true),
  ('11111111-1111-1111-1111-111111111111', 'Noah', 'Johnson', 7, 'Shortstop', '2013-08-22', true);

-- Players for Martinez family
INSERT INTO public.players (family_id, first_name, last_name, jersey_number, position, date_of_birth, is_active) VALUES
  ('22222222-2222-2222-2222-222222222222', 'Sophia', 'Martinez', 22, 'Outfield', '2013-02-03', true),
  ('22222222-2222-2222-2222-222222222222', 'Mateo', 'Martinez', 3, 'Catcher', '2014-01-10', true);

-- 5. Some events
INSERT INTO public.events (title, type, start_time, end_time, location, opponent, description, created_by, is_cancelled) VALUES
  ('Spring Practice #1', 'practice', NOW() + interval '2 days', NOW() + interval '2 days' + interval '90 minutes', 'Central Park Field 3', NULL, 'Bring water and gloves. Focus on infield drills.', 'COACH_UUID_HERE', false),
  ('Game vs Red Sox', 'game', NOW() + interval '5 days', NOW() + interval '5 days' + interval '2 hours', 'Lincoln Elementary', 'Red Sox 12U', 'First game of the season! Arrive 45 min early.', 'COACH_UUID_HERE', false),
  ('Tournament - Mavericks Classic', 'tournament', NOW() + interval '12 days', NOW() + interval '14 days', 'Various fields - see email', 'Multiple', '3-game tournament. Hotel info in team group chat.', 'COACH_UUID_HERE', false);

-- 6. Sample RSVPs (assume the coach RSVPs for the players)
-- First get the player ids after insert or hardcode some.
-- For simplicity we will do a small script-like insert using known names.

-- 7. Team settings (already has default row from schema)
UPDATE public.team_settings SET 
  team_name = 'Mavericks 12U',
  season_name = '2026 Spring Travel',
  logo_url = NULL,
  dues_monthly_cents = 12500,
  dues_season_cents = 150000
WHERE id = 1;

-- 8. Sample invoices for Johnson family
INSERT INTO public.invoices (family_id, amount_cents, due_date, status, description, created_by) VALUES
  ('11111111-1111-1111-1111-111111111111', 12500, CURRENT_DATE + 10, 'pending', 'April monthly dues', 'COACH_UUID_HERE'),
  ('11111111-1111-1111-1111-111111111111', 12500, CURRENT_DATE - 5, 'overdue', 'March monthly dues (late)', 'COACH_UUID_HERE');

-- 9. Pinned announcement
INSERT INTO public.announcements (title, body, is_pinned, created_by) VALUES
  ('Uniform Pickup This Saturday', 'All players must pick up new jerseys and hats at Central Park Field 3 this Saturday 9am-11am. Parents only — players stay home if sick.', true, 'COACH_UUID_HERE');

-- 10. Sample team message (will appear after Phase 5 chat work)
-- INSERT INTO public.messages (sender_id, channel_type, content) VALUES ('COACH_UUID_HERE', 'team', 'Welcome everyone to the 2026 season!');

-- After running, go to your coach profile and link families if needed.
-- Then test the app. You can add more families/players via the future Admin UI.
