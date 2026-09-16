import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRICE_TO_PLAN = {
  'price_1UG2LzHLYDiifWD02VO6IRh5': 'ESSENTIALS',
  'price_1UG2KVHLYDiifWD0WY1Pc06G': 'PLUS',
  'price_1UG2L4HLYDiifWD089k4TUxW': 'COMPLETE',
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

async function setPlanForEmail(email, plan) {
  if (!email || !plan) return;
  const { error } = await supabase.from('practitioner_plans').upsert({
    email: email.toLowerCase(),
    plan,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error('Supabase upsert error:', error);
  else console.log(`Plan updated: ${email} -> ${plan}`);
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

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_details?.email;
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      const priceId = lineItems.data[0]?.price?.id;
      await setPlanForEmail(email, PRICE_TO_PLAN[priceId]);
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
      const subscription = event.data.object;
      const priceId = subscription.items.data[0]?.price?.id;
      const plan = PRICE_TO_PLAN[priceId];

      if (plan) {
        const customer = await stripe.customers.retrieve(subscription.customer);
        await setPlanForEmail(customer.email, plan);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customer = await stripe.customers.retrieve(subscription.customer);
      await setPlanForEmail(customer.email, 'FREE');
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
  }

  return res.status(200).json({ received: true });
}
