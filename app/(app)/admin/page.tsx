"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from '@/lib/supabase/client';
import { toast } from "sonner";

interface SafeInvoice {
  id: string;
  family_id?: string;
  amount_cents: number;
  due_date: string;
  status?: string;
  description?: string;
  due_type?: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<SafeInvoice[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newInvoice, setNewInvoice] = useState({ amount: '', desc: '', due: '' });

  const supabase = React.useMemo(() => createClient(), []);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, family_id, amount_cents, due_date, status, description, due_type')
        .order('due_date', { ascending: true })
        .limit(100);

      if (error) throw error;
      setInvoices((data || []) as SafeInvoice[]);
    } catch (e: any) {
      console.warn('[Admin] invoices load failed:', e?.message);
      setLoadError('Could not load invoices.');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createInvoice = async () => {
    const amt = parseFloat(newInvoice.amount);
    if (!amt || !newInvoice.desc || !newInvoice.due) {
      toast.error('Fill amount, description and due date');
      return;
    }

    try {
      const { error } = await supabase.from('invoices').insert({
        amount_cents: Math.round(amt * 100),
        description: newInvoice.desc,
        due_date: newInvoice.due,
        status: 'pending',
        due_type: 'special',
      } as any);

      if (error) throw error;
      toast.success('Invoice created (minimal)');
      setNewInvoice({ amount: '', desc: '', due: '' });
      await load();
      router.refresh();
    } catch (e: any) {
      toast.error('Create failed: ' + (e.message || ''));
    }
  };

  if (loading) return <div className="p-6">Loading admin...</div>;

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {loadError && (
          <div className="p-4 bg-yellow-100 border border-yellow-400 rounded flex justify-between">
            <span>{loadError}</span>
            <button onClick={load} className="underline">Try Again</button>
          </div>
        )}

        <h1 className="text-3xl font-bold">Admin — Dues (Minimal Safe)</h1>

        <Card>
          <CardHeader><CardTitle>Quick Create Invoice</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Input type="number" placeholder="Amount $" value={newInvoice.amount} onChange={e => setNewInvoice(p => ({...p, amount: e.target.value}))} className="w-28" />
            <Input placeholder="Description" value={newInvoice.desc} onChange={e => setNewInvoice(p => ({...p, desc: e.target.value}))} />
            <Input type="date" value={newInvoice.due} onChange={e => setNewInvoice(p => ({...p, due: e.target.value}))} />
            <Button onClick={createInvoice}>Create</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoices ({invoices.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[480px] overflow-auto">
              {invoices.length === 0 && <div className="text-muted-foreground p-4">No invoices found.</div>}
              {invoices.map(inv => (
                <div key={inv.id} className="p-3 border rounded flex justify-between text-sm">
                  <div>
                    <div className="font-medium">{inv.description || 'Invoice'}</div>
                    <div className="text-xs text-muted">Due {inv.due_date} • ${(inv.amount_cents / 100).toFixed(2)}</div>
                  </div>
                  <div className="text-right text-xs">
                    {inv.status || 'pending'}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Minimal view. Use Try Again if data is missing.
            </div>
          </CardContent>
        </Card>

        <button onClick={() => { setLoadError(null); load(); }} className="text-sm underline">Refresh Data</button>
      </div>
    </ErrorBoundary>
  );
}
