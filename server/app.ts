import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Db } from './db.js';
import {
  CALC_METHODS,
  addDays,
  daysBetween,
  distanceM,
  fajrWindow,
  isValidTimezone,
  localDate,
  windowState,
  type MosqueTiming,
} from './fajr.js';
import { badges, rerank, shortName, standings, streaks, type CheckinRow, type Group, type Standing, type StriverRow } from './board.js';
import {
  QR_STEP_SEC,
  checkCode,
  hashPassword,
  holdCode,
  newCode,
  newId,
  parseCode,
  posterCode,
  rotatingCode,
  sha256,
  verifyPassword,
} from './security.js';

export interface AppOptions {
  db: () => Promise<Db>;
  now?: () => Date;
  ownerEmails?: string[];
}

interface User {
  id: string;
  email: string;
  name: string;
}

interface MosqueRow extends MosqueTiming {
  id: string;
  name: string;
  city: string;
  country: string;
  radius_m: number;
  daily_goal: number;
  practice: boolean;
  verified: boolean;
  suspended: boolean;
  qr_secret: string;
  static_key: string;
  org_id: string | null;
  labels: Record<string, string>;
  fajr_time: string | null;
  iqamah_time: string | null;
  public_board: boolean;
}

type Env = { Variables: { db: Db; user: User | null; now: Date } };
type C = Context<Env>;

class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 429,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const GROUPS = ['kids', 'youth', 'adults'] as const;
const SESSION_DAYS = 180;
const MAX_FAMILY = 8;
const BACKFILL_DAYS = 2;

const name = z.string().trim().min(1).max(60);
const grp = z.enum(GROUPS);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const mosqueFields = {
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().max(60),
  country: z.string().trim().max(60),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  timezone: z.string().refine(isValidTimezone, 'Unknown timezone'),
  calcMethod: z.enum(CALC_METHODS),
  openBeforeMin: z.number().int().min(0).max(120),
  iqamahAfterMin: z.number().int().min(0).max(90),
  closeAfterSunriseMin: z.number().int().min(-60).max(120),
  radiusM: z.number().int().min(50).max(2000),
  dailyGoal: z.number().int().min(0).max(100000),
  practice: z.boolean(),
  labels: z.object({ kids: z.string().max(30), youth: z.string().max(30), adults: z.string().max(30) }).partial(),
};
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 05:45').nullable();
// Settings added after launch. They are optional when a mosque is registered.
const mosqueExtras = { fajrTime: clock, iqamahTime: clock, publicBoard: z.boolean() };

const prizeSchema = z.object({
  grp: z.enum(['all', ...GROUPS]),
  place: z.number().int().min(1).max(3).nullable(),
  milestoneDays: z.number().int().min(1).max(366).nullable(),
  title: z.string().trim().min(1).max(80),
  detail: z.string().trim().max(200).default(''),
  sponsor: z.string().trim().max(80).default(''),
});

const challengeSchema = z
  .object({
    scopeType: z.enum(['mosque', 'org']),
    scopeId: z.string(),
    name: z.string().trim().min(2).max(80),
    startDate: dateStr,
    endDate: dateStr,
    countAway: z.boolean().default(true),
    rules: z.string().trim().max(2000).default(''),
    prizes: z.array(prizeSchema).max(30).default([]),
  })
  .refine((v) => v.endDate >= v.startDate, 'The end date is before the start date');

async function body<T extends z.ZodType>(c: C, schema: T): Promise<z.infer<T>> {
  const raw = await c.req.json().catch(() => null);
  const r = schema.safeParse(raw ?? {});
  if (!r.success) {
    const issue = r.error.issues[0];
    const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
    throw new HttpError(400, 'invalid', where + issue.message);
  }
  return r.data;
}

function need(c: C): User {
  const u = c.get('user');
  if (!u) throw new HttpError(401, 'signin', 'Sign in to continue.');
  return u;
}

