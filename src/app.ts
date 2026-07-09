import express, { type Express } from 'express';
import morgan from 'morgan';
import type { UrlStore } from './store/urlStore';
import type { Config } from './config';
import { createRouter, errorHandler, notFoundHandler } from './routes';

/**
 * Assemble the Express application from an injected store + config.
 *
 * Kept separate from `server.ts` (which owns the database connection and the
 * listening socket) so tests can build an app over an in-memory store without
 * binding a port.
 */
export function createApp(store: UrlStore, config: Config): Express {
  const app = express();

  // Trust the reverse proxy so req.protocol/req.ip reflect the client when
  // deployed behind one (e.g. for future rate-limiting by IP).
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  // Request logging — silenced under test to keep output clean.
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('tiny'));
  }

  app.use(express.json({ limit: '16kb' }));

  app.use(createRouter(store, config));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
