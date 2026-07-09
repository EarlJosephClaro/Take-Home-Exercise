import express, { type Express } from 'express';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import type { UrlStore } from './store/urlStore';
import type { Config } from './config';
import { createRouter, errorHandler, notFoundHandler } from './routes';
import { buildOpenApiSpec } from './openapi';

/**
 * Static assets to expose on top of the API. `redirect: false` stops
 * express.static from turning a bare directory path into a 301, and `index`
 * serves the UI at `/`.
 */
const STATIC_OPTIONS = { index: 'index.html', redirect: false } as const;

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

  // Serve the web UI (index.html at `/`, plus styles.css / app.js). Registered
  // before the router so a missing asset falls through to the API's catch-all
  // redirect route rather than being served here.
  app.use(express.static(config.publicDir, STATIC_OPTIONS));

  // API documentation: machine-readable spec + interactive Swagger UI.
  // Registered before the router so `/docs` isn't captured by the /:short_code
  // redirect route.
  const openApiSpec = buildOpenApiSpec(config);
  app.get('/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: 'URL Shortener API docs',
      swaggerOptions: { defaultModelsExpandDepth: 2 },
    }),
  );

  app.use(createRouter(store, config));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
