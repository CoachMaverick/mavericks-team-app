# Notifications Implementation Plan for Mavericks 12U Team Hub

## Overview
Add in-app + email notifications focused on core events first (per user request: start with event + announcement + payment). Support temp-coach (demo) + real Supabase flows. Use existing patterns: server actions, getSupabaseForReadWrite, revalidateTag, temp bypasses, mavericks styling (black/red), Radix UI components, sonner toasts.

**Key Constraints from Codebase:**
- Heavy use of temp-coach cookie bypass (id='temp-coach-id', service role for DB).
- Tables: events (serial), rsvps, announcements (serial), invoices, profiles (text ids for temp), messages, families.
- Realtime via Supabase postgres_changes (used in chat).
- No current notif system or email lib for custom (Stripe uses for receipts; Supabase for auth).
- Header: simple AppHeader (no bell yet). Dashboard, Schedule (FullCalendar), Chat, Admin, Payments.
- Styling: globals.css mavericks-*, tailwind, lucide icons.
- Mobile: bottom nav + responsive header.
- Auth: real + temp; roles coach/admin/parent/player.

## Prioritized Scope (Core Only)
Start with:
- New/updated/canceled events
- New pinned announcements
- Payment due reminders (on invoice create or status)

Defer:
- RSVP 24h reminders (needs scheduler)
- @mentions in chat (chat has some parsing)
- New team messages / daily digest
- Full per-user targeting for all (focus team-wide + family)

## Detailed Plan

### 1. Database & Schema (supabase/schema.sql)
- Add new table `notifications`:
  ```sql
  create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,  -- supports temp-coach-id + uuid
    type text not null check (type in ('event_new', 'event_updated', 'event_canceled', 'announcement_new', 'payment_due', ...)),
    title text not null,
    body text,
    link text,  -- e.g. /schedule or /payments
    related_id text,  -- event id, etc.
    is_read boolean default false,
    created_at timestamptz default now()
  );
  ```
- Add `notification_preferences` table (simple JSONB for toggles, or per-type bools):
  ```sql
  create table if not exists public.notification_preferences (
    user_id text primary key,
    event_new boolean default true,
    event_updated boolean default true,
    event_canceled boolean default true,
    announcement_new boolean default true,
    payment_due boolean default true,
    -- future: team_message_digest, etc.
    updated_at timestamptz default now()
  );
  ```
- ALTERs for migration + IF NOT EXISTS.
- RLS policies:
  - Users can select/update own notifications + prefs.
  - Coaches/admins can view/insert for team (for creation).
  - Enable RLS.
- Update lib/supabase/types.ts manually (or note to run gen).
- Add indexes for unread queries (user_id, is_read, created_at).

**Migration Note:** Run full schema.sql updates in Supabase SQL editor. Existing data unaffected.

### 2. In-App Notifications (UI + Backend)
- **Header Update** (components/layout/AppHeader.tsx):
  - Add bell icon (lucide Bell) + badge (unread count).
  - Client component: fetch unread count + list (or use realtime sub).
  - Dropdown (use existing @radix-ui/react-dropdown-menu or Dialog) showing recent notifs.
  - Click notif: mark read, navigate via link.
  - Unread count badge in red (Mavericks primary).
  - Support mobile (header already handles).

- **Notifications List**:
  - New page: app/(app)/notifications/page.tsx (or modal in header).
  - List with icon per type, title, body, time, "mark all read" button.
  - Link to related (e.g. schedule for events).
  - Pagination or limit 20 recent.
  - Filter unread.

- **Data Layer** (lib/actions.ts):
  - New actions:
    - createNotification(userId(s), type, title, body, link?, relatedId?)
    - getNotifications(limit?, unreadOnly?)
    - markNotificationRead(id), markAllRead()
    - getNotificationPreferences(userId)
    - updateNotificationPreferences(prefs)
  - Use getSupabaseForReadWrite() for temp support (inserts bypass RLS).
  - For real users: target coaches (all) + parents (via family from roster/players).
  - RevalidateTag('notifications')

- **Realtime**: In header/notif page, use Supabase client subscribe to 'notifications' INSERT/UPDATE for current user_id. Update count/list live (like chat).

- **Styling**: Use mavericks-card, primary red for unread/accent, clean list. Mobile responsive.

### 3. Triggering Notifications (Core Events)
- **Events** (lib/actions.ts createEvent, updateEvent, deleteEvent/update for cancel):
  - After successful create/update/cancel:
    - Fetch coaches + all family members (use getRoster or query profiles/families).
    - For each relevant user: if prefs allow, createNotification('event_new' etc., "New Event: Title", details + date, link `/schedule`).
  - Use revalidateTag('events') already there.
  - Temp: insert with 'temp-coach-id' as user if viewing as coach.

