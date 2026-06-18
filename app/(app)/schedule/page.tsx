import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { FullCalendarWrapper } from "@/components/schedule/FullCalendarWrapper";
import { Card, CardContent } from "@/components/ui/card";
import ErrorBoundary from "@/components/ErrorBoundary";

export const dynamic = 'force-dynamic';

interface SafeEvent {
  id: number | string;
  title?: string;
  type?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  opponent?: string;
  description?: string;
  is_cancelled?: boolean;
}

export default async function SchedulePage() {
  let events: SafeEvent[] = [];
  let isCoach = false;
  let hasError = false;

  try {
    const cookieStore = await cookies();
    const isTempCoach = cookieStore.get("temp-coach")?.value === "1";

    const supabase = await createClient();

    if (!isTempCoach) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("role, is_admin")
            .eq("id", user.id)
            .maybeSingle() as any;
          isCoach = prof?.role === 'coach' || prof?.role === 'admin' || prof?.is_admin === true;
        }
      } catch {}
    } else {
      isCoach = true;
    }

    // MINIMAL safe query
    try {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, type, start_time, end_time, location, opponent, description, is_cancelled")
        .order("start_time", { ascending: true })
        .limit(60);

      if (error) throw error;
      events = (data || []).filter((e: any) => e && e.id && e.start_time) as SafeEvent[];
    } catch (e: any) {
      console.warn('[Schedule] events failed:', e?.message);
      hasError = true;
      events = [];
    }
  } catch (e: any) {
    console.warn('[Schedule] page error:', e?.message);
    hasError = true;
  }

  return (
    <div className="space-y-6">
      {hasError && (
        <div className="p-4 border border-yellow-500 bg-yellow-50 text-yellow-800 rounded text-sm">
          Something went wrong loading schedule. <button onClick={() => window.location.reload()} className="underline">Try Again</button>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Schedule &amp; Calendar</h1>
        <p className="text-muted-foreground">Practices, games for Mavericks 12U</p>
      </div>

      <ErrorBoundary fallback={
        <div className="p-8 border rounded bg-muted/30 text-center">
          Calendar unavailable right now. <button onClick={() => window.location.reload()} className="underline">Retry</button>
        </div>
      }>
        <FullCalendarWrapper events={events as any} isCoach={isCoach} initialRsvpCounts={{}} rsvpsByEvent={{}} rosterPlayers={[]} />
      </ErrorBoundary>

      <div>
        <h2 className="text-xl font-semibold mb-3">Events</h2>
        {events.length === 0 ? (
          <Card><CardContent className="p-6 text-muted-foreground text-center">No events loaded.</CardContent></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {events.slice(0, 10).map(ev => (
              <Card key={ev.id} className="mavericks-card">
                <CardContent className="p-4 text-sm">
                  <div className="font-medium">{ev.title || 'Event'}</div>
                  <div className="text-xs text-muted">{ev.start_time ? new Date(ev.start_time).toLocaleString() : ''}</div>
                  {ev.location && <div className="text-xs">📍 {ev.location}</div>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
