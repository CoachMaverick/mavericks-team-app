import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { FullCalendarWrapper } from "@/components/schedule/FullCalendarWrapper";
import { Card, CardContent } from "@/components/ui/card";
import ErrorBoundary from "@/components/ErrorBoundary";
import { getEvents, getRsvpCountsForEvents, getRsvpsForEvents, getRoster } from "@/lib/actions";

export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  let events: any[] = [];
  let rsvpCounts: any = {};
  let rsvpsByEvent: any = {};
  let rosterPlayers: any[] = [];
  let isCoach = false;
  let hasError = false;
  let errorMsg = '';

  const cookieStore = await cookies();
  const isTempCoach = cookieStore.get("temp-coach")?.value === "1";

  try {
    const supabase = await createClient();

    // 1. Auth + coach check - wrapped in try/catch
    try {
      if (isTempCoach) {
        isCoach = true;
      } else {
        const { data: { user } } = await supabase.auth.getUser().catch((e) => {
          console.error("Schedule error:", e);
          return { data: { user: null } };
        });
        if (user) {
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", user.id)
              .maybeSingle();
            isCoach = (prof as any)?.role === 'coach' || (prof as any)?.role === 'admin' || (prof as any)?.is_admin === true;
          } catch (profErr: any) {
            console.error("Schedule error:", profErr);
            isCoach = false;
          }
        }
      }
    } catch (authErr: any) {
      console.error("Schedule error:", authErr);
      isCoach = isTempCoach;
    }

    // 2. Events - use action with try/catch + .select('*') inside action
    try {
      const fetched = await getEvents().catch((e: any) => {
        console.error("Schedule error:", e);
        return [] as any[];
      });
      events = (fetched || []).filter((e: any) => e && e.id != null && e.start_time);
    } catch (evErr: any) {
      console.error("Schedule error:", evErr);
      events = [];
    }

    // 3. RSVP data and roster - all wrapped, return empty on error
    try {
      const eventIds = events.map((e: any) => e.id);
      if (eventIds.length > 0) {
        rsvpCounts = await getRsvpCountsForEvents(eventIds).catch((e: any) => {
          console.error("Schedule error:", e);
          return {} as any;
        });
        rsvpsByEvent = await getRsvpsForEvents(eventIds).catch((e: any) => {
          console.error("Schedule error:", e);
          return {} as any;
        });
      }
      rosterPlayers = await getRoster().catch((e: any) => {
        console.error("Schedule error:", e);
        return [] as any[];
      });
    } catch (dataErr: any) {
      console.error("Schedule error:", dataErr);
      rsvpCounts = {};
      rsvpsByEvent = {};
      rosterPlayers = [];
    }
  } catch (pageErr: any) {
    console.error("Schedule error:", pageErr);
    hasError = true;
    errorMsg = 'Something went wrong loading the schedule.';
    events = [];
    rsvpCounts = {};
    rsvpsByEvent = {};
    rosterPlayers = [];
  }

  return (
    <div className="space-y-6 p-4">
      {(hasError || events.length === 0) && (
        <div className="p-4 border border-red-500 bg-red-50 text-red-800 rounded text-sm">
          Schedule error: {errorMsg || 'Failed to load schedule data (see console).'}
          <button onClick={() => window.location.reload()} className="underline font-medium ml-2">Try Again</button>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Schedule &amp; Calendar</h1>
        <p className="text-muted-foreground">Practices, games, tournaments for Mavericks 12U</p>
        {isCoach && (
          <div className="text-xs text-muted-foreground mt-1">Click a date on the calendar to add an event</div>
        )}
      </div>

      <ErrorBoundary
        fallback={
          <Card className="mavericks-card">
            <CardContent className="p-8 text-center text-muted-foreground">
              Calendar section failed to load.
              <button onClick={() => window.location.reload()} className="underline block mx-auto mt-2">Try Again</button>
            </CardContent>
          </Card>
        }
      >
        <FullCalendarWrapper
          events={events}
          isCoach={isCoach}
          initialRsvpCounts={rsvpCounts}
          rsvpsByEvent={rsvpsByEvent}
          rosterPlayers={rosterPlayers}
        />
      </ErrorBoundary>

      {/* Simple upcoming list as fallback / additional view */}
      {events.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold tracking-tight mb-3">Upcoming Events</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {events.slice(0, 8).map((ev: any) => (
              <Card key={ev.id} className="mavericks-card">
                <CardContent className="p-4 space-y-1 text-sm">
                  <div className="font-semibold">{ev.title || 'Untitled'}</div>
                  <div className="text-muted-foreground">
                    {ev.start_time ? new Date(ev.start_time).toLocaleDateString() : 'TBD'}
                    {ev.start_time ? ` • ${new Date(ev.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </div>
                  {ev.location && <div>Location: {ev.location}</div>}
                  {ev.opponent && <div>vs {ev.opponent}</div>}
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{ev.type || 'event'}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground text-center">
        {isCoach ? "Use the calendar to manage events (add/edit/delete). Click events for RSVP." : "View only. Contact your coach for changes."}
      </div>
    </div>
  );
}
