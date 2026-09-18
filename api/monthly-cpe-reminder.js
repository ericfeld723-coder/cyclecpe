import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = 'info@cyclecpe.com';
const CATALOG_LINK = 'https://cyclecpe.com'; // logged-in landing page; app routes to Catalog after login
const UNSUBSCRIBE_BASE = 'https://cyclecpe.vercel.app/api/unsubscribe-cpe-reminder';

// Mirrors getForm8554NextDueDate(ssn) in the app exactly, so the date shown here always
// matches what the practitioner sees on their own Enrolled Agent Status page.
function getForm8554NextDueDate(ssnLast4) {
  let baseDeadlineYear;
  const lastDigit = ssnLast4 && ssnLast4.length ? parseInt(ssnLast4.slice(-1), 10) : NaN;
  if (isNaN(lastDigit) || [7, 8, 9].includes(lastDigit)) {
    baseDeadlineYear = 2027;
  } else if ([0, 1, 2, 3].includes(lastDigit)) {
    baseDeadlineYear = 2028;
  } else {
    baseDeadlineYear = 2029;
  }

  const today = new Date();
  let deadlineYear = baseDeadlineYear;
  let deadline = new Date(deadlineYear, 0, 31);
  while (today.getTime() > deadline.getTime()) {
    deadlineYear += 3;
    deadline = new Date(deadlineYear, 0, 31);
  }
  const windowStart = new Date(deadlineYear - 1, 10, 1);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return { windowLabel: `${fmt(windowStart)} – ${fmt(deadline)}` };
}

// Mirrors runEngine()'s per-year minimum exactly: 16 hours (2 Ethics) for a full year,
// prorated by months enrolled that year — not an even 1/3 split of the 3-year total.
function getCurrentYearRequirement(enrollmentDateStr) {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const enrollmentDate = enrollmentDateStr ? new Date(enrollmentDateStr) : new Date(`${currentYear}-01-01`);
  const startYear = enrollmentDate.getUTCFullYear();
  const startMonth = enrollmentDate.getUTCMonth() + 1;

  let monthsInYear = 12;
  if (currentYear === startYear) {
    monthsInYear = Math.max(1, 12 - startMonth + 1);
  } else if (currentYear < startYear) {
    monthsInYear = 0;
  }

  const requiredTotal = monthsInYear > 0 ? Math.round((16 * monthsInYear) / 12) : 0;
  const requiredEthics = monthsInYear > 0 ? 2 : 0;
  return { requiredTotal, requiredEthics, currentYear };
}

function buildEmailHtml({ firstName, remainingTotal, remainingEthics, currentYear, form8554Window, email }) {
  const unsubUrl = `${UNSUBSCRIBE_BASE}?email=${encodeURIComponent(email)}`;
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
    <p>Hi ${firstName || 'there'},</p>
    <p>This is your monthly reminder from CycleCPE — as of today, our records show you still have
      <strong>${remainingTotal} CE hour(s)</strong> remaining to meet your continuing education requirement
      for <strong>${currentYear}</strong>, including <strong>${remainingEthics} Ethics hour(s)</strong>.</p>
    <p>Falling behind on your annual CPE minimum puts you at risk of noncompliance with IRS Enrolled Agent
      renewal requirements — and the closer you get to year-end, the fewer options you'll have to catch up.</p>
    <p><strong>The good news:</strong> getting current takes just a few minutes. Browse our full course
      catalog and pick up the hours you need today:</p>
    <p style="text-align:center; margin: 24px 0;">
      <a href="${CATALOG_LINK}" style="background:#2F5D50; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:bold;">📚 Browse CPE Courses →</a>
    </p>
    <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
      <tr><td style="padding:8px; border:1px solid #ddd; background:#f8fafc;"><strong>CE hours still needed this year</strong></td><td style="padding:8px; border:1px solid #ddd;">${remainingTotal} hours</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd; background:#f8fafc;"><strong>Ethics hours still needed</strong></td><td style="padding:8px; border:1px solid #ddd;">${remainingEthics} hours</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd; background:#f8fafc;"><strong>Form 8554 next filing window</strong></td><td style="padding:8px; border:1px solid #ddd;">${form8554Window}</td></tr>
    </table>
    <p>You're receiving this because you have an active CycleCPE account with remaining CPE hours on file.
      If you've already completed courses elsewhere, log in and add them to your CPE Ledger so this
      reminder reflects your real progress.</p>
    <p>Questions? Just reply to this email or reach us at info@cyclecpe.com.</p>
    <p>— The CycleCPE Team<br>CycleCPE LLC · 7000 Palmetto Park Rd, Ste 210, Boca Raton, FL 33433</p>
    <p style="font-size:12px; color:#888; margin-top:24px;">
      <a href="${unsubUrl}" style="color:#888;">Don't want these reminders? Unsubscribe from CPE reminders</a>
    </p>
  </div>`;
}

async function sendReminderEmail(to, firstName, data) {
  const html = buildEmailHtml({ firstName, email: to, ...data });
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: 'CycleCPE' },
      subject: '⏰ Action Needed: You still have CPE hours remaining this year',
      content: [{ type: 'text/html', value: html }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(`SendGrid error for ${to}:`, errText);
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  // Vercel Cron requests are authenticated automatically; this guard blocks stray public hits.
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { data: profiles, error: profilesError } = await supabase
      .from('practitioner_profiles')
      .select('email, first_name, ssn, enrollment_date, unsubscribed');
    if (profilesError) throw profilesError;

    const { data: allCredits, error: creditsError } = await supabase
      .from('practitioner_credits')
      .select('email, category, hours, date');
    if (creditsError) throw creditsError;

    const currentYear = new Date().getUTCFullYear();
    const creditsByEmail = {};
    (allCredits || []).forEach((c) => {
      const email = (c.email || '').toLowerCase();
      const year = c.date ? new Date(c.date).getUTCFullYear() : null;
      if (year !== currentYear) return;
      creditsByEmail[email] = creditsByEmail[email] || { total: 0, ethics: 0 };
      creditsByEmail[email].total += Number(c.hours) || 0;
      if (c.category === 'Ethics') creditsByEmail[email].ethics += Number(c.hours) || 0;
    });

    let sentCount = 0, skippedCount = 0;

    for (const profile of profiles || []) {
      if (profile.unsubscribed) { skippedCount++; continue; }
      const email = (profile.email || '').toLowerCase();
      if (!email) { skippedCount++; continue; }

      const { requiredTotal, requiredEthics } = getCurrentYearRequirement(profile.enrollment_date);
      const earned = creditsByEmail[email] || { total: 0, ethics: 0 };
      const remainingTotal = Math.max(0, requiredTotal - earned.total);
      const remainingEthics = Math.max(0, requiredEthics - earned.ethics);

      if (remainingTotal <= 0) { skippedCount++; continue; }

      const { windowLabel } = getForm8554NextDueDate(profile.ssn);

      const sent = await sendReminderEmail(email, profile.first_name, {
        remainingTotal, remainingEthics, currentYear, form8554Window: windowLabel,
      });
      if (sent) sentCount++;
    }

    return res.status(200).json({ sent: sentCount, skipped: skippedCount });
  } catch (err) {
    console.error('monthly-cpe-reminder error:', err);
    return res.status(500).json({ error: err.message });
  }
}