export function createApp(opts: AppOptions) {
  const app = new Hono<Env>().basePath('/api');
  const owners = new Set(
    (opts.ownerEmails ?? (process.env.OWNER_EMAILS ?? '').split(',')).map((e) => e.trim().toLowerCase()).filter(Boolean),
  );
  const isOwner = (u: User | null) => !!u && owners.has(u.email);

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message, ...err.extra } }, err.status);
    }
    console.error(err);
    return c.json({ error: { code: 'server', message: 'Something went wrong on our side.' } }, 500);
  });

  app.use('*', async (c, next) => {
    const db = await opts.db();
    c.set('db', db);
    c.set('now', opts.now ? opts.now() : new Date());
    c.set('user', null);
    const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (token) {
      const [u] = await db.query<User>(
        `select u.id, u.email, u.name from sessions s join users u on u.id = s.user_id
         where s.token_hash = $1 and s.expires_at > now()`,
        [sha256(token)],
      );
      if (u) c.set('user', u);
    }
    await next();
  });

  // ---------- helpers ----------

  async function getMosque(db: Db, id: string): Promise<MosqueRow> {
    const [m] = await db.query<MosqueRow>(`select * from mosques where id = $1`, [id]);
    if (!m) throw new HttpError(404, 'not_found', 'That mosque was not found.');
    return m;
  }

  async function roleAt(c: C, mosqueId: string): Promise<'admin' | 'volunteer' | null> {
    const u = c.get('user');
    if (!u) return null;
    if (isOwner(u)) return 'admin';
    const [r] = await c
      .get('db')
      .query<{ role: 'admin' | 'volunteer' }>(`select role from mosque_staff where mosque_id = $1 and user_id = $2`, [
        mosqueId,
        u.id,
      ]);
    return r?.role ?? null;
  }

  async function needStaff(c: C, mosqueId: string, admin = false) {
    need(c);
    const role = await roleAt(c, mosqueId);
    if (!role || (admin && role !== 'admin')) {
      throw new HttpError(403, 'forbidden', admin ? 'Only a mosque admin can do that.' : 'Only mosque staff can do that.');
    }
    return role;
  }

  async function canManageScope(c: C, scopeType: string, scopeId: string): Promise<boolean> {
    const u = c.get('user');
    if (!u) return false;
    if (scopeType === 'mosque') return (await roleAt(c, scopeId)) === 'admin';
    const [o] = await c.get('db').query<{ owner_user_id: string }>(`select owner_user_id from orgs where id = $1`, [scopeId]);
    return !!o && (o.owner_user_id === u.id || isOwner(u));
  }

  function mosqueJson(m: MosqueRow) {
    return {
      id: m.id,
      name: m.name,
      city: m.city,
      country: m.country,
      lat: m.lat,
      lng: m.lng,
      timezone: m.timezone,
      calcMethod: m.calc_method,
      openBeforeMin: m.open_before_min,
      iqamahAfterMin: m.iqamah_after_min,
      closeAfterSunriseMin: m.close_after_sunrise_min,
      radiusM: m.radius_m,
      dailyGoal: m.daily_goal,
      practice: m.practice,
      verified: m.verified,
      suspended: m.suspended,
      orgId: m.org_id,
      labels: { kids: 'Kids', youth: 'Youth', adults: 'Adults', ...(m.labels ?? {}) },
      fajrTime: m.fajr_time,
      iqamahTime: m.iqamah_time,
      publicBoard: m.public_board,
    };
  }

  function windowJson(m: MosqueRow, now: Date) {
    const ws = windowState(m, now);
    const w = ws.current;
    return {
      open: ws.open || m.practice,
      inWindow: ws.open,
      today: ws.today,
      date: w.date,
      fajr: w.fajr.toISOString(),
      iqamah: w.iqamah.toISOString(),
      sunrise: w.sunrise.toISOString(),
      opens: w.opens.toISOString(),
      closes: w.closes.toISOString(),
    };
  }

  async function createSession(db: Db, userId: string): Promise<string> {
    const token = newId(40);
    await db.query(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + $3::interval)`, [
      sha256(token),
      userId,
      `${SESSION_DAYS} days`,
    ]);
    return token;
  }

  /** The strivers this account may check in: the account holder and their family. */
  async function myStrivers(db: Db, userId: string) {
    return db.query<{
      id: string;
      name: string;
      grp: Group;
      user_id: string | null;
      home_mosque_id: string | null;
      squad_id: string | null;
      anonymous: boolean;
      card_code: string;
      weekly_goal: number;
    }>(
      `select id, name, grp, user_id, home_mosque_id, squad_id, anonymous, card_code, weekly_goal from strivers
       where user_id = $1 or guardian_user_id = $1 order by (user_id is null), created_at`,
      [userId],
    );
  }

  async function homeBoard(db: Db, mosqueIds: string[], from: string, to: string, hostOnly: boolean, today: string) {
    if (!mosqueIds.length) return [];
    const strivers = await db.query<StriverRow>(
      `select id, name, grp, anonymous, squad_id from strivers where home_mosque_id = any($1)`,
      [mosqueIds],
    );
    const checkins = await db.query<CheckinRow>(
      `select c.striver_id, c.fajr_date, c.offset_sec from checkins c
       join strivers s on s.id = c.striver_id
       where s.home_mosque_id = any($1) and c.fajr_date between $2 and $3
         and ($4::boolean = false or c.mosque_id = any($1))`,
      [mosqueIds, from, to, hostOnly],
    );
    const ex = await db.query<{ striver_id: string; fajr_date: string }>(
      `select e.striver_id, e.fajr_date from excuses e join strivers s on s.id = e.striver_id
       where s.home_mosque_id = any($1) and e.fajr_date between $2 and $3`,
      [mosqueIds, from, to],
    );
    return standings(strivers, checkins, today, excusedMap(ex));
  }

  function excusedMap(rows: { striver_id: string; fajr_date: string }[]) {
    const map = new Map<string, Set<string>>();
    for (const r of rows) {
      const set = map.get(r.striver_id);
      if (set) set.add(r.fajr_date);
      else map.set(r.striver_id, new Set([r.fajr_date]));
    }
    return map;
  }

  /** What a visitor without an account sees: first name and an initial. */
  function forViewer(c: C, rows: Standing[]): Standing[] {
    return c.get('user') ? rows : rows.map((r) => ({ ...r, name: shortName(r.name) }));
  }

  function periodRange(period: string | undefined, today: string) {
    if (period === 'week') return { from: addDays(today, -6), to: today, days: 7 };
    if (period === 'all') return { from: '0000-01-01', to: today, days: 0 };
    return { from: addDays(today, -29), to: today, days: 30 };
  }

  async function insertCheckin(
    db: Db,
    v: {
      striverId: string;
      mosque: MosqueRow;
      date: string;
      method: 'qr' | 'poster' | 'list' | 'card';
      byUserId: string | null;
      offsetSec: number;
      distanceM?: number | null;
      device?: string | null;
      at: Date;
    },
  ): Promise<boolean> {
    const rows = await db.query(
      `insert into checkins (id, striver_id, mosque_id, fajr_date, at, method, by_user_id, offset_sec, distance_m, device)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (striver_id, fajr_date) do nothing returning id`,
      [newId(), v.striverId, v.mosque.id, v.date, v.at, v.method, v.byUserId, v.offsetSec, v.distanceM ?? null, v.device ?? null],
    );
    // A first check-in anywhere gives the striver a home mosque.
    await db.query(`update strivers set home_mosque_id = $2 where id = $1 and home_mosque_id is null`, [v.striverId, v.mosque.id]);
    return rows.length > 0;
  }

  async function streakOf(db: Db, striverId: string, today: string) {
    const rows = await db.query<{ fajr_date: string }>(`select fajr_date from checkins where striver_id = $1`, [striverId]);
    const ex = await db.query<{ fajr_date: string }>(`select fajr_date from excuses where striver_id = $1`, [striverId]);
    return streaks(
      rows.map((r) => r.fajr_date),
      today,
      new Set(ex.map((r) => r.fajr_date)),
    );
  }

  // ---------- accounts ----------

  app.post('/auth/signup', async (c) => {
    const v = await body(
      c,
      z.object({
        email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(8).max(200), name, grp: grp.default('adults'),
        inviteCode: z.string().trim().max(20).optional(),
      }),
    );
    const db = c.get('db');
    const [taken] = await db.query(`select 1 from users where email = $1`, [v.email]);
    if (taken) throw new HttpError(409, 'email_taken', 'An account with this email already exists. Sign in instead.');
    const id = newId();
    await db.query(`insert into users (id, email, pass_hash, name, invite_code) values ($1,$2,$3,$4,$5)`, [
      id,
      v.email,
      await hashPassword(v.password),
      v.name,
      newCode(8),
    ]);
    // Invited by a friend: start at their mosque, as their buddy.
    const [inviter] = v.inviteCode
      ? await db.query<{ id: string; home_mosque_id: string | null }>(
          `select s.id, s.home_mosque_id from strivers s join users u on u.id = s.user_id where u.invite_code = $1`,
          [v.inviteCode.toUpperCase()],
        )
      : [];
    const sid = newId();
    await db.query(`insert into strivers (id, name, grp, user_id, card_code, invited_by, home_mosque_id) values ($1,$2,$3,$4,$5,$6,$7)`, [
      sid,
      v.name,
      v.grp,
      id,
      newId(14),
      inviter?.id ?? null,
      inviter?.home_mosque_id ?? null,
    ]);
    if (inviter) await db.query(`insert into buddies (a, b) values ($1,$2), ($2,$1) on conflict do nothing`, [sid, inviter.id]);
    return c.json({ token: await createSession(db, id) });
  });

  app.post('/auth/login', async (c) => {
    const v = await body(c, z.object({ email: z.string().trim().toLowerCase(), password: z.string() }));
    const db = c.get('db');
    const [u] = await db.query<{ id: string; pass_hash: string }>(`select id, pass_hash from users where email = $1`, [v.email]);
    if (!u || !(await verifyPassword(v.password, u.pass_hash))) {
      throw new HttpError(401, 'bad_login', 'That email and password do not match.');
    }
    return c.json({ token: await createSession(db, u.id) });
  });

  app.post('/auth/logout', async (c) => {
    const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (token) await c.get('db').query(`delete from sessions where token_hash = $1`, [sha256(token)]);
    return c.json({ ok: true });
  });

  app.get('/me', async (c) => {
    const u = need(c);
    const db = c.get('db');
    const strivers = await myStrivers(db, u.id);
    const staff = await db.query<{ id: string; name: string; role: string }>(
      `select m.id, m.name, s.role from mosque_staff s join mosques m on m.id = s.mosque_id where s.user_id = $1 order by m.name`,
      [u.id],
    );
    const orgs = await db.query<{ id: string; name: string }>(`select id, name from orgs where owner_user_id = $1 order by name`, [u.id]);
    // Accounts made before invitations existed get their code on first use.
    await db.query(`update users set invite_code = $2 where id = $1 and invite_code is null`, [u.id, newCode(8)]);
    const [code] = await db.query<{ invite_code: string }>(`select invite_code from users where id = $1`, [u.id]);
    return c.json({
      user: { id: u.id, email: u.email, name: u.name, owner: isOwner(u), inviteCode: code.invite_code },
      strivers: strivers.map((s) => ({
        id: s.id,
        name: s.name,
        grp: s.grp,
        self: s.user_id === u.id,
        homeMosqueId: s.home_mosque_id,
        squadId: s.squad_id,
        anonymous: s.anonymous,
        cardCode: s.card_code,
        weeklyGoal: s.weekly_goal,
      })),
      staff,
      orgs,
    });
  });

  app.patch('/me', async (c) => {
    const u = need(c);
    const v = await body(
      c,
      z.object({
        name: name.optional(), grp: grp.optional(), anonymous: z.boolean().optional(), homeMosqueId: z.string().nullable().optional(),
        weeklyGoal: z.number().int().min(0).max(7).optional(),
      }),
    );
    const db = c.get('db');
    if (v.weeklyGoal !== undefined) await db.query(`update strivers set weekly_goal = $2 where user_id = $1`, [u.id, v.weeklyGoal]);
    if (v.name) {
      await db.query(`update users set name = $2 where id = $1`, [u.id, v.name]);
      await db.query(`update strivers set name = $2 where user_id = $1`, [u.id, v.name]);
    }
    if (v.grp) await db.query(`update strivers set grp = $2 where user_id = $1`, [u.id, v.grp]);
    if (v.anonymous !== undefined) {
      await db.query(`update strivers set anonymous = $2 where user_id = $1 or guardian_user_id = $1`, [u.id, v.anonymous]);
    }
    if (v.homeMosqueId !== undefined) {
      if (v.homeMosqueId) await getMosque(db, v.homeMosqueId);
      // The family moves together, and a squad belongs to one mosque.
      await db.query(
        `update strivers set squad_id = case when home_mosque_id is distinct from $2 then null else squad_id end,
           class_id = case when home_mosque_id is distinct from $2 then null else class_id end, home_mosque_id = $2
         where user_id = $1 or guardian_user_id = $1`,
        [u.id, v.homeMosqueId],
      );
    }
    return c.json({ ok: true });
  });

  app.delete('/me', async (c) => {
    const u = need(c);
    const v = await body(c, z.object({ password: z.string() }));
    const db = c.get('db');
    const [row] = await db.query<{ pass_hash: string }>(`select pass_hash from users where id = $1`, [u.id]);
    if (!row || !(await verifyPassword(v.password, row.pass_hash))) {
      throw new HttpError(403, 'bad_password', 'That password is not right.');
    }
    // Cascades to sessions, the account's strivers and their check-ins.
    await db.query(`delete from users where id = $1`, [u.id]);
    return c.json({ ok: true });
  });

  app.post('/family', async (c) => {
    const u = need(c);
    const v = await body(c, z.object({ name, grp }));
    const db = c.get('db');
    const mine = await myStrivers(db, u.id);
    if (mine.length > MAX_FAMILY) throw new HttpError(400, 'limit', `A family can have up to ${MAX_FAMILY} members.`);
    const self = mine.find((s) => s.user_id === u.id);
    const id = newId();
    await db.query(
      `insert into strivers (id, name, grp, guardian_user_id, home_mosque_id, anonymous, card_code) values ($1,$2,$3,$4,$5,$6,$7)`,
      [id, v.name, v.grp, u.id, self?.home_mosque_id ?? null, self?.anonymous ?? false, newId(14)],
    );
    return c.json({ id });
  });

  app.patch('/family/:id', async (c) => {
    const u = need(c);
    const v = await body(c, z.object({ name, grp }));
    const rows = await c
      .get('db')
      .query(`update strivers set name = $3, grp = $4 where id = $1 and guardian_user_id = $2 returning id`, [
        c.req.param('id'),
        u.id,
        v.name,
        v.grp,
      ]);
    if (!rows.length) throw new HttpError(404, 'not_found', 'That family member was not found.');
    return c.json({ ok: true });
  });

  app.delete('/family/:id', async (c) => {
    const u = need(c);
    await c.get('db').query(`delete from strivers where id = $1 and guardian_user_id = $2`, [c.req.param('id'), u.id]);
    return c.json({ ok: true });
  });

  // ---------- mosques ----------

  app.get('/mosques', async (c) => {
    const db = c.get('db');
    const q = (c.req.query('q') ?? '').trim().slice(0, 60);
    const lat = Number(c.req.query('lat'));
    const lng = Number(c.req.query('lng'));
    const rows = await db.query<MosqueRow & { members: number }>(
      `select m.*, (select count(*)::int from strivers s where s.home_mosque_id = m.id) as members
       from mosques m where not m.suspended and ($1 = '' or m.name ilike $2 or m.city ilike $2 or m.country ilike $2)
       order by m.name limit 300`,
      [q, `%${q}%`],
    );
    const hasPos = c.req.query('lat') !== undefined && Number.isFinite(lat) && Number.isFinite(lng);
    const list = rows.map((m) => ({
      id: m.id,
      name: m.name,
      city: m.city,
      country: m.country,
      verified: m.verified,
      members: m.members,
      distanceM: hasPos ? Math.round(distanceM(lat, lng, m.lat, m.lng)) : null,
    }));
    if (hasPos) list.sort((a, b) => a.distanceM! - b.distanceM!);
    return c.json({ mosques: list.slice(0, 50) });
  });

  app.post('/mosques', async (c) => {
    const u = need(c);
    const v = await body(
      c,
      z.object({
        ...mosqueFields,
        calcMethod: mosqueFields.calcMethod.default('MuslimWorldLeague'),
        openBeforeMin: mosqueFields.openBeforeMin.default(30),
        iqamahAfterMin: mosqueFields.iqamahAfterMin.default(20),
        closeAfterSunriseMin: mosqueFields.closeAfterSunriseMin.default(0),
        radiusM: mosqueFields.radiusM.default(200),
        dailyGoal: mosqueFields.dailyGoal.default(0),
        practice: mosqueFields.practice.default(false),
        labels: mosqueFields.labels.default({}),
      }),
    );
    const db = c.get('db');
    const [n] = await db.query<{ n: number }>(`select count(*)::int as n from mosques where created_by = $1`, [u.id]);
    if (n.n >= 10 && !isOwner(u)) throw new HttpError(429, 'limit', 'You have registered the most mosques one account can.');
    const id = newId(10);
    await db.query(
      `insert into mosques (id, name, city, country, lat, lng, timezone, calc_method, open_before_min, iqamah_after_min,
         close_after_sunrise_min, radius_m, daily_goal, practice, qr_secret, static_key, labels, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        id, v.name, v.city, v.country, v.lat, v.lng, v.timezone, v.calcMethod, v.openBeforeMin, v.iqamahAfterMin,
        v.closeAfterSunriseMin, v.radiusM, v.dailyGoal, v.practice, newId(32), newId(16), JSON.stringify(v.labels), u.id,
      ],
    );
    await db.query(`insert into mosque_staff (mosque_id, user_id, role) values ($1, $2, 'admin')`, [id, u.id]);
    await db.query(`update strivers set home_mosque_id = $2 where (user_id = $1 or guardian_user_id = $1) and home_mosque_id is null`, [u.id, id]);
    return c.json({ id });
  });

  app.get('/mosques/:id', async (c) => {
    const db = c.get('db');
    const now = c.get('now');
    const m = await getMosque(db, c.req.param('id'));
    const win = windowJson(m, now);
    const [count] = await db.query<{ n: number }>(`select count(*)::int as n from checkins where mosque_id = $1 and fajr_date = $2`, [m.id, win.today]);
    const early = await db.query<{ name: string; anonymous: boolean; at: Date }>(
      `select s.name, s.anonymous, c.at from checkins c join strivers s on s.id = c.striver_id
       where c.mosque_id = $1 and c.fajr_date = $2 and c.method in ('qr','poster','card') order by c.at limit 3`,
      [m.id, win.today],
    );
    const [members] = await db.query<{ n: number }>(`select count(*)::int as n from strivers where home_mosque_id = $1`, [m.id]);
    const challenges = await db.query<{ id: string; name: string; start_date: string; end_date: string; scope_type: string }>(
      `select id, name, start_date, end_date, scope_type from challenges
       where (scope_type = 'mosque' and scope_id = $1) or (scope_type = 'org' and scope_id = $2)
       order by end_date desc limit 20`,
      [m.id, m.org_id ?? ''],
    );
    const [org] = m.org_id ? await db.query<{ id: string; name: string }>(`select id, name from orgs where id = $1`, [m.org_id]) : [];
    const viewer = c.get('user');
    const [self] = viewer ? await db.query<{ id: string }>(`select id from strivers where user_id = $1`, [viewer.id]) : [];
    const events = await db.query<{ id: string; fajr_date: string; title: string; detail: string; going: number; mine: boolean }>(
      `select e.id, e.fajr_date, e.title, e.detail,
         (select count(*)::int from event_going g where g.event_id = e.id) as going,
         exists (select 1 from event_going g where g.event_id = e.id and g.striver_id = $3) as mine
       from events e where e.mosque_id = $1 and e.fajr_date >= $2 order by e.fajr_date limit 5`,
      [m.id, win.today, self?.id ?? ''],
    );
    const pledges = await db.query<{ id: string; reward: string; target: number; start_date: string; end_date: string; sponsor: string; progress: number }>(
      `select p.id, p.reward, p.target, p.start_date, p.end_date, p.sponsor,
         (select count(*)::int from checkins c where c.mosque_id = p.mosque_id and c.fajr_date between p.start_date and p.end_date) as progress
       from pledges p where p.mosque_id = $1 and p.end_date >= $2 order by p.end_date limit 5`,
      [m.id, addDays(win.today, -14)],
    );
    const showNames = !!viewer || m.public_board;
    return c.json({
      events: events.map((e) => ({ id: e.id, date: e.fajr_date, title: e.title, detail: e.detail, going: e.going, mine: e.mine })),
      pledges: pledges.map((p) => ({ id: p.id, reward: p.reward, target: p.target, startDate: p.start_date, endDate: p.end_date, sponsor: p.sponsor, progress: p.progress })),
      mosque: mosqueJson(m),
      window: win,
      todayCount: count.n,
      members: members.n,
      earlyBirds: showNames ? early.map((e) => ({ name: e.anonymous ? 'Anonymous striver' : viewer ? e.name : shortName(e.name), at: e.at })) : [],
      challenges: challenges.map((ch) => ({
        id: ch.id,
        name: ch.name,
        startDate: ch.start_date,
        endDate: ch.end_date,
        scopeType: ch.scope_type,
        status: win.today < ch.start_date ? 'upcoming' : win.today > ch.end_date ? 'ended' : 'active',
      })),
      org: org ?? null,
      role: await roleAt(c, m.id),
    });
  });

  app.patch('/mosques/:id', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id, true);
    const v = await body(c, z.object({ ...mosqueFields, ...mosqueExtras }).partial());
    const db = c.get('db');
    const m = await getMosque(db, id);
    await db.query(`update mosques set fajr_time = $2, iqamah_time = $3, public_board = $4 where id = $1`, [
      id,
      v.fajrTime === undefined ? m.fajr_time : v.fajrTime,
      v.iqamahTime === undefined ? m.iqamah_time : v.iqamahTime,
      v.publicBoard ?? m.public_board,
    ]);
    await db.query(
      `update mosques set name=$2, city=$3, country=$4, lat=$5, lng=$6, timezone=$7, calc_method=$8, open_before_min=$9,
         iqamah_after_min=$10, close_after_sunrise_min=$11, radius_m=$12, daily_goal=$13, practice=$14, labels=$15 where id=$1`,
      [
        id, v.name ?? m.name, v.city ?? m.city, v.country ?? m.country, v.lat ?? m.lat, v.lng ?? m.lng, v.timezone ?? m.timezone,
        v.calcMethod ?? m.calc_method, v.openBeforeMin ?? m.open_before_min, v.iqamahAfterMin ?? m.iqamah_after_min,
        v.closeAfterSunriseMin ?? m.close_after_sunrise_min, v.radiusM ?? m.radius_m, v.dailyGoal ?? m.daily_goal,
        v.practice ?? m.practice, JSON.stringify({ ...(m.labels ?? {}), ...(v.labels ?? {}) }),
      ],
    );
    return c.json({ ok: true });
  });

  app.get('/mosques/:id/leaderboard', async (c) => {
    const db = c.get('db');
    const m = await getMosque(db, c.req.param('id'));
    const today = localDate(c.get('now'), m.timezone);
    const range = periodRange(c.req.query('period'), today);
    // A mosque can keep its names for people who are signed in.
    if (!c.get('user') && !m.public_board) return c.json({ rows: [], total: 0, today, from: range.from, hidden: true });
    const rows = await homeBoard(db, [m.id], range.from, range.to, false, today);
    return c.json({ rows: forViewer(c, rows.slice(0, 300)), total: rows.length, today, from: range.from, hidden: false });
  });

  app.get('/mosques/:id/squads', async (c) => {
    const db = c.get('db');
    const m = await getMosque(db, c.req.param('id'));
    const today = localDate(c.get('now'), m.timezone);
    const rows = await db.query<{ id: string; name: string; members: number; days: number }>(
      `select q.id, q.name,
         (select count(*)::int from strivers s where s.squad_id = q.id) as members,
         (select count(*)::int from checkins c join strivers s on s.id = c.striver_id where s.squad_id = q.id and c.fajr_date >= $2) as days
       from squads q where q.mosque_id = $1`,
      [m.id, addDays(today, -29)],
    );
    const list = rows
      .filter((r) => r.members > 0)
      .map((r) => ({ ...r, perMember: Math.round((r.days / r.members) * 10) / 10 }))
      .sort((a, b) => b.perMember - a.perMember || b.days - a.days);
    const u = c.get('user');
    let mine: { id: string; name: string; code: string } | null = null;
    if (u) {
      [mine = null] = await db.query<{ id: string; name: string; code: string }>(
        `select q.id, q.name, q.code from squads q join strivers s on s.squad_id = q.id where s.user_id = $1`,
        [u.id],
      );
    }
    return c.json({ squads: list, mine });
  });

  // ---------- squads ----------

  async function selfStriver(c: C) {
    const u = need(c);
    const mine = await myStrivers(c.get('db'), u.id);
    return mine.find((s) => s.user_id === u.id)!;
  }

  app.post('/squads', async (c) => {
    const v = await body(c, z.object({ name: z.string().trim().min(2).max(40) }));
    const me = await selfStriver(c);
    if (!me.home_mosque_id) throw new HttpError(400, 'no_home', 'Choose your home mosque first.');
    const db = c.get('db');
    const id = newId();
    const code = newCode(6);
    await db.query(`insert into squads (id, mosque_id, name, code) values ($1,$2,$3,$4)`, [id, me.home_mosque_id, v.name, code]);
    await db.query(`update strivers set squad_id = $2 where id = $1`, [me.id, id]);
    return c.json({ id, code });
  });

  app.post('/squads/join', async (c) => {
    const v = await body(c, z.object({ code: z.string().trim().toUpperCase() }));
    const me = await selfStriver(c);
    const db = c.get('db');
    const [q] = await db.query<{ id: string; mosque_id: string; name: string }>(`select id, mosque_id, name from squads where code = $1`, [v.code]);
    if (!q) throw new HttpError(404, 'not_found', 'No squad has that code.');
    if (q.mosque_id !== me.home_mosque_id) {
      throw new HttpError(400, 'other_mosque', 'That squad belongs to another mosque. Make it your home mosque first.');
    }
    const [n] = await db.query<{ n: number }>(`select count(*)::int as n from strivers where squad_id = $1`, [q.id]);
    if (n.n >= 10) throw new HttpError(400, 'full', 'That squad is full. A squad has up to 10 members.');
    await db.query(`update strivers set squad_id = $2 where id = $1`, [me.id, q.id]);
    return c.json({ id: q.id, name: q.name });
  });

  app.post('/squads/leave', async (c) => {
    const me = await selfStriver(c);
    await c.get('db').query(`update strivers set squad_id = null where id = $1`, [me.id]);
    return c.json({ ok: true });
  });

  // ---------- check-in ----------

  async function resolveCode(db: Db, raw: string, now: Date) {
    const parsed = parseCode(raw);
    if (!parsed) throw new HttpError(400, 'bad_code', 'That is not a Rijal al-Fajr check-in code.');
    const [m] = await db.query<MosqueRow>(`select * from mosques where id = $1`, [parsed.mosqueId]);
    if (!m || m.suspended) throw new HttpError(400, 'bad_code', 'That is not a Rijal al-Fajr check-in code.');
    const r = checkCode(parsed, m, now);
    if (!r.ok) {
      throw r.reason === 'expired'
        ? new HttpError(400, 'expired_code', 'That code has expired. Scan the code on the screen again.')
        : new HttpError(400, 'bad_code', 'That is not a Rijal al-Fajr check-in code.');
    }
    return { mosque: m, proof: r.proof };
  }

  app.post('/checkin/preview', async (c) => {
    const v = await body(c, z.object({ code: z.string().max(300) }));
    const now = c.get('now');
    const { mosque, proof } = await resolveCode(c.get('db'), v.code, now);
    return c.json({
      mosque: { id: mosque.id, name: mosque.name, city: mosque.city },
      window: windowJson(mosque, now),
      practice: mosque.practice,
      needsLocation: proof === 'poster' && !mosque.practice,
      // Swap a screen code for a hold so signing up does not time it out.
      code: proof === 'screen' ? holdCode(mosque.id, mosque.qr_secret, now) : v.code,
    });
  });

  app.post('/checkin', async (c) => {
    const u = need(c);
    const v = await body(
      c,
      z.object({
        code: z.string().max(300),
        striverIds: z.array(z.string()).min(1).max(MAX_FAMILY + 1),
        lat: z.number().optional(),
        lng: z.number().optional(),
        accuracy: z.number().optional(),
        device: z.string().max(64).optional(),
      }),
    );
    const db = c.get('db');
    const now = c.get('now');
    const { mosque, proof } = await resolveCode(db, v.code, now);
    const ws = windowState(mosque, now);
    if (!ws.open && !mosque.practice) {
      throw new HttpError(400, 'closed', 'Check-in is open only around Fajr.', { opens: ws.current.opens.toISOString() });
    }
    let dist: number | null = null;
    if (proof === 'poster' && !mosque.practice) {
      if (v.lat === undefined || v.lng === undefined) {
        throw new HttpError(400, 'need_location', 'Allow location so we can confirm you are at the mosque.');
      }
      dist = Math.round(distanceM(v.lat, v.lng, mosque.lat, mosque.lng));
      // Phone GPS is often off by tens of metres indoors, so allow for its own stated accuracy.
      const slack = Math.min(Math.max(v.accuracy ?? 0, 0), 150);
      if (dist - slack > mosque.radius_m) {
        throw new HttpError(400, 'too_far', `You seem to be ${dist} m from ${mosque.name}. Check in when you are at the mosque.`);
      }
    }
    const mine = await myStrivers(db, u.id);
    const chosen = mine.filter((s) => v.striverIds.includes(s.id));
    if (chosen.length !== v.striverIds.length) throw new HttpError(403, 'forbidden', 'You can only check in yourself and your family.');
    const date = ws.open ? ws.current.date : ws.today;
    const fajr = fajrWindow(mosque, date).fajr;
    const offsetSec = Math.round((now.getTime() - fajr.getTime()) / 1000);
    const results = [];
    for (const s of chosen) {
      const fresh = await insertCheckin(db, {
        striverId: s.id, mosque, date, method: proof === 'poster' ? 'poster' : 'qr', byUserId: u.id, offsetSec, distanceM: dist, device: v.device, at: now,
      });
      const st = await streakOf(db, s.id, date);
      results.push({ striverId: s.id, name: s.name, fresh, streak: st.current, best: st.best });
    }
    return c.json({ mosque: { id: mosque.id, name: mosque.name }, date, results });
  });

  // ---------- staff: screen, attendance list, cards ----------

  app.get('/mosques/:id/screen', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id);
    const db = c.get('db');
    const now = c.get('now');
    const m = await getMosque(db, id);
    const win = windowJson(m, now);
    const [count] = await db.query<{ n: number }>(`select count(*)::int as n from checkins where mosque_id = $1 and fajr_date = $2`, [id, win.today]);
    const recent = await db.query<{ name: string; anonymous: boolean; at: Date }>(
      `select s.name, s.anonymous, c.at from checkins c join strivers s on s.id = c.striver_id
       where c.mosque_id = $1 and c.fajr_date = $2 order by c.at desc limit 6`,
      [id, win.today],
    );
    const top = await homeBoard(db, [id], addDays(win.today, -29), win.today, false, win.today);
    const sec = Math.floor(now.getTime() / 1000);
    return c.json({
      mosque: { id: m.id, name: m.name, city: m.city, dailyGoal: m.daily_goal, practice: m.practice },
      window: win,
      code: rotatingCode(m.id, m.qr_secret, now),
      posterCode: posterCode(m.id, m.static_key),
      refreshInSec: QR_STEP_SEC - (sec % QR_STEP_SEC),
      todayCount: count.n,
      recent: recent.map((r) => ({ name: r.anonymous ? 'Anonymous striver' : r.name, at: r.at })),
      top: top.slice(0, 3),
    });
  });

  function markDate(m: MosqueRow, now: Date, wanted?: string): string {
    const today = localDate(now, m.timezone);
    const date = wanted ?? today;
    if (date > today || date < addDays(today, -BACKFILL_DAYS)) {
      throw new HttpError(400, 'bad_date', `Attendance can be recorded for today and the ${BACKFILL_DAYS} days before it.`);
    }
    return date;
  }

  app.get('/mosques/:id/roster', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id);
    const db = c.get('db');
    const m = await getMosque(db, id);
    const date = markDate(m, c.get('now'), c.req.query('date'));
    const rows = await db.query<{
      id: string; name: string; grp: Group; managed: boolean; card_code: string; checkin_mosque: string | null; method: string | null; at: Date | null;
      class_id: string | null; excused: boolean; member: boolean;
    }>(
      `select s.id, s.name, s.grp, (s.managed_mosque_id is not null) as managed, s.card_code,
              c.mosque_id as checkin_mosque, c.method, c.at, s.class_id, (e.striver_id is not null) as excused, true as member
       from strivers s left join checkins c on c.striver_id = s.id and c.fajr_date = $2
         left join excuses e on e.striver_id = s.id and e.fajr_date = $2
       where s.home_mosque_id = $1
       union
       select s.id, s.name, s.grp, false, s.card_code, c.mosque_id, c.method, c.at, null, false, false
       from checkins c join strivers s on s.id = c.striver_id
       where c.mosque_id = $1 and c.fajr_date = $2 and s.home_mosque_id is distinct from $1
       order by 2`,
      [id, date],
    );
    return c.json({
      date,
      people: rows.map((r) => ({
        id: r.id, name: r.name, grp: r.grp, managed: r.managed, cardCode: r.card_code,
        present: r.checkin_mosque !== null, here: r.checkin_mosque === id, method: r.method, at: r.at,
        classId: r.class_id, excused: r.excused, member: r.member,
      })),
    });
  });

  app.post('/mosques/:id/roster', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id);
    const v = await body(c, z.object({ name, grp }));
    const sid = newId();
    await c.get('db').query(
      `insert into strivers (id, name, grp, managed_mosque_id, home_mosque_id, card_code) values ($1,$2,$3,$4,$4,$5)`,
      [sid, v.name, v.grp, id, newId(14)],
    );
    return c.json({ id: sid });
  });

  app.delete('/mosques/:id/roster/:sid', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id, true);
    const db = c.get('db');
    // A name the mosque added is deleted; a person with their own account just leaves the mosque.
    await db.query(`delete from strivers where id = $1 and managed_mosque_id = $2`, [c.req.param('sid'), id]);
    await db.query(`update strivers set home_mosque_id = null, squad_id = null where id = $1 and home_mosque_id = $2`, [c.req.param('sid'), id]);
    return c.json({ ok: true });
  });

  app.post('/mosques/:id/mark', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id);
    const v = await body(c, z.object({ striverId: z.string().optional(), cardCode: z.string().optional(), date: dateStr.optional(), present: z.boolean().default(true) }));
    const db = c.get('db');
    const now = c.get('now');
    const m = await getMosque(db, id);
    const date = markDate(m, now, v.date);
    const [s] = v.cardCode
      ? await db.query<{ id: string; name: string; grp: Group }>(`select id, name, grp from strivers where card_code = $1`, [v.cardCode.trim().replace(/^.*\/k\//, '')])
      : await db.query<{ id: string; name: string; grp: Group }>(`select id, name, grp from strivers where id = $1`, [v.striverId ?? '']);
    if (!s) throw new HttpError(404, 'not_found', v.cardCode ? 'That card is not recognised.' : 'That person was not found.');
    if (!v.present) {
      await db.query(`delete from checkins where striver_id = $1 and fajr_date = $2 and mosque_id = $3`, [s.id, date, id]);
      return c.json({ striver: s, date, present: false, fresh: false });
    }
    const fresh = await insertCheckin(db, {
      striverId: s.id, mosque: m, date, method: v.cardCode ? 'card' : 'list', byUserId: c.get('user')!.id,
      offsetSec: m.iqamah_after_min * 60, at: now,
    });
    const st = await streakOf(db, s.id, date);
    return c.json({ striver: s, date, present: true, fresh, streak: st.current });
  });

  app.get('/mosques/:id/stats', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id);
    const db = c.get('db');
    const m = await getMosque(db, id);
    const today = localDate(c.get('now'), m.timezone);
    const from = addDays(today, -13);
    const rows = await db.query<{ fajr_date: string; n: number; phone: number }>(
      `select fajr_date, count(*)::int as n, count(*) filter (where method in ('qr','poster'))::int as phone
       from checkins where mosque_id = $1 and fajr_date >= $2 group by fajr_date`,
      [id, from],
    );
    const by = new Map(rows.map((r) => [r.fajr_date, r]));
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = addDays(from, i);
      return { date: d, count: by.get(d)?.n ?? 0, byPhone: by.get(d)?.phone ?? 0 };
    });
    const [tot] = await db.query<{ members: number; visitors: number }>(
      `select (select count(*)::int from strivers where home_mosque_id = $1) as members,
              (select count(distinct c.striver_id)::int from checkins c join strivers s on s.id = c.striver_id
                where c.mosque_id = $1 and c.fajr_date >= $2 and s.home_mosque_id is distinct from $1) as visitors`,
      [id, addDays(today, -29)],
    );
    // More than three accounts checking in from one phone on one morning is worth a look.
    const flags = await db.query<{ fajr_date: string; n: number }>(
      `select fajr_date, count(distinct by_user_id)::int as n from checkins
       where mosque_id = $1 and fajr_date >= $2 and device is not null group by fajr_date, device having count(distinct by_user_id) > 3`,
      [id, from],
    );
    return c.json({ today, days, members: tot.members, visitors: tot.visitors, flags });
  });

  app.get('/mosques/:id/export.csv', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id);
    const db = c.get('db');
    const m = await getMosque(db, id);
    const today = localDate(c.get('now'), m.timezone);
    const from = dateStr.safeParse(c.req.query('from')).data ?? addDays(today, -89);
    const rows = await db.query<{ fajr_date: string; name: string; grp: string; method: string; at: Date; home: boolean }>(
      `select c.fajr_date, s.name, s.grp, c.method, c.at, (s.home_mosque_id = $1) as home
       from checkins c join strivers s on s.id = c.striver_id where c.mosque_id = $1 and c.fajr_date >= $2
       order by c.fajr_date, c.at`,
      [id, from],
    );
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: m.timezone, hour: '2-digit', minute: '2-digit' });
    const esc = (s: string) => (/[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s);
    const lines = ['date,name,group,method,time,member'];
    for (const r of rows) lines.push([r.fajr_date, esc(r.name), r.grp, r.method, time.format(r.at), r.home ? 'member' : 'visitor'].join(','));
    return c.body(lines.join('\n') + '\n', 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="fajr-attendance-${m.id}.csv"`,
    });
  });

  app.get('/mosques/:id/staff', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id, true);
    const rows = await c.get('db').query(
      `select u.id, u.name, u.email, s.role from mosque_staff s join users u on u.id = s.user_id where s.mosque_id = $1 order by s.role, u.name`,
      [id],
    );
    return c.json({ staff: rows });
  });

  app.post('/mosques/:id/staff', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id, true);
    const v = await body(c, z.object({ email: z.string().trim().toLowerCase(), role: z.enum(['admin', 'volunteer']) }));
    const db = c.get('db');
    const [u] = await db.query<{ id: string }>(`select id from users where email = $1`, [v.email]);
    if (!u) throw new HttpError(404, 'not_found', 'No account uses that email. Ask them to sign up first.');
    await db.query(
      `insert into mosque_staff (mosque_id, user_id, role) values ($1,$2,$3) on conflict (mosque_id, user_id) do update set role = excluded.role`,
      [id, u.id, v.role],
    );
    return c.json({ ok: true });
  });

  app.delete('/mosques/:id/staff/:uid', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id, true);
    const db = c.get('db');
    const [admins] = await db.query<{ n: number }>(`select count(*)::int as n from mosque_staff where mosque_id = $1 and role = 'admin' and user_id <> $2`, [id, c.req.param('uid')]);
    if (admins.n === 0) throw new HttpError(400, 'last_admin', 'A mosque needs at least one admin.');
    await db.query(`delete from mosque_staff where mosque_id = $1 and user_id = $2`, [id, c.req.param('uid')]);
    return c.json({ ok: true });
  });

  app.post('/mosques/:id/org', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id, true);
    const v = await body(c, z.object({ code: z.string().trim().toUpperCase().nullable() }));
    const db = c.get('db');
    if (!v.code) {
      await db.query(`update mosques set org_id = null where id = $1`, [id]);
      return c.json({ org: null });
    }
    const [o] = await db.query<{ id: string; name: string }>(`select id, name from orgs where code = $1`, [v.code]);
    if (!o) throw new HttpError(404, 'not_found', 'No organisation has that code.');
    await db.query(`update mosques set org_id = $2 where id = $1`, [id, o.id]);
    return c.json({ org: o });
  });

  // ---------- strivers ----------

  app.get('/strivers/:id/stats', async (c) => {
    const u = need(c);
    const db = c.get('db');
    const [s] = await db.query<{
      id: string; name: string; grp: Group; user_id: string | null; guardian_user_id: string | null; home_mosque_id: string | null; managed_mosque_id: string | null;
    }>(`select * from strivers where id = $1`, [c.req.param('id')]);
    if (!s) throw new HttpError(404, 'not_found', 'That person was not found.');
    const own = s.user_id === u.id || s.guardian_user_id === u.id;
    if (!own && !(s.home_mosque_id && (await roleAt(c, s.home_mosque_id)))) {
      throw new HttpError(403, 'forbidden', 'You cannot see this person.');
    }
    const rows = await db.query<{ fajr_date: string; offset_sec: number; mosque_id: string; mosque: string }>(
      `select c.fajr_date, c.offset_sec, c.mosque_id, m.name as mosque from checkins c join mosques m on m.id = c.mosque_id
       where c.striver_id = $1 order by c.fajr_date desc`,
      [s.id],
    );
    const [home] = s.home_mosque_id ? await db.query<MosqueRow>(`select * from mosques where id = $1`, [s.home_mosque_id]) : [];
    const today = localDate(c.get('now'), home?.timezone ?? 'UTC');
    const ex = await db.query<{ fajr_date: string }>(`select fajr_date from excuses where striver_id = $1`, [s.id]);
    const st = streaks(rows.map((r) => r.fajr_date), today, new Set(ex.map((r) => r.fajr_date)));
    const [extra] = await db.query<{ weekly_goal: number; invited: number }>(
      `select s.weekly_goal,
         (select count(*)::int from strivers i where i.invited_by = s.id and exists (select 1 from checkins c where c.striver_id = i.id)) as invited
       from strivers s where s.id = $1`,
      [s.id],
    );
    // The week runs Monday to Sunday.
    const [ty, tm, td] = today.split('-').map(Number);
    const monday = addDays(today, -((new Date(Date.UTC(ty, tm - 1, td)).getUTCDay() + 6) % 7));
    let rank: number | null = null;
    let ranked = 0;
    if (home) {
      const board = await homeBoard(db, [home.id], addDays(today, -29), today, false, today);
      ranked = board.length;
      rank = board.find((b) => b.striverId === s.id)?.rank ?? null;
    }
    return c.json({
      striver: { id: s.id, name: s.name, grp: s.grp },
      today,
      total: rows.length,
      streak: st.current,
      best: st.best,
      doneToday: rows.some((r) => r.fajr_date === today),
      dates: rows.filter((r) => r.fajr_date >= addDays(today, -180)).map((r) => r.fajr_date),
      excused: ex.filter((r) => r.fajr_date >= addDays(today, -180)).map((r) => r.fajr_date),
      weeklyGoal: extra.weekly_goal,
      weekDays: rows.filter((r) => r.fajr_date >= monday).length,
      recent: rows.slice(0, 5).map((r) => ({ date: r.fajr_date, mosque: r.mosque })),
      mosques: new Set(rows.map((r) => r.mosque_id)).size,
      rank,
      ranked,
      home: home ? { id: home.id, name: home.name } : null,
      badges: badges({
        total: rows.length,
        best: st.best,
        mosques: new Set(rows.map((r) => r.mosque_id)).size,
        early: rows.filter((r) => r.offset_sec <= 0).length,
        invited: extra.invited,
      }),
    });
  });

  app.get('/strivers/:id/review', async (c) => {
    const u = need(c);
    const db = c.get('db');
    const [s] = await db.query<{ id: string; name: string; user_id: string | null; guardian_user_id: string | null }>(
      `select id, name, user_id, guardian_user_id from strivers where id = $1`,
      [c.req.param('id')],
    );
    if (!s || (s.user_id !== u.id && s.guardian_user_id !== u.id)) throw new HttpError(403, 'forbidden', 'You cannot see this person.');
    const year = /^\d{4}$/.test(c.req.query('year') ?? '') ? c.req.query('year')! : String(c.get('now').getUTCFullYear());
    const rows = await db.query<{ fajr_date: string; offset_sec: number; mosque: string }>(
      `select c.fajr_date, c.offset_sec, m.name as mosque from checkins c join mosques m on m.id = c.mosque_id
       where c.striver_id = $1 and c.fajr_date between $2 and $3 order by c.fajr_date`,
      [s.id, `${year}-01-01`, `${year}-12-31`],
    );
    const ex = await db.query<{ fajr_date: string }>(`select fajr_date from excuses where striver_id = $1`, [s.id]);
    const months = Array.from({ length: 12 }, () => 0);
    const byMosque = new Map<string, number>();
    for (const r of rows) {
      months[Number(r.fajr_date.slice(5, 7)) - 1]++;
      byMosque.set(r.mosque, (byMosque.get(r.mosque) ?? 0) + 1);
    }
    const top = [...byMosque.entries()].sort((a, b) => b[1] - a[1])[0];
    return c.json({
      name: s.name,
      year: Number(year),
      total: rows.length,
      best: streaks(rows.map((r) => r.fajr_date), `${year}-12-31`, new Set(ex.map((r) => r.fajr_date))).best,
      months,
      mosques: byMosque.size,
      topMosque: top ? { name: top[0], days: top[1] } : null,
      beforeAdhan: rows.filter((r) => r.offset_sec <= 0).length,
      first: rows[0]?.fajr_date ?? null,
    });
  });

  // ---------- challenges ----------

  async function savePrizes(db: Db, challengeId: string, prizes: z.infer<typeof prizeSchema>[]) {
    await db.query(`delete from prizes where challenge_id = $1`, [challengeId]);
    for (const p of prizes) {
      if ((p.place === null) === (p.milestoneDays === null)) {
        throw new HttpError(400, 'invalid', 'A prize is either for a place on the podium or for a number of days.');
      }
      await db.query(
        `insert into prizes (id, challenge_id, grp, place, milestone_days, title, detail, sponsor) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [newId(), challengeId, p.grp, p.place, p.milestoneDays, p.title, p.detail, p.sponsor],
      );
    }
  }

  app.post('/challenges', async (c) => {
    need(c);
    const v = await body(c, challengeSchema);
    if (!(await canManageScope(c, v.scopeType, v.scopeId))) throw new HttpError(403, 'forbidden', 'Only an admin can create a challenge.');
    const db = c.get('db');
    const id = newId(10);
    await db.query(
      `insert into challenges (id, scope_type, scope_id, name, start_date, end_date, count_away, rules) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, v.scopeType, v.scopeId, v.name, v.startDate, v.endDate, v.countAway, v.rules],
    );
    await savePrizes(db, id, v.prizes);
    return c.json({ id });
  });

  type ChallengeRow = { id: string; scope_type: 'mosque' | 'org'; scope_id: string; name: string; start_date: string; end_date: string; count_away: boolean; rules: string };

  async function getChallenge(db: Db, id: string) {
    const [ch] = await db.query<ChallengeRow>(`select * from challenges where id = $1`, [id]);
    if (!ch) throw new HttpError(404, 'not_found', 'That challenge was not found.');
    return ch;
  }

  app.put('/challenges/:id', async (c) => {
    need(c);
    const db = c.get('db');
    const ch = await getChallenge(db, c.req.param('id'));
    if (!(await canManageScope(c, ch.scope_type, ch.scope_id))) throw new HttpError(403, 'forbidden', 'Only an admin can change a challenge.');
    const v = await body(c, challengeSchema);
    await db.query(`update challenges set name=$2, start_date=$3, end_date=$4, count_away=$5, rules=$6 where id=$1`, [
      ch.id, v.name, v.startDate, v.endDate, v.countAway, v.rules,
    ]);
    await savePrizes(db, ch.id, v.prizes);
    return c.json({ ok: true });
  });

  app.delete('/challenges/:id', async (c) => {
    need(c);
    const db = c.get('db');
    const ch = await getChallenge(db, c.req.param('id'));
    if (!(await canManageScope(c, ch.scope_type, ch.scope_id))) throw new HttpError(403, 'forbidden', 'Only an admin can delete a challenge.');
    await db.query(`delete from challenges where id = $1`, [ch.id]);
    return c.json({ ok: true });
  });

  app.get('/challenges/:id', async (c) => {
    const db = c.get('db');
    const ch = await getChallenge(db, c.req.param('id'));
    let mosqueIds: string[];
    let scopeName: string;
    let tz = 'UTC';
    let labels = { kids: 'Kids', youth: 'Youth', adults: 'Adults' };
    if (ch.scope_type === 'mosque') {
      const m = await getMosque(db, ch.scope_id);
      mosqueIds = [m.id];
      scopeName = m.name;
      tz = m.timezone;
      labels = mosqueJson(m).labels;
    } else {
      const [o] = await db.query<{ name: string }>(`select name from orgs where id = $1`, [ch.scope_id]);
      const ms = await db.query<{ id: string; timezone: string }>(`select id, timezone from mosques where org_id = $1 and not suspended`, [ch.scope_id]);
      mosqueIds = ms.map((m) => m.id);
      scopeName = o?.name ?? 'Organisation';
      tz = ms[0]?.timezone ?? 'UTC';
    }
    const today = localDate(c.get('now'), tz);
    const to = today < ch.end_date ? today : ch.end_date;
    let hidden = false;
    if (ch.scope_type === 'mosque' && !c.get('user')) hidden = !(await getMosque(db, ch.scope_id)).public_board;
    const rows = to >= ch.start_date && !hidden ? await homeBoard(db, mosqueIds, ch.start_date, to, !ch.count_away, to) : [];
    const prizes = await db.query<{ id: string; grp: string; place: number | null; milestone_days: number | null; title: string; detail: string; sponsor: string }>(
      `select * from prizes where challenge_id = $1 order by place nulls last, milestone_days`,
      [ch.id],
    );
    return c.json({
      challenge: {
        id: ch.id, name: ch.name, startDate: ch.start_date, endDate: ch.end_date, countAway: ch.count_away, rules: ch.rules,
        scopeType: ch.scope_type, scopeId: ch.scope_id, scopeName,
        status: today < ch.start_date ? 'upcoming' : today > ch.end_date ? 'ended' : 'active',
      },
      labels,
      today,
      prizes: prizes.map((p) => ({ grp: p.grp, place: p.place, milestoneDays: p.milestone_days, title: p.title, detail: p.detail, sponsor: p.sponsor })),
      rows: forViewer(c, rows.slice(0, 500)),
      hidden,
      canEdit: await canManageScope(c, ch.scope_type, ch.scope_id),
    });
  });

  // ---------- organisations ----------

  app.post('/orgs', async (c) => {
    const u = need(c);
    const v = await body(c, z.object({ name: z.string().trim().min(2).max(80) }));
    const id = newId(10);
    const code = newCode(6);
    await c.get('db').query(`insert into orgs (id, name, code, owner_user_id) values ($1,$2,$3,$4)`, [id, v.name, code, u.id]);
    return c.json({ id, code });
  });

  app.get('/orgs/:id', async (c) => {
    const db = c.get('db');
    const [o] = await db.query<{ id: string; name: string; code: string; owner_user_id: string }>(`select * from orgs where id = $1`, [c.req.param('id')]);
    if (!o) throw new HttpError(404, 'not_found', 'That organisation was not found.');
    const today = localDate(c.get('now'), 'UTC');
    const from = addDays(today, -30);
    const mosques = await db.query<{ id: string; name: string; city: string; total: number; strivers: number }>(
      `select m.id, m.name, m.city, count(c.id)::int as total, count(distinct c.striver_id)::int as strivers
       from mosques m left join checkins c on c.mosque_id = m.id and c.fajr_date >= $2
       where m.org_id = $1 and not m.suspended group by m.id order by total desc, m.name`,
      [o.id, from],
    );
    const top = forViewer(c, rerank(await homeBoard(db, mosques.map((m) => m.id), from, addDays(today, 1), false, today)).slice(0, 20));
    const challenges = await db.query<{ id: string; name: string; start_date: string; end_date: string }>(
      `select id, name, start_date, end_date from challenges where scope_type = 'org' and scope_id = $1 order by end_date desc`,
      [o.id],
    );
    const u = c.get('user');
    const mine = !!u && (u.id === o.owner_user_id || isOwner(u));
    return c.json({
      org: { id: o.id, name: o.name, code: mine ? o.code : null },
      mosques,
      top,
      challenges: challenges.map((ch) => ({
        id: ch.id, name: ch.name, startDate: ch.start_date, endDate: ch.end_date,
        status: today < ch.start_date ? 'upcoming' : today > ch.end_date ? 'ended' : 'active',
      })),
      canEdit: mine,
    });
  });

  // ---------- world ----------

  app.get('/world', async (c) => {
    const db = c.get('db');
    const today = localDate(c.get('now'), 'UTC');
    const seasons = await db.query<{ id: string; name: string; start_date: string; end_date: string }>(
      `select id, name, start_date, end_date from seasons where end_date >= $1 order by start_date limit 6`,
      [addDays(today, -30)],
    );
    const season = seasons.find((x) => x.id === c.req.query('season'));
    const range = season
      ? { from: season.start_date, to: season.end_date, days: Math.max(1, daysBetween(season.start_date, today < season.end_date ? today : season.end_date) + 1) }
      : { ...periodRange(c.req.query('period'), today), to: '9999-12-31' };
    const country = (c.req.query('country') ?? '').trim();
    const rows = await db.query<{ id: string; name: string; city: string; country: string; total: number; strivers: number; days: number }>(
      `select m.id, m.name, m.city, m.country, count(c.id)::int as total, count(distinct c.striver_id)::int as strivers,
              count(distinct c.fajr_date)::int as days
       from mosques m join checkins c on c.mosque_id = m.id and c.fajr_date between $1 and $3
       where m.verified and not m.practice and not m.suspended and ($2 = '' or m.country = $2)
       group by m.id`,
      [range.from, country, range.to],
    );
    const list = rows.map((r) => {
      const span = range.days || Math.max(r.days, 1);
      return { ...r, consistency: r.strivers >= 5 ? Math.min(100, Math.round((r.total / (r.strivers * span)) * 100)) : null };
    });
    if (c.req.query('sort') === 'consistency') {
      list.sort((x, y) => (y.consistency ?? -1) - (x.consistency ?? -1) || y.total - x.total);
    } else list.sort((x, y) => y.total - x.total || x.name.localeCompare(y.name));
    // The same check-ins, added up by city or by country.
    const group = c.req.query('group');
    const groups = new Map<string, { name: string; country: string; total: number; mosques: number }>();
    if (group === 'city' || group === 'country') {
      for (const r of rows) {
        const key = group === 'city' ? `${r.city}|${r.country}` : r.country;
        if (!(group === 'city' ? r.city : r.country)) continue;
        const g = groups.get(key) ?? { name: group === 'city' ? r.city : r.country, country: r.country, total: 0, mosques: 0 };
        g.total += r.total;
        g.mosques += 1;
        groups.set(key, g);
      }
    }
    const countries = await db.query<{ country: string }>(
      `select distinct country from mosques where verified and not practice and not suspended and country <> '' order by country`,
    );
    return c.json({
      rows: list.slice(0, 200),
      groups: [...groups.values()].sort((x, y) => y.total - x.total || x.name.localeCompare(y.name)).slice(0, 200),
      countries: countries.map((r) => r.country),
      seasons: seasons.map((x) => ({
        id: x.id, name: x.name, startDate: x.start_date, endDate: x.end_date,
        status: today < x.start_date ? 'upcoming' : today > x.end_date ? 'ended' : 'active',
      })),
    });
  });

  // ---------- buddies ----------

  app.get('/buddies', async (c) => {
    const me = await selfStriver(c);
    const db = c.get('db');
    const now = c.get('now');
    const rows = await db.query<{ id: string; name: string; mosque: string | null; timezone: string | null }>(
      `select s.id, s.name, m.name as mosque, m.timezone from buddies b join strivers s on s.id = b.b
       left join mosques m on m.id = s.home_mosque_id where b.a = $1 order by s.name`,
      [me.id],
    );
    const ids = rows.map((r) => r.id);
    const dates = ids.length ? await db.query<{ striver_id: string; fajr_date: string }>(`select striver_id, fajr_date from checkins where striver_id = any($1)`, [ids]) : [];
    const ex = ids.length ? await db.query<{ striver_id: string; fajr_date: string }>(`select striver_id, fajr_date from excuses where striver_id = any($1)`, [ids]) : [];
    const excused = excusedMap(ex);
    const day = localDate(now, 'UTC');
    const sent = await db.query<{ to_striver: string }>(`select to_striver from nudges where from_striver = $1 and day = $2`, [me.id, day]);
    const nudges = await db.query<{ id: string; name: string }>(
      `select n.id, s.name from nudges n join strivers s on s.id = n.from_striver where n.to_striver = $1 and not n.seen order by n.created_at desc limit 10`,
      [me.id],
    );
    return c.json({
      buddies: rows.map((r) => {
        const mine = dates.filter((d) => d.striver_id === r.id).map((d) => d.fajr_date);
        const today = localDate(now, r.timezone ?? 'UTC');
        return {
          striverId: r.id, name: r.name, mosque: r.mosque, doneToday: mine.includes(today),
          streak: streaks(mine, today, excused.get(r.id)).current, nudged: sent.some((x) => x.to_striver === r.id),
        };
      }),
      nudges,
    });
  });

  app.post('/buddies', async (c) => {
    const v = await body(c, z.object({ code: z.string().trim().toUpperCase().min(4).max(20) }));
    const me = await selfStriver(c);
    const db = c.get('db');
    const [other] = await db.query<{ id: string; name: string }>(
      `select s.id, s.name from strivers s join users u on u.id = s.user_id where u.invite_code = $1`,
      [v.code],
    );
    if (!other) throw new HttpError(404, 'not_found', 'No one has that code. Check it with your friend.');
    if (other.id === me.id) throw new HttpError(400, 'self', 'That is your own code. Share it with a friend.');
    const [n] = await db.query<{ n: number }>(`select count(*)::int as n from buddies where a = $1`, [me.id]);
    if (n.n >= 10) throw new HttpError(400, 'limit', 'You can have up to 10 buddies.');
    await db.query(`insert into buddies (a, b) values ($1,$2), ($2,$1) on conflict do nothing`, [me.id, other.id]);
    return c.json({ name: other.name });
  });

  app.delete('/buddies/:sid', async (c) => {
    const me = await selfStriver(c);
    await c.get('db').query(`delete from buddies where (a = $1 and b = $2) or (a = $2 and b = $1)`, [me.id, c.req.param('sid')]);
    return c.json({ ok: true });
  });

  app.post('/buddies/:sid/nudge', async (c) => {
    const me = await selfStriver(c);
    const db = c.get('db');
    const [pair] = await db.query(`select 1 from buddies where a = $1 and b = $2`, [me.id, c.req.param('sid')]);
    if (!pair) throw new HttpError(403, 'forbidden', 'You can only nudge your buddies.');
    // One nudge per buddy per day.
    const rows = await db.query(
      `insert into nudges (id, from_striver, to_striver, day) values ($1,$2,$3,$4) on conflict (from_striver, to_striver, day) do nothing returning id`,
      [newId(), me.id, c.req.param('sid'), localDate(c.get('now'), 'UTC')],
    );
    return c.json({ sent: rows.length > 0 });
  });

  app.post('/nudges/seen', async (c) => {
    const me = await selfStriver(c);
    await c.get('db').query(`update nudges set seen = true where to_striver = $1`, [me.id]);
    return c.json({ ok: true });
  });

  // ---------- excused days ----------

  app.post('/mosques/:id/excuse', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id);
    const v = await body(c, z.object({ striverId: z.string(), date: dateStr, excused: z.boolean() }));
    const db = c.get('db');
    const m = await getMosque(db, id);
    const today = localDate(c.get('now'), m.timezone);
    if (v.date < addDays(today, -7) || v.date > addDays(today, 14)) {
      throw new HttpError(400, 'bad_date', 'A day can be excused from a week back to two weeks ahead.');
    }
    const [s] = await db.query<{ id: string }>(`select id from strivers where id = $1 and home_mosque_id = $2`, [v.striverId, id]);
    if (!s) throw new HttpError(404, 'not_found', 'Only a member of this mosque can be excused here.');
    if (v.excused) {
      await db.query(`insert into excuses (striver_id, fajr_date, mosque_id, by_user_id) values ($1,$2,$3,$4) on conflict do nothing`, [
        s.id, v.date, id, c.get('user')!.id,
      ]);
    } else await db.query(`delete from excuses where striver_id = $1 and fajr_date = $2`, [s.id, v.date]);
    return c.json({ ok: true });
  });

  // ---------- classes ----------

  app.get('/mosques/:id/classes', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id);
    const rows = await c.get('db').query<{ id: string; name: string; members: number }>(
      `select k.id, k.name, (select count(*)::int from strivers s where s.class_id = k.id) as members from classes k where k.mosque_id = $1 order by k.name`,
      [id],
    );
    return c.json({ classes: rows });
  });

  app.post('/mosques/:id/classes', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id);
    const v = await body(c, z.object({ name: z.string().trim().min(2).max(40) }));
    const cid = newId(10);
    await c.get('db').query(`insert into classes (id, mosque_id, name) values ($1,$2,$3)`, [cid, id, v.name]);
    return c.json({ id: cid });
  });

  async function getClass(db: Db, id: string) {
    const [k] = await db.query<{ id: string; name: string; mosque_id: string }>(`select * from classes where id = $1`, [id]);
    if (!k) throw new HttpError(404, 'not_found', 'That class was not found.');
    return k;
  }

  app.delete('/classes/:id', async (c) => {
    const db = c.get('db');
    const k = await getClass(db, c.req.param('id'));
    await needStaff(c, k.mosque_id, true);
    await db.query(`delete from classes where id = $1`, [k.id]);
    return c.json({ ok: true });
  });

  app.post('/classes/:id/members', async (c) => {
    const db = c.get('db');
    const k = await getClass(db, c.req.param('id'));
    await needStaff(c, k.mosque_id);
    const v = await body(c, z.object({ striverId: z.string(), member: z.boolean() }));
    const rows = await db.query(
      `update strivers set class_id = $3 where id = $1 and home_mosque_id = $2 and ($3::text is not null or class_id = $4) returning id`,
      [v.striverId, k.mosque_id, v.member ? k.id : null, k.id],
    );
    if (!rows.length && v.member) throw new HttpError(404, 'not_found', 'Only a member of this mosque can join the class.');
    return c.json({ ok: true });
  });

  app.get('/classes/:id', async (c) => {
    const db = c.get('db');
    const k = await getClass(db, c.req.param('id'));
    const m = await getMosque(db, k.mosque_id);
    const today = localDate(c.get('now'), m.timezone);
    const range = periodRange(c.req.query('period'), today);
    const role = await roleAt(c, m.id);
    if (!c.get('user') && !m.public_board) return c.json({ class: { id: k.id, name: k.name, mosqueId: m.id, mosqueName: m.name }, rows: [], members: [], role, hidden: true });
    const members = await db.query<StriverRow>(`select id, name, grp, anonymous, squad_id from strivers where class_id = $1 order by name`, [k.id]);
    const ids = members.map((x) => x.id);
    const checkins = ids.length
      ? await db.query<CheckinRow>(`select striver_id, fajr_date, offset_sec from checkins where striver_id = any($1) and fajr_date between $2 and $3`, [ids, range.from, range.to])
      : [];
    const ex = ids.length ? await db.query<{ striver_id: string; fajr_date: string }>(`select striver_id, fajr_date from excuses where striver_id = any($1)`, [ids]) : [];
    return c.json({
      class: { id: k.id, name: k.name, mosqueId: m.id, mosqueName: m.name },
      rows: forViewer(c, standings(members, checkins, today, excusedMap(ex))),
      // Staff see everyone in the class, including those yet to check in.
      members: role ? members.map((x) => ({ id: x.id, name: x.name })) : [],
      role,
      hidden: false,
    });
  });

  // ---------- after Fajr ----------

  app.post('/mosques/:id/events', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id);
    const v = await body(c, z.object({ title: z.string().trim().min(2).max(80), detail: z.string().trim().max(300).default(''), date: dateStr }));
    const db = c.get('db');
    const m = await getMosque(db, id);
    const today = localDate(c.get('now'), m.timezone);
    if (v.date < today || v.date > addDays(today, 60)) throw new HttpError(400, 'bad_date', 'Choose a day from today up to two months ahead.');
    const eid = newId();
    await db.query(`insert into events (id, mosque_id, fajr_date, title, detail) values ($1,$2,$3,$4,$5)`, [eid, id, v.date, v.title, v.detail]);
    return c.json({ id: eid });
  });

  app.delete('/events/:id', async (c) => {
    const db = c.get('db');
    const [e] = await db.query<{ mosque_id: string }>(`select mosque_id from events where id = $1`, [c.req.param('id')]);
    if (!e) return c.json({ ok: true });
    await needStaff(c, e.mosque_id);
    await db.query(`delete from events where id = $1`, [c.req.param('id')]);
    return c.json({ ok: true });
  });

  app.post('/events/:id/going', async (c) => {
    const v = await body(c, z.object({ going: z.boolean() }));
    const me = await selfStriver(c);
    const db = c.get('db');
    const [e] = await db.query(`select 1 from events where id = $1`, [c.req.param('id')]);
    if (!e) throw new HttpError(404, 'not_found', 'That event was not found.');
    if (v.going) await db.query(`insert into event_going (event_id, striver_id) values ($1,$2) on conflict do nothing`, [c.req.param('id'), me.id]);
    else await db.query(`delete from event_going where event_id = $1 and striver_id = $2`, [c.req.param('id'), me.id]);
    return c.json({ ok: true });
  });

  // ---------- shared targets ----------

  app.post('/mosques/:id/pledges', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id, true);
    const v = await body(
      c,
      z
        .object({
          reward: z.string().trim().min(2).max(120), target: z.number().int().min(1).max(10000000), startDate: dateStr, endDate: dateStr,
          sponsor: z.string().trim().max(80).default(''),
        })
        .refine((x) => x.endDate >= x.startDate, 'The end date is before the start date'),
    );
    const pid = newId();
    await c.get('db').query(`insert into pledges (id, mosque_id, reward, target, start_date, end_date, sponsor) values ($1,$2,$3,$4,$5,$6,$7)`, [
      pid, id, v.reward, v.target, v.startDate, v.endDate, v.sponsor,
    ]);
    return c.json({ id: pid });
  });

  app.delete('/pledges/:id', async (c) => {
    const db = c.get('db');
    const [p] = await db.query<{ mosque_id: string }>(`select mosque_id from pledges where id = $1`, [c.req.param('id')]);
    if (!p) return c.json({ ok: true });
    await needStaff(c, p.mosque_id, true);
    await db.query(`delete from pledges where id = $1`, [c.req.param('id')]);
    return c.json({ ok: true });
  });

  // ---------- sponsors ----------

  const SPONSOR_KINDS = ['prizes', 'breakfast', 'funds', 'vouchers', 'other'] as const;
  const sponsorSchema = z
    .object({
      name: z.string().trim().min(2).max(80),
      email: z.string().trim().toLowerCase().email().max(200),
      phone: z.string().trim().max(40).default(''),
      country: z.string().trim().min(2).max(60),
      city: z.string().trim().max(60).default(''),
      kinds: z.array(z.enum(SPONSOR_KINDS)).min(1, 'Choose at least one way to sponsor'),
      note: z.string().trim().max(500).default(''),
      scope: z.enum(['country', 'mosque']),
      mosqueId: z.string().nullable().default(null),
    })
    .refine((v) => v.scope === 'country' || !!v.mosqueId, 'Choose the mosque you want to sponsor');

  type SponsorRow = {
    id: string; user_id: string; name: string; email: string; phone: string; country: string; city: string;
    kinds: string[]; note: string; scope: 'country' | 'mosque'; mosque_id: string | null; mosque_name: string | null; created_at: Date;
  };
  const sponsorJson = (r: SponsorRow) => ({
    id: r.id, name: r.name, email: r.email, phone: r.phone, country: r.country, city: r.city, kinds: r.kinds, note: r.note,
    scope: r.scope, mosqueId: r.mosque_id, mosqueName: r.mosque_name, createdAt: r.created_at,
  });
  const SPONSOR_SELECT = `select s.*, m.name as mosque_name from sponsors s left join mosques m on m.id = s.mosque_id`;

  app.post('/sponsors', async (c) => {
    const u = need(c);
    const v = await body(c, sponsorSchema);
    const db = c.get('db');
    const [n] = await db.query<{ n: number }>(`select count(*)::int as n from sponsors where user_id = $1`, [u.id]);
    if (n.n >= 5) throw new HttpError(429, 'limit', 'One account can make up to 5 sponsor offers.');
    if (v.scope === 'mosque') await getMosque(db, v.mosqueId!);
    const id = newId();
    await db.query(
      `insert into sponsors (id, user_id, name, email, phone, country, city, kinds, note, scope, mosque_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, u.id, v.name, v.email, v.phone, v.country, v.city, JSON.stringify(v.kinds), v.note, v.scope, v.scope === 'mosque' ? v.mosqueId : null],
    );
    return c.json({ id });
  });

  app.get('/sponsors/mine', async (c) => {
    const u = need(c);
    const rows = await c.get('db').query<SponsorRow>(`${SPONSOR_SELECT} where s.user_id = $1 order by s.created_at desc`, [u.id]);
    return c.json({ sponsors: rows.map(sponsorJson) });
  });

  app.put('/sponsors/:id', async (c) => {
    const u = need(c);
    const v = await body(c, sponsorSchema);
    const db = c.get('db');
    if (v.scope === 'mosque') await getMosque(db, v.mosqueId!);
    const rows = await db.query(
      `update sponsors set name=$3, email=$4, phone=$5, country=$6, city=$7, kinds=$8, note=$9, scope=$10, mosque_id=$11
       where id = $1 and user_id = $2 returning id`,
      [c.req.param('id'), u.id, v.name, v.email, v.phone, v.country, v.city, JSON.stringify(v.kinds), v.note, v.scope, v.scope === 'mosque' ? v.mosqueId : null],
    );
    if (!rows.length) throw new HttpError(404, 'not_found', 'That sponsor offer was not found.');
    return c.json({ ok: true });
  });

  app.delete('/sponsors/:id', async (c) => {
    const u = need(c);
    await c.get('db').query(`delete from sponsors where id = $1 and (user_id = $2 or $3::boolean)`, [c.req.param('id'), u.id, isOwner(u)]);
    return c.json({ ok: true });
  });

  // Contact details are for the people who run a mosque or organisation, not for the public.
  app.get('/mosques/:id/sponsors', async (c) => {
    const id = c.req.param('id');
    await needStaff(c, id, true);
    const db = c.get('db');
    const m = await getMosque(db, id);
    const rows = await db.query<SponsorRow>(
      `${SPONSOR_SELECT} where s.mosque_id = $1 or (s.scope = 'country' and lower(s.country) = lower($2) and $2 <> '')
       order by (s.mosque_id is null), s.created_at desc limit 200`,
      [id, m.country.trim()],
    );
    return c.json({ sponsors: rows.map(sponsorJson), country: m.country });
  });

  app.get('/orgs/:id/sponsors', async (c) => {
    const id = c.req.param('id');
    need(c);
    if (!(await canManageScope(c, 'org', id))) throw new HttpError(403, 'forbidden', 'Only the organisation owner can see its sponsors.');
    const rows = await c.get('db').query<SponsorRow>(
      `${SPONSOR_SELECT} where s.mosque_id in (select id from mosques where org_id = $1)
         or (s.scope = 'country' and lower(s.country) in (select lower(trim(country)) from mosques where org_id = $1 and country <> ''))
       order by (s.mosque_id is null), s.created_at desc limit 200`,
      [id],
    );
    return c.json({ sponsors: rows.map(sponsorJson) });
  });

  // ---------- reports and the owner console ----------

  app.post('/reports', async (c) => {
    const u = need(c);
    const v = await body(c, z.object({ targetType: z.enum(['mosque', 'striver', 'challenge']), targetId: z.string().max(40), reason: z.string().trim().min(3).max(500) }));
    await c.get('db').query(`insert into reports (id, reporter_user_id, target_type, target_id, reason) values ($1,$2,$3,$4,$5)`, [
      newId(), u.id, v.targetType, v.targetId, v.reason,
    ]);
    return c.json({ ok: true });
  });

  function needOwner(c: C) {
    if (!isOwner(need(c))) throw new HttpError(403, 'forbidden', 'This page is for the app owner.');
  }

  app.get('/owner', async (c) => {
    needOwner(c);
    const db = c.get('db');
    const mosques = await db.query(
      `select m.id, m.name, m.city, m.country, m.verified, m.suspended, m.practice, m.created_at,
              (select count(*)::int from checkins c where c.mosque_id = m.id) as checkins,
              (select count(*)::int from strivers s where s.home_mosque_id = m.id) as members
       from mosques m order by m.verified, m.created_at desc limit 500`,
    );
    const reports = await db.query(
      `select r.id, r.target_type, r.target_id, r.reason, r.created_at, u.email as reporter
       from reports r left join users u on u.id = r.reporter_user_id where r.resolved_at is null order by r.created_at desc limit 200`,
    );
    const [totals] = await db.query(
      `select (select count(*)::int from users) as users, (select count(*)::int from strivers) as strivers,
              (select count(*)::int from mosques) as mosques, (select count(*)::int from checkins) as checkins`,
    );
    const sponsors = await db.query<SponsorRow>(`${SPONSOR_SELECT} order by s.created_at desc limit 200`);
    const seasons = await db.query(`select id, name, start_date as "startDate", end_date as "endDate" from seasons order by start_date desc limit 50`);
    return c.json({ mosques, reports, totals, sponsors: sponsors.map(sponsorJson), seasons });
  });

  // A season is a worldwide table for a set of dates, such as a winter 40 days.
  app.post('/owner/seasons', async (c) => {
    needOwner(c);
    const v = await body(
      c,
      z.object({ name: z.string().trim().min(2).max(60), startDate: dateStr, endDate: dateStr }).refine((x) => x.endDate >= x.startDate, 'The end date is before the start date'),
    );
    const id = newId(10);
    await c.get('db').query(`insert into seasons (id, name, start_date, end_date) values ($1,$2,$3,$4)`, [id, v.name, v.startDate, v.endDate]);
    return c.json({ id });
  });

  app.delete('/owner/seasons/:id', async (c) => {
    needOwner(c);
    await c.get('db').query(`delete from seasons where id = $1`, [c.req.param('id')]);
    return c.json({ ok: true });
  });

  app.post('/owner/mosques/:id', async (c) => {
    needOwner(c);
    const v = await body(c, z.object({ verified: z.boolean().optional(), suspended: z.boolean().optional() }));
    const db = c.get('db');
    const m = await getMosque(db, c.req.param('id'));
    await db.query(`update mosques set verified = $2, suspended = $3 where id = $1`, [m.id, v.verified ?? m.verified, v.suspended ?? m.suspended]);
    return c.json({ ok: true });
  });

  app.post('/owner/reports/:id/resolve', async (c) => {
    needOwner(c);
    await c.get('db').query(`update reports set resolved_at = now() where id = $1`, [c.req.param('id')]);
    return c.json({ ok: true });
  });

  app.get('/health', (c) => c.json({ ok: true }));
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found.' } }, 404));

  return app;
}
