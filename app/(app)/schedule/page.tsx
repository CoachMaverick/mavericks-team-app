import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { FullCalendarWrapper } from "@/components/schedule/FullCalendarWrapper";
import { Card, CardContent } from "@/components/ui/card";
import { getEvents, getRsvpCountsForEvents, getRsvpsForEvents, getRoster } from "@/lib/actions";
import type { Event, Profile } from "@/lib/supabase/types";

export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  let user: any = null;
  let profile: Profile | null = null;
  let isTempCoach = false;
  let events: Event[] = [];
  let rsvpCounts: any = {};
  let rsvpsByEvent: any = {};
  let rosterPlayers: any[] = [];
  let upcoming: any[] = [];

  try {
    const cookieStore = await cookies();
    isTempCoach = cookieStore.get("temp-coach")?.value === "1";

    const supabase = await createClient();

    if (isTempCoach) {
      // Temporary hardcoded coach bypass (matches layout and other pages)
      user = {
        id: "temp-coach-id",
        email: "coach@comavericksbaseball.com",
      };
      profile = {
        id: "temp-coach-id",
        role: "coach" as const,
        first_name: "Coach",
        last_name: "Maverick",
        phone: null,
        avatar_url: null,
        family_id: null,
        last_active_at: null,
        created_at: new Date().toISOString(),
        updated_at: null,
      } as Profile;
    } else {
      const {
        data: { user: realUser },
      } = await supabase.auth.getUser();

      if (!realUser) {
        return (
          <div className="p-6 text-center text-muted-foreground">
            Not authenticated. Please log in to view the schedule.
          </div>
        );
      }

      user = realUser;

      try {
        const { data: realProfile } = await supabase
          .from("profiles")
          .select("role, family_id, is_admin")
          .eq("id", realUser.id)
          .single<Profile>();
        profile = realProfile;
      } catch (profileErr) {
        console.warn('Schedule profile fetch error (missing columns?):', profileErr);
        profile = null;
      }
    }

    const isCoach = profile?.role === "coach" || isTempCoach || profile?.role === "admin" || profile?.is_admin === true;

    // Fetch events (via action for consistent temp-coach handling via service role)
    events = await getEvents().catch(() => [] as Event[]);

    const eventIds = events.map(e => e.id);
    rsvpCounts = eventIds.length > 0 ? await getRsvpCountsForEvents(eventIds).catch(() => ({} as any)) : {};
    rsvpsByEvent = eventIds.length > 0 ? await getRsvpsForEvents(eventIds).catch(() => ({} as any)) : {};
    rosterPlayers = await getRoster().catch(() => [] as any[]);

    // Simple upcoming list (sorted, limited)
    upcoming = [...events]
      .filter(e => !e.is_cancelled)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, 10);

  } catch (e: any) {
    console.warn('Schedule page error (falling back gracefully):', e?.message);
    // All vars default to safe empty values defined above
  }

  const isCoach = profile?.role === "coach" || isTempCoach || profile?.role === "admin" || profile?.is_admin === true;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Schedule &amp; Calendar</h1>
          <p className="text-muted-foreground">Practices, games, tournaments for Mavericks 12U</p>
        </div>
        {isCoach && (
          <div className="text-xs text-muted-foreground">Click a date on the calendar to add an event</div>
        )}
      </div>

      {events.length === 0 ? (
        <Card className="mavericks-card">
          <CardContent className="p-8 text-center text-muted-foreground">
            No events yet. {isCoach ? "Click a date on the calendar below to add the first one." : "Your coach will add events soon."}
          </CardContent>
        </Card>
      ) : null}

      {/* Basic Calendar */}
      <FullCalendarWrapper
        events={events}
        isCoach={isCoach}
        initialRsvpCounts={rsvpCounts}
        rsvpsByEvent={rsvpsByEvent}
        rosterPlayers={rosterPlayers}
      />

      {/* Simple Upcoming Events List */}
      {upcoming.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold tracking-tight mb-3">Upcoming Events</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {upcoming.map((ev) => (
              <Card key={ev.id} className="mavericks-card">
                <CardContent className="p-4 space-y-1 text-sm">
                  <div className="font-semibold">{ev.title}</div>
                  <div className="text-muted-foreground">
                    {new Date(ev.start_time).toLocaleDateString()} • {new Date(ev.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {ev.location && <div>Location: {ev.location}</div>}
                  {ev.opponent && <div>vs {ev.opponent}</div>}
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{ev.type}</div>
                  {ev.description && <div className="text-muted-foreground text-xs line-clamp-2">{ev.description}</div>}
                  {rsvpCounts[ev.id] && (
                    <div className="text-xs mt-1 flex gap-1 flex-wrap">
                      <span className="bg-green-600 text-white px-1.5 py-0.5 rounded text-[10px] font-medium">{rsvpCounts[ev.id].yes} Yes</span>
                      <span className="bg-yellow-500 text-white px-1.5 py-0.5 rounded text-[10px] font-medium">{rsvpCounts[ev.id].maybe} Maybe</span>
                      <span className="bg-red-600 text-white px-1.5 py-0.5 rounded text-[10px] font-medium">{rsvpCounts[ev.id].no} No</span>
                    </div>
                  )}
                  {rsvpsByEvent[ev.id] && rsvpsByEvent[ev.id].length > 0 && (
                    <div className="text-[10px] mt-0.5 text-muted-foreground truncate">
                      {rsvpsByEvent[ev.id].slice(0,3).map((r: any, i: number) => (
                        <span key={i}>{r.family_name}{i < Math.min(rsvpsByEvent[ev.id].length-1, 2) ? ', ' : ''}</span>
                      ))}
                      {rsvpsByEvent[ev.id].length > 3 && ` +${rsvpsByEvent[ev.id].length-3}`}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground text-center">
        {isCoach ? "Use the calendar to manage events (add/edit)." : "View only. Contact your coach for changes."}
      </div>
    </div>
  );
}
