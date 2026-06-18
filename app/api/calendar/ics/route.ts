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

    // Fetch ALL events that have a start_time (past + upcoming). Public feed.
    const { data: events = [], error } = await supabase
      .from("events")
      .select("id, title, start_time, end_time, location, description, is_cancelled")
      .not("start_time", "is", null)
      .order("start_time", { ascending: true });

    if (error) {
      console.error("ICS DB error:", error);
      throw error;
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
    "X-WR-TIMEZONE:America/Denver",
  ];

  // Minimal VTIMEZONE for America/Denver (handles DST)
  lines.push("BEGIN:VTIMEZONE");
  lines.push("TZID:America/Denver");
  lines.push("BEGIN:STANDARD");
  lines.push("DTSTART:19701101T020000");
  lines.push("RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU");
  lines.push("TZOFFSETFROM:-0600");
  lines.push("TZOFFSETTO:-0700");
  lines.push("END:STANDARD");
  lines.push("BEGIN:DAYLIGHT");
  lines.push("DTSTART:19700308T020000");
  lines.push("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU");
  lines.push("TZOFFSETFROM:-0700");
  lines.push("TZOFFSETTO:-0600");
  lines.push("END:DAYLIGHT");
  lines.push("END:VTIMEZONE");

  const escape = (str: string | null | undefined): string => {
    if (!str) return "";
    return String(str)
      .replace(/\\/g, "\\\\")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;")
      .replace(/\r?\n/g, "\\n");
  };

  const formatToDenver = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    // Format in America/Denver without TZ chars, as YYYYMMDDTHHMMSS
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Denver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    const map: Record<string, string> = {};
    for (const p of parts) {
      if (p.type !== "literal") map[p.type] = p.value;
    }
    // Pad if needed (Intl should give 2 digits)
    const y = map.year || "1970";
    const m = (map.month || "01").padStart(2, "0");
    const da = (map.day || "01").padStart(2, "0");
    const h = (map.hour || "00").padStart(2, "0");
    const mi = (map.minute || "00").padStart(2, "0");
    const s = (map.second || "00").padStart(2, "0");
    return `${y}${m}${da}T${h}${mi}${s}`;
  };

  // DTSTAMP preferably in UTC Z format
  const nowUTC = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  let eventCount = 0;
  events.forEach((ev: any, index: number) => {
    if (!ev.start_time) return;

    const uid = `mavericks-${ev.id || index}@mavericks-team.app`;
    const dtstart = formatToDenver(ev.start_time);
    const dtend = ev.end_time ? formatToDenver(ev.end_time) : null;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${nowUTC}`);
    if (dtstart) lines.push(`DTSTART;TZID=America/Denver:${dtstart}`);
    if (dtend) lines.push(`DTEND;TZID=America/Denver:${dtend}`);
    lines.push(`SUMMARY:${escape(ev.title || "Team Event")}`);
    if (ev.location) lines.push(`LOCATION:${escape(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escape(ev.description)}`);
    if (ev.is_cancelled) lines.push("STATUS:CANCELLED");
    lines.push("END:VEVENT");
    eventCount++;
  });

  lines.push("END:VCALENDAR");
  const ics = lines.join("\r\n");

  // Debug log (visible in server logs) to help diagnose "no events"
  console.log(`[ICS] Generated feed with ${eventCount} events (from ${events?.length || 0} rows)`);
  return ics;
}
