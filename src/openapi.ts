import type { Config } from './config';

/**
 * Build the OpenAPI 3 description of the API. Taking `config` lets us advertise
 * the correct server URL (port / base URL) so "Try it out" in Swagger UI hits
 * the running instance. This object is the single source of truth served at
 * `/openapi.json` and rendered by Swagger UI at `/docs`.
 */
export function buildOpenApiSpec(config: Config): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: {
      title: 'URL Shortener API',
      version: '1.0.0',
      description:
        'Shorten URLs, redirect short codes to their target, and report ' +
        'per-link click statistics.',
      license: { name: 'MIT' },
    },
    servers: [{ url: config.baseUrl, description: 'This instance' }],
    tags: [
      { name: 'links', description: 'Create and resolve short links' },
      { name: 'stats', description: 'Click statistics' },
      { name: 'system', description: 'Operational endpoints' },
    ],
    paths: {
      '/shorten': {
        post: {
          tags: ['links'],
          summary: 'Create a short code for a URL',
          operationId: 'shorten',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ShortenRequest' },
                examples: {
                  basic: { value: { url: 'https://example.com/a/very/long/link' } },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Short link created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ShortenResponse' },
                },
              },
            },
            '400': {
              description:
                'Invalid input — missing/empty `url`, malformed URL, ' +
                'non-http(s) scheme, or longer than 2048 characters',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/{short_code}': {
        get: {
          tags: ['links'],
          summary: 'Redirect to the original URL',
          description:
            'Records a hit for the current UTC day, then issues a 302 ' +
            'redirect to the stored URL.',
          operationId: 'redirect',
          parameters: [
            {
              name: 'short_code',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              example: 'aB3xK9p',
            },
          ],
          responses: {
            '302': {
              description: 'Redirect to the original URL',
              headers: {
                Location: {
                  description: 'The original URL',
                  schema: { type: 'string', format: 'uri' },
                },
              },
            },
            '404': {
              description: 'Unknown short code',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/stats/{short_code}': {
        get: {
          tags: ['stats'],
          summary: 'Total hits and a 30-day daily breakdown',
          operationId: 'stats',
          parameters: [
            {
              name: 'short_code',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              example: 'aB3xK9p',
            },
          ],
          responses: {
            '200': {
              description: 'Statistics for the short code',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Stats' },
                },
              },
            },
            '404': {
              description: 'Unknown short code',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/health': {
        get: {
          tags: ['system'],
          summary: 'Liveness probe',
          operationId: 'health',
          responses: {
            '200': {
              description: 'Service is up',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { status: { type: 'string', example: 'ok' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        ShortenRequest: {
          type: 'object',
          required: ['url'],
          properties: {
            url: {
              type: 'string',
              format: 'uri',
              maxLength: 2048,
              description: 'Absolute http(s) URL to shorten',
              example: 'https://example.com/a/very/long/link',
            },
          },
        },
        ShortenResponse: {
          type: 'object',
          required: ['short_code', 'short_url'],
          properties: {
            short_code: { type: 'string', example: 'aB3xK9p' },
            short_url: {
              type: 'string',
              format: 'uri',
              example: 'http://localhost:8787/aB3xK9p',
            },
          },
        },
        DailyHit: {
          type: 'object',
          required: ['date', 'hits'],
          properties: {
            date: { type: 'string', format: 'date', example: '2026-07-09' },
            hits: { type: 'integer', minimum: 0, example: 3 },
          },
        },
        Stats: {
          type: 'object',
          required: ['short_code', 'original_url', 'created_at', 'total_hits', 'daily'],
          properties: {
            short_code: { type: 'string', example: 'aB3xK9p' },
            original_url: {
              type: 'string',
              format: 'uri',
              example: 'https://example.com/a/very/long/link',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              example: '2026-07-09T10:00:00Z',
            },
            total_hits: {
              type: 'integer',
              minimum: 0,
              description:
                'All-time hits. May exceed the sum of `daily` for links older ' +
                'than the 30-day window.',
              example: 42,
            },
            daily: {
              type: 'array',
              description:
                'Exactly 30 entries (last 30 UTC days, oldest first), ' +
                'zero-filled for days with no hits.',
              items: { $ref: '#/components/schemas/DailyHit' },
            },
          },
        },
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string', example: 'short code not found' },
          },
        },
      },
    },
  };
}
