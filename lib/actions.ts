"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateTag, unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import type { RsvpStatus } from "@/lib/supabase/types";

// Helper: under temp-coach (demo), use service role client so real DB data
// is immediately readable/queryable even without matching RLS. 
async function getSupabaseForReadWrite() {
  noStore();
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";
  if (isTemp && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient: createSupabaseJs } = await import("@supabase/supabase-js");
    let supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    supaUrl = supaUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
    return createSupabaseJs(
      supaUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    ) as any;
  }
  return await createClient();
}

// Example Server Action - will be expanded in the next phases
export async function createRsvp(eventId: number | string, playerId: string, status: RsvpStatus, note?: string) {
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";

  const supabase = isTemp ? await getSupabaseForReadWrite() : await createClient();

  // Use simple demo family name for temp coach to match simplified schema
  const familyName = isTemp ? "Demo Family" : (playerId || "Unknown Family");

  const { error } = await supabase.from("rsvps").insert(
    {
      event_id: Number(eventId),
      response: status,
      family_name: familyName,
      notes: note || null,
    } as any
  );

  if (error) {
    console.error("Failed to save RSVP - details:", {
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      eventId,
      playerId,
      status,
      familyName,
      isTemp,
    });
    throw new Error("Failed to save RSVP");
  }

  return { success: true };
}



// Coach-only event management (create / update / delete)
// We use direct role check in client too, but server enforces.

export async function createEvent(data: {
  title: string;
  type: string;
  start_time: string;
  end_time?: string | null;
  location?: string | null;
  opponent?: string | null;
  description?: string | null;
}) {
  const supabase = await getSupabaseForReadWrite();

  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";

  let createdBy: string | null = null;
  if (!isTemp) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_admin")
      .eq("id", user.id)
      .single() as { data: { role?: string; is_admin?: boolean } | null };

    if (profile?.role !== "coach" && profile?.role !== "admin" && profile?.is_admin !== true) {
      throw new Error("Only coaches can create events");
    }
    createdBy = user.id;
  }

  if (!data.title || !data.start_time) {
    throw new Error("Title and start time are required");
  }

  const insertPayload: any = {
    title: data.title,
    type: data.type,
    start_time: data.start_time,
    end_time: data.end_time || null,
    location: data.location || null,
    opponent: data.opponent || null,
    description: data.description || null,
    created_by: createdBy,
  };

  const { error } = await supabase.from("events").insert(insertPayload);

  if (error) throw new Error(error.message);

  revalidateTag("events");

  // Core notification: new event (temp coach + coaches). Real multi-user targeting in future.
  try {
    const cookieStore = await cookies();
    const isT = cookieStore.get("temp-coach")?.value === "1";
    await createNotification(
      isT ? 'temp-coach-id' : 'temp-coach-id', // placeholder; for real would fanout to coaches/parents
      'event_new',
      `New Event: ${data.title}`,
      `${data.type} on ${new Date(data.start_time).toLocaleDateString()}`,
      '/schedule'
    );
  } catch {}

  return { success: true };
}

export async function updateEvent(eventId: number | string, data: {
  title?: string;
  type?: string;
  start_time?: string;
  end_time?: string | null;
  location?: string | null;
  opponent?: string | null;
  description?: string | null;
  is_cancelled?: boolean;
}) {
  const supabase = await getSupabaseForReadWrite();

  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";

  if (!isTemp) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_admin")
      .eq("id", user.id)
      .single() as { data: { role?: string; is_admin?: boolean } | null };

    if (profile?.role !== "coach" && profile?.role !== "admin" && profile?.is_admin !== true) {
      throw new Error("Only coaches can update events");
    }
  }

  const { error } = await (supabase as any)
    .from("events")
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", eventId);

  if (error) throw new Error(error.message);

  revalidateTag("events");

  // Core notifs for update / cancel
  try {
    const notifType = data.is_cancelled ? 'event_canceled' : 'event_updated';
    await createNotification(
      'temp-coach-id',
      notifType,
      data.is_cancelled ? 'Event Canceled' : 'Event Updated',
      `Check /schedule for details (id ${eventId})`,
      '/schedule'
    );
  } catch {}

  return { success: true };
}

export async function deleteEvent(eventId: number | string) {
  const supabase = await getSupabaseForReadWrite();

  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";

  if (!isTemp) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_admin")
      .eq("id", user.id)
      .single() as { data: { role?: string; is_admin?: boolean } | null };

    if (profile?.role !== "coach" && profile?.role !== "admin" && profile?.is_admin !== true) {
      throw new Error("Only coaches can delete events");
    }
  }

  const { error } = await supabase.from("events").delete().eq("id", eventId);

  if (error) throw new Error(error.message);

  revalidateTag("events");
  return { success: true };
}

// Fetch events (used by schedule and dashboard)
export async function getEvents(options?: { upcomingOnly?: boolean; limit?: number }) {
  noStore();
  const supabase = await getSupabaseForReadWrite();

  let query = supabase
    .from("events")
    .select("*")
    .order("start_time", { ascending: true });

  if (options?.upcomingOnly) {
    const now = new Date().toISOString();
    query = query.gte("start_time", now);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.warn("getEvents error (falling back to demo):", error.message);
    // Demo fallback with integer IDs
    const demo = [
      {
        id: 1,
        title: "Spring Practice #3",
        type: "practice",
        start_time: new Date(Date.now() + 1000 * 3600 * 24 * 2).toISOString(),
        end_time: new Date(Date.now() + 1000 * 3600 * 24 * 2 + 3600 * 2).toISOString(),
        location: "Central Park Field 3",
        opponent: null,
        description: "Focus on hitting and base running.",
        created_by: null,
        is_cancelled: false,
        created_at: new Date().toISOString(),
        updated_at: null,
      },
      {
        id: 2,
        title: "Game vs Tigers",
        type: "game",
        start_time: new Date(Date.now() + 1000 * 3600 * 24 * 5).toISOString(),
        end_time: null,
        location: "Lincoln Elementary",
        opponent: "Tigers 12U",
        description: "",
        created_by: null,
        is_cancelled: false,
        created_at: new Date().toISOString(),
        updated_at: null,
      },
    ] as any;
    return demo;
  }

  return data || [];
}

// Simple helper to get RSVP counts for a set of events (used for dashboard/schedule summaries)
export async function getRsvpCountsForEvents(eventIds: (number | string)[]): Promise<Record<number | string, { yes: number; no: number; maybe: number; total: number }>> {
  if (!eventIds.length) return {};

  const supabase = await getSupabaseForReadWrite();

  const { data: rsvps, error } = await supabase
    .from("rsvps")
    .select("event_id, response")
    .in("event_id", eventIds.map(id => Number(id)));

  if (error || !rsvps) {
    return {};
  }

  const counts: Record<string, any> = {};

  eventIds.forEach(id => {
    counts[id] = { yes: 0, no: 0, maybe: 0, total: 0 };
  });

  rsvps.forEach((r: any) => {
    if (counts[r.event_id]) {
      const resp = r.response;
      if (counts[r.event_id][resp] !== undefined) {
        counts[r.event_id][resp] = (counts[r.event_id][resp] || 0) + 1;
        counts[r.event_id].total += 1;
      }
    }
  });

  return counts;
}

// Get RSVPs for specific events, with roster names for display
export async function getRsvpsForEvents(eventIds: (number | string)[]): Promise<Record<number | string, any[]>> {
  if (!eventIds.length) return {};

  const supabase = await getSupabaseForReadWrite();

  try {
    const { data: rsvps, error } = await supabase
      .from("rsvps")
      .select("event_id, response, family_name, notes, created_at")
      .in("event_id", eventIds.map(id => Number(id)))
      .order("created_at", { ascending: true });

    if (error) throw error;

    const byEvent: Record<number | string, any[]> = {};
    eventIds.forEach(id => { byEvent[id] = []; });

    (rsvps || []).forEach((r: any) => {
      if (byEvent[r.event_id]) {
        byEvent[r.event_id].push(r);
      }
    });

    return byEvent;
  } catch (e: any) {
    console.warn("getRsvpsForEvents fallback (demo):", e?.message);
    // Demo data using roster names
    const demo: Record<number | string, any[]> = {};
    if (eventIds.length > 0) {
      const firstId = eventIds[0];
      demo[firstId] = [
        { response: "yes", family_name: "Johnson Family", notes: "" },
        { response: "yes", family_name: "Johnson Family", notes: "Liam and Noah" },
        { response: "maybe", family_name: "Martinez Family", notes: "" },
      ];
      if (eventIds.length > 1) {
        demo[eventIds[1]] = [
          { response: "yes", family_name: "Martinez Family", notes: "" },
          { response: "no", family_name: "Johnson Family", notes: "" },
        ];
      }
    }
    return demo;
  }
}

