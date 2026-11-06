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
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  const key = process.env.TELEGRAM_DASHBOARD_KEY;
  if (!key || req.headers.authorization !== `Bearer ${key}`) return res.status(401).json({ ok: false });
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN || !process.env.TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ ok: false, error: 'Tracking is not configured' });
  }
  try {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      return d.toISOString().slice(0, 10);
    });
    const commands = [
      ['GET', 'tg:joins:total'],
      ['GET', 'tg:leaves:total'],
      ['GET', 'tg:chat_id'],
      ...days.flatMap(day => [['GET', `tg:${day}:joins`], ['GET', `tg:${day}:leaves`]])
    ];
    const data = await redis(commands);
    const values = (data.result || []).map(x => Number(x.result || 0));
    const joins30 = values.slice(3).filter((_, i) => i % 2 === 0);
    const leaves30 = values.slice(4).filter((_, i) => i % 2 === 0);
    const sum = arr => arr.reduce((a, b) => a + b, 0);
    const chatId = process.env.TELEGRAM_CHAT_ID || data.result?.[2]?.result;
    let members = null;
    if (chatId) {
      const countResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChatMemberCount?chat_id=${encodeURIComponent(chatId)}`);
      const countData = await countResponse.json();
      if (countData.ok) members = countData.result;
    }
    return res.status(200).json({
      ok: true,
      currentMembers: members,
      totalJoinsTracked: values[0],
      totalLeavesTracked: values[1],
      last7Days: { joins: sum(joins30.slice(0, 7)), leaves: sum(leaves30.slice(0, 7)) },
      last30Days: { joins: sum(joins30), leaves: sum(leaves30) },
      timezone: 'UTC',
      note: 'Join/leave counters start when the webhook is enabled; historical joins are not backfilled.'
    });
  } catch {
    return res.status(503).json({ ok: false, error: 'Could not load tracking stats' });
  }
}