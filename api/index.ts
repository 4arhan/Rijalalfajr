// Vercel entry point. vercel.json sends every /api/* request here.
import { handle } from 'hono/vercel';
import { createApp } from '../server/app.js';
import { getDb } from '../server/db.js';

const handler = handle(createApp({ db: getDb }));

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
