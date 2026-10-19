import Stripe from 'stripe';
import { getAuthedEmail, rateLimit, clientIp, ADMIN_EMAIL } from './_auth.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Same price IDs already used in the webhook — kept in sync with your 3 paid plans.
// Live-mode and test-mode price IDs are different. The right set is chosen automatically
// from the Stripe secret key in use (sk_live_... = live, sk_test_... = test).
const IS_LIVE = (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live');
const PLAN_TO_PRICE = IS_LIVE
  ? {
      PLUS: 'price_1UQ4iyHLYDiifWD0nUD0UD0b', // $99/yr (live)
      COMPLETE: 'price_1UQ4isHLYDiifWD0gECGf3UV', // $129/yr (live)
    }
  : {
      ESSENTIALS: 'price_1UG2LzHLYDiifWD02VO6IRh5',
      PLUS: 'price_1UPkG8HLYDiifWD0pUkgcorp', // $99/yr (test)
      COMPLETE: 'price_1UPkKXHLYDiifWD01rgtclTB', // $129/yr (test)
    };

export default async function handler(req, res) {
  const ALLOWED_ORIGINS = ['https://cyclecpe.com', 'https://www.cyclecpe.com', 'https://cyclecpe.vercel.app'];
  if (req.headers.origin && ALLOWED_ORIGINS.includes(req.headers.origin)) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Only a logged-in user may change a plan, and only their own (the admin may change any).
  const authedEmail = await getAuthedEmail(req);
  if (!authedEmail) return res.status(401).json({ error: 'Please log in again to change your plan.' });
  if (!rateLimit('plan:' + authedEmail, 10, 60 * 60 * 1000) || !rateLimit('planip:' + clientIp(req), 30, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many plan changes. Please try again later.' });
  }

  const { email, newPlan } = req.body || {};
  if (email && authedEmail !== String(email).toLowerCase() && authedEmail !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'You can only change your own plan.' });
  }
  if (!email || !newPlan || (newPlan !== 'FREE' && !PLAN_TO_PRICE[newPlan])) {
    return res.status(400).json({ error: 'A valid email and newPlan (FREE, PLUS, or COMPLETE) are required.' });
  }

  try {
    // Find the Stripe customer by email
    const customers = await stripe.customers.list({ email: email.toLowerCase(), limit: 1 });
    if (!customers.data.length) {
      return res.status(404).json({ error: 'No Stripe customer found for that email. They may not have an active subscription yet.' });
    }
    const customer = customers.data[0];

    // Find their active subscription
    const subscriptions = await stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 1 });
    if (!subscriptions.data.length) {
      return res.status(404).json({ error: 'No active subscription found for this customer. Use the regular pricing table to subscribe first.' });
    }
    const subscription = subscriptions.data[0];
    const currentItem = subscription.items.data[0];

    // Switching to FREE = cancel the paid subscription at the end of the period they
    // already paid for. The webhook's customer.subscription.deleted event then sets the
    // plan to FREE in Supabase when that date arrives.
    if (newPlan === 'FREE') {
      const updatedFree = await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
      const endDate = new Date(updatedFree.current_period_end * 1000);
      await sendPlanConfirmationEmail(email, 'FREE', endDate);
      return res.status(200).json({
        message: `Your paid plan will end on ${endDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} and your account will switch to Free. You keep full access until then.`,
        endsAt: endDate.toISOString(),
      });
    }

    const newPriceId = PLAN_TO_PRICE[newPlan];

    if (currentItem.price.id === newPriceId) {
      return res.status(200).json({ message: 'Already on this plan — no change needed.' });
    }

    // Swap the price: only charge the prorated difference, and reset the billing
    // anchor to today so the new cycle starts fresh from the upgrade date.
    const updated = await stripe.subscriptions.update(subscription.id, {
      items: [{ id: currentItem.id, price: newPriceId }],
      proration_behavior: 'create_prorations',
      billing_cycle_anchor: 'now',
      cancel_at_period_end: false, // also reverses a pending switch-to-Free
    });

    await sendPlanConfirmationEmail(email, newPlan);

    return res.status(200).json({
      message: `Subscription updated to ${newPlan}. The prorated charge will appear on the customer's next invoice, and their billing date has reset to today.`,
      subscriptionId: updated.id,
      newPeriodEnd: new Date(updated.current_period_end * 1000).toISOString(),
    });
  } catch (err) {
    console.error('upgrade-subscription error:', err);
    return res.status(500).json({ error: err.message });
  }
}

const PLAN_NAMES = { FREE: 'Free ($0)', ESSENTIALS: 'EA Essentials ($79/year)', PLUS: 'EA Plus ($99/year)', COMPLETE: 'EA Complete ($129/year)' };

async function sendPlanConfirmationEmail(email, plan, endDate) {
  if (!email || !PLAN_NAMES[plan]) return;
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <p>Hi there,</p>
        <p>${plan === 'FREE' && endDate ? `This confirms your CycleCPE paid plan will end on <strong>${endDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>, after which your account switches to the <strong>Free</strong> plan. You keep full access until then, and your certificates and ledger remain available. You will not be charged again.` : `This confirms your CycleCPE membership is now on the <strong>${PLAN_NAMES[plan]}</strong> plan.`}</p>
        <p>You can review or change your plan anytime from the Practitioner Tool tab in your CycleCPE account.</p>
        <p>Questions? Reach us anytime at info@cyclecpe.com.</p>
        <p>— The CycleCPE Team<br>CycleCPE LLC · 7000 Palmetto Park Rd, Ste 210, Boca Raton, FL 33433</p>
      </div>`;

    const uniqueRecipients = Array.from(new Set([email.toLowerCase(), 'info@cyclecpe.com']));

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: uniqueRecipients.map((e) => ({ email: e })) }],
        from: { email: 'info@cyclecpe.com', name: 'CycleCPE' },
        subject: `Your CycleCPE Plan Confirmation — ${PLAN_NAMES[plan]}`,
        content: [{ type: 'text/html', value: html }],
      }),
    });
    if (!res.ok) console.error('sendPlanConfirmationEmail SendGrid error:', await res.text());
  } catch (err) {
    console.error('sendPlanConfirmationEmail exception:', err);
  }
}
