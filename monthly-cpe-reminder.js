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
  const startMonth =
