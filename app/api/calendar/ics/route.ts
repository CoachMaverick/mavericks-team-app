import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    let supabase: any;

    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (serviceKey) {
      // Always prefer service role for public calendar feed (no RLS blocks, works for temp/demo + real)
      const { createClient } = await import("@supabase/supabase-js");
      supabase = createClient(supaUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    } else {
      const { createClient } = await import("@/lib/supabase/server");
      supabase = await createClient();
    }

    // Fetch all events (feed should include past + future for full history/sub)
    const { data: events = [], error } = await supabase
      .from("events")
      .select("id, title, start_time, end_time, location, description, is_cancelled")
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
    // Return a valid minimal feed on error so clients don't break hard
    const emptyICS = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Mavericks 12U//EN",
      "END:VCALENDAR",
    ].join("\r\n");
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

  const formatToICS = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    // UTC format YYYYMMDDTHHMMSSZ
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  };

  const escape = (str: string | null | undefined): string => {
    if (!str) return "";
    return String(str)
      .replace(/\\/g, "\\\\")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;")
      .replace(/\r?\n/g, "\\n");
  };

  const now = formatToICS(new Date().toISOString()) || "";

  events.forEach((ev: any, index: number) => {
    if (!ev.start_time) return;

    const uid = `mavericks-${ev.id || index}@mavericks-team.app`;
    const dtstart = formatToICS(ev.start_time);
    const dtend = ev.end_time ? formatToICS(ev.end_time) : null;

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
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
