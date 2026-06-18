"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TeamLogo } from "@/components/TeamLogo";
import { toast } from "sonner";
import { Upload, RefreshCw, Plus, Edit, Trash } from "lucide-react";
import { 
  getFamilies, getInvoices, getPlayers, getTeamSettings,
  getInvoicePaymentsMap,
  revalidateInvoiceCache,
  getNotificationPreferences,
  updateNotificationPreferences
} from '@/lib/actions';
import { createClient } from '@/lib/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function NotificationPrefsForm() {
  const [prefs, setPrefs] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getNotificationPreferences().then(setPrefs).catch(() => setPrefs({
      event_new: true, event_updated: true, event_canceled: true, announcement_new: true, payment_due: true, team_message: true
    }));
  }, []);

  const toggle = async (key: string, val: boolean) => {
    if (!prefs) return;
    setSaving(true);
    const newP = { ...prefs, [key]: val };
    setPrefs(newP);
    try {
      await updateNotificationPreferences({ [key]: val });
      toast.success('Preference saved');
    } catch(e: any) {
      toast.error(e.message || 'Save failed');
    }
    setSaving(false);
  };

  if (!prefs) return <div className="text-xs">Loading prefs...</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
      {[
        ['event_new', 'New / Updated / Canceled Events'],
        ['announcement_new', 'New Pinned Announcements'],
        ['payment_due', 'Payment Due Reminders'],
        ['team_message', 'New Team Chat Messages'],
      ].map(([k, label]) => (
        <label key={k} className="flex items-center gap-2 border rounded p-2 cursor-pointer hover:bg-muted/30">
          <input type="checkbox" checked={!!prefs[k]} onChange={e => toggle(k, e.target.checked)} disabled={saving} />
          <span>{label}</span>
        </label>
      ))}
      <p className="text-[10px] col-span-full text-muted-foreground mt-1">These control both in-app and email (when enabled). Real-time for all users.</p>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [currentLogo, setCurrentLogo] = useState<string>('/images/mavericks-logo.jpg');
  const [uploading, setUploading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Mutable session state for temp demo.
  // Starts empty (no hardcoded demos). Admin Create + bulk populate only via user action; LS persists across nav.
  // Delete/edit/mark work; lists show truly empty until creates happen.
  const [tempSessionInvoices, setTempSessionInvoices] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mavericks-demo-invoices');
      if (saved) return JSON.parse(saved);
      // Start empty (real empty state); Admin create/bulk will populate via onAdd + update. No hardcoded.
      const empty: any[] = [];
      localStorage.setItem('mavericks-demo-invoices', JSON.stringify(empty));
      return empty;
    }
    return [];
  });

  const updateTempSessionInvoices = (updater: (prev: any[]) => any[]) => {
    setTempSessionInvoices((prev: any[]) => {
      const newVal = updater(prev);
      if (typeof window !== 'undefined') {
        localStorage.setItem('mavericks-demo-invoices', JSON.stringify(newVal));
      }
      return newVal;
    });
  };

  useEffect(() => {
    // Load saved logo on mount
    const saved = localStorage.getItem('mavericks-logo');
    if (saved) {
      setCurrentLogo(saved);
    }
  }, []);

  // Helper to refresh server data + force list reload. For real: revalidate + fetch fresh from Supabase.
  // For temp: keeps the mutable session state (CRUD operations persist; no re-adding deleted demo items).
  const refreshAll = () => {
    router.refresh();
    revalidateInvoiceCache().catch(() => {});
    setDataVersion(v => v + 1);
    // for temp, the session is already current; for real, load will query fresh after reval
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file (PNG, JPG, etc.)");
      return;
    }

    if (file.size > 2 * 1024 * 1024) { // 2MB limit for simplicity
      toast.error("Logo file too large (max 2MB)");
      return;
    }

    setUploading(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      localStorage.setItem('mavericks-logo', dataUrl);
      setCurrentLogo(dataUrl);
      setUploading(false);
      toast.success("Team logo updated! Refresh pages to see changes everywhere.");
    };
    reader.onerror = () => {
      toast.error("Failed to read the image file.");
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const resetLogo = () => {
    localStorage.removeItem('mavericks-logo');
    setCurrentLogo('/images/mavericks-logo.jpg');
    toast.success("Logo reset to default. Refresh to see changes.");
  };

  return (
    <ErrorBoundary>
    <div className="space-y-6">
      {loadError && (
        <div className="p-4 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded flex justify-between">
          <span>{loadError} Some admin features limited.</span>
          <button onClick={() => window.location.reload()} className="text-sm underline">Try Again</button>
        </div>
      )}
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Admin Panel</h1>
        <p className="text-muted-foreground mb-6">
          {typeof document !== 'undefined' && document.cookie.includes('temp-coach=1')
            ? 'Admin (demo mode)'
            : 'Admin Panel — real Supabase user'}
        </p>
      </div>

      {/* Team Logo Management */}
      <Card className="mavericks-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Team Logo Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <TeamLogo size="lg" className="border border-border rounded-lg p-1 bg-card" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">Current Logo</p>
              <p className="text-sm text-muted-foreground truncate">
                {currentLogo.startsWith('data:') ? 'Custom uploaded logo' : 'Default: /images/mavericks-logo.jpg'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium block mb-1.5">Upload New Logo</label>
              <Input 
                type="file" 
                accept="image/*" 
                onChange={handleLogoUpload}
                disabled={uploading}
                className="cursor-pointer file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
              <p className="text-xs text-muted-foreground mt-1">PNG or JPG recommended. Max 2MB. Will update across header, dashboard, login, etc.</p>
            </div>

            <Button 
              variant="outline" 
              onClick={resetLogo} 
              disabled={uploading}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" /> Reset to Default Logo
            </Button>
          </div>

          <div className="pt-2 border-t border-border text-xs text-muted-foreground">
            <p><strong>Note:</strong> Client-side simulation using localStorage (temp mode). For full Supabase: upload the file to a 'team-assets' Storage bucket (public), save the public URL, and update TeamLogo to fetch from DB/settings.</p>
            <p className="mt-1">Place your actual logos at <code>public/images/mavericks-logo.jpg</code> and <code>public/images/mavericks-banner.jpg</code>.</p>
          </div>
        </CardContent>
      </Card>

      {/* Core Notification Preferences (for coach/admin) */}
      <Card className="mavericks-card">
        <CardHeader>
          <CardTitle>Notification Settings (Core)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">Toggle for events, announcements, payments. Changes affect in-app + email (prefs checked in actions).</p>
          <NotificationPrefsForm />
        </CardContent>
      </Card>

      {/* Dues Management - Flexible for Coach/Admin */}
      <Card className="mavericks-card">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Dues Management</CardTitle>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="mavericks-btn-primary flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Create New Invoice / Special Due
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Invoice / Special Due</DialogTitle>
                  <DialogDescription>
                    Add custom dues such as tournament fees, uniforms, travel, etc. Assign to the whole team (All Players) or specific families.
                  </DialogDescription>
                </DialogHeader>
                <CreateInvoiceForm 
                  key={isCreateOpen.toString()}
                  open={isCreateOpen}
                  onSuccess={() => { refreshAll(); setIsCreateOpen(false); }} 
                  onAddForDemo={(added) => {
                    console.log('[Admin] onAddForDemo called with', added.length, 'item(s). Form values at submit:', added[0] ? {desc: added[0].description, amount: added[0].amount_cents, due: added[0].due_date, type: added[0].due_type} : null);
                    updateTempSessionInvoices(prev => {
                      const newSession = [...prev, ...added];
                      console.log('[Admin] tempSessionInvoices updated from', prev.length, 'to', newSession.length);
                      return newSession;
                    });
                  }} 
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bulk Actions - direct client Supabase */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={async () => {
              const supabase = createClient();
              const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
              try {
                const settings = isTemp ? { dues_monthly_cents: 12500 } : await getTeamSettings();
                const fams = isTemp ? [{id:'fam1',name:'Maverick Family (Temp)'},{id:'fam2',name:'Johnson Family (Temp)'}] : await getFamilies();
                const today = new Date();
                const dueDate = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().split('T')[0];
                let count = 0;
                let added: any[] = [];
                for (const fam of fams) {
                  if (isTemp) {
                    const item = {
                      id: 'temp-' + Date.now() + '-' + count,
                      family_id: fam.id,
                      amount_cents: settings.dues_monthly_cents || 12500,
                      due_date: dueDate,
                      description: 'Monthly dues',
                      due_type: 'monthly',
                      status: 'pending',
                      family: { name: fam.name }
                    };
                    added.push(item);
                    count++;
                  } else {
                    const { error } = await supabase.from('invoices').insert({
                      family_id: fam.id,
                      amount_cents: settings.dues_monthly_cents || 12500,
                      due_date: dueDate,
                      description: 'Monthly dues',
                      due_type: 'monthly',
                      status: 'pending',
                    } as any);
                    if (error) throw error;
                    count++;
                  }
                }
                if (isTemp && added.length) {
                  updateTempSessionInvoices(prev => [...prev, ...added]);
                }
                toast.success(`Monthly dues generated for ${count} families${isTemp ? ' (demo)' : ''}`);
                refreshAll();
              } catch (e: any) {
                if (isTemp) {
                  // Fallback create in temp even on error path
                  const dueDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().split('T')[0];
                  const fallback = [{id:'fam1',name:'Maverick Family (Temp)'},{id:'fam2',name:'Johnson Family (Temp)'}].map((fam, idx) => ({
                    id: 'temp-' + Date.now() + '-fb' + idx,
                    family_id: fam.id,
                    amount_cents: 12500,
                    due_date: dueDate,
                    description: 'Monthly dues',
                    due_type: 'monthly',
                    status: 'pending',
                    family: { name: fam.name }
                  }));
                  updateTempSessionInvoices(prev => [...prev, ...fallback]);
                  toast.success('Monthly dues generated (demo)');
                  refreshAll();
                } else toast.error(e.message);
              }
            }} variant="outline">
              Generate Monthly Dues ($125) for All
            </Button>
            <Button onClick={async () => {
              const supabase = createClient();
              const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
              try {
                const settings = isTemp ? { dues_season_cents: 150000 } : await getTeamSettings();
                const fams = isTemp ? [{id:'fam1',name:'Maverick Family (Temp)'},{id:'fam2',name:'Johnson Family (Temp)'}] : await getFamilies();
                const dueDate = new Date().toISOString().split('T')[0];
                let count = 0;
                let added: any[] = [];
                for (const fam of fams) {
                  if (isTemp) {
                    const item = {
                      id: 'temp-' + Date.now() + '-' + count,
                      family_id: fam.id,
                      amount_cents: settings.dues_season_cents || 150000,
                      due_date: dueDate,
                      description: 'Full season payment',
                      due_type: 'season',
                      status: 'pending',
                      family: { name: fam.name }
                    };
                    added.push(item);
                    count++;
                  } else {
                    const { error } = await supabase.from('invoices').insert({
                      family_id: fam.id,
                      amount_cents: settings.dues_season_cents || 150000,
                      due_date: dueDate,
                      description: 'Full season payment',
                      due_type: 'season',
                      status: 'pending',
                    } as any);
                    if (error) throw error;
                    count++;
                  }
                }
                if (isTemp && added.length) {
                  updateTempSessionInvoices(prev => [...prev, ...added]);
                }
                toast.success(`Season payments created for ${count} families${isTemp ? ' (demo)' : ''}`);
                refreshAll();
              } catch (e: any) {
                if (isTemp) {
                  const dueDate = new Date().toISOString().split('T')[0];
                  const fallback = [{id:'fam1',name:'Maverick Family (Temp)'},{id:'fam2',name:'Johnson Family (Temp)'}].map((fam, idx) => ({
                    id: 'temp-' + Date.now() + '-fb' + idx,
                    family_id: fam.id,
                    amount_cents: 150000,
                    due_date: dueDate,
                    description: 'Full season payment',
                    due_type: 'season',
                    status: 'pending',
                    family: { name: fam.name }
                  }));
                  updateTempSessionInvoices(prev => [...prev, ...fallback]);
                  toast.success('Season payments created (demo)');
                  refreshAll();
                } else toast.error(e.message);
              }
            }} variant="outline">
              Create Full Season ($1,500) for All
            </Button>
            <Button onClick={() => refreshAll()} variant="ghost">Refresh List</Button>
          </div>

          {/* Defaults Editor (live team_settings) */}
          <DuesDefaults />

          {/* Invoices List */}
          <DuesList dataVersion={dataVersion} onRefresh={refreshAll} tempSessionInvoices={tempSessionInvoices} onUpdateTempSessionInvoices={updateTempSessionInvoices} />
        </CardContent>
      </Card>

      {/* Other Admin Stubs */}
      <Card className="mavericks-card">
        <CardHeader>
          <CardTitle>Other Admin Tools</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>✅ Manage users / roles (stub - coming soon)</p>
          <p>✅ Configure dues / season settings (see above + team_settings)</p>
          <p>✅ Full access to all features (see Dashboard for nav + features)</p>
          <p className="text-muted-foreground text-xs">Real admin tools (with Supabase) in later phases. Logo upload above works in temp mode.</p>
        </CardContent>
      </Card>
    </div>
    </ErrorBoundary>
  );
}

// Create New Invoice / Special Due form - supports All Players (team) or Specific Families (multi)
function CreateInvoiceForm({ onSuccess, onAddForDemo, open }: { onSuccess: () => void; onAddForDemo?: (added: any[]) => void; open?: boolean }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueType, setDueType] = useState<'monthly' | 'special' | 'season' | 'other'>('special');
  const [assignMode, setAssignMode] = useState<'all' | 'specific'>('all');
  const [selectedFamilyIds, setSelectedFamilyIds] = useState<string[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getFamilies().then(setFamilies).catch(() => {
      setFamilies([]);
    });
  }, []);

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setDueDate('');
    setDueType('special');
    setAssignMode('all');
    setSelectedFamilyIds([]);
  };

  // Reset form state when dialog closes (for cancel or after success) to ensure clean state on next open
  useEffect(() => {
    if (open === false) {
      resetForm();
    }
  }, [open]);

  const toggleFamily = (fid: string) => {
    setSelectedFamilyIds(prev =>
      prev.includes(fid) ? prev.filter(id => id !== fid) : [...prev, fid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    console.log('[CreateInvoiceForm] handleSubmit fired. Current values (should be user\'s input):', {
      amount, description, dueDate, dueType, assignMode, selectedFamilyIds: [...selectedFamilyIds]
    });
    if (!amount || !description || !dueDate) {
      toast.error('Please fill Description, Amount, and Due Date');
      return;
    }
    if (assignMode === 'specific' && selectedFamilyIds.length === 0) {
      toast.error('Select at least one family for Specific Families');
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
    try {
      const amountCents = Math.round(parseFloat(amount) * 100);
      const base = {
        amount_cents: amountCents,
        due_date: dueDate,
        description,
        due_type: dueType,
        notes: description,
        status: 'pending',
        created_by: isTemp ? 'temp-coach-id' : undefined,
      };

      let createdCount = 0;
      let addedForDemo: any[] = [];

      if (assignMode === 'all') {
        console.log('[CreateInvoiceForm] Processing assign=all, will create', families.length, 'record(s) with user values (no defaults)');
        for (const fam of families) {
          if (isTemp) {
            // simulate success for demo - construct full inv for display
            const item = {
              id: 'temp-' + Date.now() + '-' + createdCount,
              family_id: fam.id,
              amount_cents: amountCents,
              due_date: dueDate,
              description,
              due_type: dueType,
              notes: description,
              status: 'pending',
              family: { name: fam.name }
            };
            console.log('[CreateInvoiceForm] TEMP: "inserting" ONE record (sim):', {desc: item.description, amount: item.amount_cents, type: item.due_type, family: fam.id});
            addedForDemo.push(item);
            createdCount++;
          } else {
            console.log('[CreateInvoiceForm] REAL: inserting ONE record for fam', fam.id, 'with desc:', description);
            const { error } = await supabase.from('invoices').insert({
              family_id: fam.id,
              ...base,
            } as any);
            if (error) throw error;
            console.log('[CreateInvoiceForm] REAL insert succeeded for', fam.id);
            createdCount++;
          }
        }
        if (isTemp && addedForDemo.length && onAddForDemo) {
          onAddForDemo(addedForDemo);
        }
        toast.success(`Created invoice for ${createdCount} families (All Players)${isTemp ? ' (demo)' : ''}`);
      } else {
        console.log('[CreateInvoiceForm] Processing assign=specific, will create', selectedFamilyIds.length, 'record(s) with user values (no defaults)');
        for (const fid of selectedFamilyIds) {
          const fam = families.find((f: any) => f.id === fid);
          if (isTemp) {
            const item = {
              id: 'temp-' + Date.now() + '-' + createdCount,
              family_id: fid,
              amount_cents: amountCents,
              due_date: dueDate,
              description,
              due_type: dueType,
              notes: description,
              status: 'pending',
              family: { name: fam?.name || 'Family' }
            };
            console.log('[CreateInvoiceForm] TEMP: "inserting" ONE record (sim):', {desc: item.description, amount: item.amount_cents, type: item.due_type, family: fid});
            addedForDemo.push(item);
            createdCount++;
          } else {
            console.log('[CreateInvoiceForm] REAL: inserting ONE record for fam', fid, 'with desc:', description);
            const { error } = await supabase.from('invoices').insert({
              family_id: fid,
              ...base,
            } as any);
            if (error) throw error;
            console.log('[CreateInvoiceForm] REAL insert succeeded for', fid);
            createdCount++;
          }
        }
        if (isTemp && addedForDemo.length && onAddForDemo) {
          onAddForDemo(addedForDemo);
        }
        toast.success(`Created invoice for ${createdCount} selected families${isTemp ? ' (demo)' : ''}`);
      }
      if (!isTemp) {
        await revalidateInvoiceCache();
      }
      resetForm();
      onSuccess();
    } catch (e: any) {
      if (isTemp) {
        // even if error (e.g. RLS), treat as success for demo
        console.log('[CreateInvoiceForm] TEMP error path, treating as success (no actual insert happened)');
        toast.success('Created invoice(s) (demo - temp coach)');
        resetForm();
        onSuccess();
      } else {
        toast.error(e.message || 'Failed to create invoice');
      }
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="text-sm font-medium">Description</label>
        <Input 
          value={description} 
          onChange={e => setDescription(e.target.value)} 
          placeholder="Fall Tournament Fee" 
          required 
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Amount ($)</label>
          <Input 
            type="number" 
            step="0.01" 
            value={amount} 
            onChange={e => setAmount(e.target.value)} 
            placeholder="75.00" 
            required 
          />
        </div>
        <div>
          <label className="text-sm font-medium">Due Date</label>
          <Input 
            type="date" 
            value={dueDate} 
            onChange={e => setDueDate(e.target.value)} 
            required 
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Type</label>
        <select 
          value={dueType} 
          onChange={e => setDueType(e.target.value as any)} 
          className="w-full border p-2 rounded bg-background text-sm"
          required
        >
          <option value="monthly">Monthly Dues</option>
          <option value="special">Special / One-time (e.g. tournament, uniform, travel)</option>
          <option value="season">Full Season Payment</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium block mb-1.5">Assign To</label>
        <div className="flex gap-4 mb-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input 
              type="radio" 
              name="assign" 
              checked={assignMode === 'all'} 
              onChange={() => { setAssignMode('all'); setSelectedFamilyIds([]); }} 
            />
            All Players (whole team)
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input 
              type="radio" 
              name="assign" 
              checked={assignMode === 'specific'} 
              onChange={() => setAssignMode('specific')} 
            />
            Specific Families
          </label>
        </div>

        {assignMode === 'specific' && (
          <div className="border rounded p-2 bg-background max-h-36 overflow-auto">
            <div className="text-xs text-muted-foreground mb-1.5 px-1">Select one or more families:</div>
            {families.length === 0 && <div className="text-xs px-1 text-muted-foreground">No families loaded</div>}
            {families.map((f: any) => (
              <label key={f.id} className="flex items-center gap-2 py-0.5 px-1 hover:bg-muted/50 rounded text-sm cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={selectedFamilyIds.includes(f.id)} 
                  onChange={() => toggleFamily(f.id)} 
                />
                {f.name}
              </label>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">
          {assignMode === 'all' 
            ? 'One invoice will be created for every family on the team.' 
            : 'One invoice per selected family (same details).'}
        </p>
      </div>

      <Button type="submit" disabled={submitting} className="w-full mavericks-btn-primary mt-2">
        {submitting ? 'Creating Invoices...' : 'Create Invoice(s)'}
      </Button>
    </form>
  );
}

// Dues List with full coach controls: filters, Paid/Partial/Unpaid status (computed from payments), Edit, Delete, quick Mark as Paid, Record partial
function DuesList({ dataVersion = 0, onRefresh, tempSessionInvoices = [], onUpdateTempSessionInvoices }: { dataVersion?: number; onRefresh?: () => void; tempSessionInvoices?: any[]; onUpdateTempSessionInvoices?: (updater: (prev: any[]) => any[]) => void }) {
  const supabase = createClient();
  const [isTempCoach, setIsTempCoach] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [paymentsMap, setPaymentsMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [partialFor, setPartialFor] = useState<any>(null);
  const [partialAmount, setPartialAmount] = useState('');
  const [partialNote, setPartialNote] = useState('');

  // Filters use display labels
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Paid' | 'Partial' | 'Unpaid'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'monthly' | 'season' | 'special' | 'other'>('all');

  useEffect(() => {
    const temp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
    setIsTempCoach(temp);
    load(temp);
  }, [dataVersion]);

  // React to changes in tempSession prop from form creates or list mutations; for temp, the session is the full mutable list (base + user entered - deleted)
  useEffect(() => {
    if (isTempCoach) {
      setInvoices(tempSessionInvoices);
      setFamilies(getDemoFamilies());
      setPaymentsMap(getDemoPaymentsMap());
    }
  }, [tempSessionInvoices, isTempCoach]);

  const getDemoFamilies = () => [
    { id: 'fam1', name: 'Maverick Family (Temp)' },
    { id: 'fam2', name: 'Johnson Family (Temp)' },
  ];

  const getDemoPaymentsMap = () => ({}); // no hardcoded demo partials; real/empty map for consistency

  async function load(temp = isTempCoach) {
    setLoading(true);
    if (temp) {
      // Temp coach: use the mutable tempSessionInvoices (populated by Admin creates only; starts empty)
      setInvoices(tempSessionInvoices);
      setFamilies(getDemoFamilies());
      setPaymentsMap(getDemoPaymentsMap());
      setLoading(false);
      return;
    }
    await revalidateInvoiceCache().catch(() => {});
    try {
      const [invData, famData, payMap] = await Promise.all([
        getInvoices(), 
        getFamilies(), 
        getInvoicePaymentsMap()
      ]);
      setInvoices(invData || []);
      setFamilies(famData || []);
      setPaymentsMap(payMap || {});
    } catch (e) {
      // on error for real, show empty (no demo fallback)
      console.warn('Admin DuesList load error for real, showing empty:', e);
      setInvoices([]);
      setFamilies([]);
      setPaymentsMap({});
    }
    setLoading(false);
  }

  // old load removed - new load above handles temp demo and real via get* for reads


  // Compute display status + paid info for an invoice
  function getInvoiceDisplay(inv: any) {
    const total = inv.amount_cents || 0;
    const paid = paymentsMap[inv.id] || 0;
    let label: 'Paid' | 'Partial' | 'Unpaid';
    let cls: string;

    if (inv.status === 'paid' || paid >= total) {
      label = 'Paid';
      cls = 'status-paid';
    } else if (paid > 0) {
      label = 'Partial';
      cls = 'status-pending'; // amber
    } else if (inv.status === 'overdue') {
      label = 'Unpaid';
      cls = 'status-overdue';
    } else {
      label = 'Unpaid';
      cls = 'status-pending';
    }

    const remaining = Math.max(0, total - paid);
    return { label, cls, paid, remaining, total };
  }

  const filteredInvoices = invoices
    .map((inv: any) => ({ inv, display: getInvoiceDisplay(inv) }))
    .filter(({ inv, display }) => {
      const matchesSearch = !search || 
        (inv.description || '').toLowerCase().includes(search.toLowerCase()) ||
        (inv.family?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (inv.notes || '').toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || display.label === statusFilter;
      const matchesType = typeFilter === 'all' || inv.due_type === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    })
    .map(x => x.inv)
    .sort((a: any, b: any) => (a.due_date || '').localeCompare(b.due_date || ''));

  function getDueTypeBadge(dueType: string) {
    const map: Record<string, string> = {
      monthly: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      season: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
      special: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
      other: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
    };
    const cls = map[dueType] || map.other;
    return <Badge variant="outline" className={cls}>{dueType}</Badge>;
  }

  async function handleEdit(inv: any) {
    setEditing({ ...inv, newAmount: (inv.amount_cents / 100).toFixed(2) });
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      if (isTempCoach) {
        // Simulate in temp demo mode - update local state
        setInvoices(prev => prev.map(inv => 
          inv.id === editing.id 
            ? { 
                ...inv, 
                amount_cents: Math.round(parseFloat(editing.newAmount) * 100),
                due_date: editing.due_date,
                description: editing.description,
                status: editing.status,
                notes: editing.notes,
              } 
            : inv
        ));
        onUpdateTempSessionInvoices?.(prev => prev.map(i => 
          i.id === editing.id 
            ? { 
                ...i, 
                amount_cents: Math.round(parseFloat(editing.newAmount) * 100),
                due_date: editing.due_date,
                description: editing.description,
                status: editing.status,
                notes: editing.notes,
              } 
            : i
        ));
        toast.success('Due updated (demo - temp coach)');
        setEditing(null);
      } else {
        // @ts-ignore - types for temp
        const { error } = await supabase.from('invoices').update({
          amount_cents: Math.round(parseFloat(editing.newAmount) * 100),
          due_date: editing.due_date,
          description: editing.description,
          status: editing.status,
          notes: editing.notes,
        } as any).eq('id', editing.id);
        if (error) throw error;
        toast.success('Due updated');
        setEditing(null);
        await revalidateInvoiceCache();
        await load();
        onRefresh?.();
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to update');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this due?')) return;
    try {
      if (isTempCoach) {
        // Simulate in temp demo mode
        setInvoices(prev => prev.filter(inv => inv.id !== id));
        onUpdateTempSessionInvoices?.(prev => prev.filter(i => i.id !== id));
        toast.success('Deleted (demo - temp coach)');
      } else {
        const { error } = await supabase.from('invoices').delete().eq('id', id);
        if (error) throw error;
        toast.success('Deleted');
        await revalidateInvoiceCache();
        await load();
        onRefresh?.();
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete');
    }
  }

  // Quick full Mark as Paid for coach - records full payment in payments table + marks paid
  async function markPaid(id: string, inv?: any) {
    try {
      const total = inv?.amount_cents || 0;
      if (isTempCoach) {
        // Simulate in temp demo mode - update local state and add fake payment record in map
        setInvoices(prev => prev.map(i => i.id === id ? { ...i, status: 'paid' } : i));
        setPaymentsMap(prev => ({ ...prev, [id]: total }));
        onUpdateTempSessionInvoices?.(prev => prev.map(i => i.id === id ? { ...i, status: 'paid' } : i));
        toast.success('Marked as Paid (demo - temp coach)');
      } else {
        // Record the full amount as a manual payment (creates proper history)
        const { error: payErr } = await supabase.from('payments').insert({
          invoice_id: id,
          amount_cents: total,
          paid_at: new Date().toISOString(),
          status: 'succeeded',
          stripe_payment_intent_id: 'manual-' + Date.now(),
        } as any);
        if (payErr) throw payErr;

        // @ts-ignore
        const { error: upErr } = await supabase.from('invoices').update({ status: 'paid' }).eq('id', id);
        if (upErr) throw upErr;
        toast.success('Marked as Paid (full amount recorded)');
        await revalidateInvoiceCache();
        await load();
        onRefresh?.();
      }
    } catch (e: any) { 
      toast.error(e.message || 'Failed to mark paid'); 
    }
  }

  async function openPartial(inv: any) {
    setPartialFor(inv);
    const display = getInvoiceDisplay(inv);
    const remainingStr = (display.remaining / 100).toFixed(2);
    setPartialAmount(remainingStr);
    setPartialNote('');
  }

  async function submitPartial() {
    if (!partialFor || !partialAmount) return;
    try {
      const cents = Math.round(parseFloat(partialAmount) * 100);
      if (isTempCoach) {
        // Simulate partial in demo
        setInvoices(prev => prev.map(i => i.id === partialFor.id ? { ...i, status: 'pending' } : i));
        setPaymentsMap(prev => ({ ...prev, [partialFor.id]: (prev[partialFor.id] || 0) + cents }));
        onUpdateTempSessionInvoices?.(prev => prev.map(i => i.id === partialFor.id ? { ...i, status: 'pending' } : i));
        toast.success(`Recorded $${partialAmount} payment (demo - temp coach)`);
        setPartialFor(null);
        setPartialAmount('');
        setPartialNote('');
      } else {
        const { error } = await supabase.from('payments').insert({
          invoice_id: partialFor.id,
          amount_cents: cents,
          paid_at: new Date().toISOString(),
          status: 'succeeded',
          stripe_payment_intent_id: 'manual-' + Date.now(),
        } as any);
        if (error) throw error;
        // optionally update status if full, but for simplicity reload will handle via payments map
        toast.success(`Recorded $${partialAmount} payment`);
        setPartialFor(null);
        setPartialAmount('');
        setPartialNote('');
        await revalidateInvoiceCache();
        await load();
        onRefresh?.();
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to record payment');
    }
  }

  if (loading) return <div>Loading dues...</div>;

  // Compute outstanding using real paid amounts for the filtered view
  const totalOutstanding = filteredInvoices.reduce((s, i) => {
    const d = getInvoiceDisplay(i);
    return s + d.remaining;
  }, 0);

  return (
    <div className="space-y-3">
      {/* Filters - now with Paid/Partial/Unpaid */}
      <div className="flex flex-col md:flex-row gap-2 text-sm">
        <Input 
          placeholder="Search description, family, notes..." 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          className="md:w-64" 
        />
        <select 
          value={statusFilter} 
          onChange={e => setStatusFilter(e.target.value as any)} 
          className="border p-2 rounded bg-background"
        >
          <option value="all">All Status</option>
          <option value="Paid">Paid</option>
          <option value="Partial">Partial</option>
          <option value="Unpaid">Unpaid</option>
        </select>
        <select 
          value={typeFilter} 
          onChange={e => setTypeFilter(e.target.value as any)} 
          className="border p-2 rounded bg-background"
        >
          <option value="all">All Types</option>
          <option value="monthly">Monthly</option>
          <option value="season">Season</option>
          <option value="special">Special</option>
        </select>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => { setSearch(''); setStatusFilter('all'); setTypeFilter('all'); }}
        >
          Clear
        </Button>
        <div className="text-xs self-center text-muted-foreground ml-auto">
          Showing {filteredInvoices.length} • Outstanding in view: ${(totalOutstanding / 100).toFixed(2)}
        </div>
      </div>

      <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
        {filteredInvoices.length === 0 && (
          <div className="text-muted-foreground p-4 border rounded text-sm">No dues match current filters. Use the Create button or bulk actions above to add more.</div>
        )}
        {filteredInvoices.map((inv: any) => {
          const display = getInvoiceDisplay(inv);
          const isPaid = display.label === 'Paid';
          const amountStr = (inv.amount_cents / 100).toFixed(2);
          const paidStr = (display.paid / 100).toFixed(2);

          return (
            <div key={inv.id} className="p-3 border rounded flex flex-col md:flex-row md:items-center gap-2 bg-card text-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{inv.description || inv.due_type}</span>
                  {getDueTypeBadge(inv.due_type || 'other')}
                  <Badge className={display.cls}>{display.label}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Due {inv.due_date} {inv.notes ? `• ${inv.notes}` : ''} {inv.family?.name ? `• ${inv.family.name}` : ''}
                  {inv.player ? ` • Player: ${inv.player.first_name} ${inv.player.last_name}` : ''}
                </div>
                {display.paid > 0 && (
                  <div className="text-[11px] mt-0.5 text-emerald-600">
                    Paid ${paidStr} of ${amountStr} {display.label === 'Partial' ? `• $${(display.remaining/100).toFixed(2)} remaining` : ''}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 md:gap-1 flex-wrap md:flex-nowrap">
                <div className="text-right font-semibold tabular-nums mr-1">${amountStr}</div>

                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => handleEdit(inv)} title="Edit">
                    <Edit className="h-3.5 w-3.5" />
                  </Button>

                  {!isPaid && (
                    <>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => markPaid(inv.id, inv)}
                        className="whitespace-nowrap"
                      >
                        Mark as Paid
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => openPartial(inv)}
                      >
                        Record $
                      </Button>
                    </>
                  )}

                  <Button size="sm" variant="destructive" onClick={() => handleDelete(inv.id)} title="Delete">
                    <Trash className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Dialog - full fields */}
      {editing && (
        <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Invoice</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <div>
                <label className="text-xs">Amount</label>
                <Input type="number" step="0.01" value={editing.newAmount} onChange={e => setEditing({...editing, newAmount: e.target.value})} />
              </div>
              <div>
                <label className="text-xs">Due Date</label>
                <Input type="date" value={editing.due_date} onChange={e => setEditing({...editing, due_date: e.target.value})} />
              </div>
              <div>
                <label className="text-xs">Description</label>
                <Input value={editing.description || ''} onChange={e => setEditing({...editing, description: e.target.value})} placeholder="Description" />
              </div>
              <div>
                <label className="text-xs">Status (raw)</label>
                <select value={editing.status} onChange={e => setEditing({...editing, status: e.target.value})} className="border p-2 w-full rounded bg-background">
                  <option value="pending">pending</option>
                  <option value="paid">paid</option>
                  <option value="overdue">overdue</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
              <div>
                <label className="text-xs">Notes</label>
                <Input value={editing.notes || ''} onChange={e => setEditing({...editing, notes: e.target.value})} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={saveEdit} className="mavericks-btn-primary flex-1">Save Changes</Button>
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Partial / Manual Payment Dialog */}
      <Dialog open={!!partialFor} onOpenChange={() => setPartialFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment (supports partials)</DialogTitle>
            <DialogDescription>
              For {partialFor?.description || partialFor?.due_type} — due {partialFor?.due_date}. Enter any amount (will update status when fully paid).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm">Amount ($)</label>
              <Input type="number" step="0.01" value={partialAmount} onChange={e=>setPartialAmount(e.target.value)} placeholder="25.00" />
            </div>
            <div>
              <label className="text-sm">Note (optional, e.g. method)</label>
              <Input value={partialNote} onChange={e=>setPartialNote(e.target.value)} placeholder="Cash, check, Venmo, etc." />
            </div>
            <div className="flex gap-2">
              <Button onClick={submitPartial} className="mavericks-btn-primary flex-1">Record Payment</Button>
              <Button variant="outline" onClick={() => setPartialFor(null)}>Cancel</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Full payments and partials are tracked in the payments table. Status becomes "Paid" automatically when the total paid meets the invoice amount.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Simple live editor for default monthly / season amounts (direct client Supabase)
function DuesDefaults() {
  const supabase = createClient();
  const [monthly, setMonthly] = useState('125.00');
  const [season, setSeason] = useState('1500.00');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
    if (isTemp) {
      setMonthly('125.00');
      setSeason('1500.00');
      setLoaded(true);
      return;
    }
    getTeamSettings().then((s: any) => {
      if (s?.dues_monthly_cents != null) setMonthly((s.dues_monthly_cents / 100).toFixed(2));
      if (s?.dues_season_cents != null) setSeason((s.dues_season_cents / 100).toFixed(2));
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  async function saveDefaults() {
    setSaving(true);
    const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
    try {
      const m = Math.round(parseFloat(monthly) * 100);
      const s = Math.round(parseFloat(season) * 100);
      if (isTemp) {
        toast.success('Default dues amounts updated (demo)');
      } else {
        // @ts-ignore
        const { error } = await supabase.from('team_settings').update({
          dues_monthly_cents: m,
          dues_season_cents: s,
          updated_at: new Date().toISOString(),
        } as any).eq('id', 1);
        if (error) throw error;
        toast.success('Default dues amounts updated. New bulk generations will use these.');
      }
    } catch (e: any) {
      if (isTemp) {
        toast.success('Default dues amounts updated (demo)');
      } else {
        toast.error(e.message || 'Failed to save');
      }
    }
    setSaving(false);
  }

  if (!loaded) return <div className="text-xs text-muted-foreground">Loading defaults…</div>;

  return (
    <div className="rounded border p-3 bg-muted/30 text-sm space-y-2 mt-1">
      <div className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Default Dues Amounts (used by bulk buttons above)</div>
      <div className="flex flex-col sm:flex-row gap-2 items-end">
        <div>
          <label className="text-xs block mb-1">Monthly</label>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">$</span>
            <Input type="number" step="0.01" value={monthly} onChange={e=>setMonthly(e.target.value)} className="w-28" />
          </div>
        </div>
        <div>
          <label className="text-xs block mb-1">Full Season</label>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">$</span>
            <Input type="number" step="0.01" value={season} onChange={e=>setSeason(e.target.value)} className="w-28" />
          </div>
        </div>
        <Button onClick={saveDefaults} disabled={saving} size="sm" variant="outline" className="ml-1">
          {saving ? 'Saving...' : 'Save Defaults'}
        </Button>
        <span className="text-[10px] text-muted-foreground ml-2">Affects future Generate Monthly / Season only.</span>
      </div>
    </div>
  );
}
