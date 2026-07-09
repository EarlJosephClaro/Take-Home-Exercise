import { Router, type Request, type Response, type NextFunction } from 'express';
import type { UrlStore } from './store/urlStore';
import { normalizeUrl, ValidationError } from './lib/validation';
import type { Config } from './config';

/**
 * Build the API router. The store and config are injected so the same routes
 * can be exercised against an in-memory database in tests.
 */
export function createRouter(store: UrlStore, config: Config): Router {
  const router = Router();

  // Liveness/readiness probe (used by the Docker HEALTHCHECK).
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Small landing payload so hitting the root isn't a 404.
  router.get('/', (_req, res) => {
    res.json({
      service: 'url-shortener',
      endpoints: {
        shorten: 'POST /shorten { url }',
        redirect: 'GET /:short_code',
        stats: 'GET /stats/:short_code',
      },
    });
  });

  // POST /shorten — create a short code for a URL.
  router.post('/shorten', (req: Request, res: Response) => {
    const url = normalizeUrl((req.body ?? {}).url); // throws ValidationError -> 400
    const shortCode = store.createShortUrl(url);
    res.status(201).json({
      short_code: shortCode,
      short_url: `${config.baseUrl}/${shortCode}`,
    });
  });

  // GET /stats/:short_code — total + per-day breakdown (last 30 days).
  // Registered before the catch-all redirect so "stats" is never treated as a code.
  router.get('/stats/:short_code', (req: Request, res: Response) => {
    const stats = store.getStats(req.params.short_code ?? '', new Date());
    if (!stats) {
      res.status(404).json({ error: 'short code not found' });
      return;
    }
    res.json(stats);
  });

  // GET /:short_code — 302 redirect to the original URL, recording a hit.
  router.get('/:short_code', (req: Request, res: Response) => {
    const record = store.findByCode(req.params.short_code ?? '');
    if (!record) {
      res.status(404).json({ error: 'short code not found' });
      return;
    }
    store.recordHit(record.id, new Date());
    res.redirect(302, record.original_url);
  });

  return router;
}

/** 404 handler for unmatched routes. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'not found' });
}

/**
 * Central error handler. Turns ValidationError into 400 and anything else into
 * a 500 (logged server-side, opaque to the client).
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express needs the 4-arg signature
  _next: NextFunction,
): void {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error('unhandled error:', err);
  res.status(500).json({ error: 'internal server error' });
}
