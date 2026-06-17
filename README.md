# Mavericks 12U Travel Baseball — Team Management App

Beautiful, fast, mobile-first team hub for the Mavericks 12U squad. Built with Next.js 15, Supabase (Auth magic links + Realtime + Postgres + Storage), Stripe, Tailwind + shadcn-style components.

**Team colors:** Black (#0A0A0A), Red (#DC2626), White.

## Current Status
This is the **initial scaffold + skeleton** (Phase 0 + early layout). 
The app has:
- Magic link login page (ready)
- Protected app layout with beautiful dark sporty header, sidebar (desktop), bottom nav (mobile)
- Dashboard, Schedule, Chat, Roster, Payments, Admin route stubs
- Full planned DB schema + RLS in `supabase/schema.sql`
- Theme with red accents ready for FullCalendar + realtime

Full features (realtime chat, calendar with RSVPs, Stripe payments, admin tools) will be built step-by-step.

## Quick Start (Local Development)

1. **Install dependencies** (run this in your terminal):

```bash
cd /Users/browerpower5/mavericks-team-app
npm install
```

2. **Copy environment variables**:

```bash
cp .env.example .env.local
```

3. **Create your Supabase project** (free):
   - Go to https://database.new
   - Create new project
   - Go to **Authentication > Providers > Email**
     - Enable magic links
     - Disable password sign-in if desired
   - Note your Project URL and anon key → put into `.env.local`
   - Get the **service_role** key (Settings > API) → put into `.env.local` (server only)

4. **Run the database schema** (very important):
   - In Supabase Dashboard → **SQL Editor** → New query
   - Copy and paste the entire contents of `supabase/schema.sql`
   - Run it
   - Then go to **Authentication > Users**, copy your own user UUID after you sign up the first time, and run:
     ```sql
     UPDATE public.profiles SET role = 'coach' WHERE id = 'PASTE-YOUR-UUID-HERE';
     ```

5. **Create Storage bucket** (for logo):
   - Dashboard → Storage → New bucket → name: `team-assets` → Public

6. **Start the dev server**:

```bash
npm run dev
```

Visit http://localhost:3000 — you will be redirected to `/login`.

Sign up / log in with email + password (default on /login) or magic link → for magic links, click the link (points to /auth/confirm) → you should be logged in and land in the app (after setting Site URL + Redirect URLs + templates in Supabase dashboard as per .env.example). Email confirmation may be required depending on your Supabase project settings.

## Stripe Setup (for Payments phase)

- Create a Stripe account (use test mode)
- Get Publishable + Secret keys → `.env.local`
- In Stripe Dashboard create a Webhook endpoint:
  - URL: `https://localhost:3000/api/stripe-webhook` (or your deployed URL later)
  - Events to listen for: `checkout.session.completed`, `payment_intent.succeeded`
- Put the webhook signing secret in `STRIPE_WEBHOOK_SECRET`

## Key Files

- `supabase/schema.sql` — the single source of truth for tables + RLS policies. Paste into SQL editor.
- `app/login/page.tsx` — magic link UI (points to /auth/confirm)
- `app/auth/confirm/route.ts` — handles magiclink + signup confirmation via verifyOtp + token_hash (the primary flow)
- `app/auth/callback/route.ts` — kept for PKCE/OAuth code exchange
- `app/(app)/layout.tsx` — protected layout with role-aware nav
- `lib/supabase/*` — server/client/middleware helpers (standard @supabase/ssr 2026 pattern)
- Middleware excludes /auth/* and /login so the confirm route can safely call verifyOtp and set session cookies.

## Next Implementation Phases (see plan)

After `npm install` and schema, the next work (I'll continue in this session):

- Phase 1: Polish magic link + callback + first coach promotion guidance
- Phase 2: Verify RLS + seed sample data
- Then dashboard + roster, FullCalendar, realtime chat, Stripe invoices, Admin logo upload, etc.

## Deploy

Recommended: Vercel (zero-config for Next.js 15).

Add all the same env vars in Vercel dashboard.
Add the Stripe webhook endpoint using your production URL.

## Notes for non-technical parents

The app is deliberately simple:
- One-tap RSVP on events
- Big "Pay Now" buttons that go to Stripe Checkout (Apple Pay / cards supported)
- Chat feels like a group text
- Works great on phones

## Getting Help / Contributing

This is a custom internal team tool. For issues during setup, share the exact error.

Let's build something the whole team will use. Go Mavericks! ⚾🔴
