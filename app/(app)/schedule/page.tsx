'use client';

import React, { useState, useEffect } from 'react';
import { FullCalendarWrapper } from "@/components/schedule/FullCalendarWrapper";
import ErrorBoundary from "@/components/ErrorBoundary";
import { getEvents, getRsvpCountsForEvents, getRsvpsForEvents, getRoster } from "@/lib/actions";
import { createClient } from '@/lib/supabase/client';

export default function SchedulePage() {
  const [events, setEvents] = useState<any[]>([]);
  const [rsvpCounts, setRsvpCounts] = useState<any>({});
  const [rsvpsByEvent, setRsvpsByEvent] = useState<any>({});
  const [rosterPlayers, setRosterPlayers] = useState<any[]>([]);
  const [currentFamilyName, setCurrentFamilyName] = useState<string>('My Family');
  const [isCoach, setIsCoach] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Controlled state for Add dialog so bottom button can open the real modal in wrapper
  const [showAddDialog, setShowAddDialog] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const supabase = createClient();
      const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');

      let coach = isTemp;
      let currentUser: any = null;
      if (!isTemp) {
        try {
          const { data: { user } } = await supabase.auth.getUser().catch((e: any) => {
            console.error("Schedule error:", e);
            return { data: { user: null } };
          });
          currentUser = user;
          if (user) {
            let prof: any = null;
            try {
              const { data } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", user.id)
                .maybeSingle();
              prof = data;
            } catch (e: any) {
              console.error("Schedule error:", e);
              prof = null;
            }
            coach = (prof as any)?.role === 'coach' || (prof as any)?.role === 'admin' || (prof as any)?.is_admin === true;
            if (user?.email?.toLowerCase() === 'coach@comavericksbaseball.com') coach = true;
          }
        } catch (e: any) {
          console.error("Schedule error:", e);
          coach = false;
          if (currentUser?.email?.toLowerCase() === 'coach@comavericksbaseball.com') coach = true;
        }
      }
      setIsCoach(coach);

      // Events
      const fetchedEvents = await getEvents().catch((e: any) => {
        console.error("Schedule error:", e);
        return [] as any[];
      });
      const safeEvents = (fetchedEvents || []).filter((e: any) => e && e.id != null && e.start_time);
      setEvents(safeEvents);

      const eventIds = safeEvents.map((e: any) => e.id);

      let counts = {};
      let byEvent = {};
      if (eventIds.length > 0) {
        counts = await getRsvpCountsForEvents(eventIds).catch((e: any) => {
          console.error("Schedule error:", e);
          return {};
        });
        byEvent = await getRsvpsForEvents(eventIds).catch((e: any) => {
          console.error("Schedule error:", e);
          return {};
        });
      }
      setRsvpCounts(counts);
      setRsvpsByEvent(byEvent);

      const roster = await getRoster().catch((e: any) => {
        console.error("Schedule error:", e);
        return [] as any[];
      });
      setRosterPlayers(roster);

      // Determine current user's actual family name from profile + roster (so RSVPs use real names e.g. "Brower Family" not "Demo Family")
      let famName = 'My Family';
      if (isTemp) {
        famName = (roster && roster.length && roster[0]?.family?.name) || 'Johnson Family';
      } else if (currentUser) {
        try {
          const { data: profData } = await supabase
            .from("profiles")
            .select("family_id")
            .eq("id", currentUser.id)
            .maybeSingle() as any;
          const myFamId = profData?.family_id;
          if (myFamId) {
            const match = roster.find((p: any) => p.family_id === myFamId);
            if (match?.family?.name) famName = match.family.name;
          }
        } catch (e) {
          console.warn("Schedule RSVP family name lookup:", e);
        }
      }
      setCurrentFamilyName(famName);
    } catch (e: any) {
      console.error("Schedule error:", e);
      setLoadError('Failed to load schedule data. Some features may be unavailable.');
      setEvents([]);
      setRsvpCounts({});
      setRsvpsByEvent({});
      setRosterPlayers([]);
      setCurrentFamilyName('My Family');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Realtime updates for RSVPs so lists/counts refresh across users/views
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('rsvps-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rsvps' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRetry = () => {
    loadData();
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Mavericks 12U Schedule</h1>
      <p className="text-lg text-green-400 mb-8">✅ Page is now loading in production</p>
      
      <div className="bg-zinc-900 p-6 rounded-xl">
        {loadError && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-800 rounded flex justify-between items-center">
            <span>Schedule error: {loadError}</span>
            <button onClick={handleRetry} className="text-sm underline">Try Again</button>
          </div>
        )}

        {loading ? (
          <p className="text-muted-foreground">Loading schedule data...</p>
        ) : (
          <ErrorBoundary
            fallback={
              <div className="p-8 border rounded bg-muted text-center">
                Calendar temporarily unavailable.
                <button onClick={handleRetry} className="underline block mt-2">Try Again</button>
              </div>
            }
          >
            <FullCalendarWrapper
              events={events}
              isCoach={isCoach}
              initialRsvpCounts={rsvpCounts}
              rsvpsByEvent={rsvpsByEvent}
              rosterPlayers={rosterPlayers}
              currentFamilyName={currentFamilyName}
              showAddDialog={showAddDialog}
              onShowAddDialogChange={setShowAddDialog}
            />
          </ErrorBoundary>
        )}

        {isCoach && (
          <button 
            onClick={() => setShowAddDialog(true)}
            className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white"
          >
            Add New Event
          </button>
        )}
      </div>
    </div>
  );
}