- **Announcements** (createAnnouncement, and when pinning?):
  - On create (pinned by default): notify "New Announcement: Title" to all users.
  - Link to /chat.

- **Payments**:
  - Hook into invoice create (note: some in client via Supabase, some actions) or payment due logic.
  - On new invoice or status change to pending/overdue: notify family users "Payment Due: desc by date", amount.
  - Use existing getInvoices etc.
  - Link to /payments.

- Helper: `async function notifyUsers(userIds: string[], type, payload)` that checks prefs then inserts.

- Avoid duplicates (e.g. don't notify creator immediately).

### 4. Email Notifications (Core)
- **Lib**: Project uses Supabase/Stripe for emails currently. Add `resend` (lightweight, good for Next):
  - `npm install resend`
  - Env: RESEND_API_KEY (from resend.com)
  - Create lib/email.ts: `import { Resend } from 'resend'; const resend = new Resend(process.env.RESEND_API_KEY);`
  - Send function: `sendEmail(to, subject, html)`

- **When to Send**:
  - In the notify helper, after in-app insert: if user has email && pref enabled, send.
  - Simple HTML template with Mavericks logo/branding (reuse TeamLogo? or inline).
  - Subjects: "New Mavericks Event: [Title]", "Payment Reminder", etc.
  - Body: details + link to app + unsubscribe note (future).

- **Demo/Temp Coach**:
  - If isTemp or no key: console.log(`[EMAIL] To: ${email} Subject: ...`) + show in-app toast.
  - Real: actually send (parents get emails).

- Alternative (no new dep): Use Supabase Edge Functions for email (but more complex; note as option). Or leverage existing Stripe email for payments.

- For RSVP reminders (deferred): Would need scheduled fn (Vercel Cron + /api/cron or Supabase pg_cron).

### 5. Notification Preferences / Admin Controls
- **Storage**: notification_preferences table (per user_id).
- **UI**:
  - In /admin (for coaches/admins): new section "Notification Settings".
  - Toggles (switches, use existing or simple checkboxes + save):
    - Event created/updated/canceled
    - New pinned announcements
    - Payment due reminders
  - Save calls updateNotificationPreferences.
  - Defaults: all true.
- **Logic**: Before createNotification, check user's pref for that type. If off, skip (in-app + email).
- Per-family? Start with per-user (coach sets for self; parents have defaults).

- Expose in profile if needed.

### 6. Scheduling & Advanced (Deferred)
- RSVP 24h before: On event create/update, could store "reminder_sent" flag + have /api/cron or on page load query upcoming + send if within window (simple but not perfect). Full: add cron.
- @mentions: Parse in sendMessage (chat already has @ logic), notify mentioned users.
- Daily digest: Batch + cron.
- Unread count: Query or maintain in header state + realtime.

### 7. Polish & Integration
- **Styling**: Consistent with current (mavericks-card, primary red for bell/unread, lucide Bell, sonner for "new notif" toasts).
- **Temp Coach**: Full support (inserts, views, prefs default on).
- **Security/RLS**: Only own notifs visible; creation restricted to system/coaches.
- **Revalidate**: Add 'notifications' tag where appropriate.
- **Dashboard/Header**: Add bell (even if no notifs yet).
- **Testing**: 
  - Temp coach: create event -> see in-app + console email.
  - Real flows similar.
  - Toggle prefs.
  - Mobile view.
- **Files to Touch**:
  - supabase/schema.sql (new tables + policies + alters)
  - lib/supabase/types.ts
  - lib/actions.ts (new notif helpers + calls in existing)
  - components/layout/AppHeader.tsx (bell + client logic)
  - app/(app)/notifications/page.tsx (new)
  - app/(app)/admin/page.tsx (settings UI)
  - Possibly lib/email.ts (new)
  - Update dashboard or other if links.
- **Deps**: Optional `resend` for email. Add to package.json.
- **Env**: Document RESEND_API_KEY (and Supabase email already set).
- **Future**: Full types, cron, more notif types, push (web).

## Phased Rollout (Start Core)
1. Schema + basic in-app create/get/mark (no email).
2. Hook core actions (events/ann/payments) + header bell.
3. Add email sending (resend or console).
4. Prefs toggles in admin.
5. Realtime polish, tests, clean up.
6. Defer advanced (reminders etc.).

**Risks/Mitigations**:
- Email deliverability: Use Resend (reliable) + from verified domain.
- Temp coach spam: Prefs + only for coach view.
- Performance: Limit notifs, index queries.
- No breaking: All additive; existing reval unchanged.

**Next Steps After Plan Approval**:
- Update schema.
- Add actions.
- UI in header.
- etc.

This keeps it useful, clean, leverages existing (realtime, actions, temp support, styling). Total scope reasonable for core.