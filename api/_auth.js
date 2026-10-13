import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export const ADMIN_EMAIL = 'info@cyclecpe.com';

// Verifies the logged-in user's Supabase access token from the "Authorization: Bearer <token>"
// header and returns their email (lowercased), or null if missing/invalid.
export async function getAuthedEmail(req) {
  try {
    const header = req.headers['authorization'] || req.headers['Authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return null;
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data || !data.user || !data.user.email) return null;
    return data.user.email.toLowerCase();
  } catch (e) {
    return null;
  }
}

// Best-effort in-memory rate limiter (per server instance). Not a perfect global limit on
// serverless, but it stops simple abuse and rapid-fire scripts.
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const entry = buckets.get(key) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
  entry.count += 1;
  buckets.set(key, entry);
  if (buckets.size > 5000) { for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k); }
  return entry.count <= max;
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' ? fwd.split(',')[0].trim() : '') || req.socket?.remoteAddress || 'unknown';
}
