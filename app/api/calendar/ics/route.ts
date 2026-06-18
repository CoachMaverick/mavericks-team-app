import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    let supabase: any;

    const rawSupaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Strip trailing rest path like the main actions helper does (critical for supabase-js client)
    const supaUrl = rawSupaUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");

    if (serviceKey) {
      // Prefer service role for public feed: bypasses RLS, works for demo/temp-coach + real data
      const { createClient: createSupabaseJs } = await import("@supabase/supabase-js");
      supabase = createSupabaseJs(supaUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    } else {
      const { createClient } = await import("@/lib/supabase/server");
      supabase = await createClient();
    }

    // Query ALL events from the 'events' table (no date filter for now)
    const { data: events = [], error } = await supabase
      .from("events")
      .select("*")
      .order("start_time", { ascending: true });

    if (error) {
      console.error("ICS DB error:", error);
      throw error;
    }

    if (!events || events.length === 0) {
      console.error("No events found in 'events' table for ICS feed");
    }

    const icsContent = buildICS(events || []);

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="mavericks-12u-schedule.ics"',
        "Cache-Control": "public, max-age=60, s-maxage=60, must-revalidate",
        "Expires": "0",
      },
    });
  } catch (e: any) {
    console.error("Calendar ICS generation failed:", e?.message || e);
    // Return a valid (empty) feed with full structure on error
    const emptyICS = buildICS([]);
    return new NextResponse(emptyICS, {
      status: 200,
      headers: { "Content-Type": "text/calendar; charset=utf-8" },
    });
  }
}

function buildICS(events: any[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mavericks 12U//Team App//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Mavericks 12U Schedule",
  ];

  const escape = (str: string | null | undefined): string => {
    if (!str) return "";
    return String(str)
      .replace(/\\/g, "\\\\")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;")
      .replace(/\r?\n/g, "\\n");
  };

  // Format to UTC YYYYMMDDTHHMMSSZ (reliable for most calendar apps)
  const formatToUTC = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  };

  const now = formatToUTC(new Date().toISOString()) || "";

  let eventCount = 0;
  events.forEach((ev: any, index: number) => {
    if (!ev.start_time) return;

    const uid = `mavericks-${ev.id || index}@mavericks-team.app`;
    const dtstart = formatToUTC(ev.start_time);
    const dtend = ev.end_time ? formatToUTC(ev.end_time) : null;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${now}`);
    if (dtstart) lines.push(`DTSTART:${dtstart}`);
    if (dtend) lines.push(`DTEND:${dtend}`);
    lines.push(`SUMMARY:${escape(ev.title || "Team Event")}`);
    if (ev.location) lines.push(`LOCATION:${escape(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escape(ev.description)}`);
    if (ev.is_cancelled) lines.push("STATUS:CANCELLED");
    lines.push("END:VEVENT");
    eventCount++;
  });

  lines.push("END:VCALENDAR");
  const ics = lines.join("\r\n");

  // Debug log (visible in server logs)
  if (eventCount === 0) {
    console.error("[ICS] No valid events were found (0 events with start_time)");
  } else {
    console.log(`[ICS] Generated feed with ${eventCount} events (from ${events?.length || 0} rows)`);
  }
  return ics;
}