// =====================================================
// Payments / Dues Management (Phase 6 flexible)
// =====================================================

export async function getFamilies() {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase.from('families').select('id, name').order('name');
    if (error) throw error;
    return data || [];
  } catch {
    // Temp bypass demo data
    return [
      { id: 'fam1', name: 'Maverick Family (Temp)' },
      { id: 'fam2', name: 'Johnson Family (Temp)' },
    ];
  }
}

export async function getPlayers() {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase.from('players').select('id, first_name, last_name, family_id').order('last_name');
    if (error) throw error;
    return data || [];
  } catch {
    // Temp bypass demo data matching getFamilies demo
    return [
      { id: 'p1', first_name: 'Liam', last_name: 'Johnson', family_id: 'fam1' },
      { id: 'p2', first_name: 'Noah', last_name: 'Johnson', family_id: 'fam1' },
      { id: 'p3', first_name: 'Sophia', last_name: 'Martinez', family_id: 'fam2' },
      { id: 'p4', first_name: 'Mateo', last_name: 'Martinez', family_id: 'fam2' },
    ] as any;
  }
}



// Full roster for management UI: players + family + contacts (profiles for parents)
export async function getRoster() {
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";
  if (isTemp) {
    // Always return demo data for temp mode - no DB queries to avoid any ID/type issues
    const now = new Date();
    return [
      {
        id: 'p1', family_id: 'fam1', first_name: 'Liam', last_name: 'Johnson', jersey_number: 12, position: 'Pitcher', date_of_birth: '2013-04-15', notes: null, is_active: true, created_at: now.toISOString(),
        family: { id: 'fam1', name: 'Johnson Family', email: 'johnson.parent@email.com', phone: '(555) 123-4567', parent_names: 'Alex & Jordan Johnson', primary_parent: { first_name: 'Alex', last_name: 'Johnson', phone: '(555) 123-4567', email: 'johnson.parent@email.com' } }
      },
      {
        id: 'p2', family_id: 'fam1', first_name: 'Noah', last_name: 'Johnson', jersey_number: 7, position: 'Shortstop', date_of_birth: '2013-08-22', notes: null, is_active: true, created_at: now.toISOString(),
        family: { id: 'fam1', name: 'Johnson Family', email: 'johnson.parent@email.com', phone: '(555) 123-4567', parent_names: 'Alex & Jordan Johnson', primary_parent: { first_name: 'Alex', last_name: 'Johnson', phone: '(555) 123-4567', email: 'johnson.parent@email.com' } }
      },
      {
        id: 'p3', family_id: 'fam2', first_name: 'Sophia', last_name: 'Martinez', jersey_number: 22, position: 'Outfield', date_of_birth: '2013-02-03', notes: null, is_active: true, created_at: now.toISOString(),
        family: { id: 'fam2', name: 'Martinez Family', email: 'martinez@email.com', phone: '(555) 987-6543', parent_names: 'Maria Martinez', primary_parent: { first_name: 'Maria', last_name: 'Martinez', phone: '(555) 987-6543', email: 'martinez@email.com' } }
      },
      {
        id: 'p4', family_id: 'fam2', first_name: 'Mateo', last_name: 'Martinez', jersey_number: 3, position: 'Catcher', date_of_birth: '2014-01-10', notes: null, is_active: true, created_at: now.toISOString(),
        family: { id: 'fam2', name: 'Martinez Family', email: 'martinez@email.com', phone: '(555) 987-6543', parent_names: 'Maria Martinez', primary_parent: { first_name: 'Maria', last_name: 'Martinez', phone: '(555) 987-6543', email: 'martinez@email.com' } }
      },
    ] as any;
  }

  const supabase = await getSupabaseForReadWrite();
  try {
    const { data, error } = await supabase
      .from('players')
      .select(`
        *,
        family:families(
          *,
          primary_parent:profiles(first_name, last_name, phone, email)
        )
      `)
      .eq('is_active', true)
      .order('last_name', { ascending: true });
    if (error) throw error;
    return (data || []) as any[];
  } catch {
    if (isTemp) {
      // Rich demo data with contacts for temp/roster testing
      const now = new Date();
      return [
        {
          id: 'p1', family_id: 'fam1', first_name: 'Liam', last_name: 'Johnson', jersey_number: 12, position: 'Pitcher', date_of_birth: '2013-04-15', notes: null, is_active: true, created_at: now.toISOString(),
          family: { id: 'fam1', name: 'Johnson Family', email: 'johnson.parent@email.com', phone: '(555) 123-4567', parent_names: 'Alex & Jordan Johnson', primary_parent: { first_name: 'Alex', last_name: 'Johnson', phone: '(555) 123-4567', email: 'johnson.parent@email.com' } }
        },
        {
          id: 'p2', family_id: 'fam1', first_name: 'Noah', last_name: 'Johnson', jersey_number: 7, position: 'Shortstop', date_of_birth: '2013-08-22', notes: null, is_active: true, created_at: now.toISOString(),
          family: { id: 'fam1', name: 'Johnson Family', email: 'johnson.parent@email.com', phone: '(555) 123-4567', parent_names: 'Alex & Jordan Johnson', primary_parent: { first_name: 'Alex', last_name: 'Johnson', phone: '(555) 123-4567', email: 'johnson.parent@email.com' } }
        },
        {
          id: 'p3', family_id: 'fam2', first_name: 'Sophia', last_name: 'Martinez', jersey_number: 22, position: 'Outfield', date_of_birth: '2013-02-03', notes: null, is_active: true, created_at: now.toISOString(),
          family: { id: 'fam2', name: 'Martinez Family', email: 'martinez@email.com', phone: '(555) 987-6543', parent_names: 'Maria Martinez', primary_parent: { first_name: 'Maria', last_name: 'Martinez', phone: '(555) 987-6543', email: 'martinez@email.com' } }
        },
        {
          id: 'p4', family_id: 'fam2', first_name: 'Mateo', last_name: 'Martinez', jersey_number: 3, position: 'Catcher', date_of_birth: '2014-01-10', notes: null, is_active: true, created_at: now.toISOString(),
          family: { id: 'fam2', name: 'Martinez Family', email: 'martinez@email.com', phone: '(555) 987-6543', parent_names: 'Maria Martinez', primary_parent: { first_name: 'Maria', last_name: 'Martinez', phone: '(555) 987-6543', email: 'martinez@email.com' } }
        },
      ] as any;
    }
    // For real users with missing tables/columns, return empty so dashboard can show "0 players"
    return [] as any[];
  }
}

// =====================================================
// Roster Management (CRUD for players + families for contacts)
// Coaches/Admins only (enforced in UI + optional server check)
// Use Supabase (real writes via service for temp/demo)
// =====================================================

