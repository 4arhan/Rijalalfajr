// Passwords, session tokens, ids and the signed codes behind QR check-in.
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

export function newId(len = 12): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Short code people can type: join codes, squad codes. */
export function newCode(len = 6): string {
  return newId(len).toUpperCase();
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 32, (err, key) =>
      err ? reject(err) : resolve(`s1$${salt.toString('hex')}$${key.toString('hex')}`),
    ),
  );
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [v, saltHex, keyHex] = stored.split('$');
  if (v !== 's1' || !saltHex || !keyHex) return Promise.resolve(false);
  const want = Buffer.from(keyHex, 'hex');
  return new Promise((resolve, reject) =>
    scrypt(password, Buffer.from(saltHex, 'hex'), want.length, (err, key) =>
      err ? reject(err) : resolve(timingSafeEqual(key, want)),
    ),
  );
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 16);
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const QR_STEP_SEC = 30;
const HOLD_MIN = 10;

/** The code on the mosque's screen. It changes every QR_STEP_SEC seconds. */
export function rotatingCode(mosqueId: string, secret: string, now: Date): string {
  const step = Math.floor(now.getTime() / 1000 / QR_STEP_SEC);
  return `r.${mosqueId}.${step}.${sign(secret, `r.${mosqueId}.${step}`)}`;
}

export function posterCode(mosqueId: string, staticKey: string): string {
  return `s.${mosqueId}.${staticKey}`;
}

/**
 * A hold stands in for a screen code that was valid when it was scanned, so a
 * person who still has to sign up or pick family members is not timed out.
 */
export function holdCode(mosqueId: string, secret: string, now: Date): string {
  const exp = Math.floor(now.getTime() / 1000) + HOLD_MIN * 60;
  return `h.${mosqueId}.${exp}.${sign(secret, `h.${mosqueId}.${exp}`)}`;
}

export type ParsedCode = { kind: 'r' | 's' | 'h'; mosqueId: string; rest: string[] };

export function parseCode(raw: string): ParsedCode | null {
  // Accept a full link (https://host/c/<code>) as well as the bare code.
  const code = raw.trim().replace(/^.*\/c\//, '');
  const [kind, mosqueId, ...rest] = code.split('.');
  if (!mosqueId || (kind !== 'r' && kind !== 's' && kind !== 'h')) return null;
  return { kind, mosqueId, rest };
}

export type CodeCheck = { ok: true; proof: 'screen' | 'poster' } | { ok: false; reason: 'expired' | 'invalid' };

export function checkCode(
  p: ParsedCode,
  mosque: { id: string; qr_secret: string; static_key: string },
  now: Date,
): CodeCheck {
  const nowSec = Math.floor(now.getTime() / 1000);
  if (p.kind === 's') {
    return p.rest[0] && safeEqual(p.rest[0], mosque.static_key) ? { ok: true, proof: 'poster' } : { ok: false, reason: 'invalid' };
  }
  const [num, sig] = p.rest;
  if (!num || !sig || !/^\d+$/.test(num)) return { ok: false, reason: 'invalid' };
  if (!safeEqual(sig, sign(mosque.qr_secret, `${p.kind}.${mosque.id}.${num}`))) return { ok: false, reason: 'invalid' };
  if (p.kind === 'r') {
    const age = Math.floor(nowSec / QR_STEP_SEC) - Number(num);
    // The current code and the two before it: up to 90 seconds to scan.
    return age >= -1 && age <= 2 ? { ok: true, proof: 'screen' } : { ok: false, reason: 'expired' };
  }
  return Number(num) >= nowSec ? { ok: true, proof: 'screen' } : { ok: false, reason: 'expired' };
}
