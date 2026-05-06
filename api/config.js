import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.VIRUS_UPSTASH_URL,
  token: process.env.VIRUS_UPSTASH_TOKEN,
});

const REDIS_KEY = 'virus:config';
const ADMIN_HASH = process.env.VIRUS_ADMIN_HASH;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const config = await redis.get(REDIS_KEY);
      return res.status(200).json(config || {});
    } catch (error) {
      console.error('Redis GET error:', error);
      return res.status(200).json({});
    }
  }

  if (req.method === 'POST') {
    try {
      const { passwordHash, ...configData } = req.body || {};
      if (!passwordHash || passwordHash !== ADMIN_HASH) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      await redis.set(REDIS_KEY, configData);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Redis POST error:', error);
      return res.status(500).json({ error: 'Failed to save' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
