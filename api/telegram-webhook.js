const ACTIVE = new Set(['member', 'administrator', 'creator']);
function isMember(member) {
  return ACTIVE.has(member?.status) || (member?.status === 'restricted' && member?.is_member === true);
}
async function redis(commands) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });
  if (!response.ok) throw new Error('Redis request failed');
  return response.json();
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(401).json({ ok: false });
  }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return res.status(503).json({ ok: false, error: 'Storage is not configured' });
  }
  const update = req.body || {};
  const change = update.chat_member;
  if (!change || !Number.isInteger(update.update_id)) return res.status(200).json({ ok: true });
  const chatId = String(change.chat?.id || '');
  if (!chatId || (process.env.TELEGRAM_CHAT_ID && chatId !== process.env.TELEGRAM_CHAT_ID)) {
    return res.status(200).json({ ok: true });
  }
  const wasMember = isMember(change.old_chat_member);
  const nowMember = isMember(change.new_chat_member);
  let kind = null;
  if (!wasMember && nowMember) kind = 'joins';
  if (wasMember && !nowMember) kind = 'leaves';
  if (!kind) return res.status(200).json({ ok: true });

  try {
    const dedupeKey = `tg:update:${update.update_id}`;
    const first = await redis([['SET', dedupeKey, '1', 'EX', '86400', 'NX']]);
    if (first?.result?.[0]?.result !== 'OK') return res.status(200).json({ ok: true, duplicate: true });
    const day = new Date().toISOString().slice(0, 10);
    await redis([
      ['INCR', `tg:${kind}:total`],
      ['INCR', `tg:${day}:${kind}`],
      ['SET', 'tg:chat_id', chatId]
    ]);
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(503).json({ ok: false, error: 'Could not save update' });
  }
}