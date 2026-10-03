import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../server.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const originalUrl = (req.headers['x-now-route-matches'] as string) || (req.headers['x-matched-path'] as string);
  if (req.url === '/api' && originalUrl) {
    req.url = originalUrl;
  }
  return app(req, res);
}
