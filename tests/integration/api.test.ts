import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createDb, type DB } from '../../src/db';
import { UrlStore } from '../../src/store/urlStore';
import { createApp } from '../../src/app';
import type { Config } from '../../src/config';

const TEST_CONFIG: Config = {
  port: 0,
  baseUrl: 'http://short.test',
  dbPath: ':memory:',
  publicDir: resolve(__dirname, '../../public'),
};

describe('URL shortener API', () => {
  let db: DB;
  let app: Express;

  beforeEach(() => {
    db = createDb(':memory:');
    app = createApp(new UrlStore(db), TEST_CONFIG);
  });

  afterEach(() => {
    db.close();
  });

  /** Shorten a URL and return the created short code. */
  async function shorten(url: string): Promise<string> {
    const res = await request(app).post('/shorten').send({ url }).expect(201);
    return res.body.short_code as string;
  }

  describe('POST /shorten', () => {
    it('creates a short code and short_url', async () => {
      const res = await request(app)
        .post('/shorten')
        .send({ url: 'https://example.com/some/long/path' })
        .expect(201);

      expect(res.body.short_code).toMatch(/^[0-9A-Za-z]{7}$/);
      expect(res.body.short_url).toBe(`${TEST_CONFIG.baseUrl}/${res.body.short_code}`);
    });

    it('rejects a missing url with 400', async () => {
      const res = await request(app).post('/shorten').send({}).expect(400);
      expect(res.body.error).toBeTruthy();
    });

    it('rejects an invalid url with 400', async () => {
      await request(app).post('/shorten').send({ url: 'not-a-url' }).expect(400);
    });

    it('rejects a non-http(s) scheme with 400', async () => {
      await request(app)
        .post('/shorten')
        .send({ url: 'javascript:alert(1)' })
        .expect(400);
    });
  });

  describe('GET /:short_code', () => {
    it('302-redirects to the original URL', async () => {
      const code = await shorten('https://example.com/');
      const res = await request(app).get(`/${code}`).expect(302);
      expect(res.headers.location).toBe('https://example.com/');
    });

    it('returns 404 for an unknown code', async () => {
      await request(app).get('/nope123').expect(404);
    });
  });

  describe('GET /stats/:short_code', () => {
    it('returns total hits and a 30-day breakdown', async () => {
      const code = await shorten('https://example.com/');

      // Three visits.
      await request(app).get(`/${code}`).expect(302);
      await request(app).get(`/${code}`).expect(302);
      await request(app).get(`/${code}`).expect(302);

      const res = await request(app).get(`/stats/${code}`).expect(200);
      expect(res.body.short_code).toBe(code);
      expect(res.body.original_url).toBe('https://example.com/');
      expect(res.body.total_hits).toBe(3);
      expect(res.body.daily).toHaveLength(30);

      // Today's bucket (last entry) should carry all three hits.
      expect(res.body.daily.at(-1).hits).toBe(3);
      const windowSum = res.body.daily.reduce(
        (sum: number, d: { hits: number }) => sum + d.hits,
        0,
      );
      expect(windowSum).toBe(3);
    });

    it('reports zero hits for a freshly created code', async () => {
      const code = await shorten('https://example.com/');
      const res = await request(app).get(`/stats/${code}`).expect(200);
      expect(res.body.total_hits).toBe(0);
      expect(res.body.daily.every((d: { hits: number }) => d.hits === 0)).toBe(true);
    });

    it('returns 404 for an unknown code', async () => {
      await request(app).get('/stats/nope123').expect(404);
    });
  });

  describe('misc', () => {
    it('exposes a health check', async () => {
      const res = await request(app).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
    });

    it('serves the web UI at the root', async () => {
      const res = await request(app).get('/').expect(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('URL Shortener');
    });

    it('serves static assets (app.js)', async () => {
      const res = await request(app).get('/app.js').expect(200);
      expect(res.headers['content-type']).toMatch(/javascript/);
    });

    it('serves the OpenAPI spec', async () => {
      const res = await request(app).get('/openapi.json').expect(200);
      expect(res.body.openapi).toMatch(/^3\./);
      expect(res.body.info.title).toBe('URL Shortener API');
      expect(res.body.paths['/shorten']).toBeDefined();
      // Server URL reflects the injected config.
      expect(res.body.servers[0].url).toBe(TEST_CONFIG.baseUrl);
    });

    it('serves Swagger UI at /docs', async () => {
      const res = await request(app).get('/docs/').expect(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('returns JSON 404 for unknown routes', async () => {
      await request(app).delete('/whatever').expect(404);
    });
  });
});
