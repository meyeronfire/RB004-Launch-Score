import type Stripe from "stripe";
import { activatePurchase, activateRefund, stripeClient, verifyStripeEvent } from "@/lib/payments";
import { trackPurchased } from "@/lib/analytics-server";
import { enqueuePaidPrompt } from "@/lib/paid-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET; const stripe = stripeClient();
  if (!secret || !stripe) return Response.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing Stripe signature." }, { status: 400 });
  if (Number(request.headers.get("content-length") ?? 0) > 1_000_000) return Response.json({ error: "Webhook payload is too large." }, { status: 413 });
  let raw = "";
  if (!request.body) return Response.json({ error: "Webhook payload is empty." }, { status: 400 });
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 1_000_000) { await reader.cancel(); return Response.json({ error: "Webhook payload is too large." }, { status: 413 }); } chunks.push(part.value); }
    raw = Buffer.concat(chunks.map((part) => Buffer.from(part))).toString("utf8");
  } catch { return Response.json({ error: "Webhook payload could not be read." }, { status: 400 }); }
  let event: Stripe.Event;
  try { event = verifyStripeEvent(stripe, raw, signature, secret); }
  catch { return Response.json({ error: "Stripe signature is invalid." }, { status: 400 }); }
  if (event.type === "checkout.session.completed") {
    try {
      const purchased = await activatePurchase(event, event.data.object as Stripe.Checkout.Session);
      if (purchased) {
        await trackPurchased();
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.scanId) await enqueuePaidPrompt(session.metadata.scanId);
      }
    }
    catch (error) { console.error("Verified Stripe event could not unlock a report:", error instanceof Error ? error.message : "Unknown error"); return Response.json({ error: "Purchase processing will be retried." }, { status: 500 }); }
  }
  if (event.type === "charge.refunded") {
    try { await activateRefund(event, event.data.object as Stripe.Charge); }
    catch (error) { console.error("Verified Stripe refund could not revoke report access:", error instanceof Error ? error.message : "Unknown error"); return Response.json({ error: "Refund processing will be retried." }, { status: 500 }); }
  }
  return Response.json({ received: true });
}
