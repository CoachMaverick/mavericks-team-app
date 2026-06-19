"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createClient } from '@/lib/supabase/client';
import { getInvoices, getRoster, getTeamSettings, updateTeamSettings } from '@/lib/actions';
import { toast } from "sonner";

interface SafeInvoice {
  id: string;
  family_id?: string;
  amount_cents: number;
  due_date: string;
  status?: string | null;
  description?: string | null;
  due_type?: string;
  notes?: string | null;
  player_id?: string;
  [key: string]: any;
}

interface RosterFamily {
  id: string;
  name: string;
  email?: string | null;
}

interface RosterPlayer {
  id: string;
  first_name: string;
  last_name: string;
  family_id?: string;
  family?: { id: string; name: string; email?: string | null };
}

export default function AdminPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<SafeInvoice[]>([]);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [families, setFamilies] = useState<RosterFamily[]>([]);
  const [teamSettings, setTeamSettings] = useState({ dues_monthly_cents: 12500, dues_season_cents: 150000 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Create form
  const [newInvoice, setNewInvoice] = useState({
    family_id: '',
    player_id: '',
    amount: '',
    desc: '',
    due: '',
    due_type: 'special' as 'monthly' | 'season' | 'special',
  });

  // Edit state
  const [editing, setEditing] = useState<SafeInvoice | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const supabase = React.useMemo(() => createClient(), []);
  const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');

  // Temporary bypass: force full admin for this email even if profile not synced
  const [forcedAdmin, setForcedAdmin] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email?.toLowerCase() === 'coach@comavericksbaseball.com') {
          setForcedAdmin(true);
        }
      } catch {}
    })();
  }, [supabase]);

  const hasFullAdminAccess = forcedAdmin || isTemp;

  const load = async () => {
    setLoading(true);
    setLoadError(null);

    try {
      // Load invoices (uses service for temp)
      const fetched = await getInvoices();
      let invList = (fetched || []) as SafeInvoice[];

      // Load roster
      let rosterData: any[] = [];
      try {
        rosterData = await getRoster();
        if (isTemp) {
          const saved = localStorage.getItem('mavericks-temp-roster');
          if (saved) rosterData = JSON.parse(saved);
        }
      } catch (e) {
        console.warn('Roster load for admin:', e);
      }
      setRoster(rosterData);

      // Build unique families from roster
      const famMap: Record<string, RosterFamily> = {};
      rosterData.forEach((p: any) => {
        const f = p.family;
        if (f?.id && f.name && !famMap[f.id]) {
          famMap[f.id] = { id: f.id, name: f.name, email: f.email };
        }
      });
      setFamilies(Object.values(famMap));

      // For temp/demo, merge LS invoices so admin sees what parents see / created
      if (isTemp) {
        const saved = localStorage.getItem('mavericks-demo-invoices');
        if (saved) {
          const lsList: any[] = JSON.parse(saved);
          const seen = new Set(invList.map((i: any) => i.id));
          lsList.forEach((li: any) => {
            if (!seen.has(li.id)) {
              invList.push(li as SafeInvoice);
              seen.add(li.id);
            }
          });
        }
      }

      setInvoices(invList);

      // Load settings
      const settings = await getTeamSettings().catch(() => ({ dues_monthly_cents: 12500, dues_season_cents: 150000 }));
      setTeamSettings(settings);
    } catch (e: any) {
      console.error("PAGE ERROR:", e);
      setLoadError('Could not load data.');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Save team settings
  const saveSettings = async () => {
    try {
      await updateTeamSettings({
        dues_monthly_cents: teamSettings.dues_monthly_cents,
        dues_season_cents: teamSettings.dues_season_cents,
      });
      toast.success('Default dues amounts saved');
      await load();
    } catch (e: any) {
      toast.error('Failed to save settings: ' + (e.message || e));
    }
  };

  const createInvoice = async () => {
    const amt = parseFloat(newInvoice.amount);
    if (!amt || !newInvoice.desc || !newInvoice.due) {
      toast.error('Please fill amount, description and due date');
      return;
    }
    if (!newInvoice.family_id) {
      toast.error('Please select a family');
      return;
    }

    const payload: any = {
      family_id: newInvoice.family_id,
      player_id: newInvoice.player_id || null,
      amount_cents: Math.round(amt * 100),
      description: newInvoice.desc,
      due_date: newInvoice.due,
      due_type: newInvoice.due_type,
      status: 'pending',
      notes: null,
    };

    try {
      if (isTemp) {
        // Persist to shared LS for demo (visible in payments too)
        const saved = localStorage.getItem('mavericks-demo-invoices');
        let list: any[] = saved ? JSON.parse(saved) : [];
        const newInv = {
          id: 'demo-' + Date.now(),
          ...payload,
          created_at: new Date().toISOString(),
          family: families.find(f => f.id === payload.family_id) || { name: 'Demo Family' },
          player: roster.find(p => p.id === payload.player_id) || null,
        };
        list = [...list, newInv];
        localStorage.setItem('mavericks-demo-invoices', JSON.stringify(list));
        setInvoices(list as SafeInvoice[]);
        toast.success('Invoice created (demo)');
      } else {
        const { error } = await supabase.from('invoices').insert(payload);
        if (error) throw error;
        toast.success('Invoice created');
      }

      setNewInvoice({ family_id: '', player_id: '', amount: '', desc: '', due: '', due_type: 'special' });
      await load();
      router.refresh();
    } catch (e: any) {
      console.error("PAGE ERROR:", e);
      toast.error('Create failed: ' + (e.message || 'unknown'));
    }
  };

  // Bulk generate for all families using defaults
  const generateBulk = async (type: 'monthly' | 'season') => {
    const amount = type === 'monthly' ? teamSettings.dues_monthly_cents : teamSettings.dues_season_cents;
    if (!amount || amount <= 0) {
      toast.error('Set default dues amount first');
      return;
    }

    const today = new Date();
    const due = new Date(today.getFullYear(), today.getMonth() + (type === 'monthly' ? 1 : 3), 1).toISOString().split('T')[0];
    const desc = type === 'monthly' ? 'Monthly Dues' : 'Season Dues';

    try {
      const uniqueFamilies = families; // or from roster
      let created = 0;

      if (isTemp) {
        const saved = localStorage.getItem('mavericks-demo-invoices');
        let list: any[] = saved ? JSON.parse(saved) : [];
        const seen = new Set(list.map((i: any) => `${i.family_id}-${type}-${due}`));

        for (const fam of uniqueFamilies) {
          const key = `${fam.id}-${type}-${due}`;
          if (seen.has(key)) continue;
          const newInv = {
            id: 'demo-' + Date.now() + '-' + fam.id,
            family_id: fam.id,
            amount_cents: amount,
            due_date: due,
            description: desc,
            due_type: type,
            status: 'pending',
            created_at: new Date().toISOString(),
            family: fam,
          };
          list.push(newInv);
          created++;
          seen.add(key);
        }
        localStorage.setItem('mavericks-demo-invoices', JSON.stringify(list));
        setInvoices(list as SafeInvoice[]);
      } else {
        for (const fam of uniqueFamilies) {
          await supabase.from('invoices').insert({
            family_id: fam.id,
            amount_cents: amount,
            due_date: due,
            description: desc,
            due_type: type,
            status: 'pending',
          } as any);
          created++;
        }
      }

      toast.success(`Generated ${created} ${type} invoices`);
      await load();
      router.refresh();
    } catch (e: any) {
      toast.error('Bulk generate failed: ' + (e.message || e));
    }
  };

  const startEdit = (inv: SafeInvoice) => {
    setEditing(inv);
    setEditForm({
      amount: (inv.amount_cents / 100).toFixed(2),
      desc: inv.description || '',
      due: inv.due_date,
      due_type: inv.due_type || 'special',
      notes: inv.notes || '',
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const amt = parseFloat(editForm.amount);
    if (!amt || !editForm.due) {
      toast.error('Amount and due date required');
      return;
    }

    try {
      const payload = {
        amount_cents: Math.round(amt * 100),
        description: editForm.desc,
        due_date: editForm.due,
        due_type: editForm.due_type,
        notes: editForm.notes || null,
      };

      if (isTemp) {
        const saved = localStorage.getItem('mavericks-demo-invoices');
        let list: any[] = saved ? JSON.parse(saved) : [];
        list = list.map((i: any) => i.id === editing.id ? { ...i, ...payload } : i);
        localStorage.setItem('mavericks-demo-invoices', JSON.stringify(list));
        setInvoices(list as SafeInvoice[]);
        toast.success('Invoice updated (demo)');
      } else {
        const { error } = await (supabase as any).from('invoices').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Invoice updated');
      }

      setEditing(null);
      setEditForm({});
      await load();
      router.refresh();
    } catch (e: any) {
      toast.error('Update failed: ' + (e.message || e));
    }
  };

  const deleteInvoice = async (id: string) => {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;

    try {
      if (isTemp) {
        const saved = localStorage.getItem('mavericks-demo-invoices');
        let list: any[] = saved ? JSON.parse(saved) : [];
        list = list.filter((i: any) => i.id !== id);
        localStorage.setItem('mavericks-demo-invoices', JSON.stringify(list));
        setInvoices(list as SafeInvoice[]);
        toast.success('Invoice deleted (demo)');
      } else {
        const { error } = await supabase.from('invoices').delete().eq('id', id);
        if (error) throw error;
        toast.success('Invoice deleted');
      }
      await load();
      router.refresh();
    } catch (e: any) {
      toast.error('Delete failed: ' + (e.message || e));
    }
  };

  const markPaid = async (id: string) => {
    try {
      if (isTemp) {
        const saved = localStorage.getItem('mavericks-demo-invoices');
        let list: any[] = saved ? JSON.parse(saved) : [];
        list = list.map((i: any) => i.id === id ? { ...i, status: 'paid' } : i);
        localStorage.setItem('mavericks-demo-invoices', JSON.stringify(list));
        setInvoices(list as SafeInvoice[]);
        toast.success('Marked paid (demo)');
      } else {
        const { error } = await (supabase as any).from('invoices').update({ status: 'paid' }).eq('id', id);
        if (error) throw error;
        // Also record a payment for history
        await (supabase as any).from('payments').insert({
          invoice_id: id,
          amount_cents: invoices.find(i => i.id === id)?.amount_cents || 0,
          paid_at: new Date().toISOString(),
          status: 'succeeded',
        }).catch(() => {});
        toast.success('Marked as paid');
      }
      await load();
      router.refresh();
    } catch (e: any) {
      toast.error('Failed to mark paid: ' + (e.message || e));
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Loading admin dues...</div>;
  }

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {loadError && (
          <div className="p-4 bg-red-50 border border-red-500 text-red-800 rounded">
            PAGE ERROR: {loadError} <button onClick={load} className="underline ml-2">Retry</button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Admin — Dues &amp; Invoices</h1>
          <Button onClick={() => { load(); router.refresh(); }} variant="outline" size="sm">Refresh All</Button>
        </div>

        {/* Default Dues Settings */}
        <Card className="mavericks-card">
          <CardHeader>
            <CardTitle>Default Dues Amounts</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs block mb-1">Monthly</label>
              <Input
                type="number"
                value={teamSettings.dues_monthly_cents / 100}
                onChange={(e) => setTeamSettings(p => ({ ...p, dues_monthly_cents: Math.round(parseFloat(e.target.value || '0') * 100) }))}
                className="w-28"
              />
            </div>
            <div>
              <label className="text-xs block mb-1">Season</label>
              <Input
                type="number"
                value={teamSettings.dues_season_cents / 100}
                onChange={(e) => setTeamSettings(p => ({ ...p, dues_season_cents: Math.round(parseFloat(e.target.value || '0') * 100) }))}
                className="w-28"
              />
            </div>
            <Button onClick={saveSettings}>Save Defaults</Button>
            <span className="text-xs text-muted-foreground ml-2">Used for bulk generation</span>
          </CardContent>
        </Card>

        {/* Create / Special Due */}
        <Card className="mavericks-card">
          <CardHeader><CardTitle>Create New Invoice / Special Due</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="text-xs">Family</label>
                <select
                  value={newInvoice.family_id}
                  onChange={(e) => setNewInvoice(p => ({ ...p, family_id: e.target.value, player_id: '' }))}
                  className="w-full border rounded px-3 py-2 bg-background"
                >
                  <option value="">Select family...</option>
                  {families.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs">Player (optional)</label>
                <select
                  value={newInvoice.player_id}
                  onChange={(e) => setNewInvoice(p => ({ ...p, player_id: e.target.value }))}
                  className="w-full border rounded px-3 py-2 bg-background"
                >
                  <option value="">All / Family</option>
                  {roster.filter(p => !newInvoice.family_id || p.family_id === newInvoice.family_id).map(p => (
                    <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs">Type</label>
                <select value={newInvoice.due_type} onChange={e => setNewInvoice(p => ({...p, due_type: e.target.value as any}))} className="w-full border rounded px-3 py-2 bg-background">
                  <option value="monthly">Monthly</option>
                  <option value="season">Season</option>
                  <option value="special">Special</option>
                </select>
              </div>

              <div>
                <label className="text-xs">Amount $</label>
                <Input type="number" step="0.01" placeholder="150.00" value={newInvoice.amount} onChange={e => setNewInvoice(p => ({...p, amount: e.target.value}))} />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs">Description</label>
                <Input placeholder="e.g. January dues or Tournament fee" value={newInvoice.desc} onChange={e => setNewInvoice(p => ({...p, desc: e.target.value}))} />
              </div>

              <div>
                <label className="text-xs">Due Date</label>
                <Input type="date" value={newInvoice.due} onChange={e => setNewInvoice(p => ({...p, due: e.target.value}))} />
              </div>

              <div className="md:col-span-1">
                <Button onClick={createInvoice} className="w-full">Create Invoice</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Generation */}
        <Card className="mavericks-card">
          <CardHeader><CardTitle>Bulk Generate Dues</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={() => generateBulk('monthly')} variant="outline">Generate Monthly for All Families</Button>
            <Button onClick={() => generateBulk('season')} variant="outline">Generate Season for All Families</Button>
            <span className="text-xs self-center text-muted-foreground">Uses default amounts above. Skips duplicates by family+type+date.</span>
          </CardContent>
        </Card>

        {/* Invoices List with Edit/Delete */}
        <Card className="mavericks-card">
          <CardHeader>
            <CardTitle>All Invoices ({invoices.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <div className="text-muted-foreground">No invoices yet. Create some above or use bulk generate.</div>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-auto">
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex flex-col md:flex-row md:items-center justify-between p-3 border rounded bg-card gap-2 text-sm">
                    <div className="flex-1">
                      <div className="font-medium">
                        {inv.description || inv.due_type || 'Invoice'} 
                        {inv.due_type && <span className="ml-2 text-xs px-2 py-0.5 bg-muted rounded">{inv.due_type}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Due {new Date(inv.due_date).toLocaleDateString()} • ${(inv.amount_cents / 100).toFixed(2)}
                        {inv.notes && ` • ${inv.notes}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={inv.status === 'paid' ? 'default' : 'secondary'} className="uppercase text-[10px]">
                        {inv.status || 'pending'}
                      </Badge>

                      <Button size="sm" variant="outline" onClick={() => startEdit(inv)}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => markPaid(inv.id)}>Mark Paid</Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteInvoice(inv.id)}>Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog / Inline simple */}
        {editing && (
          <Card className="mavericks-card border-primary">
            <CardHeader><CardTitle>Edit Invoice</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input type="number" step="0.01" value={editForm.amount} onChange={e => setEditForm((p:any)=>({...p, amount:e.target.value}))} placeholder="Amount" />
              <Input value={editForm.desc} onChange={e => setEditForm((p:any)=>({...p, desc:e.target.value}))} placeholder="Description" />
              <Input type="date" value={editForm.due} onChange={e => setEditForm((p:any)=>({...p, due:e.target.value}))} />
              <div className="flex gap-2">
                <Button onClick={saveEdit}>Save Changes</Button>
                <Button variant="outline" onClick={() => { setEditing(null); setEditForm({}); }}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="text-xs text-muted-foreground">
          All changes persist for demo (localStorage) and real users (DB). Use Payments page to test Pay Now / partials.
        </div>
      </div>
    </ErrorBoundary>
  );
}
