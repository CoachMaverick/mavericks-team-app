import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

// This is a stub. Full implementation in Phase 6 (payments).
// It will verify the Stripe signature and update invoices + payments table.

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia", // or latest stable you are using
});

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed.", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Handle successful checkout
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const invoiceId = session.metadata?.invoice_id;

    if (invoiceId) {
      const supabase = await createClient();

      // Create payment record
      await supabase.from('payments').insert({
        invoice_id: invoiceId,
        amount_cents: session.amount_total || 0,
        paid_at: new Date().toISOString(),
        status: 'succeeded',
        stripe_payment_intent_id: session.payment_intent as string,
      } as any);

      // Update invoice (simplified for types)
      // @ts-ignore - types partial in temp setup
      await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoiceId);

      console.log(`Invoice ${invoiceId} marked paid via Stripe`);
    }
  }

  console.log(`Received Stripe event: ${event.type}`);

  return NextResponse.json({ received: true });
}
