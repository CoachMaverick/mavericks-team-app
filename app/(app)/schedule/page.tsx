import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { FullCalendarWrapper } from "@/components/schedule/FullCalendarWrapper";
import { Card, CardContent } from "@/components/ui/card";
import ErrorBoundary from "@/components/ErrorBoundary";

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

    // Auth + coach detection (wrapped)
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

    // Events - simple .select('*')
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("start_time", { ascending: true });
      if (error) {
        console.error("Schedule error:", error);
        throw error;
      }
      events = (data || []).filter((e: any) => e && e.id != null && e.start_time);
    } catch (e: any) {
      console.error("Schedule error:", e);
      events = [];
    }

    const eventIds = events.map((e: any) => e.id);

    // RSVPs counts - simple .select('*')
    if (eventIds.length > 0) {
      try {
        const { data: rsvps, error } = await supabase
          .from("rsvps")
          .select("*")
          .in("event_id", eventIds.map((id: any) => Number(id)));
        if (error) {
          console.error("Schedule error:", error);
          throw error;
        }
        const counts: any = {};
        eventIds.forEach((id: any) => { counts[id] = { yes: 0, no: 0, maybe: 0, total: 0 }; });
        (rsvps || []).forEach((r: any) => {
          if (counts[r.event_id]) {
            const resp = r.response;
            if (counts[r.event_id][resp] !== undefined) {
              counts[r.event_id][resp] = (counts[r.event_id][resp] || 0) + 1;
              counts[r.event_id].total += 1;
            }
          }
        });
        rsvpCounts = counts;
      } catch (e: any) {
        console.error("Schedule error:", e);
        rsvpCounts = {};
      }

      // RSVPs by event - simple .select('*')
      try {
        const { data: rsvps, error } = await supabase
          .from("rsvps")
          .select("*")
          .in("event_id", eventIds.map((id: any) => Number(id)))
          .order("created_at", { ascending: true });
        if (error) {
          console.error("Schedule error:", error);
          throw error;
        }
        const byEvent: any = {};
        eventIds.forEach((id: any) => { byEvent[id] = []; });
        (rsvps || []).forEach((r: any) => {
          if (byEvent[r.event_id]) byEvent[r.event_id].push(r);
        });
        rsvpsByEvent = byEvent;
      } catch (e: any) {
        console.error("Schedule error:", e);
        rsvpsByEvent = {};
      }
    }

    // Roster - simple .select('*')
    try {
      const { data: players, error: pErr } = await supabase
        .from("players")
        .select("*")
        .eq("is_active", true)
        .order("last_name", { ascending: true });
      if (pErr) {
        console.error("Schedule error:", pErr);
        throw pErr;
      }
      const playerList = players || [];
      // minimal families
      const famIds = [...new Set(playerList.map((p: any) => p.family_id).filter(Boolean))];
      let famMap: any = {};
      if (famIds.length) {
        const { data: fams } = await supabase.from("families").select("*").in("id", famIds);
        (fams || []).forEach((f: any) => famMap[f.id] = f);
      }
      rosterPlayers = playerList.map((p: any) => ({
        ...p,
        family: famMap[p.family_id] || { id: p.family_id, name: 'Unassigned' }
      }));
    } catch (e: any) {
      console.error("Schedule error:", e);
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
          PAGE ERROR: Failed to load schedule data (see console).
          <button onClick={() => window.location.reload()} className="underline font-medium ml-2">Try Again</button>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Schedule &amp; Calendar</h1>
        <p className="text-muted-foreground">Practices, games, tournaments for Mavericks 12U</p>
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
          events={events as any}
          isCoach={isCoach}
          initialRsvpCounts={rsvpCounts}
          rsvpsByEvent={rsvpsByEvent}
          rosterPlayers={rosterPlayers}
        />
      </ErrorBoundary>

      <div>
        <h2 className="text-xl font-semibold tracking-tight mb-3">Events</h2>
        {events.length === 0 ? (
          <Card className="mavericks-card">
            <CardContent className="p-8 text-center text-muted-foreground">
              No events found.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {events.slice(0, 12).map((ev: any) => (
              <Card key={String(ev?.id)} className="mavericks-card">
                <CardContent className="p-4 space-y-1 text-sm">
                  <div className="font-semibold">{ev?.title || 'Untitled'}</div>
                  <div className="text-muted-foreground text-xs">
                    {ev?.start_time ? (() => { try { return new Date(ev.start_time).toLocaleString(); } catch { return 'TBD'; } })() : 'TBD'}
                  </div>
                  {ev?.location && <div>Location: {ev.location}</div>}
                  {ev?.opponent && <div>vs {ev.opponent}</div>}
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{ev?.type || 'event'}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Ultra-safe mode • Empty DB or missing columns handled gracefully.
      </p>
    </div>
  );
}
