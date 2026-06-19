"use client";

import React, { useState, useEffect, useMemo } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Search, Users } from 'lucide-react';
import { getRoster, updatePlayer, deletePlayer } from '@/lib/actions';

interface RosterPlayer {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  position?: string | null;
  jersey_number?: number | null;
  notes?: string | null;
  family?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    parent_names?: string | null;
    primary_parent?: { first_name?: string; last_name?: string; phone?: string; email?: string } | null;
  } | null;
}

export default function RosterPage() {
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCoach, setIsCoach] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<RosterPlayer | null>(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    position: '',
    jersey_number: '',
    notes: '',
    name: '',  // family name, matches families.name column
    parent_names: '',
    email: '',
    phone: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');

  // Load roster data
  const loadRoster = async () => {
    setLoading(true);
    try {
      let data = await getRoster();
      if (isTemp) {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('mavericks-temp-roster') : null;
        if (saved) {
          data = JSON.parse(saved);
        } else if (typeof window !== 'undefined') {
          localStorage.setItem('mavericks-temp-roster', JSON.stringify(data));
        }
      }
      setPlayers(data as RosterPlayer[]);
    } catch (e) {
      console.warn('Roster load error (using fallback demo):', e);
      setLoadError('Failed to load roster data.');
      try {
        const fallback = await getRoster();
        let data = fallback as RosterPlayer[];
        if (isTemp && typeof window !== 'undefined') {
          const saved = localStorage.getItem('mavericks-temp-roster');
          if (saved) data = JSON.parse(saved);
          else localStorage.setItem('mavericks-temp-roster', JSON.stringify(data));
        }
        setPlayers(data);
      } catch (e2) {
        console.warn('Roster fallback also failed, using empty:', e2);
        setPlayers([]);
      }
    }
    setLoading(false);
  };

  // Determine coach role (temp or profile)
  useEffect(() => {
    const loadRole = async () => {
      if (isTemp) {
        setIsCoach(true);
        return;
      }
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase.from('profiles').select('role, is_admin').eq('id', user.id).single() as any;
          let coach = profile?.role === 'coach' || profile?.role === 'admin' || profile?.is_admin === true;
          if (user.email?.toLowerCase() === 'coach@comavericksbaseball.com') coach = true;
          setIsCoach(coach);
        }
      } catch {
        try {
          const { createClient } = await import('@/lib/supabase/client');
          const sb = createClient();
          const { data: { user: u } } = await sb.auth.getUser();
          if (u?.email?.toLowerCase() === 'coach@comavericksbaseball.com') {
            setIsCoach(true);
          } else {
            setIsCoach(false);
          }
        } catch {
          setIsCoach(false);
        }
      }
    };
    loadRole();
    loadRoster();
  }, [isTemp]);

  // Client-side filtered + grouped - safe
  const filteredPlayers = useMemo(() => {
    try {
      const safePlayers = Array.isArray(players) ? players.filter(p => p && typeof p === 'object') : [];
      if (!searchTerm.trim()) return safePlayers;
      const q = searchTerm.toLowerCase();
      return safePlayers.filter(p =>
        `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase().includes(q) ||
        (p.family?.name || '').toLowerCase().includes(q) ||
        (p.position || '').toLowerCase().includes(q) ||
        (p.family?.parent_names || '').toLowerCase().includes(q)
      );
    } catch (e) {
      console.warn('Roster filter error:', e);
      return [];
    }
  }, [players, searchTerm]);

  const byFamily = useMemo(() => {
    try {
      return filteredPlayers.reduce((acc, player) => {
        const famName = player.family?.name || 'Unassigned';
        if (!acc[famName]) acc[famName] = [];
        acc[famName].push(player);
        return acc;
      }, {} as Record<string, RosterPlayer[]>);
    } catch (e) {
      console.warn('Roster group error:', e);
      return {};
    }
  }, [filteredPlayers]);

  // Form helpers
  const openAdd = () => {
    setEditingPlayer(null);
    setFormData({
      first_name: '', last_name: '', date_of_birth: '', position: '', jersey_number: '', notes: '',
      name: '', parent_names: '', email: '', phone: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (player: RosterPlayer) => {
    setEditingPlayer(player);
    setFormData({
      first_name: player.first_name || '',
      last_name: player.last_name || '',
      date_of_birth: player.date_of_birth || '',
      position: player.position || '',
      jersey_number: player.jersey_number?.toString() || '',
      notes: player.notes || '',
      name: player.family?.name || '',
      parent_names: player.family?.parent_names || '',
      email: player.family?.email || '',
      phone: player.family?.phone || '',
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingPlayer(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.first_name || !formData.last_name) {
      toast.error('First name and last name are required');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        jersey_number: formData.jersey_number ? parseInt(formData.jersey_number) : null,
        date_of_birth: formData.date_of_birth || null,
      };
      if (isTemp) {
        // Local in-memory CRUD for temp/demo - use string IDs, no DB
        let newPlayers = [...players];
        if (editingPlayer) {
          newPlayers = newPlayers.map(p => {
            if (p.id === editingPlayer.id) {
              return {
                ...p,
                ...payload,
                family: {
                  ...p.family,
                  name: payload.name || `${payload.last_name} Family`,
                  email: payload.email || null,
                  phone: payload.phone || null,
                  parent_names: payload.parent_names || null,
                }
              } as RosterPlayer;
            }
            return p;
          });
        } else {
          const newId = `temp-player-${Date.now()}`;
          const newFamId = `temp-family-${Date.now()}`;
          const famName = payload.name || `${payload.last_name} Family`;
          const newPlayer: RosterPlayer = {
            id: newId,
            first_name: payload.first_name,
            last_name: payload.last_name,
            date_of_birth: payload.date_of_birth || null,
            position: payload.position || null,
            jersey_number: payload.jersey_number || null,
            notes: payload.notes || null,
            family: {
              id: newFamId,
              name: famName,
              email: payload.email || null,
              phone: payload.phone || null,
              parent_names: payload.parent_names || null,
            }
          };
          newPlayers.push(newPlayer);
        }
        setPlayers(newPlayers);
        if (typeof window !== 'undefined') {
          localStorage.setItem('mavericks-temp-roster', JSON.stringify(newPlayers));
        }
        toast.success(editingPlayer ? 'Player updated (demo)' : 'Player added (demo)');
      } else {
        if (editingPlayer) {
          const updateData = {
            ...payload,
            family_name: payload.name,  // map to what updatePlayer expects
          };
          await updatePlayer(editingPlayer.id, updateData as any);
          toast.success('Player updated');
        } else {
          const { createClient } = await import('@/lib/supabase/client');
          const supabase = createClient();

          try {
            const famName = payload.name || `${payload.last_name} Family`;

            let familyId: string;

            // Find or create family safely, using correct columns (name not family_name)
            const { data: existingFam } = await (supabase as any)
              .from('families')
              .select('id')
              .ilike('name', famName)
              .limit(1)
              .maybeSingle();

            if (existingFam?.id) {
              familyId = existingFam.id;
              // Update contacts if provided (correct columns)
              if (payload.email || payload.phone || payload.parent_names) {
                await (supabase as any)
                  .from('families')
                  .update({
                    email: payload.email || null,
                    phone: payload.phone || null,
                    parent_names: payload.parent_names || null,
                  } as any)
                  .eq('id', familyId);
              }
            } else {
              const { data: newFam, error: famErr } = await (supabase as any)
                .from('families')
                .insert({
                  name: famName,  // correct column: name (not family_name)
                  email: payload.email || null,
                  phone: payload.phone || null,
                  parent_names: payload.parent_names || null,
                } as any)
                .select('id')
                .single();

              if (famErr || !newFam?.id) {
                throw new Error(famErr?.message || 'Failed to create family');
              }
              familyId = newFam.id;
            }

            // Insert player linked to family
            const { error: playerErr } = await (supabase as any)
              .from('players')
              .insert({
                family_id: familyId,
                first_name: (payload.first_name || '').trim(),
                last_name: (payload.last_name || '').trim(),
                date_of_birth: payload.date_of_birth || null,
                position: payload.position || null,
                jersey_number: payload.jersey_number || null,
                notes: payload.notes || null,
                is_active: true,
              } as any);

            if (playerErr) {
              throw new Error(playerErr.message || 'Failed to add player');
            }

            toast.success('Player added to roster');
          } catch (insertErr: any) {
            throw new Error(insertErr?.message || 'Failed to create player and/or family');
          }
        }
        await loadRoster();
      }
      closeDialog();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save player');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (player: RosterPlayer) => {
    if (!confirm(`Delete ${player.first_name} ${player.last_name}? This cannot be undone.`)) return;
    try {
      if (isTemp) {
        const newPlayers = players.filter(p => p.id !== player.id);
        setPlayers(newPlayers);
        if (typeof window !== 'undefined') {
          localStorage.setItem('mavericks-temp-roster', JSON.stringify(newPlayers));
        }
        toast.success('Player removed (demo)');
      } else {
        await deletePlayer(player.id);
        toast.success('Player removed');
        await loadRoster();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  const formatDob = (dob?: string | null) => {
    if (!dob) return '—';
    try {
      return new Date(dob).getFullYear().toString();
    } catch {
      return '—';
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Loading roster...</div>;
  }

  return (
    <ErrorBoundary>
    <div className="space-y-6">
      {loadError && (
        <div className="p-4 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded flex justify-between">
          <span>{loadError} Some data may be missing.</span>
          <button onClick={() => window.location.reload()} className="text-sm underline">Try Again</button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-7 w-7" /> Roster
          </h1>
          <p className="text-muted-foreground">
            {Object.keys(byFamily).length} families • {filteredPlayers.length} players
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search players or families..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          {isCoach && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openAdd} className="mavericks-btn-primary gap-2">
                  <Plus className="h-4 w-4" /> Add Player
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>{editingPlayer ? 'Edit Player' : 'Add New Player'}</DialogTitle>
                  <DialogDescription>
                    {editingPlayer ? 'Update details and family contact info.' : 'Players are grouped by family. Provide family + parent contact details.'}
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="first">First Name *</Label>
                      <Input id="first" value={formData.first_name} onChange={e => setFormData({ ...formData, first_name: e.target.value })} required />
                    </div>
                    <div>
                      <Label htmlFor="last">Last Name *</Label>
                      <Input id="last" value={formData.last_name} onChange={e => setFormData({ ...formData, last_name: e.target.value })} required />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="dob">Date of Birth</Label>
                      <Input id="dob" type="date" value={formData.date_of_birth} onChange={e => setFormData({ ...formData, date_of_birth: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="jersey">Jersey #</Label>
                      <Input id="jersey" type="number" value={formData.jersey_number} onChange={e => setFormData({ ...formData, jersey_number: e.target.value })} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="pos">Position</Label>
                      <Input id="pos" placeholder="Pitcher, Catcher..." value={formData.position} onChange={e => setFormData({ ...formData, position: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="fam">Family Name</Label>
                      <Input id="fam" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Johnson Family (auto-generated from last name if blank)" />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="parents">Parent / Guardian Names</Label>
                    <Input id="parents" value={formData.parent_names} onChange={e => setFormData({ ...formData, parent_names: e.target.value })} placeholder="Alex & Jordan Johnson" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input id="phone" type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="(555) 123-4567" />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="family@email.com" />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Input id="notes" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Allergies, etc." />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
                    <Button type="submit" disabled={submitting} className="mavericks-btn-primary">
                      {submitting ? 'Saving...' : editingPlayer ? 'Save Changes' : 'Add Player'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {Object.keys(byFamily).length === 0 && (
        <Card className="mavericks-card">
          <CardContent className="p-8 text-center text-muted-foreground">
            No players match your search. {isCoach ? 'Add the first player!' : ''}
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {Object.entries(byFamily).map(([familyName, familyPlayers]) => {
          const fam = familyPlayers[0]?.family;
          const contact = fam ? (
            <div className="text-sm text-muted-foreground">
              {fam.parent_names || 'Parents'} • {fam.phone || '—'} {fam.email ? `• ${fam.email}` : ''}
            </div>
          ) : null;

          return (
            <Card key={familyName} className="mavericks-card">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-lg">
                  <span>{familyName}</span>
                  <Badge variant="secondary">{familyPlayers.length} player{familyPlayers.length > 1 ? 's' : ''}</Badge>
                </CardTitle>
                {contact && <div className="text-xs mt-0.5">{contact}</div>}
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  {familyPlayers.map((player) => {
                    const initials = `${player.first_name?.[0] || ''}${player.last_name?.[0] || ''}`.toUpperCase();
                    return (
                      <div key={player.id} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/40">
                        <Avatar className="h-10 w-10 border mt-0.5">
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                            {initials || 'P'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium flex items-center gap-2">
                            {player.first_name} {player.last_name}
                            {player.jersey_number && <span className="text-primary font-mono text-sm">#{player.jersey_number}</span>}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {player.position || 'Player'} • DOB {formatDob(player.date_of_birth)}
                          </div>
                          {player.notes && <div className="text-xs text-muted-foreground mt-0.5 truncate">{player.notes}</div>}

                          {/* Coach actions */}
                          {isCoach && (
                            <div className="flex gap-1 mt-2">
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openEdit(player)}>
                                <Edit className="h-3 w-3 mr-1" /> Edit
                              </Button>
                              <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => handleDelete(player)}>
                                <Trash2 className="h-3 w-3 mr-1" /> Delete
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!isCoach && (
        <p className="text-center text-xs text-muted-foreground">Contact your coach to update player info or add new teammates.</p>
      )}
    </div>
    </ErrorBoundary>
  );
}