export async function createPlayer(data: {
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  position?: string | null;
  jersey_number?: number | null;
  notes?: string | null;
  family_name: string;
  parent_names?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  const supabase = await getSupabaseForReadWrite();

  if (!data.first_name || !data.last_name || !data.family_name) {
    throw new Error('Player name and family name are required');
  }

  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";
  if (isTemp) {
    // For temp/demo mode: skip DB entirely to avoid any UUID/string ID issues.
    // Client-side state (with localStorage) handles full CRUD.
    return { success: true };
  }

  // Real user path: use DB (assumes proper setup)
  // Find or create family by name (simple match for ease)
  let familyId: string;
  const { data: existingFam } = await supabase
    .from('families')
    .select('id')
    .ilike('name', data.family_name)
    .limit(1)
    .single();

  if (existingFam?.id) {
    familyId = existingFam.id;
    // update family contacts if provided
    if (data.email || data.phone || data.parent_names) {
      await supabase.from('families').update({
        email: data.email || undefined,
        phone: data.phone || undefined,
        parent_names: data.parent_names || undefined,
      } as any).eq('id', familyId);
    }
  } else {
    const { data: newFam, error: famErr } = await supabase.from('families').insert({
      name: data.family_name,
      email: data.email || null,
      phone: data.phone || null,
      parent_names: data.parent_names || null,
    } as any).select('id').single();
    if (famErr || !newFam) throw new Error('Failed to create family');
    familyId = newFam.id;
  }

  // Insert player
  const { error: playerErr } = await supabase.from('players').insert({
    family_id: familyId,
    first_name: data.first_name.trim(),
    last_name: data.last_name.trim(),
    date_of_birth: data.date_of_birth || null,
    position: data.position || null,
    jersey_number: data.jersey_number || null,
    notes: data.notes || null,
    is_active: true,
  } as any);

  if (playerErr) throw new Error(playerErr.message || 'Failed to add player');

  return { success: true };
}

export async function updatePlayer(id: string, data: Partial<{
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  position: string | null;
  jersey_number: number | null;
  notes: string | null;
  family_name: string;
  email: string | null;
  phone: string | null;
  parent_names: string | null;
}>) {
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";
  if (isTemp) {
    // For temp/demo, skip DB to avoid any UUID issues; client handles in-memory
    return { success: true };
  }
  const supabase = await getSupabaseForReadWrite();

  // If family contact fields, update family
  if (data.family_name || data.email !== undefined || data.phone !== undefined || data.parent_names !== undefined) {
    const { data: player } = await supabase.from('players').select('family_id').eq('id', id).single();
    if (player?.family_id) {
      const updateFam: any = {};
      if (data.family_name) updateFam.name = data.family_name;
      if (data.email !== undefined) updateFam.email = data.email;
      if (data.phone !== undefined) updateFam.phone = data.phone;
      if (data.parent_names !== undefined) updateFam.parent_names = data.parent_names;
      if (Object.keys(updateFam).length) {
        await supabase.from('families').update(updateFam).eq('id', player.family_id);
      }
    }
  }

  // Player fields
  const playerUpdate: any = {};
  if (data.first_name) playerUpdate.first_name = data.first_name.trim();
  if (data.last_name) playerUpdate.last_name = data.last_name.trim();
  if (data.date_of_birth !== undefined) playerUpdate.date_of_birth = data.date_of_birth;
  if (data.position !== undefined) playerUpdate.position = data.position;
  if (data.jersey_number !== undefined) playerUpdate.jersey_number = data.jersey_number;
  if (data.notes !== undefined) playerUpdate.notes = data.notes;

  if (Object.keys(playerUpdate).length > 0) {
    const { error } = await supabase.from('players').update(playerUpdate).eq('id', id);
    if (error) throw new Error(error.message || 'Failed to update player');
  }

  return { success: true };
}

export async function deletePlayer(id: string) {
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";
  if (isTemp) {
    // For temp/demo, skip DB to avoid any UUID issues; client handles in-memory
    return { success: true };
  }
  const supabase = await getSupabaseForReadWrite();
  const { error } = await supabase.from('players').delete().eq('id', id);
  if (error) throw new Error(error.message || 'Failed to delete player');
  return { success: true };
}

export async function pinMessage(messageId: string, isPinned: boolean) {
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";

  if (!messageId) throw new Error('Invalid message');

  if (isTemp) {
    // For temp coach / demo, only attempt real DB update for non-demo IDs (i.e. messages that were actually inserted via service role).
    // Demo fallback messages (e.g. "m1") never exist in DB so pinning them has no persistence across refresh (expected).
    // Real inserted messages get persisted is_pinned via DB. getMessages(..., {pinnedOnly:true}) + revalidate ensures
    // Pinned section always reflects true DB state after nav/refresh. Always revalidateTag so server loads are fresh.
    const isDemoId = typeof messageId === 'string' && (messageId === 'temp-coach-id' || messageId.startsWith('m') || messageId.startsWith('dm') || messageId.startsWith('opt-') || !messageId.includes('-'));
    if (!isDemoId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient: createSupabaseJs } = await import("@supabase/supabase-js");
      let supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      supaUrl = supaUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
      const supabase = createSupabaseJs(supaUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
      // Use filter with ::text cast on id to avoid any "invalid input syntax for type uuid" when
      // DB column may still be uuid (or during transition) but we pass string id.
      const { error } = await supabase
        .from('messages')
        .update({ is_pinned: isPinned })
        .filter('id::text', 'eq', messageId);
      if (error) throw new Error(error.message || 'Failed to pin/unpin message');
    }
    revalidateTag('messages');
    return { success: true };
  }

  // Verify coach for real user first (using normal client), then perform the pin update
  // using service role (when available) so RLS policies don't block legitimate coach pins.
  const supabaseCheck = await createClient();
  const { data: { user } } = await supabaseCheck.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabaseCheck
    .from("profiles")
    .select("role, is_admin")
    .eq("id", user.id)
    .single() as { data: { role?: string; is_admin?: boolean } | null };

  if (profile?.role !== "coach" && profile?.role !== "admin") {
    throw new Error("Only coaches can pin messages");
  }

  // Perform update with service-role if available (stable for pin regardless of current RLS), else normal client
  let supabase: any = supabaseCheck;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient: createSupabaseJs } = await import("@supabase/supabase-js");
    let supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    supaUrl = supaUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
    supabase = createSupabaseJs(supaUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  }

  const { error } = await supabase
    .from('messages')
    .update({ is_pinned: isPinned })
    .filter('id::text', 'eq', messageId);

  if (error) throw new Error(error.message || 'Failed to pin message');

  revalidateTag('messages');
  return { success: true };
}

export async function editMessage(messageId: string, newContent: string) {
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";

  const trimmed = (newContent || '').trim();
  if (!messageId || !trimmed) throw new Error('Message ID and content are required');

  if (isTemp) {
    // For temp coach / demo: persist the edit via service role when possible (for messages that were
    // actually inserted with real DB ids). This ensures edited content survives subsequent loads,
    // pin/unpin, navigation, and refresh (otherwise loadMessagesForView would revert optimistic-only edits).
    // Demo fallback ids (m1 etc) stay client-only.
    const isDemoId = typeof messageId === 'string' && (messageId.startsWith('m') || messageId.startsWith('dm') || messageId.startsWith('opt-') || !messageId.includes('-'));
    if (!isDemoId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient: createSupabaseJs } = await import("@supabase/supabase-js");
      let supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      supaUrl = supaUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
      const supabase = createSupabaseJs(supaUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
      const { error } = await supabase
        .from('messages')
        .update({ content: trimmed, updated_at: new Date().toISOString() } as any)
        .filter('id::text', 'eq', messageId);
      if (error) throw new Error(error.message || 'Failed to edit message');
    }
    revalidateTag('messages');
    return { success: true };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Fetch the message to verify ownership (sender) or coach privilege
  const { data: row, error: fetchErr } = await (supabase as any)
    .from('messages')
    .select('sender_id, channel_type')
    .filter('id::text', 'eq', messageId)
    .single();

  if (fetchErr || !row) throw new Error('Message not found');

  // Check profile for coach role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_admin')
    .eq('id', user.id)
    .single() as { data: { role?: string; is_admin?: boolean } | null };

  const isCoachOrAdmin = profile?.role === 'coach' || profile?.role === 'admin' || profile?.is_admin === true;
  const isOwner = row.sender_id === user.id;

  if (!isOwner && !isCoachOrAdmin) {
    throw new Error('You can only edit your own messages');
  }

  // Use service role for the update to ensure it succeeds (coaches editing, RLS compatibility)
  let updateClient: any = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient: createSupabaseJs } = await import("@supabase/supabase-js");
    let supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    supaUrl = supaUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
    updateClient = createSupabaseJs(supaUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  }

  const { error } = await updateClient
    .from('messages')
    .update({
      content: trimmed,
      updated_at: new Date().toISOString(),
    } as any)
    .filter('id::text', 'eq', messageId);

  if (error) throw new Error(error.message || 'Failed to edit message');

  revalidateTag('messages');
  return { success: true };
}

