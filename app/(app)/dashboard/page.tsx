import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Calendar, MessageCircle, CreditCard, Users } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamBanner } from "@/components/TeamBanner";
import { getTeamPaymentSummary, getEvents, getRoster, getMessages, getPinnedAnnouncements, getInvoices, getRsvpCountsForEvents, getRsvpsForEvents } from "@/lib/actions";

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // All data fetched fresh on load (actions use noStore() + service role for temp/demo)
  // Use broad try/catch + per-call fallbacks so dashboard loads even with missing tables/columns
  let summary = {
    totalOwedCents: 0,
    familiesWithBalance: 0,
    upcomingCents: 0,
    upcomingCount: 0,
    paidCount: 0,
    totalInvoices: 0,
  };
  let allInvoices: any[] = [];
  let upcomingEventsRaw: any[] = [];
  let roster: any[] = [];
  let recentMsgs: any[] = [];
  let pinnedAnns: any[] = [];
  let rsvpCountsForUpcoming: Record<number | string, { yes: number; no: number; maybe: number; total: number }> = {};
  let rsvpsForUpcoming: Record<number | string, any[]> = {};

  try {
    summary = await getTeamPaymentSummary().catch(() => ({
      totalOwedCents: 0,
      familiesWithBalance: 0,
      upcomingCents: 0,
      upcomingCount: 0,
      paidCount: 0,
      totalInvoices: 0,
    }));

    allInvoices = await getInvoices().catch(() => [] as any[]);
    upcomingEventsRaw = await getEvents({ upcomingOnly: true, limit: 5 }).catch(() => [] as any[]);
    const upcomingIds = Array.isArray(upcomingEventsRaw) ? upcomingEventsRaw.map((e: any) => e?.id).filter(Boolean) : [];
    rsvpCountsForUpcoming = upcomingIds.length > 0
      ? await getRsvpCountsForEvents(upcomingIds).catch(() => ({} as any))
      : {};
    rsvpsForUpcoming = upcomingIds.length > 0
      ? await getRsvpsForEvents(upcomingIds).catch(() => ({} as any))
      : {};
    roster = await getRoster().catch(() => [] as any[]);
    recentMsgs = await getMessages('team', null, 8).catch(() => [] as any[]);
    pinnedAnns = await getPinnedAnnouncements().catch(() => [] as any[]);
  } catch (e: any) {
    console.warn('[Dashboard] data fetch error (falling back to empty):', e?.message || e);
    // defaults already initialized above
  }

  // Processing with extra safety to prevent render crashes on bad/missing data
  let paidCents = 0;
  let pendingCents = 0;
  let paidFamilySet = new Set();
  let upcomingEvents: any[] = [];
  let totalPlayers = 0;
  let activeFamilies = 0;
  let recentActivity: any[] = [];

  try {
    const safeInvoices = Array.isArray(allInvoices) ? allInvoices.filter((i: any) => i && typeof i === 'object') : [];
    paidCents = safeInvoices
      .filter((i: any) => i.status === 'paid')
      .reduce((s: number, i: any) => s + (Number(i.amount_cents) || 0), 0);
    pendingCents = safeInvoices
      .filter((i: any) => i.status !== 'paid' && i.status !== 'cancelled')
      .reduce((s: number, i: any) => s + (Number(i.amount_cents) || 0), 0);
    paidFamilySet = new Set(
      safeInvoices.filter((i: any) => i.status === 'paid').map((i: any) => i.family_id).filter(Boolean)
    );

    // Roster snapshot (compute early for Not Responded calc in Upcoming Events)
    const safeRoster = Array.isArray(roster) ? roster.filter((p: any) => p && typeof p === 'object') : [];
    totalPlayers = safeRoster.length;
    activeFamilies = new Set(safeRoster.map((p: any) => p.family_id).filter(Boolean)).size;

    // Upcoming events (next 3-5)
    const safeUpcoming = Array.isArray(upcomingEventsRaw) ? upcomingEventsRaw.filter((ev: any) => ev && typeof ev === 'object') : [];
    upcomingEvents = safeUpcoming.map((ev: any) => {
      try {
        const startDate = new Date(ev.start_time || 0);
        const dateStr = isNaN(startDate.getTime()) ? 'TBD' : startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const timeStr = isNaN(startDate.getTime()) ? '' : startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const counts = rsvpCountsForUpcoming[ev.id] || { yes: 0, no: 0, maybe: 0, total: 0 };
        const yesCount = counts.yes || 0;
        const noCount = counts.no || 0;
        const notResponded = totalPlayers > 0
          ? Math.max(0, totalPlayers - yesCount - noCount)
          : 0;
        const rsvpSummary = totalPlayers > 0
          ? `Yes: ${yesCount} | No: ${noCount} | Not Responded: ${notResponded}`
          : (yesCount > 0 || noCount > 0 ? `Yes: ${yesCount} | No: ${noCount}` : 'No RSVPs yet');
        const rsvpListRaw = rsvpsForUpcoming[ev.id] || [];
        const rsvpList = rsvpListRaw.length > 0
          ? rsvpListRaw.map((r: any) => {
              const fam = r.family_name || 'Family';
              const resp = r.response ? r.response.charAt(0).toUpperCase() + r.response.slice(1) : '';
              return `${fam} - ${resp}`;
            }).join(' • ')
          : '';
        return {
          id: ev.id,
          title: ev.title || 'Event',
          date: dateStr,
          time: timeStr,
          location: ev.location || 'TBD',
          rsvpSummary,
          rsvpList,
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Recent Activity: latest team chat messages (most recent first)
    const safeRecent = Array.isArray(recentMsgs) ? recentMsgs.filter((m: any) => m && typeof m === 'object') : [];
    recentActivity = [...safeRecent]
      .sort((a: any, b: any) => {
        try {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        } catch {
          return 0;
        }
      })
      .slice(0, 4)
      .map((m: any) => ({
        id: m.id,
        content: (m.content || '').slice(0, 80) + ((m.content || '').length > 80 ? '...' : ''),
        sender: m.sender?.first_name || (m.sender_id === 'temp-coach-id' ? 'Coach' : 'Teammate'),
        time: (() => { try { return new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } })(),
      }));

    // Mix in a recent pinned announcement if available (for variety in activity feed)
    const safePinned = Array.isArray(pinnedAnns) ? pinnedAnns.filter((a: any) => a && typeof a === 'object') : [];
    if (safePinned.length > 0 && recentActivity.length < 4) {
      const a = safePinned[0];
      recentActivity = [
        ...recentActivity,
        {
          id: `ann-${a.id || Date.now()}`,
          content: (a.title || 'Announcement') + ': ' + ((a.body || '').slice(0, 50) + '...'),
          sender: 'Coach',
          time: (() => { try { return new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } })(),
        },
      ];
    }
  } catch (e: any) {
    console.warn('[Dashboard] processing error (using safe defaults):', e?.message || e);
    // keep the zero/empty defaults defined above
  }

  return (
    <div className="space-y-8 pb-8">
      {/* Hero Banner - Mavericks Branding */}
      <div className="relative w-full h-40 md:h-48 rounded-2xl overflow-hidden shadow-xl border border-border bg-[#0A0A0A]">
        <TeamBanner />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40 flex items-center p-6 md:p-8">
          <div className="flex items-center gap-4">
            <TeamLogo size="lg" className="drop-shadow-xl ring-2 ring-primary/30" />
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tighter text-white">Mavericks</h1>
              <div className="text-sm md:text-base text-white/95 font-medium tracking-widest mt-0.5">12U 2027 Season</div>
              <p className="text-white/80 text-xs md:text-sm mt-1">Travel Baseball • Team Dashboard</p>
            </div>
          </div>
        </div>
        <div className="absolute top-4 right-4 text-right text-xs text-white/70 hidden md:block">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Upcoming Events Widget - clickable to /schedule */}
        <Link href="/schedule" className="block group">
          <Card className="mavericks-card h-full transition-all group-hover:border-primary/40 group-hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <Calendar className="h-5 w-5 text-primary" /> Upcoming Events
                <span className="ml-auto text-xs font-normal text-muted-foreground">→ Schedule</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {upcomingEvents.length > 0 ? (
                  upcomingEvents.map((ev: any) => (
                    <div key={ev.id} className="flex justify-between items-start gap-3 border-l-2 border-primary/20 pl-3 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium leading-tight">{ev.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {ev.date} • {ev.time} • {ev.location}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {ev.rsvpSummary}
                        </div>
                        {ev.rsvpList && (
                          <div className="text-[9px] text-muted-foreground/80 mt-0.5 truncate">
                            {ev.rsvpList}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground py-2">No upcoming events scheduled.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Recent Activity Widget - clickable to /chat */}
        <Link href="/chat" className="block group">
          <Card className="mavericks-card h-full transition-all group-hover:border-primary/40 group-hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <MessageCircle className="h-5 w-5 text-primary" /> Recent Activity
                <span className="ml-auto text-xs font-normal text-muted-foreground">→ Chat</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {recentActivity.length > 0 ? (
                  recentActivity.map((item: any, idx: number) => (
                    <div key={idx} className="text-sm border-l-2 border-primary/20 pl-3">
                      <div className="text-foreground/90 leading-snug line-clamp-2">{item.content}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {item.sender} • {item.time}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground py-2">No recent activity yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Payment Summary Widget - clickable to /payments */}
        <Link href="/payments" className="block group">
          <Card className="mavericks-card h-full transition-all group-hover:border-primary/40 group-hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <CreditCard className="h-5 w-5 text-primary" /> Payment Summary
                <span className="ml-auto text-xs font-normal text-muted-foreground">→ Payments</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-muted-foreground text-xs">Collected</div>
                  <div className="text-2xl font-semibold text-emerald-600 mt-0.5">${(paidCents / 100).toFixed(0)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Outstanding</div>
                  <div className="text-2xl font-semibold text-amber-600 mt-0.5">${(pendingCents / 100).toFixed(0)}</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground flex justify-between pt-1 border-t">
                <span>{paidFamilySet.size} families paid</span>
                <span>{summary.familiesWithBalance} with balance</span>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Roster Snapshot Widget - clickable to /roster */}
        <Link href="/roster" className="block group">
          <Card className="mavericks-card h-full transition-all group-hover:border-primary/40 group-hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <Users className="h-5 w-5 text-primary" /> Roster Snapshot
                <span className="ml-auto text-xs font-normal text-muted-foreground">→ Roster</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-end gap-6">
                <div>
                  <div className="text-4xl font-bold tracking-tighter">{totalPlayers}</div>
                  <div className="text-sm text-muted-foreground -mt-1">Players</div>
                </div>
                <div>
                  <div className="text-4xl font-bold tracking-tighter">{activeFamilies}</div>
                  <div className="text-sm text-muted-foreground -mt-1">Families</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Optional: prominent calendar subscription link (public ICS feed) */}
      <div className="text-center pt-2">
        <a
          href="/api/calendar/ics"
          target="_blank"
          rel="noopener"
          className="text-[10px] underline text-muted-foreground hover:text-foreground"
        >
          📅 Subscribe to full team calendar (.ics feed)
        </a>
      </div>

      <div className="text-center text-[10px] text-muted-foreground pt-4 border-t">
        Fresh data • Click any widget to navigate • Mavericks 12U (Black &amp; Red)
      </div>
    </div>
  );
}
