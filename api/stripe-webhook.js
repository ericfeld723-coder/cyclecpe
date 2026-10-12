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
  if (error) console.error('Supabase plan upsert error:', error);
  else console.log(`Plan updated: ${email} -> ${plan}`);
}

const PLAN_NAMES = { ESSENTIALS: 'EA Essentials ($79/year)', PLUS: 'EA Plus ($129/year)', COMPLETE: 'EA Complete ($179/year)' };

// Sends a plan confirmation email — separate from Stripe's own payment receipt — covering
// any path that lands on a paid plan (new subscription, upgrade, or downgrade).
// Sends a quick internal alert straight to info@cyclecpe.com for events that need human
// attention — a failed payment or an issued refund — rather than leaving these to be
// discovered only by someone happening to check Stripe or Supabase later.
async function sendAdminAlertEmail(subject, message) {
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: 'info@cyclecpe.com' }] }],
        from: { email: 'info@cyclecpe.com', name: 'CycleCPE Alerts' },
        subject: `⚠️ CycleCPE Alert: ${subject}`,
        content: [{ type: 'text/html', value: `<p>${message}</p>` }],
      }),
    });
    if (!res.ok) console.error('sendAdminAlertEmail SendGrid error:', await res.text());
  } catch (err) {
    console.error('sendAdminAlertEmail exception:', err);
  }
}

