import { getAuthedEmail, rateLimit, clientIp, ADMIN_EMAIL } from './_auth.js';

const ALLOWED_ORIGINS = ['https://cyclecpe.com', 'https://www.cyclecpe.com', 'https://cyclecpe.vercel.app'];
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { to, subject, body, attachments } = req.body || {};

  // ---- Basic validation ----
  if (!Array.isArray(to) || !to.length || to.length > 5 || !to.every(e => typeof e === 'string' && EMAIL_RE.test(e))) {
    return res.status(400).json({ error: 'Invalid recipients.' });
  }
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 250) {
    return res.status(400).json({ error: 'Invalid subject.' });
  }
  if (typeof body !== 'string' || !body.trim() || body.length > 20000) {
    return res.status(400).json({ error: 'Invalid body.' });
  }
  const recipients = Array.from(new Set(to.map(e => e.toLowerCase())));

  // ---- Who is calling, and what may they send? ----
  const authedEmail = await getAuthedEmail(req);
  const ip = clientIp(req);

  if (!authedEmail) {
    // Anonymous visitors may ONLY submit the public contact form: to info@cyclecpe.com, no attachments.
    const isContactForm = recipients.length === 1 && recipients[0] === ADMIN_EMAIL && subject.startsWith('[CycleCPE Contact]');
    if (!isContactForm || (attachments && attachments.length)) {
      return res.status(401).json({ error: 'Please log in to send this email.' });
    }
    if (body.length > 5000) return res.status(400).json({ error: 'Message too long.' });
    if (!rateLimit('contact:' + ip, 5, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many messages. Please try again later.' });
    }
  } else {
    if (!rateLimit('mail:' + authedEmail, 40, 60 * 60 * 1000) || !rateLimit('mailip:' + ip, 120, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many emails. Please try again later.' });
    }
    // A logged-in user may email themselves and the CycleCPE archive/admin address.
    // The admin account may email any practitioner.
    if (authedEmail !== ADMIN_EMAIL) {
      const allowed = new Set([authedEmail, ADMIN_EMAIL]);
      if (!recipients.every(r => allowed.has(r))) {
        return res.status(403).json({ error: 'You can only send email to your own address.' });
      }
    }
  }

  // ---- Attachments: PDFs only, size-capped ----
  let cleanAttachments;
  if (attachments !== undefined && attachments !== null) {
    if (!Array.isArray(attachments) || attachments.length > 2) return res.status(400).json({ error: 'Invalid attachments.' });
    let total = 0;
    cleanAttachments = [];
    for (const a of attachments) {
      if (!a || typeof a.content !== 'string' || typeof a.filename !== 'string') return res.status(400).json({ error: 'Invalid attachment.' });
      total += a.content.length;
      cleanAttachments.push({
        content: a.content,
        filename: a.filename.slice(0, 120).replace(/[^\w.\- ]/g, '_'),
        type: 'application/pdf',
        disposition: 'attachment',
      });
    }
    if (total > 7 * 1024 * 1024) return res.status(400).json({ error: 'Attachment too large.' });
  }

  const sgPayload = {
    personalizations: [{ to: recipients.map(email => ({ email })) }],
    from: { email: 'info@cyclecpe.com', name: 'CycleCPE' },
    subject: subject.replace(/[\r\n]+/g, ' '),
    content: [{ type: 'text/plain', value: body }],
  };
  if (cleanAttachments && cleanAttachments.length) sgPayload.attachments = cleanAttachments;

  const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(sgPayload),
  });
  if (!sgRes.ok) {
    const err = await sgRes.text();
    console.error('send-email SendGrid error:', err);
    return res.status(502).json({ error: 'Email could not be sent right now.' });
  }
  return res.status(200).json({ sent: true });
}
