import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Calendar, MessageCircle, CreditCard, Users } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamBanner } from "@/components/TeamBanner";
import { getTeamPaymentSummary, getEvents, getRoster, getMessages, getPinnedAnnouncements, getInvoices } from "@/lib/actions";

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // All data fetched fresh on load (actions use noStore() + service role for temp/demo)
  const summary = await getTeamPaymentSummary().catch(() => ({
    totalOwedCents: 0,
    familiesWithBalance: 0,
    upcomingCents: 0,
    upcomingCount: 0,
    paidCount: 0,
    totalInvoices: 0,
  }));

  const allInvoices = await getInvoices().catch(() => [] as any[]);
  const paidCents = allInvoices
    .filter((i: any) => i.status === 'paid')
    .reduce((s: number, i: any) => s + (i.amount_cents || 0), 0);
  const pendingCents = allInvoices
    .filter((i: any) => i.status !== 'paid' && i.status !== 'cancelled')
    .reduce((s: number, i: any) => s + (i.amount_cents || 0), 0);
  const paidFamilySet = new Set(
    allInvoices.filter((i: any) => i.status === 'paid').map((i: any) => i.family_id)
  );

  // Upcoming events (next 3-5)
  const upcomingEventsRaw = await getEvents({ upcomingOnly: true, limit: 5 }).catch(() => [] as any[]);

  const upcomingEvents = upcomingEventsRaw.map((ev: any) => {
    const startDate = new Date(ev.start_time);
    const dateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return {
      id: ev.id,
      title: ev.title,
      date: dateStr,
      time: timeStr,
      location: ev.location || 'TBD',
    };
  });

  // Roster snapshot
  const roster = await getRoster().catch(() => [] as any[]);
  const totalPlayers = roster.length;
  const activeFamilies = new Set(roster.map((p: any) => p.family_id).filter(Boolean)).size;

  // Recent Activity: latest team chat messages (most recent first)
  const recentMsgs = await getMessages('team', null, 8).catch(() => [] as any[]);
  let recentActivity = [...recentMsgs]
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 4)
    .map((m: any) => ({
      id: m.id,
      content: (m.content || '').slice(0, 80) + ((m.content || '').length > 80 ? '...' : ''),
      sender: m.sender?.first_name || (m.sender_id === 'temp-coach-id' ? 'Coach' : 'Teammate'),
      time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }));

  // Mix in a recent pinned announcement if available (for variety in activity feed)
  const pinnedAnns = await getPinnedAnnouncements().catch(() => [] as any[]);
  if (pinnedAnns.length > 0 && recentActivity.length < 4) {
    const a = pinnedAnns[0];
    recentActivity = [
      ...recentActivity,
      {
        id: `ann-${a.id}`,
        content: a.title + ': ' + (a.body || '').slice(0, 50) + '...',
        sender: 'Coach',
        time: new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
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

      <div className="text-center text-[10px] text-muted-foreground pt-4 border-t">
        Fresh data • Click any widget to navigate • Mavericks 12U (Black &amp; Red)
      </div>
    </div>
  );
}
