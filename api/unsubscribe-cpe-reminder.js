import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function page(title, message) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: Arial, sans-serif; background:#f8fafc; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
  .card { background:#fff; border-radius:10px; padding:40px; max-width:420px; text-align:center; box-shadow:0 2px 10px rgba(0,0,0,0.08); }
  h1 { color:#2F5D50; font-size:1.3rem; }
  p { color:#555; }
  a { color:#2F5D50; }
</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p><p><a href="https://cyclecpe.com">Return to CycleCPE</a></p></div></body></html>`;
}

export default async function handler(req, res) {
  const email = (req.query.email || '').toLowerCase();
  res.setHeader('Content-Type', 'text/html');

  if (!email) {
    return res.status(400).send(page('Missing email', 'No email address was provided.'));
  }

  try {
    const { error } = await supabase
      .from('practitioner_profiles')
      .update({ unsubscribed: true })
      .eq('email', email);

    if (error) {
      console.error('unsubscribe error:', error);
      return res.status(500).send(page('Something went wrong', 'Please try again, or email info@cyclecpe.com to be removed manually.'));
    }

    return res.status(200).send(page('Unsubscribed', `${email} will no longer receive monthly CPE reminder emails. You can still log in and track your CPE anytime.`));
  } catch (err) {
    console.error('unsubscribe exception:', err);
    return res.status(500).send(page('Something went wrong', 'Please try again, or email info@cyclecpe.com to be removed manually.'));
  }
}
