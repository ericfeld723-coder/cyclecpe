import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Same price IDs already used in the webhook — kept in sync with your 3 paid plans.
const PLAN_TO_PRICE = {
  ESSENTIALS: 'price_1UG2LzHLYDiifWD02VO6IRh5',
  PLUS: 'price_1UG2KVHLYDiifWD0WY1Pc06G',
  COMPLETE: 'price_1UG2L4HLYDiifWD089k4TUxW',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { email, newPlan } = req.body;
  if (!email || !newPlan || !PLAN_TO_PRICE[newPlan]) {
    return res.status(400).json({ error: 'A valid email and newPlan (ESSENTIALS, PLUS, or COMPLETE) are required.' });
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

const PLAN_NAMES = { ESSENTIALS: 'EA Essentials ($79/year)', PLUS: 'EA Plus ($129/year)', COMPLETE: 'EA Complete ($179/year)' };

async function sendPlanConfirmationEmail(email, plan) {
  if (!email || !PLAN_NAMES[plan]) return;
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <p>Hi there,</p>
        <p>This confirms your CycleCPE membership is now on the <strong>${PLAN_NAMES[plan]}</strong> plan.</p>
        <p>You can review or change your plan anytime from the Practitioner Tool tab in your CycleCPE account.</p>
        <p>A separate payment receipt from Stripe will follow, if applicable, to the same email address.</p>
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
