import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../server.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const matchedPath = (req.headers['x-matched-path'] as string) || (req.headers['x-now-route-matches'] as string);
  if (matchedPath && (req.url === '/api' || req.url === '/api/')) {
    const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    req.url = matchedPath + queryString;
  }
  return app(req, res);
}
