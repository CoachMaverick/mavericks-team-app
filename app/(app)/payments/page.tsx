"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  getMyInvoices, 
  createStripeCheckout, 
  getPaymentHistory,
  revalidateInvoiceCache,
  confirmStripePayment,
  getInvoicePaymentsMap,
} from '@/lib/actions';
import { createClient } from '@/lib/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle } from "lucide-react";

interface Invoice {
  id: string;
  family_id: string;
  amount_cents: number;
  due_date: string;
  status: string;
  description: string | null;
  due_type: string;
  notes: string | null;
  created_at: string;
  family?: { name: string };
  player?: { first_name: string; last_name: string };
}

interface PaymentHistoryItem {
  id: string;
  amount_cents: number;
  paid_at: string;
  status: string | null;
  invoice?: { description?: string | null; due_type?: string; due_date?: string; family?: { name?: string } };
}

function PaymentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [history, setHistory] = useState<PaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);

  // For accurate partial payment tracking + remaining balances (real from DB or LS for temp)
  const [paymentsMap, setPaymentsMap] = useState<Record<string, number>>({});

  // Partial / manual payment dialog (for coaches + parents)
  const [partialFor, setPartialFor] = useState<Invoice | null>(null);
  const [partialAmount, setPartialAmount] = useState('');
  const [partialNote, setPartialNote] = useState('');

  // For temp mode display
  const mockFamilyName = 'Maverick Family (Temp)';

  useEffect(() => {
    loadInvoices();
    loadHistory();
    loadPaymentsMap();
  }, []);

  // Handle Stripe success/cancel redirect
  useEffect(() => {
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');
    const sessionId = searchParams.get('session_id');

    if (success === 'true' && sessionId) {
      // New flow uses dedicated /payments/success page for nice branded confirmation + details.
      // Still run confirm here for side-effects (marks paid server-side / LS), then redirect.
      // Old ?success links will gracefully forward.
      toast.success('Payment successful! Redirecting to confirmation...');
      (async () => {
        let paidInvoiceId: string | null = null;
        try {
          const result = await confirmStripePayment(sessionId);
          paidInvoiceId = result?.invoiceId || null;
        } catch (err) {
          console.error('Confirm payment error (webhook may handle it):', err);
        }
        await loadInvoices();
        await loadHistory();
        await loadPaymentsMap();

        // Legacy: ensure temp LS invoice marked (for old direct /payments?success links)
        const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
        const targetId = paidInvoiceId || sessionId;
        if (isTemp && targetId) {
          const saved = localStorage.getItem('mavericks-demo-invoices');
          if (saved) {
            let list: any[] = JSON.parse(saved);
            let changed = false;
            list = list.map((i: any) => {
              if (i.id === targetId && i.status !== 'paid') {
                changed = true;
                return { ...i, status: 'paid' };
              }
              return i;
            });
            if (changed) {
              localStorage.setItem('mavericks-demo-invoices', JSON.stringify(list));
              setInvoices(list);
            }
          }
        }

        // Go to the nice success page (it will also confirm + show details + update demo payments LS if needed)
        router.replace(`/payments/success?session_id=${sessionId}`);
      })();
    } else if (canceled) {
      const url = new URL(window.location.href);
      url.searchParams.delete('canceled');
      window.history.replaceState({}, '', url.toString());
      toast.error('Payment canceled.');
    }
  }, [searchParams]);

  // Always get fresh data on window focus (in addition to manual refresh and post-mutation loads)
  useEffect(() => {
    const onFocus = () => {
      loadInvoices();
      loadHistory();
      loadPaymentsMap();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const refreshAll = () => {
    router.refresh();
    // also trigger server cache invalidation if any (helps for RSC parts)
    revalidateInvoiceCache().catch(() => {});
    // force reload fresh data in this client page
    loadInvoices();
    loadHistory();
    loadPaymentsMap();
  };

  async function loadInvoices() {
    setLoading(true);
    const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
    if (isTemp) {
      // Always load fresh from shared LS for temp demo (reflects Admin creates/deletes)
      // Start empty if no saved; new creates from Admin populate LS (truly empty until created).
      let list: any[] = [];
      const saved = localStorage.getItem('mavericks-demo-invoices');
      if (saved) {
        list = JSON.parse(saved);
      }
      // Merge any real DB invoices (queryable via service role in temp for coach testing / real flow).
      try {
        const real = await getMyInvoices();
        if (real && real.length) {
          const seen = new Set(list.map((i: any) => i.id));
          for (const r of real) {
            if (!seen.has(r.id)) {
              list.push(r);
              seen.add(r.id);
            }
          }
        }
      } catch (e) {
        console.log('[payments load] real merge skipped (expected in pure temp)');
      }
      setInvoices(list);
      setLoading(false);
      return;
    }
    await revalidateInvoiceCache().catch(() => {});
    try {
      const data = await getMyInvoices();
      setInvoices(data || []);
    } catch (e) {
      console.warn('Failed to load invoices for real user, showing empty:', e);
      setInvoices([]);
    }
    setLoading(false);
  }

  async function loadHistory() {
    setLoadingHistory(true);
    await revalidateInvoiceCache().catch(() => {});
    try {
      const h = await getPaymentHistory(15);
      setHistory(h || []);
    } catch {
      setHistory([]);
    }
    setLoadingHistory(false);
  }

  async function loadPaymentsMap() {
    const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
    if (isTemp) {
      const saved = localStorage.getItem('mavericks-demo-payments');
      const map: Record<string, number> = {};
      if (saved) {
        const pays: any[] = JSON.parse(saved);
        pays.forEach((p: any) => {
          if (p.invoice_id) {
            map[p.invoice_id] = (map[p.invoice_id] || 0) + (p.amount_cents || 0);
          }
        });
      }
      setPaymentsMap(map);
      return;
    }
    try {
      // getInvoicePaymentsMap is global but works for our family view too (privileged under temp)
      const m = await getInvoicePaymentsMap();
      setPaymentsMap(m || {});
    } catch {
      setPaymentsMap({});
    }
  }

  // Compute paid so far + nice display status (Paid / Partial / Unpaid) using real paymentsMap (supports partials)
  function getInvoiceDisplay(inv: Invoice) {
    const total = inv.amount_cents || 0;
    const paidFromMap = paymentsMap[inv.id] || 0;
    // Fallback: if status says paid but no map entry yet (e.g. legacy full mark), treat as full.
    const paid = paidFromMap > 0 ? paidFromMap : (inv.status === 'paid' ? total : 0);
    let label: 'Paid' | 'Partial' | 'Unpaid';
    let cls: string;

    if (inv.status === 'paid' || paid >= total) {
      label = 'Paid';
      cls = 'status-paid';
    } else if (paid > 0) {
      label = 'Partial';
      cls = 'status-pending';
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

  const totalOwed = invoices
    .reduce((sum, i) => sum + getInvoiceDisplay(i).remaining, 0);

  const upcoming = [...invoices]
    .filter(i => i.status === 'pending')
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const displayStatuses = invoices.map(i => getInvoiceDisplay(i).label);
  const paidCount = displayStatuses.filter(s => s === 'Paid').length;
  const pendingCount = displayStatuses.filter(s => s !== 'Paid').length;

  async function handlePay(invoiceId: string) {
    console.log('[payments] handlePay(Pay Now) called with invoiceId:', invoiceId, 'from row in list');
    setPayingId(invoiceId);
    try {
      const inv = invoices.find(x => x.id === invoiceId);
      // Compute remaining using paymentsMap for true partial support.
      const paidSoFar = paymentsMap[invoiceId] || 0;
      const remaining = Math.max(0, (inv?.amount_cents || 0) - paidSoFar);
      if (remaining <= 0) {
        toast.info('This invoice is already fully paid.');
        setPayingId(null);
        return;
      }
      // Pass snapshot (incl. pay_amount_cents for partial/remaining + email for Stripe receipt)
      // so createStripeCheckout can build a real hosted Checkout Session even for temp/LS-only invoices.
      // Build rich snapshot so server can always pass accurate parent email + name to Stripe for prefill.
      // In real authenticated cases, the logged-in user's email (from auth) will be preferred in the action.
      // For demo/temp, we provide sensible fallbacks based on roster data.
      const customerName = [
        inv?.player?.first_name,
        inv?.player?.last_name,
      ].filter(Boolean).join(' ') || inv?.family?.name || undefined;

      // Prefer any email already on the invoice row (from DB/family load) or snapshot; otherwise demo.
      // The server action will further prefer invoice/family data + current auth user.
      const rowEmail = (inv as any)?.email || (inv as any)?.family?.email || null;

      const snapshot = inv ? {
        amount_cents: inv.amount_cents,
        description: inv.description,
        due_date: inv.due_date,
        family_name: inv.family?.name,
        pay_amount_cents: remaining,                    // charge only what's still owed (enables partial via card)
        email: rowEmail || 'parent@mavericksbaseball.test',
        customer_name: customerName,
      } : undefined;
      const res = await createStripeCheckout(invoiceId, snapshot);
      console.log('[payments] createStripeCheckout result for', invoiceId, ':', res);
      if (res?.url) {
        console.log('[payments] redirecting to real Stripe hosted Checkout for invoice', invoiceId);
        window.location.href = res.url;
      } else {
        // Demo fallback (no Stripe key). Current success handling (redirect + ?success + confirm) is used for real hosted payments.
        toast.success('Demo: Payment simulated (no real charge)');
        const supabase = createClient();
        const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
        const amt = inv ? inv.amount_cents : 0;
        if (isTemp) {
          const updatedList = invoices.map(i => i.id === invoiceId ? { ...i, status: 'paid' } : i);
          setInvoices(updatedList);
          localStorage.setItem('mavericks-demo-invoices', JSON.stringify(updatedList));
          refreshAll();
        } else {
          if (inv) {
            const { error: payErr } = await supabase.from('payments').insert({
              invoice_id: invoiceId,
              amount_cents: amt,
              paid_at: new Date().toISOString(),
              status: 'succeeded',
              stripe_payment_intent_id: 'demo-' + Date.now(),
            } as any);
            if (payErr) console.warn('demo payments insert err:', payErr.message);
            // @ts-ignore
            const { error: invErr } = await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoiceId);
            if (invErr) console.warn('demo invoice update err:', invErr.message);
          }
          await revalidateInvoiceCache().catch(() => {});
          await loadInvoices();
          await loadHistory();
          refreshAll();
        }
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to initiate payment');
    }
    setPayingId(null);
  }

  // Coach/demo quick complete (hidden or shown for testing; real parents won't see this often)
  async function markAsPaid(invoiceId: string) {
    const supabase = createClient();
    const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
    try {
      const inv = invoices.find(x => x.id === invoiceId);
      if (isTemp) {
        // simulate and persist to shared LS so Admin sees too
        const updatedList = invoices.map(i => i.id === invoiceId ? { ...i, status: 'paid' } : i);
        setInvoices(updatedList);
        localStorage.setItem('mavericks-demo-invoices', JSON.stringify(updatedList));
        await revalidateInvoiceCache().catch(() => {});
        toast.success('Marked as paid (coach override / demo)');
        refreshAll();
      } else {
        // @ts-ignore
        const { error: upErr } = await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoiceId);
        if (upErr) throw upErr;
        if (inv) {
          await supabase.from('payments').insert({
            invoice_id: invoiceId,
            amount_cents: inv.amount_cents,
            paid_at: new Date().toISOString(),
            status: 'succeeded',
            stripe_payment_intent_id: 'manual-' + Date.now(),
          } as any);
        }
        await revalidateInvoiceCache().catch(() => {});
        toast.success('Marked as paid (coach override)');
        await loadInvoices();
        await loadHistory();
        refreshAll();
      }
    } catch (e: any) {
      if (isTemp) {
        setInvoices(prev => prev.map(i => i.id === invoiceId ? { ...i, status: 'paid' } : i));
        toast.success('Marked as paid (coach override / demo)');
        await loadInvoices();
        await loadHistory();
        refreshAll();
      } else {
        toast.error(e.message || 'Failed to mark paid');
      }
    }
  }

  // Partial / manual / offline payment recording (available to parents + coaches in this view)
  function openPartial(inv: Invoice) {
    const display = getInvoiceDisplay(inv);
    const remStr = (display.remaining / 100).toFixed(2);
    setPartialFor(inv);
    setPartialAmount(remStr);
    setPartialNote('');
  }

  async function submitPartial() {
    if (!partialFor || !partialAmount) return;
    const cents = Math.round(parseFloat(partialAmount) * 100);
    if (cents <= 0) {
      toast.error('Enter a positive amount');
      return;
    }
    const supabase = createClient();
    const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
    const targetId = partialFor.id;
    try {
      if (isTemp) {
        // Update in-memory map + persist demo payments to LS (so balances survive refresh/nav and can be seen in admin too if extended)
        setPaymentsMap(prev => ({ ...prev, [targetId]: (prev[targetId] || 0) + cents }));
        let pays: any[] = [];
        const savedP = localStorage.getItem('mavericks-demo-payments');
        if (savedP) pays = JSON.parse(savedP);
        pays.push({
          id: 'demopay-' + Date.now(),
          invoice_id: targetId,
          amount_cents: cents,
          paid_at: new Date().toISOString(),
          status: 'succeeded',
          stripe_payment_intent_id: 'manual-' + Date.now(),
          notes: partialNote || null,
        });
        localStorage.setItem('mavericks-demo-payments', JSON.stringify(pays));
        toast.success(`Recorded $${partialAmount} payment (demo / partial)`);
      } else {
        const { error } = await supabase.from('payments').insert({
          invoice_id: targetId,
          amount_cents: cents,
          paid_at: new Date().toISOString(),
          status: 'succeeded',
          stripe_payment_intent_id: 'manual-' + Date.now(),
        } as any);
        if (error) throw error;
        await revalidateInvoiceCache().catch(() => {});
        toast.success(`Recorded $${partialAmount} payment`);
      }
      setPartialFor(null);
      setPartialAmount('');
      setPartialNote('');
      await loadInvoices();
      await loadHistory();
      await loadPaymentsMap();
      refreshAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to record payment');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Payments &amp; Dues</h1>
        <p className="text-muted-foreground">View your family dues, balances, and pay securely via Stripe.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="mavericks-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-500">${(totalOwed / 100).toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{upcoming.length} upcoming dues</p>
          </CardContent>
        </Card>
        <Card className="mavericks-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Next Due</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming[0] ? (
              <>
                <div className="text-xl font-semibold truncate">{upcoming[0].description || upcoming[0].due_type}</div>
                <div className="text-sm">${(upcoming[0].amount_cents / 100).toFixed(2)} • due {new Date(upcoming[0].due_date).toLocaleDateString()}</div>
              </>
            ) : (
              <div className="text-muted-foreground">No upcoming dues</div>
            )}
          </CardContent>
        </Card>
        <Card className="mavericks-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="status-paid">Paid: {paidCount}</Badge>
              <Badge variant="outline" className="status-pending">Open: {pendingCount}</Badge>
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={loadInvoices} variant="outline" size="sm">Refresh Dues</Button>
              <Button onClick={loadHistory} variant="ghost" size="sm">Refresh History</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dues / Invoices list */}
      <Card className="mavericks-card">
        <CardHeader>
          <CardTitle>Your Dues &amp; Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>Loading dues...</div>
          ) : invoices.length === 0 ? (
            <div className="text-muted-foreground">No dues yet. Your coach will add monthly, season, or special fees.</div>
          ) : (
            <div className="space-y-3">
              {invoices.map((inv) => {
                const display = getInvoiceDisplay(inv);
                const isPaid = display.label === 'Paid';
                const paidSoFar = display.paid;
                const remaining = display.remaining;
                return (
                  <div key={inv.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg bg-card gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        {inv.description || inv.due_type}
                        {inv.player && <span className="text-xs px-1.5 py-0.5 rounded bg-muted">for {inv.player.first_name}</span>}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Due: {new Date(inv.due_date).toLocaleDateString()} {inv.notes ? `• ${inv.notes}` : ''}
                      </div>
                      <div className="text-xs mt-0.5 text-muted-foreground">
                        Family: {inv.family?.name || mockFamilyName} {inv.due_type ? `• ${inv.due_type}` : ''}
                      </div>
                      {/* Always show balance for transparency with partial payments */}
                      <div className="text-xs mt-1 text-emerald-600">
                        Paid so far: ${(paidSoFar/100).toFixed(2)} • Remaining ${(remaining/100).toFixed(2)}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mt-1 md:mt-0">
                      <div className="text-right">
                        <div className="font-semibold tabular-nums">${(inv.amount_cents / 100).toFixed(2)}</div>
                        <Badge className={display.cls}>
                          {display.label}
                        </Badge>
                      </div>

                      {!isPaid && (
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => handlePay(inv.id)} 
                            disabled={payingId === inv.id}
                            className="mavericks-btn-primary"
                            size="sm"
                          >
                            {payingId === inv.id ? 'Processing...' : 'Pay Now (Stripe)'}
                          </Button>
                          {/* Partial / manual / offline payment (parents + coaches) */}
                          <Button onClick={() => openPartial(inv)} variant="outline" size="sm">
                            Record Payment
                          </Button>
                          {/* Coach/demo helper - visible to allow testing overrides */}
                          <Button onClick={() => markAsPaid(inv.id)} variant="outline" size="sm">
                            Mark Paid (Coach)
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Real-ish Payment History */}
      <Card className="mavericks-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Payment History
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? 'Hide' : 'Show'}
            </Button>
          </CardTitle>
        </CardHeader>
        {showHistory && (
          <CardContent>
            {loadingHistory ? (
              <div className="text-sm text-muted-foreground">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="text-sm text-muted-foreground">No payment records yet. Paid invoices and manual coach entries will appear here.</div>
            ) : (
              <div className="space-y-2 text-sm">
                {history.map((p: any) => (
                  <div key={p.id} className="flex justify-between border-b pb-1 last:border-none last:pb-0">
                    <div>
                      {p.invoice?.description || p.invoice?.due_type || 'Payment'} 
                      <span className="text-muted-foreground"> • {p.invoice?.family?.name || ''}</span>
                    </div>
                    <div className="text-right tabular-nums">
                      ${(p.amount_cents / 100).toFixed(2)} <span className="text-xs text-muted-foreground">on {new Date(p.paid_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">History loaded from the payments table.</p>
          </CardContent>
        )}
      </Card>

      <p className="text-xs text-center text-muted-foreground">
        Payments processed securely via Stripe (one-time Checkout). Partial payments supported (record offline/cash or pay remaining via Stripe). Recurring Stripe subscriptions planned for a future update.
      </p>

      {/* Partial Payment Dialog (used by both parents on this page and coaches) */}
      <Dialog open={!!partialFor} onOpenChange={() => setPartialFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Partial / Manual Payment</DialogTitle>
            <DialogDescription>
              For {partialFor?.description || partialFor?.due_type} — due {partialFor?.due_date}. Enter any amount up to the remaining balance (cash, Venmo, partial, etc.).
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
            <p className="text-[11px] text-muted-foreground">This will be recorded against the invoice and update your remaining balance immediately.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading payments...</div>}>
      <PaymentsContent />
    </Suspense>
  );
}
