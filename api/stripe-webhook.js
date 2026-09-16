import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRICE_TO_PLAN = {
  'price_1UG2FVHanYNo34o68FdVIVbR': 'ESSENTIALS',
  'price_1UG2FiHanYNo34o6XlfB5U9A': 'PLUS',
  'price_1UG2G4HanYNo34o6uaUPFNp': 'COMPLETE',
};

export const config = { api: { bodyParser: false } };

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (c) => chunks.push(c));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const rawBody = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = (session.customer_details?.email || '').toLowerCase();

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
    const priceId = lineItems.data[0]?.price?.id;
    const plan = PRICE_TO_PLAN[priceId];

    if (email && plan) {
      const { error } = await supabase.from('practitioner_plans').upsert({
        email,
        plan,
        updated_at: new Date().toISOString(),
      });
      if (error) console.error('Supabase upsert error:', error);
      else console.log(`Plan updated: ${email} -> ${plan}`);
    } else {
      console.warn('Could not resolve email/plan from session', { email, priceId });
    }
  }

  return res.status(200).json({ received: true });
}
