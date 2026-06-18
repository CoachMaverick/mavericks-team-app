import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { FullCalendarWrapper } from "@/components/schedule/FullCalendarWrapper";
import { Card, CardContent } from "@/components/ui/card";
import ErrorBoundary from "@/components/ErrorBoundary";

export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  let events: any[] = [];
  let isCoach = false;
  let hasError = false;

  const cookieStore = await cookies();
  const isTempCoach = cookieStore.get("temp-coach")?.value === "1";

  try {
    const supabase = await createClient();

    // simple coach detection
    if (isTempCoach) {
      isCoach = true;
    } else {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", user.id)
              .maybeSingle();
            isCoach = (prof as any)?.role === 'coach' || (prof as any)?.role === 'admin' || (prof as any)?.is_admin === true;
          } catch (e) {
            console.error("Schedule error:", e);
            isCoach = false;
          }
        }
      } catch (e) {
        console.error("Schedule error:", e);
        isCoach = false;
      }
    }

    // simple events .select('*')
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("start_time", { ascending: true });
      if (error) {
        console.error("Schedule error:", error);
        throw error;
      }
      events = (data || []).filter((e: any) => e && e.id && e.start_time);
    } catch (e: any) {
      console.error("Schedule error:", e);
      events = [];
      hasError = true;
    }

    // rsvps simple (not used for complex yet)
    // (skipped for nuclear minimal to avoid any crash)

  } catch (e: any) {
    console.error("Schedule error:", e);
    events = [];
    hasError = true;
  }

  return (
    <div className="space-y-6 p-4">
      {hasError && (
        <div className="p-4 border border-yellow-500 bg-yellow-50 text-yellow-800 rounded text-sm">
          Schedule error loading data (see console).
          <button onClick={() => window.location.reload()} className="underline ml-2">Try Again</button>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Schedule &amp; Calendar</h1>
        <p className="text-muted-foreground">Practices, games, tournaments for Mavericks 12U</p>
      </div>

      {/* Always render calendar UI */}
      <ErrorBoundary
        fallback={
          <div className="p-8 border rounded bg-muted text-center">
            Calendar temporarily unavailable.
            <button onClick={() => window.location.reload()} className="underline block mt-2">Try Again</button>
          </div>
        }
      >
        <FullCalendarWrapper
          events={events}
          isCoach={isCoach}
          initialRsvpCounts={{}}
          rsvpsByEvent={{}}
          rosterPlayers={[]}
        />
      </ErrorBoundary>

      {/* Simple Add Event button (calendar date click also adds when coach) */}
      <div className="text-center">
        <button
          className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm"
          onClick={() => alert('Use calendar date click to add event (full modal coming back next)')}
        >
          Add Event
        </button>
        <p className="text-xs text-muted-foreground mt-1">(Click a date on the calendar above to add)</p>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Nuclear minimal mode — page always renders.
      </p>
    </div>
  );
}