async function sendPlanConfirmationEmail(email, plan) {
  if (!email || !PLAN_NAMES[plan]) return;
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <p>Hi there,</p>
        <p>This confirms your CycleCPE membership is now active on the <strong>${PLAN_NAMES[plan]}</strong> plan.</p>
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

const COURSE_TITLES = {"ethics": {"t": "Practicing Under Circular 230", "h": 1}, "s-corp": {"t": "S Corporation Taxation: Elections, Compensation, and Basis", "h": 1}, "estate-gift": {"t": "Estate & Gift Tax Planning Under OBBBA", "h": 1}, "biz-incentives": {"t": "Business Cost Recovery & Investment Incentives", "h": 1}, "qrp": {"t": "Qualified Retirement Plan Matters", "h": 1}, "partnership-tax": {"t": "Partnership Taxation Fundamentals", "h": 1}, "like-kind-exchanges": {"t": "Like-Kind Exchanges & Real Estate Taxation", "h": 1}, "digital-assets": {"t": "2026 Digital Assets & Information Reporting Update", "h": 1}, "simple-sep-design": {"t": "SIMPLE & SEP Plan Design for Small Business", "h": 1}, "tax-update": {"t": "2026 Federal Tax Law Update", "h": 2}, "see-prep": {"t": "Special Enrollment Examination Prep", "h": 2}, "aftr": {"t": "Annual Federal Tax Refresher", "h": 6}, "individual-credits-deep-dive": {"t": "2026 Individual Credits & Provisions Deep Dive", "h": 4}, "business-depreciation-update": {"t": "Business Entity & Depreciation Law Update", "h": 4}, "circular-230-case-studies": {"t": "Circular 230 in Practice: Case Studies & Scenarios", "h": 4}, "preparer-penalties-enforcement": {"t": "Preparer Penalties & IRS Enforcement Priorities", "h": 4}, "trust-estate-income-tax": {"t": "Trust & Estate Income Taxation (Form 1041)", "h": 4}, "multistate-nexus": {"t": "Multistate Taxation & Nexus Fundamentals", "h": 4}, "fbar-fatca-reporting": {"t": "International Information Reporting: FBAR & FATCA", "h": 4}, "defined-benefit-plans": {"t": "Defined Benefit & Cash Balance Plan Design", "h": 4}, "ira-rollovers-conversions": {"t": "IRA Rollovers, Conversions, and Beneficiary Planning", "h": 4}, "data-security-safeguards": {"t": "Data Security & Safeguards Obligations for Tax Practices", "h": 4}};

async function sendCoursePurchaseEmail(email, slug, amountCents) {
  if (!email || !slug) return;
  try {
    const course = COURSE_TITLES[slug];
    const title = course ? course.t : slug;
    const hours = course ? `${course.h} CE hour${course.h === 1 ? '' : 's'}` : '';
    const amount = typeof amountCents === 'number' ? `$${(amountCents / 100).toFixed(2)}` : '';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <p>Hi there,</p>
        <p>Thank you for your purchase. This confirms you now have access to the following CycleCPE course:</p>
        <p style="margin:12px 0;"><strong>${title}</strong>${hours ? `<br>${hours}` : ''}${amount ? `<br>Amount paid: ${amount}` : ''}</p>
        <p>Log in to your CycleCPE account and open the course from the catalog to begin. Once you pass the exam, your certificate is emailed to you automatically and added to your CPE ledger.</p>
        <p>A separate payment receipt from Stripe will follow, if applicable, to the same email address.</p>
        <p>Questions? Reach us anytime at info@cyclecpe.com.</p>
        <p>— The CycleCPE Team<br>CycleCPE LLC · 7000 Palmetto Park Rd, Ste 210, Boca Raton, FL 33433</p>
      </div>`;
    const uniqueRecipients = Array.from(new Set([email.toLowerCase(), 'info@cyclecpe.com']));
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: uniqueRecipients.map((e) => ({ email: e })) }],
        from: { email: 'info@cyclecpe.com', name: 'CycleCPE' },
        subject: `Your CycleCPE Course Purchase — ${title}`,
        content: [{ type: 'text/html', value: html }],
      }),
    });
    if (!res.ok) console.error('sendCoursePurchaseEmail SendGrid error:', await res.text());
  } catch (err) {
    console.error('sendCoursePurchaseEmail exception:', err);
  }
}

async function recordCoursePurchase(email, slug) {
  if (!email || !slug) return;
  const { error } = await supabase.from('course_purchases').upsert({
    email: email.toLowerCase(),
    slug,
    purchased_at: new Date().toISOString(),
  });
  if (error) console.error('Supabase course purchase upsert error:', error);
  else console.log(`Course purchase recorded: ${email} -> ${slug}`);
}

// Ensures one email never ends up with more than one active subscription. Only called
// right after a brand-new subscription is created via checkout — this does NOT touch
// upgrades/downgrades/cancels/resumes on an existing subscription, since those modify the
// same subscription object rather than creating a new one, so they're never affected.
async function enforceSingleSubscriptionPerCustomer(customerId, newSubscriptionId) {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 100,
    });

    const others = subscriptions.data.filter((s) => s.id !== newSubscriptionId);
    if (!others.length) return;

    for (const old of others) {
      await stripe.subscriptions.cancel(old.id);
      console.log(`Canceled duplicate subscription ${old.id} for customer ${customerId} (kept ${newSubscriptionId})`);
    }
  } catch (err) {
    console.error('enforceSingleSubscriptionPerCustomer error:', err);
  }
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
      const plan = PRICE_TO_PLAN[priceId];

      if (plan) {
        // A membership plan purchase — make sure this is now the ONLY active
        // subscription for this customer before recording the plan.
        if (session.subscription && session.customer) {
          await enforceSingleSubscriptionPerCustomer(session.customer, session.subscription);
        }
        await setPlanForEmail(email, plan);
        await sendPlanConfirmationEmail(email, plan);
      } else if (session.client_reference_id) {
        await recordCoursePurchase(email, session.client_reference_id);
        await sendCoursePurchaseEmail(email, session.client_reference_id, session.amount_total);
      }
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

    // A charge failed to renew — flag it so it's visible in Supabase, and alert
    // info@cyclecpe.com directly rather than leaving this to be discovered later.
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      const customer = await stripe.customers.retrieve(invoice.customer);
      await supabase.from('practitioner_plans').upsert({
        email: (customer.email || '').toLowerCase(),
        past_due: true,
        updated_at: new Date().toISOString(),
      });
      await sendAdminAlertEmail(
        'Payment Failed',
        `A payment failed for ${customer.email}. Amount: $${(invoice.amount_due / 100).toFixed(2)}. Stripe will retry automatically per your dunning settings; if it continues failing, this subscription may become past_due or eventually cancel.`
      );
    }

    // Clears the past_due flag once a retried payment actually succeeds.
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      if (invoice.billing_reason === 'subscription_cycle' || invoice.billing_reason === 'subscription_update') {
        const customer = await stripe.customers.retrieve(invoice.customer);
        await supabase.from('practitioner_plans').upsert({
          email: (customer.email || '').toLowerCase(),
          past_due: false,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // A charge was refunded — revert plan access to FREE and alert the team, since a
    // refund isn't automatically reflected by any other subscription event.
    if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      const customerId = charge.customer;
      if (customerId) {
        const customer = await stripe.customers.retrieve(customerId);
        await setPlanForEmail(customer.email, 'FREE');
        await sendAdminAlertEmail(
          'Refund Issued',
          `A refund of $${(charge.amount_refunded / 100).toFixed(2)} was issued for ${customer.email}. Their plan has been automatically reverted to FREE.`
        );
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
  }

  return res.status(200).json({ received: true });
}
