export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ success: false, error: 'Verification is not configured' });
  }

  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  if (!token || token.length > 2048) {
    return res.status(400).json({ success: false, error: 'Missing or invalid token' });
  }

  try {
    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const result = await verification.json();
    if (!result.success) {
      return res.status(403).json({ success: false, error: 'Challenge not passed' });
    }

    return res.status(200).json({ success: true });
  } catch {
    return res.status(502).json({ success: false, error: 'Verification service unavailable' });
  }
}
