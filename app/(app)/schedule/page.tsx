import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  let events: any[] = [];
  let hasError = false;

  const cookieStore = await cookies();
  const isTempCoach = cookieStore.get("temp-coach")?.value === "1";

  try {
    const supabase = await createClient();

    // minimal events query
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("start_time", { ascending: true });
      if (error) {
        console.error("Schedule error:", error);
        throw error;
      }
      events = data || [];
    } catch (e: any) {
      console.error("Schedule error:", e);
      events = [];
      hasError = true;
    }
  } catch (e: any) {
    console.error("Schedule error:", e);
    events = [];
    hasError = true;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Schedule</h1>

      <button
        className="mb-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        onClick={() => alert("Add Event coming soon")}
      >
        Add Event
      </button>

      {hasError && (
        <div className="mb-4 p-3 bg-yellow-100 text-yellow-800 rounded">
          Error loading events (see console). Showing empty list.
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-gray-500">No events</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e: any) => (
            <li key={e.id} className="p-3 border rounded">
              <div className="font-semibold">{e.title || "Untitled"}</div>
              <div className="text-sm text-gray-600">
                {e.start_time ? new Date(e.start_time).toLocaleString() : "TBD"}
                {e.location ? ` • ${e.location}` : ""}
              </div>
              {e.description && <div className="text-sm mt-1">{e.description}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
