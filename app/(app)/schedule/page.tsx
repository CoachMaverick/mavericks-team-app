import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { FullCalendarWrapper } from "@/components/schedule/FullCalendarWrapper";
import { Card, CardContent } from "@/components/ui/card";
import ErrorBoundary from "@/components/ErrorBoundary";

export const dynamic = 'force-dynamic';

interface SafeEvent {
  id: number | string;
  title?: string | null;
  type?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  opponent?: string | null;
  description?: string | null;
  is_cancelled?: boolean | null;
}

export default async function SchedulePage() {
  let events: SafeEvent[] = [];
  let isCoach = false;
  let hasError = false;
  let errorMsg = '';

  const cookieStore = await cookies();
  const isTempCoach = cookieStore.get("temp-coach")?.value === "1";

  try {
    const supabase = await createClient();

    // 1. Minimal auth + coach check - separate try
    try {
      if (isTempCoach) {
        isCoach = true;
      } else {
        const { data: { user } } = await supabase.auth.getUser().catch((e) => {
          console.error("PAGE ERROR:", e);
          console.error('[Schedule] auth.getUser error:', e);
          return { data: { user: null } };
        });
        if (user) {
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("role, is_admin")
              .eq("id", user.id)
              .maybeSingle();
            isCoach = (prof as any)?.role === 'coach' || (prof as any)?.role === 'admin' || (prof as any)?.is_admin === true;
          } catch (profErr: any) {
            console.error("PAGE ERROR:", profErr);
            console.error('[Schedule] profile query error:', profErr);
            isCoach = false;
          }
        }
      }
    } catch (authErr: any) {
      console.error("PAGE ERROR:", authErr);
      console.error('[Schedule] auth/coach check failed:', authErr);
      isCoach = isTempCoach;
    }

    // 2. Minimal events SELECT - separate try, basic columns only, NO joins
    try {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, type, start_time, end_time, location, opponent, description, is_cancelled")
        .order("start_time", { ascending: true })
        .limit(100);

      if (error) {
        console.error("PAGE ERROR:", error);
        console.error('[Schedule] events select error:', error);
        throw error;
      }
      events = (data || [])
        .filter((e: any) => e && e.id != null && e.start_time)
        .map((e: any) => ({
          id: e.id,
          title: e.title ?? null,
          type: e.type ?? null,
          start_time: e.start_time ?? null,
          end_time: e.end_time ?? null,
          location: e.location ?? null,
          opponent: e.opponent ?? null,
          description: e.description ?? null,
          is_cancelled: e.is_cancelled ?? false,
        })) as SafeEvent[];
    } catch (evErr: any) {
      console.error("PAGE ERROR:", evErr);
      console.error('[Schedule] events query failed:', evErr);
      events = [];
      hasError = true;
      errorMsg = 'Failed to load events.';
    }
  } catch (pageErr: any) {
    console.error("PAGE ERROR:", pageErr);
    console.error('[Schedule] page fatal error:', pageErr);
    hasError = true;
    errorMsg = 'Something went wrong loading the schedule.';
    events = [];
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
          initialRsvpCounts={{}}
          rsvpsByEvent={{}}
          rosterPlayers={[]}
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
            {events.slice(0, 12).map((ev) => (
              <Card key={String(ev.id)} className="mavericks-card">
                <CardContent className="p-4 space-y-1 text-sm">
                  <div className="font-semibold">{ev.title || 'Untitled'}</div>
                  <div className="text-muted-foreground text-xs">
                    {ev.start_time ? new Date(ev.start_time).toLocaleString() : 'TBD'}
                  </div>
                  {ev.location && <div>Location: {ev.location}</div>}
                  {ev.opponent && <div>vs {ev.opponent}</div>}
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{ev.type || 'event'}</div>
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
