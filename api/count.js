import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const COUNT_KEY = 'virus:global_count';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      const raw = await redis.get(COUNT_KEY);
      const count = typeof raw === 'number' ? raw : parseInt(raw || '0', 10) || 0;
      return res.status(200).json({ count });
    }

    if (req.method === 'POST') {
      let n = 1;
      if (req.body && typeof req.body === 'object' && Number.isFinite(req.body.n)) {
        n = Math.max(1, Math.min(50, Math.floor(req.body.n)));
      }
      const count = await redis.incrby(COUNT_KEY, n);
      return res.status(200).json({ count });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('count handler error:', err);
    return res.status(500).json({ error: 'internal' });
  }
}
