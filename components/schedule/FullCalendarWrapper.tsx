"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import { EventClickArg, DateSelectArg } from "@fullcalendar/core";
import { format } from "date-fns";
import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { Event } from "@/lib/supabase/types";
import { createClient } from '@/lib/supabase/client';

interface FullCalendarWrapperProps {
  events: Event[];
  isCoach: boolean;
  initialRsvpCounts?: Record<number | string, { yes: number; no: number; maybe: number; total: number }>;
  rsvpsByEvent?: Record<number | string, any[]>;
  currentFamilyName?: string;
  showAddDialog?: boolean;
  onShowAddDialogChange?: (open: boolean) => void;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  practice: "#DC2626",
  game: "#B91C1C",
  tournament: "#7C3AED",
  meeting: "#2563EB",
  other: "#4B5563",
};

export function FullCalendarWrapper({ 
  events: initialEvents, 
  isCoach,
  initialRsvpCounts = {},
  rsvpsByEvent = {},
  currentFamilyName,
  showAddDialog: showAddDialogProp,
  onShowAddDialogChange,
}: FullCalendarWrapperProps) {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [rsvpCounts, setRsvpCounts] = useState<Record<number | string, { yes: number; no: number; maybe: number; total: number }>>(initialRsvpCounts || {});
  const [rsvpsByEventState, setRsvpsByEventState] = useState<Record<number | string, any[]>>(rsvpsByEvent || {});
  const [currentFamilyNameState, setCurrentFamilyNameState] = useState<string>(currentFamilyName || 'Family');



  // Sync local state when parent re-fetches fresh events from Supabase (e.g. after create)
  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  useEffect(() => {
    if (rsvpsByEvent) setRsvpsByEventState(rsvpsByEvent);
  }, [rsvpsByEvent]);

  useEffect(() => {
    if (currentFamilyName) setCurrentFamilyNameState(currentFamilyName);
  }, [currentFamilyName]);

  // Sync RSVP counts from parent (e.g. initial load or retry). Note: after live RSVP we update locally.
  useEffect(() => {
    if (initialRsvpCounts) setRsvpCounts(initialRsvpCounts);
  }, [initialRsvpCounts]);

  // Support controlled add dialog (for page's bottom "Add New Event" button) + internal fallback
  const [internalShowAddDialog, setInternalShowAddDialog] = useState(false);
  const isControlledAdd = typeof showAddDialogProp === "boolean";
  const showAddDialog = isControlledAdd ? showAddDialogProp : internalShowAddDialog;
  const setShowAddDialog = (open: boolean) => {
    if (onShowAddDialogChange) onShowAddDialogChange(open);
    if (!isControlledAdd) setInternalShowAddDialog(open);
  };

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    type: "practice" as Event["type"],
    start: "",
    end: "",
    location: "",
    opponent: "",
    description: "",
  });

  // Convert DB events to FullCalendar format (simple, stable)
  // Use Date objects to ensure correct parsing and display on the right dates (avoids ISO string timezone pitfalls)
  // Extra defensive: guard bad/missing dates so calendar never crashes even with bad DB rows
  const calendarEvents = (Array.isArray(events) ? events : [])
    .filter((e: any) => e != null && e.id && e.start_time)
    .map((event: any) => {
      try {
        const start = event.start_time ? new Date(event.start_time) : null;
        const end = event.end_time ? new Date(event.end_time) : undefined;
        if (!start || isNaN(start.getTime())) return null;
        return {
          id: String(event.id),
          title: event.title || "Untitled",
          start,
          end: end && !isNaN(end.getTime()) ? end : undefined,
          allDay: !event.end_time,
          backgroundColor: event.is_cancelled ? "#6b7280" : EVENT_TYPE_COLORS[event.type] || "#DC2626",
          borderColor: event.is_cancelled ? "#6b7280" : "#B91C1C",
          textColor: "#ffffff",
          extendedProps: { ...event },
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as any[];

  const resetForm = () => {
    setFormData({
      title: "",
      type: "practice",
      start: "",
      end: "",
      location: "",
      opponent: "",
      description: "",
    });
  };

  // Fresh fetch after mutations so calendar + parent data stay in sync (stable after save)
  async function reloadEventsFromDb() {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("start_time", { ascending: true });
      if (!error && Array.isArray(data)) {
        setEvents(data as any);
      }
    } catch (e: any) {
      console.error("Schedule error (reloadEventsFromDb):", e);
    }
  }

  // Reload RSVPs + recompute counts for a single event (used after RSVP click for real-time UI)
  async function reloadRsvpsForEvent(eventId: number | string) {
    try {
      const supabase = createClient();
      const { data: rsvps, error } = await (supabase as any)
        .from("rsvps")
        .select("*")
        .eq("event_id", Number(eventId))
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Schedule error (reloadRsvpsForEvent):", error);
        return;
      }

      const list = Array.isArray(rsvps) ? rsvps : [];
      setRsvpsByEventState((prev) => ({ ...prev, [eventId]: list }));

      // Recompute counts for this event only (yes/no only)
      const counts: { yes: number; no: number; maybe: number; total: number } = { yes: 0, no: 0, maybe: 0, total: 0 };
      list.forEach((r: any) => {
        const resp = r?.response;
        if (resp === 'yes') {
          counts.yes = (counts.yes || 0) + 1;
          counts.total += 1;
        } else if (resp === 'no') {
          counts.no = (counts.no || 0) + 1;
          counts.total += 1;
        }
      });
      setRsvpCounts((prev) => ({ ...prev, [eventId]: counts }));
    } catch (e: any) {
      console.error("Schedule error (reloadRsvpsForEvent):", e);
    }
  }

  const handleEventClick = (clickInfo: EventClickArg) => {
    const dbEvent = clickInfo.event.extendedProps as Event;
    if (dbEvent?.id) {
      setSelectedEvent(dbEvent);
    }
  };

  const handleDateSelect = (selectInfo: DateSelectArg) => {
    if (!isCoach) return;

    resetForm();
    setFormData({
      title: "",
      type: "practice",
      start: format(selectInfo.start, "yyyy-MM-dd'T'HH:mm"),
      end: selectInfo.end ? format(selectInfo.end, "yyyy-MM-dd'T'HH:mm") : "",
      location: "",
      opponent: "",
      description: "",
    });
    setShowAddDialog(true);
    selectInfo.view.calendar.unselect();
  };

  // Coach: Create - fully client-side with direct insert + try/catch
  const handleCreate = async () => {
    if (!formData.title || !formData.start) {
      toast.error("Title and start time are required");
      return;
    }

    const supabase = createClient();
    try {
      // Use only columns that exist in the current events table.
      // id is auto-generated, created_by/updated etc. omitted to avoid missing column errors.
      // end_time is optional (include key only when provided).
      const insertPayload: any = {
        title: formData.title,
        type: formData.type,
        start_time: new Date(formData.start).toISOString(),
        location: formData.location || null,
        description: formData.description || null,
      };

      if (formData.end) {
        insertPayload.end_time = new Date(formData.end).toISOString();
      }
      if (formData.opponent) {
        insertPayload.opponent = formData.opponent;
      }

      const { data: inserted, error } = await (supabase as any)
        .from("events")
        .insert(insertPayload)
        .select("*")
        .single();

      if (error) {
        console.error("Schedule error (createEvent insert):", error);
        console.error("Payload used:", insertPayload);
        throw new Error(error.message || "Insert failed");
      }

      toast.success("Event created");
      setShowAddDialog(false);
      resetForm();

      // Optimistic + reload fresh from DB for consistency
      if (inserted) {
        setEvents((prev) => [...prev, inserted as any]);
      }
      await reloadEventsFromDb();
      router.refresh();
    } catch (e: any) {
      console.error("Schedule error:", e);
      toast.error(e.message || "Failed to create event");
    }
  };

  // Coach: Open edit
  const openEdit = (ev: Event) => {
    setEditingEvent(ev);
    setFormData({
      title: ev.title || "",
      type: ev.type,
      start: format(new Date(ev.start_time), "yyyy-MM-dd'T'HH:mm"),
      end: ev.end_time ? format(new Date(ev.end_time), "yyyy-MM-dd'T'HH:mm") : "",
      location: ev.location || "",
      opponent: ev.opponent || "",
      description: ev.description || "",
    });
    setShowEditDialog(true);
    setSelectedEvent(null);
  };

  // Coach: Update - direct client update + try/catch + handle end_time safely
  const handleUpdate = async () => {
    if (!editingEvent) return;

    const supabase = createClient();
    try {
      // Build minimal payload. Only include end_time when a value is provided (matches create pattern)
      // Avoids "column does not exist" or type errors for end_time/updated_at in some prod schemas.
      const updatePayload: any = {
        title: formData.title,
        type: formData.type,
        start_time: new Date(formData.start).toISOString(),
        location: formData.location || null,
        description: formData.description || null,
      };

      if (formData.end) {
        updatePayload.end_time = new Date(formData.end).toISOString();
      }
      if (formData.opponent) {
        updatePayload.opponent = formData.opponent;
      }
      // Never send updated_at/created_by here to stay compatible

      const { error } = await (supabase as any)
        .from("events")
        .update(updatePayload)
        .eq("id", editingEvent.id);

      if (error) {
        console.error("Schedule error (updateEvent):", error);
        console.error("Update payload:", updatePayload);
        throw new Error(error.message || "Update failed");
      }

      toast.success("Event updated");
      setShowEditDialog(false);
      setEditingEvent(null);

      // Optimistic local update (correct keys, no formData pollution)
      const newStart = new Date(formData.start).toISOString();
      const newEnd = formData.end ? new Date(formData.end).toISOString() : (editingEvent as any).end_time || null;
      setEvents((prev) =>
        prev.map((e) =>
          e.id === editingEvent.id
            ? {
                ...e,
                title: formData.title,
                type: formData.type,
                start_time: newStart,
                end_time: newEnd,
                location: formData.location || null,
                opponent: formData.opponent || null,
                description: formData.description || null,
              } as Event
            : e
        )
      );

      await reloadEventsFromDb();
      router.refresh();
    } catch (e: any) {
      console.error("Schedule error:", e);
      toast.error(e.message || "Failed to update event");
    }
  };

  // Coach: Delete - direct + try/catch
  const handleDelete = async (eventId: number | string) => {
    if (!confirm("Delete this event permanently?")) return;

    const supabase = createClient();
    try {
      const { error } = await (supabase as any).from("events").delete().eq("id", eventId);
      if (error) {
        console.error("Schedule error (deleteEvent):", error);
        throw new Error(error.message || "Delete failed");
      }
      toast.success("Event deleted");
      setSelectedEvent(null);
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      await reloadEventsFromDb();
      router.refresh();
    } catch (e: any) {
      console.error("Schedule error:", e);
      toast.error(e.message || "Failed to delete event");
    }
  };

  const handleRsvp = async (eventId: number | string, familyName: string, status: 'yes' | 'no') => {
    const supabase = createClient();
    try {
      // Always resolve live from the signed-in user's profile.family_id -> families.name
      // This guarantees actual Family Name in rsvps table (no "Unknown Family", "Demo Family" or "My Family").
      let fam = familyName || currentFamilyNameState || '';
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          const { data: prof } = await (supabase as any)
            .from('profiles')
            .select('family_id')
            .eq('id', user.id)
            .maybeSingle();
          const fid = prof?.family_id;
          if (fid) {
            const { data: frow } = await (supabase as any)
              .from('families')
              .select('name')
              .eq('id', fid)
              .maybeSingle();
            if (frow?.name) fam = frow.name;
          }
        }
      } catch (lkpErr) {
        console.warn('RSVP live family name lookup skipped (using prop):', lkpErr);
      }
      if (!fam || /unknown|demo|my family/i.test(fam)) {
        fam = currentFamilyNameState || 'Family';
      }

      const isLikelyTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
      if (!isLikelyTemp && (!fam || /unknown|demo/i.test(fam))) {
        toast.error('Please set up your family first (Create My Family on login) so your RSVP shows the correct name.');
        return;
      }

      // Use delete + insert to achieve "upsert" semantics reliably (supports re-voting / changing answer)
      // without depending on a unique constraint that may not be present in all DBs.
      // Clear any prior response for this family + event.
      await (supabase as any)
        .from("rsvps")
        .delete()
        .eq("event_id", Number(eventId))
        .eq("family_name", fam);

      const { error } = await (supabase as any)
        .from("rsvps")
        .insert({
          event_id: Number(eventId),
          response: status,
          family_name: fam,
          notes: null,
        } as any);

      if (error) {
        console.error("Schedule error (RSVP insert):", error);
        throw new Error(error.message || "Failed to save RSVP");
      }

      toast.success(`RSVP set to ${status.toUpperCase()}`);

      // Update UI immediately with fresh data from DB (real-time counts + list in modal)
      await reloadRsvpsForEvent(eventId);
    } catch (e: any) {
      console.error("Schedule error:", e);
      toast.error(e.message || "RSVP failed");
    }
  };

  // Subscribe to full team calendar (public .ics feed)
  const subscribeToCalendar = () => {
    try {
      const origin = (typeof window !== "undefined" ? window.location.origin : "");
      const url = `${origin}/api/calendar/ics`;

      // Copy link for subscription (paste into Apple Calendar, Google Calendar, Outlook etc. as "Subscribe")
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(url)
          .then(() => {
            toast.success("Calendar subscription URL copied! Add as subscription in your calendar app.");
          })
          .catch(() => {
            prompt("Copy this subscription URL:", url);
          });
      } else {
        prompt("Copy this subscription URL:", url);
      }

      // Force download of the .ics (also works for direct add to calendar)
      const link = document.createElement("a");
      link.href = url;
      link.download = "mavericks-12u-schedule.ics";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e: any) {
      console.error("Schedule error (subscribe calendar):", e);
      toast.error("Could not prepare calendar subscription");
      // last resort - try direct open
      try {
        const origin = (typeof window !== "undefined" ? window.location.origin : "");
        window.open(`${origin}/api/calendar/ics`, "_blank");
      } catch {}
    }
  };

  // Improved map link: Apple Maps on iOS, Google otherwise
  const openInMaps = (location: string | null | undefined) => {
    try {
      if (!location) return;
      const q = encodeURIComponent(location.trim());
      const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "");
      const isIOS = /iPhone|iPad|iPod/i.test(ua);
      const mapsUrl = isIOS
        ? `https://maps.apple.com/?q=${q}`
        : `https://www.google.com/maps/search/?api=1&query=${q}`;
      window.open(mapsUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      console.error("Schedule error (open maps):", e);
      // graceful fallback
      try {
        if (location) {
          const q = encodeURIComponent(location);
          window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank");
        }
      } catch {}
    }
  };

  return (
    <>
      <div className="rounded-xl border bg-card p-2 shadow-sm">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
          }}
          events={calendarEvents}
          eventClick={handleEventClick}
          selectable={isCoach}
          select={handleDateSelect}
          editable={false}
          height="auto"
          eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
          nowIndicator
          dayMaxEvents={3}
        />
      </div>

      {/* Event Detail Modal */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="sm:max-w-md">
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedEvent.title}
                  {selectedEvent.is_cancelled && <Badge variant="destructive">Cancelled</Badge>}
                </DialogTitle>
                <DialogDescription>
                  {selectedEvent.type} • {format(new Date(selectedEvent.start_time), "EEEE, MMMM d, yyyy")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <div>
                  <strong>When:</strong> {format(new Date(selectedEvent.start_time), "h:mm a")}
                  {selectedEvent.end_time && ` – ${format(new Date(selectedEvent.end_time), "h:mm a")}`}
                </div>

                {selectedEvent.location && (
                  <div><strong>Location:</strong> {selectedEvent.location}</div>
                )}
                {selectedEvent.opponent && (
                  <div><strong>Opponent:</strong> {selectedEvent.opponent}</div>
                )}
                {selectedEvent.description && (
                  <div>
                    <strong>Details:</strong>
                    <p className="mt-1 text-muted-foreground">{selectedEvent.description}</p>
                  </div>
                )}
              </div>

              {/* Prominent RSVP Section - Mavericks themed */}
              <div className="mt-4 p-3 rounded-lg border border-primary/30 bg-primary/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-sm tracking-tight">Attendance / RSVP</div>
                  {rsvpCounts[selectedEvent.id] && (
                    <div className="flex gap-2 text-[10px] font-medium">
                      <span className="px-1.5 py-0.5 rounded bg-green-600 text-white">{rsvpCounts[selectedEvent.id].yes || 0} Yes</span>
                      <span className="px-1.5 py-0.5 rounded bg-red-600 text-white">{rsvpCounts[selectedEvent.id].no || 0} No</span>
                    </div>
                  )}
                </div>

                {/* List of who RSVPed (real family names from roster) */}
                {rsvpsByEventState[selectedEvent.id] && rsvpsByEventState[selectedEvent.id].length > 0 ? (
                  <div className="mb-3 text-xs">
                    <div className="text-muted-foreground mb-1">Who RSVPed:</div>
                    <ul className="space-y-0.5">
                      {rsvpsByEventState[selectedEvent.id].map((r: any, idx: number) => {
                        const display = r.family_name || 'Family';
                        const resp = r.response;
                        const badgeClass = resp === 'yes' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
                        return (
                          <li key={idx} className="flex justify-between items-center">
                            <span className="truncate">{display}</span>
                            <span className={`px-1.5 py-0 rounded text-[10px] font-medium ${badgeClass}`}>{resp}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  isCoach && <div className="text-xs text-muted-foreground mb-2">No RSVPs yet for this event.</div>
                )}

                {/* Prominent RSVP buttons - only Yes / No */}
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    size="sm" 
                    onClick={() => handleRsvp(selectedEvent.id, currentFamilyNameState, 'yes')} 
                    className="bg-green-600 hover:bg-green-700 text-white text-xs py-1"
                  >
                    👍 Yes
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => handleRsvp(selectedEvent.id, currentFamilyNameState, 'no')} 
                    className="bg-red-600 hover:bg-red-700 text-white text-xs py-1"
                  >
                    👎 No
                  </Button>
                </div>
                <div className="text-[10px] text-center text-muted-foreground mt-1.5">
                  {isCoach ? "Coach can view all RSVPs above" : "RSVP for your family (Yes/No only)"}
                </div>
              </div>

              {/* Calendar subscription + Maps - always visible, placed near action buttons */}
              <div className="flex gap-2 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={subscribeToCalendar}
                  className="flex-1 text-xs"
                >
                  📅 Subscribe to Calendar
                </Button>
                {selectedEvent.location && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openInMaps(selectedEvent.location)}
                    className="flex-1 text-xs"
                  >
                    🗺️ Open in Maps
                  </Button>
                )}
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setSelectedEvent(null)} className="flex-1">
                  Close
                </Button>
                {isCoach && (
                  <>
                    <Button variant="outline" onClick={() => openEdit(selectedEvent)} className="flex-1">
                      Edit
                    </Button>
                    <Button variant="destructive" onClick={() => handleDelete(selectedEvent.id)} className="flex-1">
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Event Dialog (Coach only) */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Event</DialogTitle>
            <DialogDescription>Fill in the details below.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Spring Practice #3"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Type</label>
                <select
                  className="mt-1 w-full rounded-md border bg-background p-2"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                >
                  <option value="practice">Practice</option>
                  <option value="game">Game</option>
                  <option value="tournament">Tournament</option>
                  <option value="meeting">Meeting</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Start Time</label>
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-md border bg-background p-2"
                  value={formData.start}
                  onChange={(e) => setFormData({ ...formData, start: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Location</label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Central Park Field 3"
              />
            </div>

            {formData.type === "game" && (
              <div>
                <label className="text-sm font-medium">Opponent</label>
                <Input
                  value={formData.opponent}
                  onChange={(e) => setFormData({ ...formData, opponent: e.target.value })}
                  placeholder="Red Sox 12U"
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Description / Notes</label>
              <textarea
                className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Bring water, focus on base running..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} className="mavericks-btn-primary">
              Create Event
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog (Coach) */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Type</label>
                <select
                  className="mt-1 w-full rounded-md border bg-background p-2"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                >
                  <option value="practice">Practice</option>
                  <option value="game">Game</option>
                  <option value="tournament">Tournament</option>
                  <option value="meeting">Meeting</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Start</label>
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-md border bg-background p-2"
                  value={formData.start}
                  onChange={(e) => setFormData({ ...formData, start: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Location</label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Central Park Field 3"
              />
            </div>

            {formData.type === "game" && (
              <div>
                <label className="text-sm font-medium">Opponent</label>
                <Input
                  value={formData.opponent}
                  onChange={(e) => setFormData({ ...formData, opponent: e.target.value })}
                  placeholder="Red Sox 12U"
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Description / Notes</label>
              <textarea
                className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditingEvent(null); }}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} className="mavericks-btn-primary">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
