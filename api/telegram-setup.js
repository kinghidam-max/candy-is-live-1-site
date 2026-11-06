export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const key = process.env.TELEGRAM_SETUP_KEY;
  if (!key || req.headers.authorization !== `Bearer ${key}`) return res.status(401).json({ ok: false });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const host = process.env.VERCEL_URL;
  if (!token || !secret || !host) return res.status(500).json({ ok: false, error: 'Missing bot or webhook environment variables' });
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `https://${host}/api/telegram-webhook`,
        secret_token: secret,
        allowed_updates: ['chat_member'],
        drop_pending_updates: false
      })
    });
    const result = await response.json();
    return res.status(result.ok ? 200 : 502).json({ ok: !!result.ok, description: result.description || 'Webhook setup response' });
  } catch {
    return res.status(502).json({ ok: false, error: 'Telegram API unavailable' });
  }
}