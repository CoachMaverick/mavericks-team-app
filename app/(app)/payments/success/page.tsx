"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createClient } from '@/lib/supabase/client';
import { confirmStripePayment, getMyInvoices, revalidateInvoiceCache } from '@/lib/actions';
import { CheckCircle, ArrowLeft, Home } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";

interface SuccessDetails {
  invoiceId: string | null;
  amountPaidCents: number;
  invoice: any;
  paidAt: string;
}

function PaymentsSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<SuccessDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (!sessionId) {
      setError('No payment session provided.');
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Confirm / record the payment server-side (idempotent, safe to call again)
        const result = await confirmStripePayment(sessionId);
        const invoiceId = result?.invoiceId || null;
        const amountPaidCents = (result as any)?.amountPaidCents || 0;

        // Try to get invoice details (works for real DB rows via privileged reads under temp)
        let foundInvoice: any = null;
        try {
          const invs = await getMyInvoices();
          foundInvoice = invs?.find((i: any) => i.id === invoiceId) || null;
        } catch {}

        // For temp/demo virtual invoices not in DB, fall back to shared LS (set by Admin or previous loads)
        const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
        if (!foundInvoice && isTemp && invoiceId) {
          const saved = localStorage.getItem('mavericks-demo-invoices');
          if (saved) {
            const list = JSON.parse(saved);
            foundInvoice = list.find((i: any) => i.id === invoiceId) || null;
          }
        }

        // Also ensure the demo-payments LS has an entry for this payment so balances are accurate on return to list
        if (isTemp && invoiceId && amountPaidCents > 0) {
          let pays: any[] = [];
          const savedP = localStorage.getItem('mavericks-demo-payments');
          if (savedP) pays = JSON.parse(savedP);
          // Avoid duplicate if confirm already pushed (simple check by intent id or recent)
          const already = pays.some((p: any) => p.stripe_payment_intent_id?.includes(sessionId.slice(-8)) || p.invoice_id === invoiceId && Math.abs((p.amount_cents||0) - amountPaidCents) < 10);
          if (!already) {
            pays.push({
              id: 'stripe-success-' + Date.now(),
              invoice_id: invoiceId,
              amount_cents: amountPaidCents,
              paid_at: new Date().toISOString(),
              status: 'succeeded',
              stripe_payment_intent_id: 'stripe-' + sessionId,
            });
            localStorage.setItem('mavericks-demo-payments', JSON.stringify(pays));
          }
        }

        // If we have a real invoice id, best-effort revalidate so other views see the update
        if (invoiceId && !isTemp) {
          await revalidateInvoiceCache().catch(() => {});
        }

        setDetails({
          invoiceId,
          amountPaidCents,
          invoice: foundInvoice,
          paidAt: new Date().toISOString(),
        });

        // Friendly toast
        toast.success('Payment recorded successfully!');
      } catch (e: any) {
        console.error('Success page load error:', e);
        setError(e?.message || 'Could not load payment confirmation.');
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  const mockFamily = 'Maverick Family (Temp)';

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="animate-pulse text-2xl">Processing your payment confirmation...</div>
          <p className="text-muted-foreground text-sm">Just a moment while we fetch the details.</p>
        </div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="max-w-xl mx-auto p-6 text-center space-y-4">
        <TeamLogo size="lg" className="mx-auto" />
        <h1 className="text-2xl font-bold">Payment Confirmation</h1>
        <p className="text-destructive">{error || 'Unable to load confirmation.'}</p>
        <div className="flex gap-2 justify-center">
          <Button onClick={() => router.push('/payments')} variant="outline">Back to Payments</Button>
          <Button onClick={() => router.push('/dashboard')}>Go to Dashboard</Button>
        </div>
      </div>
    );
  }

  const { invoice, amountPaidCents, invoiceId } = details;
  const paidDisplay = (amountPaidCents / 100).toFixed(2);
  const original = invoice ? (invoice.amount_cents / 100).toFixed(2) : null;
  const isPartial = invoice && amountPaidCents < (invoice.amount_cents || 0);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <TeamLogo size="md" />
        <div>
          <div className="text-xl font-bold tracking-tight">Mavericks 12U</div>
          <div className="text-xs text-muted-foreground -mt-1">Travel Baseball</div>
        </div>
      </div>

      <Card className="mavericks-card border-green-500/40 shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-10 w-10 text-green-500" />
            <div>
              <CardTitle className="text-2xl text-green-600 dark:text-green-400">Payment Confirmed!</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">Thank you — your dues have been received.</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-2">
          <div className="rounded-lg bg-green-500/5 p-4 text-sm">
            <div className="font-medium">Amount Paid</div>
            <div className="text-3xl font-semibold tabular-nums text-green-600 dark:text-green-400">${paidDisplay}</div>
            {isPartial && original && (
              <div className="text-xs mt-1 text-muted-foreground">Partial payment toward original ${original} invoice</div>
            )}
            <div className="text-[10px] text-muted-foreground mt-1">Session: {sessionId?.slice(0, 12)}...</div>
          </div>

          {invoice ? (
            <div className="border rounded-md p-3 text-sm bg-card/50">
              <div className="font-medium mb-1">{invoice.description || invoice.due_type || 'Invoice'}</div>
              <div className="text-muted-foreground">
                Due: {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '—'}
                {invoice.due_type ? ` • ${invoice.due_type}` : ''}
              </div>
              {invoice.family?.name && (
                <div className="mt-1">Family: {invoice.family.name}</div>
              )}
              {invoice.notes && <div className="text-xs mt-0.5">Note: {invoice.notes}</div>}
              {original && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Original invoice: ${original} {isPartial ? `(you paid a partial amount via Stripe)` : ''}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground border rounded p-3">
              Invoice #{invoiceId ? invoiceId.slice(0,8) : '—'}<br />
              Details will appear in your payments list.
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            A receipt has been automatically emailed by Stripe to the address on file (or the one associated with this payment method).
            You can also view full details in your Stripe dashboard or the payment history below.
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            <Button onClick={() => router.push('/payments')} className="flex-1" variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Payments &amp; Dues
            </Button>
            <Button onClick={() => router.push('/dashboard')} className="flex-1 mavericks-btn-primary">
              <Home className="mr-2 h-4 w-4" /> Go to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-[10px] text-muted-foreground">
        Mavericks 12U • Secure payments powered by Stripe. Questions? Contact your coach.
      </p>
    </div>
  );
}

export default function PaymentsSuccessPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-muted-foreground">Loading payment confirmation...</div>}>
      <PaymentsSuccessContent />
    </Suspense>
  );
}
