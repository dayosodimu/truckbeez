import type { Request, Response } from "express";
import Stripe from "stripe";
import { PLANS } from "./plans.js";
import { FleetError, updateSubscription } from "./store.js";
import type { Org, SubscriptionStatus } from "./types.js";

/**
 * Fleet plans are sold to businesses through Stripe Checkout in the browser, not as an
 * in-app purchase. Confirm this with App Store Review Guideline 3.1.3 (business services)
 * and Google Play billing policy before launch.
 *
 * With no STRIPE_SECRET_KEY the server runs in demo billing mode: checkout activates instantly.
 */
let stripe: Stripe | null = null;
function client(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripe ??= new Stripe(key);
  return stripe;
}

export async function startCheckout(org: Org, seats: number): Promise<{ url: string | null; demo: boolean }> {
  const plan = PLANS[org.plan];
  if (org.plan === "enterprise") throw new FleetError(400, "Enterprise plans are set up with our sales team.");
  if (seats > plan.maxDrivers) throw new FleetError(400, `${plan.name} allows up to ${plan.maxDrivers} drivers.`);

  const s = client();
  if (!s) {
    updateSubscription(org.id, { status: "active", seats });
    return { url: null, demo: true };
  }

  const price = plan.stripePriceEnv ? process.env[plan.stripePriceEnv] : undefined;
  if (!price) throw new FleetError(500, `Set ${plan.stripePriceEnv} to the Stripe price ID for ${plan.name}.`);
  const base = process.env.APP_URL ?? "https://truckbeez.app";

  const session = await s.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: seats }],
    client_reference_id: org.id,
    metadata: { orgId: org.id },
    subscription_data: { metadata: { orgId: org.id } },
    success_url: `${base}/fleet/billing/success`,
    cancel_url: `${base}/fleet/billing/cancel`,
  });
  return { url: session.url, demo: false };
}

/** Mounted with express.raw() so the Stripe signature can be verified against the exact body. */
export function stripeWebhook(req: Request, res: Response) {
  const s = client();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return res.status(503).send("Billing isn't configured.");

  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(req.body as Buffer, req.header("stripe-signature") ?? "", secret);
  } catch {
    return res.status(400).send("Webhook signature check failed.");
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const orgId = session.client_reference_id;
      if (orgId) {
        updateSubscription(orgId, {
          status: "active",
          stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
          stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
        });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const orgId = sub.metadata?.orgId;
      if (orgId) updateSubscription(orgId, { status: mapStatus(sub.status), seats: sub.items.data[0]?.quantity ?? undefined });
      break;
    }
  }
  res.json({ received: true });
}

function mapStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due" || s === "unpaid" || s === "incomplete") return "past_due";
  return "canceled";
}
