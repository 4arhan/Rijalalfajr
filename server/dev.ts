// Local server: the API, plus the built web app when dist/ exists.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { Hono } from 'hono';
import { createApp } from './app.js';
import { getDb } from './db.js';

const api = createApp({ db: getDb });
const app = new Hono();
app.route('/', api);

if (existsSync('dist/index.html')) {
  app.use('/assets/*', serveStatic({ root: './dist' }));
  app.get('/about', serveStatic({ path: './dist/about/index.html' }));
  app.use('*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`Rijal al-Fajr API on http://localhost:${port}`));
