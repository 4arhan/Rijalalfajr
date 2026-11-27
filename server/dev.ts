// Local server: the API, plus the built web app when dist/ exists.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { Hono } from 'hono';
import { createApp } from './app.js';
import { getDb } from './db.js';

// DEMO_NOW pretends it is another moment, to see the app as it looks at Fajr at any hour:
//   DEMO_NOW=2026-11-27T05:55:00Z npm start
// The clock still runs from there. It is for looking at the demo only.
const started = Date.now();
const pretend = process.env.DEMO_NOW ? Date.parse(process.env.DEMO_NOW) : NaN;
const api = createApp({ db: getDb, now: Number.isNaN(pretend) ? undefined : () => new Date(pretend + Date.now() - started) });
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