export async function deleteMessage(messageId: string) {
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";

  if (!messageId) throw new Error('Invalid message ID');

  if (isTemp) {
    // Temp/demo: persist soft-delete via service for real inserted messages (non-demo ids).
    // Avoids uuid cast issues by using filter('id::text'...) and nulls for sender etc in insert.
    const isDemoId = typeof messageId === 'string' && (messageId.startsWith('m') || messageId.startsWith('dm') || messageId.startsWith('opt-') || !messageId.includes('-'));
    if (!isDemoId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient: createSupabaseJs } = await import("@supabase/supabase-js");
      let supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      supaUrl = supaUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
      const supabase = createSupabaseJs(supaUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
      const { error } = await supabase
        .from('messages')
        .update({ is_deleted: true, updated_at: new Date().toISOString() } as any)
        .filter('id::text', 'eq', messageId);
      if (error) throw new Error(error.message || 'Failed to delete message');
    }
    revalidateTag('messages');
    return { success: true };
  }

  // Real user path
  const supabaseCheck = await createClient();
  const { data: { user } } = await supabaseCheck.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Verify owner or coach
  const { data: row, error: fetchErr } = await (supabaseCheck as any)
    .from('messages')
    .select('sender_id')
    .filter('id::text', 'eq', messageId)
    .single();

  if (fetchErr || !row) throw new Error('Message not found');

  const { data: profile } = await supabaseCheck
    .from('profiles')
    .select('role, is_admin')
    .eq('id', user.id)
    .single() as { data: { role?: string; is_admin?: boolean } | null };

  const isCoachOrAdmin = profile?.role === 'coach' || profile?.role === 'admin' || profile?.is_admin === true;
  const isOwner = row.sender_id === user.id;

  if (!isOwner && !isCoachOrAdmin) {
    throw new Error('You can only delete your own messages (or coaches can delete any)');
  }

  // Use service for update stability
  let updateClient: any = supabaseCheck;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient: createSupabaseJs } = await import("@supabase/supabase-js");
    let supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    supaUrl = supaUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
    updateClient = createSupabaseJs(supaUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  }

  const { error } = await updateClient
    .from('messages')
    .update({ is_deleted: true, updated_at: new Date().toISOString() } as any)
    .filter('id::text', 'eq', messageId);

  if (error) throw new Error(error.message || 'Failed to delete message');

  revalidateTag('messages');
  return { success: true };
}

// =====================================================
// Payments / Dues Management (Phase 6 flexible)
// =====================================================

export async function getInvoices(familyId?: string) {
  noStore();
  console.log('[getInvoices] called fresh (noStore) familyId=', familyId);
  const supabase = await getSupabaseForReadWrite();
  try {
    let query = supabase.from('invoices')
      .select('*, family:families(name), player:players(first_name, last_name)')
      .order('due_date', { ascending: true });
    if (familyId) {
      query = query.eq('family_id', familyId);
    }
    const { data, error } = await query;
    if (error) throw error;
    const invData = Array.isArray(data) ? data.filter((i: any) => i && typeof i === 'object') : [];
    console.log('[getInvoices] returned', invData.length, 'rows (real DB or privileged)');
    return invData;
  } catch (e: any) {
    console.warn('[getInvoices] query failed, returning empty. err:', e?.message || e);
    return [];
  }
}

export async function getTeamSettings() {
  noStore();
  const supabase = await getSupabaseForReadWrite();
  try {
    const { data } = await supabase.from('team_settings').select('*').single();
    return data || { dues_monthly_cents: 12500, dues_season_cents: 150000 };
  } catch {
    return { dues_monthly_cents: 12500, dues_season_cents: 150000 };
  }
}

export async function updateTeamSettings(updates: { dues_monthly_cents?: number; dues_season_cents?: number }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
    updated_by: user?.id || 'temp-coach-id',
  };
  // @ts-ignore - partial types in temp setup for team_settings update
  const { error } = await supabase.from('team_settings').update(payload as any).eq('id', 1);
  if (error) {
    // In temp/demo, just succeed (no real row may exist)
    console.log('[demo] team_settings update (no-op in temp):', payload);
  }
  // Client is responsible for refresh after settings update
  return { success: true };
}

// NOTE: Invoice CRUD functions (create/update/delete, bulk generate, recordManualPayment) 
// have been removed from server actions. 
// They are now performed directly from Client Components using createClient() from lib/supabase/client
// to avoid "Invalid path specified in request URL" errors from server action revalidation/middleware.
// See AdminPage and PaymentsPage for the direct Supabase implementations.
// Keep only non-CRUD and Stripe-related server actions below.

