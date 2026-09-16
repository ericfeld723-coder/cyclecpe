export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { to, subject, body } = req.body;

  const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: to.map(email => ({ email })) }],
      from: { email: 'info@cyclecpe.com', name: 'CycleCPE' },
      subject,
      content: [{ type: 'text/plain', value: body }],
    }),
  });

  if (!sgRes.ok) {
    const err = await sgRes.text();
    return res.status(sgRes.status).json({ error: err });
  }
  return res.status(200).json({ sent: true });
}
