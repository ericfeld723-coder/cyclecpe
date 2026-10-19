import { getAuthedEmail, rateLimit, clientIp } from './_auth.js';
import { encryptValue, decryptValue } from './_crypto.js';

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

  const email = await getAuthedEmail(req);
  if (!email) return res.status(401).json({ error: 'Please log in again.' });
  if (!rateLimit('crypto:' + email, 60, 60 * 1000)) return res.status(429).json({ error: 'Too many requests.' });

  try {
    const { action, values } = req.body || {};
    if (!values || typeof values !== 'object') return res.status(400).json({ error: 'values required' });
    const out = {};
    for (const [k, v] of Object.entries(values)) {
      if (v === null || v === undefined || v === '') { out[k] = ''; continue; }
      if (String(v).length > 200) return res.status(400).json({ error: 'value too long' });
      out[k] = action === 'encrypt' ? (String(v).startsWith('enc:v1:') ? v : encryptValue(v)) : decryptValue(v);
    }
    return res.status(200).json({ values: out });
  } catch (err) {
    console.error('profile-crypto error:', err.message);
    return res.status(500).json({ error: 'Encryption service unavailable.' });
  }
}