export async function createStripeCheckout(
  invoiceId: string,
  invoiceSnapshot?: {
    amount_cents: number;
    description?: string | null;
    due_date: string;
    family_name?: string | null;
    pay_amount_cents?: number; // for partial payments via Stripe (e.g. remaining balance)
    email?: string | null;     // for Stripe built-in receipt emails
    customer_name?: string | null; // optional name from roster/family/snapshot (placed in metadata; email is the primary prefill field)
  }
) {
  console.log('[createStripeCheckout] called with invoiceId=', invoiceId, 'snapshot provided:', !!invoiceSnapshot);
  const supabase = await getSupabaseForReadWrite();

  // Always attempt lookup by the exact id passed from the invoice row (Pay Now button).
  // This fixes "invoice not found". We fetch extra family/player/parent data for customer name/email prefilling.
  let invoice: any = null;
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, family:families(name, primary_parent_id), player:players(first_name, last_name)')
      .eq('id', invoiceId)
      .single();
    if (error) {
      console.warn('[createStripeCheckout] select by id failed (may be temp-only id):', invoiceId, error.message);
    } else {
      invoice = data;
    }
  } catch (e: any) {
    console.error('[createStripeCheckout] exception during invoice lookup for', invoiceId, e?.message);
  }

  // If not found in DB (common for newly created temp/LS invoices under coach bypass),
  // but the caller (payments list row) provided a snapshot of the data, use it to build
  // a real Stripe Hosted Checkout Session. This ensures "Pay Now" always redirects to
  // the full Stripe hosted page (card form etc.) instead of only simulating.
  if (!invoice && invoiceSnapshot) {
    invoice = {
      id: invoiceId,
      amount_cents: invoiceSnapshot.amount_cents,
      description: invoiceSnapshot.description || null,
      due_date: invoiceSnapshot.due_date,
      family: { name: invoiceSnapshot.family_name || 'Family' },
      // carry through for name construction below
      player: null,
    };
    console.log('[createStripeCheckout] using provided snapshot for virtual/temp id (will create real hosted Checkout)');
  }

  if (!invoice) {
    console.log('[createStripeCheckout] no invoice data (DB or snapshot) for id=', invoiceId, '— demo fallback');
    return { url: null as any, demo: true };
  }

  console.log('[createStripeCheckout] using invoice data for hosted Checkout:', invoice.id, 'desc=', invoice.description, 'amount_cents=', invoice.amount_cents);

  // Support partial payments: if pay_amount_cents provided in snapshot (e.g. remaining balance from payments), charge only that via the hosted Checkout.
  // Otherwise fall back to full invoice amount.
  const chargeCents = (invoiceSnapshot?.pay_amount_cents && invoiceSnapshot.pay_amount_cents > 0)
    ? Math.min(invoiceSnapshot.pay_amount_cents, invoice.amount_cents)
    : invoice.amount_cents;

  // --- Determine parent's email (prefer from invoice/family data as requested) ---
  // Always ensure we have a usable email for pre-filling the Checkout email field (which will be visible and editable).
  // Priority:
  // 1. Explicitly passed from the invoice row snapshot (client-side data from the specific Pay Now click)
  // 2. Data present on the fetched invoice row / joined family
  // 3. Current authenticated user (real parent logged in)
  // 4. Demo fallback
  let authUserEmail: string | null = null;
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    authUserEmail = authUser?.email || null;
  } catch (e: any) {
    // ignore for temp/demo
  }

  const customerEmail = 
    invoiceSnapshot?.email ||                                    // prefer what was explicitly passed for this row
    (invoice as any)?.email ||
    (invoice as any)?.family?.email ||
    authUserEmail ||
    'parent@mavericksbaseball.test';

  // We still support customer_name in the snapshot for logging/metadata (name pre-filling without a Customer object
  // is limited when only using customer_email; full name on receipts is best done via a Customer in other flows).
  const customerName = invoiceSnapshot?.customer_name
    || [invoice?.player?.first_name, invoice?.player?.last_name].filter(Boolean).join(' ')
    || invoice?.family?.name
    || undefined;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    // No key → simulate (no real hosted redirect)
    console.log('[DEMO] No STRIPE_SECRET_KEY — simulating (no hosted Checkout)');
    // Best-effort fake session id only for real DB rows
    if (invoice.id && !invoice.id.startsWith('temp-') && !invoice.id.startsWith('demo')) {
      try {
        await supabase.from('invoices').update({ stripe_session_id: 'demo_sess_' + Date.now() } as any).eq('id', invoiceId);
      } catch (e: any) {
        console.warn('[createStripeCheckout] demo session id update failed (non-fatal):', e?.message);
      }
    }
    return { url: null as any, demo: true };
  }

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(secretKey, {
    apiVersion: '2025-02-24.acacia',
  });

  // Always use Stripe Checkout Sessions (hosted full page) for the payment UI.
  // We never create Payment Intents directly here; Checkout Session handles the hosted card form + creates the PI internally.
  //
  // IMPORTANT: Use ONLY customer_email (never both customer and customer_email).
  // This ensures the email field is pre-filled from the parent's email (sourced preferring invoice/family data)
  // and remains visible + editable on the Stripe hosted Checkout page.
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: invoice.description || 'Mavericks 12U Dues',
          description: `Due ${invoice.due_date} - ${invoice.family?.name || 'Family'}${chargeCents < invoice.amount_cents ? ' (partial payment)' : ''}`,
        },
        unit_amount: chargeCents,
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/payments?canceled=true`,
    metadata: { 
      invoice_id: invoiceId,
      ...(customerName ? { customer_name: customerName } : {}),
    },
    customer_email: customerEmail,
  });

  console.log('[createStripeCheckout] Hosted Stripe Checkout Session created. invoiceId=', invoiceId, 'checkout_session=', session.id, 'metadata.invoice_id=', session.metadata?.invoice_id);

  // Best effort: record the checkout session id on the invoice row (only affects real DB rows; for virtual/temp ids this is a no-op with no error)
  try {
    const { error: sessUpdErr } = await supabase.from('invoices').update({ stripe_session_id: session.id } as any).eq('id', invoiceId);
    if (sessUpdErr) {
      console.warn('[createStripeCheckout] stripe_session_id update non-fatal (common for temp ids):', sessUpdErr.message);
    }
  } catch (e: any) {
    console.warn('[createStripeCheckout] stripe_session_id update failed (non-fatal):', e?.message);
  }

  return { url: session.url };
}

export async function confirmStripePayment(sessionId: string) {
  console.log('[confirmStripePayment] called for sessionId=', sessionId);
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.log('[confirmStripePayment] no secret key -> demo');
    return { success: false, demo: true };
  }

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(secretKey, {
    apiVersion: '2025-02-24.acacia',
  });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const invoiceId = session.metadata?.invoice_id;
    const amountPaidCents = session.amount_total || 0;
    console.log('[confirmStripePayment] retrieved session, payment_status=', session.payment_status, 'metadata.invoice_id=', invoiceId, 'amount=', amountPaidCents);

    if (session.payment_status === 'paid' && invoiceId) {
      const supabase = await getSupabaseForReadWrite();

      // Check if payment already recorded to avoid duplicates.
      // Note: .single() returns error (PGRST116) when no row; we treat "no row" as "not existing".
      let existingPayment: any = null;
      try {
        const { data, error: existErr } = await supabase
          .from('payments')
          .select('id')
          .eq('stripe_payment_intent_id', session.payment_intent as string)
          .single();
        if (existErr && existErr.code !== 'PGRST116') {
          console.warn('[confirmStripePayment] error checking existing payment (non-fatal):', existErr.message);
        }
        existingPayment = data;
      } catch (e: any) {
        console.warn('[confirmStripePayment] exception checking existing (non-fatal):', e?.message);
      }

      if (!existingPayment) {
        const { error: insErr } = await supabase.from('payments').insert({
          invoice_id: invoiceId,
          amount_cents: session.amount_total || 0,
          paid_at: new Date().toISOString(),
          status: 'succeeded',
          stripe_payment_intent_id: session.payment_intent as string,
        } as any);
        if (insErr) {
          console.warn('[confirmStripePayment] payments insert failed (expected for virtual/temp invoice ids):', insErr.message);
        }

        const { error: upErr } = await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoiceId);
        if (upErr) {
          console.warn('[confirmStripePayment] invoice status update failed (expected for virtual/temp ids):', upErr.message);
        } else {
          console.log('[confirmStripePayment] recorded payment + marked invoice paid for', invoiceId);
        }
      } else {
        console.log('[confirmStripePayment] payment already existed for', invoiceId);
      }

      // Core: notify on payment recorded (demo)
      if (invoiceId) {
        await createNotification('temp-coach-id', 'payment_due', 'Payment Received', `Invoice ${invoiceId} paid`, '/payments', invoiceId as string).catch(() => {});
      }

      return { success: true, invoiceId, amountPaidCents };
    }

    return { success: false, amountPaidCents: 0 };
  } catch (err: any) {
    console.error('[confirmStripePayment] Error confirming Stripe payment:', err);
    return { success: false, error: err.message, amountPaidCents: 0 };
  }
}

// =====================================================
// Family-aware + summary helpers for Payments UI (real + temp demo)
// =====================================================

export async function getMyInvoices() {
  noStore();
  console.log('[getMyInvoices] called fresh (noStore)');
  const supabase = await getSupabaseForReadWrite();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    // Under temp (or no real session) we still call getInvoices which now uses privileged client so real DB rows are returned if present.
    // This + merge in payments UI + service lookup in checkout ensures new real invoices are immediately queryable and payable.
    if (!user || user.id === 'temp-coach-id') {
      return await getInvoices();
    }
    // Real authenticated: fetch profile family (coach sees all for simplicity in /payments too; parents see own)
    const { data: profile } = await supabase
      .from('profiles')
      .select('family_id, role, is_admin')
      .eq('id', user.id)
      .single() as { data: { family_id?: string; role?: string; is_admin?: boolean } | null };
    const role = profile?.role;
    const isAdmin = profile?.is_admin === true || role === 'admin' || role === 'coach';
    if (isAdmin) {
      return await getInvoices(); // coach/admin view: team-wide
    }
    const famId = profile?.family_id;
    if (!famId) return [];
    return await getInvoices(famId);
  } catch (e: any) {
    console.warn('[getMyInvoices] error, fallback getInvoices:', e?.message);
    return await getInvoices();
  }
}

export async function getPaymentHistory(limit = 20) {
  noStore();
  console.log('[getPaymentHistory] called fresh (noStore) limit=', limit);
  const supabase = await getSupabaseForReadWrite();
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*, invoice:invoices(description, due_date, due_type, family:families(name))')
      .order('paid_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    console.log('[getPaymentHistory] returned', (data || []).length, 'records');
    return data || [];
  } catch (e: any) {
    console.warn('[getPaymentHistory] query err, returning empty:', e?.message);
    return [];
  }
}

export async function getInvoicePaymentsMap(): Promise<Record<string, number>> {
  noStore();
  const supabase = await getSupabaseForReadWrite();
  try {
    const { data, error } = await supabase.from('payments').select('invoice_id, amount_cents');
    if (error) throw error;
    const map: Record<string, number> = {};
    (data || []).forEach((p: any) => {
      const key = p.invoice_id as string;
      map[key] = (map[key] || 0) + (p.amount_cents || 0);
    });
    return map;
  } catch {
    return {};
  }
}

export async function getTeamPaymentSummary() {
  noStore();
  console.log('[getTeamPaymentSummary] called fresh (noStore)');
  const supabase = await getSupabaseForReadWrite();
  try {
    const { data: invoices, error } = await supabase.from('invoices').select('amount_cents, status, due_date, family_id');
    if (error) throw error;
    const invList = Array.isArray(invoices) ? invoices : [];
    const safeInv = invList.filter((i: any) => i && typeof i === 'object');
    const outstanding = safeInv.filter((i: any) => i.status !== 'paid' && i.status !== 'cancelled');
    const totalOwedCents = outstanding.reduce((s: number, i: any) => s + (Number(i.amount_cents) || 0), 0);
    const uniqueFamilies = new Set(outstanding.map((i: any) => i.family_id).filter(Boolean));
    const today = new Date().toISOString().split('T')[0];
    const upcoming = outstanding.filter((i: any) => i.due_date >= today);
    const upcomingCents = upcoming.reduce((s: number, i: any) => s + (Number(i.amount_cents) || 0), 0);
    const paidCount = safeInv.filter((i: any) => i.status === 'paid').length;
    return {
      totalOwedCents,
      familiesWithBalance: uniqueFamilies.size,
      upcomingCents,
      upcomingCount: upcoming.length,
      paidCount,
      totalInvoices: safeInv.length,
    };
  } catch (e: any) {
    console.warn('[getTeamPaymentSummary] err, returning empty summary:', e?.message);
    return {
      totalOwedCents: 0,
      familiesWithBalance: 0,
      upcomingCents: 0,
      upcomingCount: 0,
      paidCount: 0,
      totalInvoices: 0,
    };
  }
}

export async function revalidateInvoiceCache() {
  revalidateTag('invoices');
  revalidateTag('payments');
  return { success: true };
}

// =====================================================
// Realtime Chat (team channel + direct messages + pinned announcements)
// =====================================================

export async function getChatMembers() {
  const supabase = await createClient();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id === 'temp-coach-id') {
      // Demo members for temp coach testing
      return [
        { id: 'temp-coach-id', first_name: 'Coach', last_name: 'Maverick', role: 'coach' as const },
        { id: 'p-johnson', first_name: 'Alex', last_name: 'Johnson', role: 'parent' as const },
        { id: 'p-martinez', first_name: 'Maria', last_name: 'Martinez', role: 'parent' as const },
      ];
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, role')
      .order('last_name', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch {
    // fallback demo
    return [
      { id: 'temp-coach-id', first_name: 'Coach', last_name: 'Maverick', role: 'coach' as const },
      { id: 'p-johnson', first_name: 'Alex', last_name: 'Johnson', role: 'parent' as const },
      { id: 'p-martinez', first_name: 'Maria', last_name: 'Martinez', role: 'parent' as const },
    ];
  }
}

export async function getMessages(
  channelType: 'team' | 'direct',
  recipientId?: string | null,
  limit = 100,
  options: { pinnedOnly?: boolean } = {}
) {
  noStore(); // ensure fresh data from DB (for pin persistence after navigation)
  // Use getSupabaseForReadWrite so temp-coach (demo) can read real inserted messages via service role.
  // Real users use normal client. This lets post-send loadMessagesForView() surface persisted rows + realtime.
  const supabase = await getSupabaseForReadWrite();
  const cookieStoreForUid = await cookies();
  const isTempForGet = cookieStoreForUid.get("temp-coach")?.value === "1";

  try {
    const { data: { user } } = await supabase.auth.getUser();
    // Effective uid for filtering (temp uses string id, real uses auth id)
    const uid = (isTempForGet || !user) ? 'temp-coach-id' : user.id;

    // For temp + direct using demo-style recipient ids (e.g. 'p-johnson'), avoid building
    // a .or() filter literal containing non-uuid strings against the uuid-typed columns.
    // This prevents "invalid input syntax for type uuid" from being logged on every DM load as temp.
    // Team channel has no uid filter so real team history (if any) can surface via service role.
    const looksLikeDemoId = (v?: string | null) => !!v && (v === 'temp-coach-id' || v.startsWith('p-') || !v.includes('-'));
    if (isTempForGet && channelType === 'direct' && (looksLikeDemoId(uid) || looksLikeDemoId(recipientId))) {
      // Short-circuit to demo for temp DMs with demo contacts. Real DMs between real uuid profiles will be
      // visible to real users (non-temp path).
      throw new Error('demo-dm-short-circuit');
    }

    // For temp/demo (with string sender_ids like 'temp-coach-id'), avoid the embedded sender join entirely.
    // The join can trigger "invalid input syntax for type uuid" because profiles.id is uuid while sender_id may be non-uuid text.
    // We attach a synthetic sender for temp-coach in enrichment instead. Real users get the join.
    const useSenderJoin = !isTempForGet;
    const select = useSenderJoin ? '*, sender:profiles(id, first_name, last_name, role)' : '*';

    let query = supabase
      .from('messages')
      .select(select)
      .eq('channel_type', channelType)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (options.pinnedOnly) {
      query = query.eq('is_pinned', true);
    }

    // Soft-delete: never return deleted messages in normal views (filter always)
    query = query.not('is_deleted', 'eq', true);

    if (channelType === 'direct' && recipientId) {
      // Between uid and recipient (safe when both are real uuids)
      query = query.or(
        `and(sender_id.eq.${uid},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${uid})`
      );
    } else if (channelType === 'direct') {
      query = query.or(`sender_id.eq.${uid},recipient_id.eq.${uid}`);
    }
    // For team (or real direct): proceed with query (no bad literals)

    const { data, error } = await query;
    if (error) throw error;

    // Reactions now live directly on the message row as JSONB (simple object shape)
    // Also include is_pinned for pinned messages.
    // For temp coach: normalize sender_id/read_by/sender to the TEXT string 'temp-coach-id'
    // (even if DB stored null to avoid uuid cast on insert). This makes new messages appear
    // reliably with correct isMine, sender display, etc.
    const enriched = (data || []).map((m: any) => {
      const isTempSender = isTempForGet && (!m.sender_id || m.sender_id === 'temp-coach-id');
      const sender_id = isTempSender ? 'temp-coach-id' : m.sender_id;

      let sender = m.sender || null;
      if (isTempSender && !sender) {
        sender = { id: 'temp-coach-id', first_name: 'Coach', last_name: 'Maverick', role: 'coach' };
      }

      let read_by = m.read_by;
      if (isTempSender && (!read_by || read_by.length === 0)) {
        read_by = ['temp-coach-id'];
      }

      return {
        ...m,
        sender_id,
        sender,
        read_by,
        reactions: m.reactions || {},
        is_pinned: !!m.is_pinned,
      };
    });

    return enriched;
  } catch (e: any) {
    // Demo fallback path (also hit intentionally for temp DMs with demo ids)
    if (!String(e?.message || '').includes('demo-dm-short-circuit')) {
      console.warn('[getMessages] error, using demo:', e?.message);
    }
    const now = new Date();
    const demoTeam = [
      { 
        id: 'm1', created_at: new Date(now.getTime() - 1000*60*30).toISOString(), updated_at: new Date(now.getTime() - 1000*60*20).toISOString(), sender_id: 'temp-coach-id', channel_type: 'team', recipient_id: null, content: 'Welcome to the team chat! Season starts soon.', read_by: ['temp-coach-id'], 
        reactions: { '👍': ['p-johnson'], '🔥': ['temp-coach-id'] },
        is_pinned: false,
        is_deleted: false,
        sender: { id: 'temp-coach-id', first_name: 'Coach', last_name: 'Maverick', role: 'coach' } 
      },
      // Demo media message (uses public placeholder; real uploads use Supabase Storage chat-media bucket)
      { 
        id: 'm2', created_at: new Date(now.getTime() - 1000*60*5).toISOString(), sender_id: 'temp-coach-id', channel_type: 'team', recipient_id: null, content: 'Check out this action shot from practice!', media_url: 'https://picsum.photos/id/1015/600/400', media_type: 'image/jpeg', read_by: ['temp-coach-id'], 
        reactions: { '❤️': ['temp-coach-id', 'p-martinez'] },
        is_deleted: false,
        sender: { id: 'temp-coach-id', first_name: 'Coach', last_name: 'Maverick', role: 'coach' } 
      },
    ];
    if (channelType === 'direct' && recipientId) {
      return [
        { id: 'dm1', created_at: new Date(now.getTime() - 1000*60*10).toISOString(), sender_id: 'temp-coach-id', channel_type: 'direct', recipient_id: recipientId, content: 'Hey, any updates on the game time?', read_by: [], 
          reactions: {},
          is_deleted: false,
          sender: { id: 'temp-coach-id', first_name: 'Coach', last_name: 'Maverick', role: 'coach' } 
        },
      ];
    }
    if (options.pinnedOnly) {
      return demoTeam.filter(m => m.is_pinned);
    }
    return demoTeam;
  }
}

export async function sendMessage(
  content: string,
  channelType: 'team' | 'direct',
  recipientId?: string | null,
  mediaUrl?: string | null,
  mediaType?: string | null
) {
  // Determine temp/demo status first (safe, no getUser yet).
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";

  const hasText = !!content?.trim();
  const hasMedia = !!mediaUrl;
  if (!hasText && !hasMedia) throw new Error('Message content or media is required');

  // Reuse helper so temp always gets service-role client (when key present) for inserting
  // with sender_id as TEXT (supports "temp-coach-id" and other demo strings reliably).
  const insertClient = await getSupabaseForReadWrite();

  let senderId: string;
  if (isTemp) {
    senderId = 'temp-coach-id';
  } else {
    const { data: { user } } = await insertClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    senderId = user.id;
  }

  // For temp coach, insert sender_id / read_by as null (always valid even if DB columns are uuid).
  // We patch the string value back on the returned row + in getMessages enrichment + RT handlers.
  // This permanently avoids "invalid input syntax for type uuid: \"temp-coach-id\"" on legacy DBs
  // while keeping sender_id as the TEXT string 'temp-coach-id' everywhere in client/UI state.
  const payloadSenderId = isTemp ? null : senderId;
  const payloadReadBy = isTemp ? null : [senderId];

  const { data: insertedRows, error } = await insertClient.from('messages').insert({
    sender_id: payloadSenderId,
    channel_type: channelType,
    recipient_id: recipientId || null,
    content: content?.trim() || '',
    read_by: payloadReadBy,
    media_url: mediaUrl || null,
    media_type: mediaType || null,
    reactions: {},
    is_pinned: false,
  } as any).select().limit(1);

  if (error) throw new Error(error.message || 'Failed to send message');

  revalidateTag('messages');

  const raw = insertedRows && insertedRows[0] ? insertedRows[0] : null;
  const created = raw ? {
    ...raw,
    sender_id: isTemp ? senderId : raw.sender_id,
    read_by: isTemp ? [senderId] : raw.read_by,
    reactions: {},
    is_pinned: false,
    sender: null, // will be populated on load/select with join
  } : null;

  // Chat message notifications for team channel (in-app bell + email if enabled in prefs)
  if (channelType === 'team') {
    try {
      // For demo/temp and testing, target the temp coach user. In full multi-user, target other team members.
      await createNotification(
        'temp-coach-id',
        'team_message',
        'New team message',
        (content || '').slice(0, 100) + ((content || '').length > 100 ? '...' : ''),
        '/chat'
      );
    } catch {}
  }

  return { success: true, message: created };
}

export async function toggleMessageReaction(messageId: string, emoji: string) {
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";

  if (!messageId || !emoji) throw new Error('Invalid reaction');

  if (isTemp) {
    // Temp/demo: no real DB update (avoids any UUID issues).
    // Client-side optimistic + local state in the chat component handles it reliably for the session.
    revalidateTag('messages');
    return { success: true };
  }

  // Real user: use direct JSONB toggle on the messages.reactions column (no separate table)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const userId = user.id;

  // Fetch current reactions for this message (using any to bypass strict typed client for the new JSONB column)
  const { data: row, error: fetchErr } = await (supabase as any)
    .from('messages')
    .select('reactions')
    .filter('id::text', 'eq', messageId)
    .single();

  if (fetchErr) throw new Error(fetchErr.message || 'Could not load message for reaction');

  let reactions: Record<string, string[]> = (row?.reactions as any) || {};

  const users = reactions[emoji] ? [...reactions[emoji]] : [];
  const idx = users.indexOf(userId);

  if (idx !== -1) {
    // remove (toggle off)
    users.splice(idx, 1);
    if (users.length === 0) {
      delete reactions[emoji];
    } else {
      reactions[emoji] = users;
    }
  } else {
    // add (toggle on)
    reactions[emoji] = [...users, userId];
  }

  // Persist the updated reactions JSONB
  const { error: updateErr } = await (supabase as any)
    .from('messages')
    .update({ reactions })
    .filter('id::text', 'eq', messageId);

  if (updateErr) throw new Error(updateErr.message || 'Failed to update reaction');

  revalidateTag('messages');
  return { success: true };
}

export async function markMessagesAsRead(messageIds: string[]) {
  // Support temp via service-role for real updates to read_by (using string ids).
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";
  let supabase: any;
  let uid: string;
  if (isTemp && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient: createSupabaseJs } = await import("@supabase/supabase-js");
    let supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    supaUrl = supaUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
    supabase = createSupabaseJs(supaUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    uid = 'temp-coach-id';
  } else {
    supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id || 'temp-coach-id';
  }
  if (!messageIds?.length || !uid) return { success: true };

  if (isTemp) {
    // Temp coach: skip persisting read_by (uses string ids that can cause uuid cast errors on some DBs).
    // getMessages enrichment + client state handle read/unread for the session.
    revalidateTag('messages');
    return { success: true };
  }

  // Fetch current read_by for these messages
  const { data: msgs } = await supabase.from('messages').select('id, read_by').in('id', messageIds) as { data: any[] | null };
  for (const m of msgs || []) {
    const current = (m.read_by || []) as string[];
    if (!current.includes(uid)) {
      // @ts-ignore - partial types for read_by array update
      await supabase.from('messages').update({ read_by: [...current, uid] } as any).filter('id::text', 'eq', m.id);
    }
  }
  return { success: true };
}

export async function getPinnedAnnouncements() {
  noStore(); // always fresh from DB on calls (e.g. mount after nav)
  // Use privileged client for temp-coach so newly created announcements (via service) are immediately visible
  const supabase = await getSupabaseForReadWrite();
  try {
    // Safe select (avoid join errors for temp/service or null created_by); creator join optional for real users
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, body, is_pinned, created_at, created_by')
      .eq('is_pinned', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    // Map to expected shape; creator will be resolved on real if needed or fallback in UI
    return (data || []).map((a: any) => ({
      ...a,
      creator: null, // UI falls back to "Coach"
    }));
  } catch (e: any) {
    console.warn('[getPinnedAnnouncements] demo:', e?.message);
    return [
      { id: 1, title: 'Season Kickoff!', body: 'First practice this Saturday. Bring water!', is_pinned: true, created_at: new Date().toISOString(), creator: { first_name: 'Coach', last_name: 'Maverick' } },
    ];
  }
}

export async function createAnnouncement(title: string, body: string) {
  // Same safe pattern as sendMessage: avoid ssr auth.getUser() in next-action for temp.
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";

  if (!title?.trim() || !body?.trim()) throw new Error('Title and body required');

  let supabase: any;
  let createdBy: string | null = null;

  if (isTemp && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient: createSupabaseJs } = await import("@supabase/supabase-js");
    let supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    supaUrl = supaUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
    supabase = createSupabaseJs(supaUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    createdBy = null; // don't set invalid id for temp/demo (use text null)
  } else {
    supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Verify coach role for real users
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_admin")
      .eq("id", user.id)
      .single() as { data: { role?: string; is_admin?: boolean } | null };
    if (profile?.role !== "coach" && profile?.role !== "admin" && profile?.is_admin !== true) {
      throw new Error("Only coaches can create announcements");
    }
    createdBy = user.id;
  }

  const insertPayload: any = {
    title: title.trim(),
    body: body.trim(),
    is_pinned: true,  // ensure pinned on create per table schema
  };
  if (createdBy) insertPayload.created_by = createdBy;

  // For stability (like pinMessage), use service role for the actual insert when available
  let writeSupabase = supabase;
  if (!isTemp && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient: createSupabaseJs } = await import("@supabase/supabase-js");
    let supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    supaUrl = supaUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
    writeSupabase = createSupabaseJs(supaUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  }

  const { data: insertedRows, error } = await writeSupabase
    .from('announcements')
    .insert(insertPayload)
    .select('id, title, body, is_pinned, created_at, created_by')
    .limit(1);

  if (error) throw new Error(error.message || 'Failed to create announcement');

  revalidateTag('announcements');

  const created = insertedRows && insertedRows[0] ? { ...insertedRows[0], creator: null } : null;

  // Core: new pinned announcement notification
  try {
    await createNotification(
      'temp-coach-id',
      'announcement_new',
      `New Announcement: ${title}`,
      body.slice(0, 100),
      '/chat'
    );
  } catch {}

  return { success: true, announcement: created };
}

export async function unpinAnnouncement(id: number | string) {
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";

  if (!id) throw new Error('Invalid announcement');

  if (isTemp) {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient: createSupabaseJs } = await import("@supabase/supabase-js");
      let supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      supaUrl = supaUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
      const supabase = createSupabaseJs(supaUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
      const { error } = await supabase
        .from('announcements')
        .update({ is_pinned: false })
        .eq('id', id);
      if (error) throw new Error(error.message || 'Failed to unpin announcement');
    }
    return { success: true };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_admin")
    .eq("id", user.id)
    .single() as { data: { role?: string; is_admin?: boolean } | null };
  if (profile?.role !== "coach" && profile?.role !== "admin") {
    throw new Error("Only coaches can unpin announcements");
  }

  // use service for update stability
  let writeSupabase: any = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient: createSupabaseJs } = await import("@supabase/supabase-js");
    let supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    supaUrl = supaUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
    writeSupabase = createSupabaseJs(supaUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  }

  const { error } = await writeSupabase
    .from('announcements')
    .update({ is_pinned: false })
    .eq('id', id);

  if (error) throw new Error(error.message || 'Failed to unpin announcement');

  revalidateTag('announcements');
  return { success: true };
}

// =====================================================
// NOTIFICATIONS (core: events, announcements, payments)
// In-app first. Email in follow-up. Temp coach supported.
// =====================================================

export type NotificationType = 
  | 'event_new' | 'event_updated' | 'event_canceled'
  | 'announcement_new'
  | 'payment_due'
  | 'team_message';

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body?: string | null,
  link?: string | null,
  relatedId?: string | null
) {
  const supabase = await getSupabaseForReadWrite();

  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    body: body || null,
    link: link || null,
    related_id: relatedId || null,
    is_read: false,
  } as any);

  if (error) {
    console.warn('[createNotification] failed (non-fatal):', error.message);
    // Don't throw - notif creation is best-effort
  }

  revalidateTag('notifications');

  // Respect prefs (core types) - simple check
  const prefs = await getNotificationPreferences(userId).catch(() => null as any);
  let prefKey: string = 'payment_due';
  if (type === 'event_new' || type === 'event_updated' || type === 'event_canceled') prefKey = 'event_new';
  else if (type === 'announcement_new') prefKey = 'announcement_new';
  else if (type === 'team_message') prefKey = 'team_message';
  if (prefs && prefs[prefKey] === false) {
    return { success: true };
  }

  // Email for core types (demo logs; real via Resend)
  if (['event_new', 'event_updated', 'event_canceled', 'announcement_new', 'payment_due'].includes(type)) {
    // For demo use coach email; in prod would resolve from profile
    sendCoreEmailNotification('coach@comavericksbaseball.com', type, title, body, link).catch(() => {});
  }

  return { success: true };
}

// Get unread count for header
export async function getUnreadNotificationCount(userId?: string) {
  noStore();
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";
  let uid: string | null = userId || null;

  if (!uid) {
    if (isTemp) {
      uid = 'temp-coach-id';
    } else {
      const supabaseAuth = await createClient();
      const { data: { user } } = await supabaseAuth.auth.getUser();
      uid = user?.id || null;
    }
  }

  if (!uid) return 0;

  const supabase = await getSupabaseForReadWrite();
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', uid)
    .eq('is_read', false);

  if (error) {
    console.warn('[getUnreadNotificationCount]', error.message);
    return 0;
  }
  return count || 0;
}

// Get recent notifications
export async function getNotifications(limit = 20) {
  noStore();
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";
  let uid: string | null = null;

  if (isTemp) {
    uid = 'temp-coach-id';
  } else {
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    uid = user?.id || null;
  }

  if (!uid) return [];

  const supabase = await getSupabaseForReadWrite();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[getNotifications]', error.message);
    return [];
  }
  return data || [];
}

export async function markNotificationRead(notificationId: string) {
  const supabase = await getSupabaseForReadWrite();
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true } as any)
    .eq('id', notificationId);

  if (error) throw new Error(error.message || 'Failed to mark read');

  revalidateTag('notifications');
  return { success: true };
}

export async function markAllNotificationsRead() {
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";
  const uid = isTemp ? 'temp-coach-id' : null;
  if (!uid) return { success: true };

  const supabase = await getSupabaseForReadWrite();
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true } as any)
    .eq('user_id', uid)
    .eq('is_read', false);

  if (error) throw new Error(error.message || 'Failed to mark all read');

  revalidateTag('notifications');
  return { success: true };
}

// Preferences (simple for coaches/admins in admin UI for now)
export async function getNotificationPreferences(userId?: string) {
  noStore();
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";
  let uid: string | null = userId || null;

  if (!uid) {
    if (isTemp) {
      uid = 'temp-coach-id';
    } else {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      uid = user?.id || null;
    }
  }
  if (!uid) return null;

  const supabase = await getSupabaseForReadWrite();
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', uid)
    .single();

  if (error || !data) {
    // Default on for everyone (and optionally seed)
    const defaults = {
      user_id: uid,
      event_new: true,
      event_updated: true,
      event_canceled: true,
      announcement_new: true,
      payment_due: true,
      team_message: true,
    };
    // Try to insert defaults on first access for this user (non-fatal)
    try {
      await supabase.from('notification_preferences').upsert(defaults as any, { onConflict: 'user_id' });
    } catch {}
    return defaults;
  }
  return data;
}

export async function updateNotificationPreferences(prefs: Partial<{
  event_new: boolean;
  event_updated: boolean;
  event_canceled: boolean;
  announcement_new: boolean;
  payment_due: boolean;
  team_message: boolean;
}>) {
  const cookieStore = await cookies();
  const isTemp = cookieStore.get("temp-coach")?.value === "1";
  let uid: string | null = null;

  if (isTemp) {
    uid = 'temp-coach-id';
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id || null;
  }
  if (!uid) return { success: true };

  const supabase = await getSupabaseForReadWrite();
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({
      user_id: uid,
      ...prefs,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: 'user_id' });

  if (error) throw new Error(error.message || 'Failed to save preferences');

  revalidateTag('notifications');
  return { success: true };
}

// Basic email stub for core notifications (Supabase/Resend ready)
// For temp/demo: logs. Real: integrate Resend or Supabase edge fn here.
export async function sendCoreEmailNotification(toEmail: string | null, type: NotificationType, title: string, body?: string | null, link?: string | null) {
  if (!toEmail) return;

  const isTemp = (await import("next/headers")).cookies().then(c => c.get("temp-coach")?.value === "1");
  if (await isTemp || !process.env.RESEND_API_KEY) {
    console.log(`[EMAIL NOTIF - DEMO] To: ${toEmail} | Type: ${type} | ${title}\n${body || ''}\nLink: ${link || 'N/A'}`);
    return;
  }

  // Real path example (uncomment after `npm i resend` + env):
  // import { Resend } from 'resend';
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // await resend.emails.send({
  //   from: 'Mavericks 12U <no-reply@yourdomain.com>',
  //   to: toEmail,
  //   subject: `[Mavericks] ${title}`,
  //   html: `<p>${body || title}</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL}${link || ''}">View in app</a></p>`,
  // });
}
