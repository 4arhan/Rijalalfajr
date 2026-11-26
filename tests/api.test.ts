import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';
import { openDb, type Db } from '../server/db.js';
import { addDays, fajrWindow } from '../server/fajr.js';
import { standings, streaks } from '../server/board.js';

const LONDON = { lat: 51.5074, lng: -0.1278, timezone: 'Europe/London' };
const DAY = '2026-11-26';
const timing = { ...LONDON, calc_method: 'MuslimWorldLeague', open_before_min: 30, iqamah_after_min: 20, close_after_sunrise_min: 0 };
const win = fajrWindow(timing, DAY);

let db: Db;
let now = new Date(win.fajr.getTime() + 5 * 60000);
let app: ReturnType<typeof createApp>;

async function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await app.request('/api' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: any = text;
  try { json = JSON.parse(text); } catch { /* csv */ }
  return { status: res.status, json };
}

async function signup(email: string, name: string, grp = 'adults') {
  const r = await call('POST', '/auth/signup', { body: { email, password: 'password123', name, grp } });
  expect(r.status).toBe(200);
  const me = await call('GET', '/me', { token: r.json.token });
  return { token: r.json.token as string, self: me.json.strivers[0].id as string, userId: me.json.user.id as string };
}

async function screenCode(token: string, mosqueId: string) {
  const r = await call('GET', `/mosques/${mosqueId}/screen`, { token });
  expect(r.status).toBe(200);
  return r.json;
}

let admin: Awaited<ReturnType<typeof signup>>;
let ali: Awaited<ReturnType<typeof signup>>;
let mosqueId: string;

beforeAll(async () => {
  // Set TEST_DATABASE_URL to run the same tests against a real, empty Postgres database.
  db = process.env.TEST_DATABASE_URL ? await openDb({ url: process.env.TEST_DATABASE_URL }) : await openDb({ memory: true });
  app = createApp({ db: async () => db, now: () => now, ownerEmails: ['owner@example.com'] });
  admin = await signup('admin@example.com', 'Imam Yusuf');
  ali = await signup('ali@example.com', 'Ali');
  const m = await call('POST', '/mosques', { token: admin.token, body: { name: 'East London Masjid', city: 'London', country: 'United Kingdom', ...LONDON } });
  expect(m.status).toBe(200);
  mosqueId = m.json.id;
});

describe('fajr window', () => {
  it('opens before the adhan and closes at sunrise, in the mosque timezone', () => {
    expect(win.fajr.getUTCHours()).toBeGreaterThanOrEqual(5);
    expect(win.fajr.getUTCHours()).toBeLessThan(7);
    expect(win.opens.getTime()).toBe(win.fajr.getTime() - 30 * 60000);
    expect(win.closes.getTime()).toBe(win.sunrise.getTime());
    expect(win.sunrise.getTime()).toBeGreaterThan(win.fajr.getTime() + 60 * 60000);
  });
});

describe('streaks and standings', () => {
  it('keeps a streak alive until a Fajr is missed', () => {
    expect(streaks(['2026-11-24', '2026-11-25'], '2026-11-26')).toEqual({ best: 2, current: 2 });
    expect(streaks(['2026-11-23', '2026-11-24'], '2026-11-26')).toEqual({ best: 2, current: 0 });
    expect(streaks(['2026-11-20', '2026-11-22', '2026-11-23', '2026-11-24'], '2026-11-24')).toEqual({ best: 3, current: 3 });
  });
  it('ranks by days, then longest streak, then earliest arrival', () => {
    const s = (id: string) => ({ id, name: id, grp: 'adults' as const, anonymous: false, squad_id: null });
    const c = (striver_id: string, d: number, offset_sec = 0) => ({ striver_id, fajr_date: addDays('2026-11-01', d), offset_sec });
    const rows = standings(
      [s('gap'), s('late'), s('early'), s('two')],
      [c('gap', 0), c('gap', 2), c('gap', 4), c('late', 0, 600), c('late', 1, 600), c('late', 2, 600), c('early', 0, -60), c('early', 1, -60), c('early', 2, -60), c('two', 0), c('two', 1)],
      '2026-11-05',
    );
    expect(rows.map((r) => r.striverId)).toEqual(['early', 'late', 'gap', 'two']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });
});

describe('check-in', () => {
  it('rejects a wrong password and a duplicate email', async () => {
    expect((await call('POST', '/auth/login', { body: { email: 'ali@example.com', password: 'nope' } })).status).toBe(401);
    expect((await call('POST', '/auth/signup', { body: { email: 'ali@example.com', password: 'password123', name: 'x' } })).status).toBe(409);
  });

  it('only shows the screen code to staff', async () => {
    expect((await call('GET', `/mosques/${mosqueId}/screen`, { token: ali.token })).status).toBe(403);
    expect((await call('GET', `/mosques/${mosqueId}/screen`)).status).toBe(401);
  });

  it('checks a person in from the screen code, once per Fajr', async () => {
    const s = await screenCode(admin.token, mosqueId);
    const r = await call('POST', '/checkin', { token: ali.token, body: { code: s.code, striverIds: [ali.self] } });
    expect(r.status).toBe(200);
    expect(r.json.date).toBe(DAY);
    expect(r.json.results[0]).toMatchObject({ fresh: true, streak: 1 });
    const again = await call('POST', '/checkin', { token: ali.token, body: { code: s.code, striverIds: [ali.self] } });
    expect(again.json.results[0].fresh).toBe(false);
    const me = await call('GET', '/me', { token: ali.token });
    expect(me.json.strivers[0].homeMosqueId).toBe(mosqueId);
  });

  it('accepts a full link, and turns a screen code into a hold that outlives it', async () => {
    const s = await screenCode(admin.token, mosqueId);
    const p = await call('POST', '/checkin/preview', { body: { code: `https://example.org/c/${s.code}` } });
    expect(p.status).toBe(200);
    expect(p.json.code.startsWith('h.')).toBe(true);
    const bilal = await signup('bilal@example.com', 'Bilal');
    const saved = now;
    now = new Date(now.getTime() + 5 * 60000);
    expect((await call('POST', '/checkin', { token: bilal.token, body: { code: s.code, striverIds: [bilal.self] } })).json.error.code).toBe('expired_code');
    expect((await call('POST', '/checkin', { token: bilal.token, body: { code: p.json.code, striverIds: [bilal.self] } })).status).toBe(200);
    now = new Date(saved.getTime() + 11 * 60000);
    const omar = await signup('omar@example.com', 'Omar');
    expect((await call('POST', '/checkin', { token: omar.token, body: { code: p.json.code, striverIds: [omar.self] } })).json.error.code).toBe('expired_code');
    now = saved;
  });

  it('rejects forged codes', async () => {
    const s = await screenCode(admin.token, mosqueId);
    const forged = s.code.slice(0, -2) + (s.code.endsWith('aa') ? 'bb' : 'aa');
    expect((await call('POST', '/checkin', { token: ali.token, body: { code: forged, striverIds: [ali.self] } })).json.error.code).toBe('bad_code');
    expect((await call('POST', '/checkin', { token: ali.token, body: { code: `s.${mosqueId}.wrongkey`, striverIds: [ali.self] } })).json.error.code).toBe('bad_code');
  });

  it('is closed outside the Fajr window unless the mosque is in practice mode', async () => {
    const saved = now;
    now = new Date(win.sunrise.getTime() + 3 * 3600000);
    const zaid = await signup('zaid@example.com', 'Zaid');
    const s = await screenCode(admin.token, mosqueId);
    expect(s.window.open).toBe(false);
    const r = await call('POST', '/checkin', { token: zaid.token, body: { code: s.code, striverIds: [zaid.self] } });
    expect(r.json.error.code).toBe('closed');
    expect(r.json.error.opens).toBe(fajrWindow(timing, addDays(DAY, 1)).opens.toISOString());
    await call('PATCH', `/mosques/${mosqueId}`, { token: admin.token, body: { practice: true } });
    expect((await call('POST', '/checkin', { token: zaid.token, body: { code: s.code, striverIds: [zaid.self] } })).status).toBe(200);
    await call('PATCH', `/mosques/${mosqueId}`, { token: admin.token, body: { practice: false } });
    now = saved;
  });

  it('needs the phone to be at the mosque for the printed poster', async () => {
    const s = await screenCode(admin.token, mosqueId);
    const hamza = await signup('hamza@example.com', 'Hamza');
    const far = await call('POST', '/checkin', { token: hamza.token, body: { code: s.posterCode, striverIds: [hamza.self], lat: 51.52, lng: -0.1, accuracy: 20 } });
    expect(far.json.error.code).toBe('too_far');
    expect((await call('POST', '/checkin', { token: hamza.token, body: { code: s.posterCode, striverIds: [hamza.self] } })).json.error.code).toBe('need_location');
    const near = await call('POST', '/checkin', { token: hamza.token, body: { code: s.posterCode, striverIds: [hamza.self], lat: 51.5076, lng: -0.1279, accuracy: 20 } });
    expect(near.status).toBe(200);
  });

  it('lets a parent check in their children, but nobody else', async () => {
    const dad = await signup('dad@example.com', 'Abu Musa');
    const kid = await call('POST', '/family', { token: dad.token, body: { name: 'Musa', grp: 'kids' } });
    const s = await screenCode(admin.token, mosqueId);
    const r = await call('POST', '/checkin', { token: dad.token, body: { code: s.code, striverIds: [dad.self, kid.json.id] } });
    expect(r.json.results.map((x: any) => x.fresh)).toEqual([true, true]);
    const bad = await call('POST', '/checkin', { token: dad.token, body: { code: s.code, striverIds: [ali.self] } });
    expect(bad.status).toBe(403);
  });
});

describe('attendance list', () => {
  let kidId: string;
  it('lets staff add a child with no account and mark them present', async () => {
    const add = await call('POST', `/mosques/${mosqueId}/roster`, { token: admin.token, body: { name: 'Little Ibrahim', grp: 'kids' } });
    kidId = add.json.id;
    expect((await call('POST', `/mosques/${mosqueId}/mark`, { token: ali.token, body: { striverId: kidId } })).status).toBe(403);
    const mark = await call('POST', `/mosques/${mosqueId}/mark`, { token: admin.token, body: { striverId: kidId } });
    expect(mark.json).toMatchObject({ present: true, fresh: true, date: DAY });
    const roster = await call('GET', `/mosques/${mosqueId}/roster`, { token: admin.token });
    const row = roster.json.people.find((p: any) => p.id === kidId);
    expect(row).toMatchObject({ managed: true, present: true, method: 'list' });
  });

  it('checks a child in from their printed card, and can undo a mistake', async () => {
    const add = await call('POST', `/mosques/${mosqueId}/roster`, { token: admin.token, body: { name: 'Yahya', grp: 'kids' } });
    const roster = await call('GET', `/mosques/${mosqueId}/roster`, { token: admin.token });
    const card = roster.json.people.find((p: any) => p.id === add.json.id).cardCode;
    const r = await call('POST', `/mosques/${mosqueId}/mark`, { token: admin.token, body: { cardCode: `https://x.org/k/${card}` } });
    expect(r.json).toMatchObject({ present: true, fresh: true });
    const undo = await call('POST', `/mosques/${mosqueId}/mark`, { token: admin.token, body: { striverId: add.json.id, present: false } });
    expect(undo.json.present).toBe(false);
    const after = await call('GET', `/mosques/${mosqueId}/roster`, { token: admin.token });
    expect(after.json.people.find((p: any) => p.id === add.json.id).present).toBe(false);
  });

  it('allows two days of backfill and nothing in the future', async () => {
    expect((await call('POST', `/mosques/${mosqueId}/mark`, { token: admin.token, body: { striverId: kidId, date: addDays(DAY, -2) } })).status).toBe(200);
    expect((await call('POST', `/mosques/${mosqueId}/mark`, { token: admin.token, body: { striverId: kidId, date: addDays(DAY, -3) } })).json.error.code).toBe('bad_date');
    expect((await call('POST', `/mosques/${mosqueId}/mark`, { token: admin.token, body: { striverId: kidId, date: addDays(DAY, 1) } })).json.error.code).toBe('bad_date');
  });

  it('exports attendance as CSV for staff only', async () => {
    const csv = await call('GET', `/mosques/${mosqueId}/export.csv`, { token: admin.token });
    expect(csv.status).toBe(200);
    expect(csv.json).toContain('date,name,group,method,time,member');
    expect(csv.json).toContain('Little Ibrahim,kids,list');
    expect((await call('GET', `/mosques/${mosqueId}/export.csv`, { token: ali.token })).status).toBe(403);
  });
});

describe('competition', () => {
  let otherMosque: string;
  let challengeId: string;

  it('ranks the mosque and reports stats', async () => {
    const lb = await call('GET', `/mosques/${mosqueId}/leaderboard?period=week`, { token: admin.token });
    expect(lb.status).toBe(200);
    expect(lb.json.rows[0].name).toBe('Little Ibrahim');
    expect(lb.json.rows[0].days).toBe(2);
    const stats = await call('GET', `/mosques/${mosqueId}/stats`, { token: admin.token });
    expect(stats.json.days).toHaveLength(14);
    expect(stats.json.days[13].count).toBeGreaterThanOrEqual(6);
    const mine = await call('GET', `/strivers/${ali.self}/stats`, { token: ali.token });
    expect(mine.json).toMatchObject({ total: 1, streak: 1, doneToday: true });
    expect(mine.json.badges.find((b: any) => b.id === 'first').earned).toBe(true);
    expect((await call('GET', `/strivers/${ali.self}/stats`, { token: (await signup('nosy@example.com', 'Nosy')).token })).status).toBe(403);
  });

  it('counts Fajr at another mosque for the person, and for the mosque that hosted it', async () => {
    const m = await call('POST', '/mosques', { token: admin.token, body: { name: 'Masjid an-Noor', city: 'Leeds', country: 'United Kingdom', lat: 53.8, lng: -1.55, timezone: 'Europe/London' } });
    otherMosque = m.json.id;
    now = new Date(fajrWindow({ ...timing, lat: 53.8, lng: -1.55 }, addDays(DAY, 1)).fajr.getTime() + 60000);
    const s = await screenCode(admin.token, otherMosque);
    const r = await call('POST', '/checkin', { token: ali.token, body: { code: s.code, striverIds: [ali.self] } });
    expect(r.json.results[0]).toMatchObject({ fresh: true, streak: 2 });
    const home = await call('GET', `/mosques/${mosqueId}/leaderboard?period=week`);
    expect(home.json.rows.find((x: any) => x.striverId === ali.self).days).toBe(2);
    const host = await call('GET', `/mosques/${otherMosque}`);
    expect(host.json.todayCount).toBe(1);
    const roster = await call('GET', `/mosques/${otherMosque}/roster`, { token: admin.token });
    expect(roster.json.people.find((p: any) => p.id === ali.self)).toMatchObject({ present: true, here: true });
  });

  it('runs a challenge with prizes, and can count only Fajr prayed at the mosque itself', async () => {
    const body = {
      scopeType: 'mosque', scopeId: mosqueId, name: '40 Days of Fajr', startDate: addDays(DAY, -5), endDate: addDays(DAY, 34), countAway: false, rules: 'Be on time.',
      prizes: [
        { grp: 'kids', place: 1, milestoneDays: null, title: 'Bicycle', sponsor: 'Cycle King' },
        { grp: 'all', place: null, milestoneDays: 40, title: 'Certificate' },
      ],
    };
    expect((await call('POST', '/challenges', { token: ali.token, body })).status).toBe(403);
    const made = await call('POST', '/challenges', { token: admin.token, body });
    challengeId = made.json.id;
    const ch = await call('GET', `/challenges/${challengeId}`);
    expect(ch.json.challenge.status).toBe('active');
    expect(ch.json.prizes).toHaveLength(2);
    expect(ch.json.rows.find((x: any) => x.striverId === ali.self).days).toBe(1);
    await call('PUT', `/challenges/${challengeId}`, { token: admin.token, body: { ...body, countAway: true } });
    const ch2 = await call('GET', `/challenges/${challengeId}`);
    expect(ch2.json.rows.find((x: any) => x.striverId === ali.self).days).toBe(2);
    expect((await call('POST', '/challenges', { token: admin.token, body: { ...body, prizes: [{ grp: 'all', place: 1, milestoneDays: 5, title: 'x' }] } })).status).toBe(400);
  });

  it('keeps unapproved mosques off the world leaderboard', async () => {
    expect((await call('GET', '/world?period=week')).json.rows).toHaveLength(0);
    const owner = await signup('owner@example.com', 'Owner');
    expect((await call('GET', '/owner', { token: admin.token })).status).toBe(403);
    expect((await call('POST', `/owner/mosques/${mosqueId}`, { token: owner.token, body: { verified: true } })).status).toBe(200);
    const w = await call('GET', '/world?period=week');
    expect(w.json.rows.map((r: any) => r.id)).toEqual([mosqueId]);
    expect(w.json.rows[0].total).toBeGreaterThanOrEqual(7);
    expect(w.json.countries).toEqual(['United Kingdom']);
  });

  it('groups mosques into an organisation with its own challenge', async () => {
    const org = await call('POST', '/orgs', { token: admin.token, body: { name: 'UK Fajr League' } });
    expect((await call('POST', `/mosques/${mosqueId}/org`, { token: admin.token, body: { code: 'NOPE00' } })).status).toBe(404);
    await call('POST', `/mosques/${mosqueId}/org`, { token: admin.token, body: { code: org.json.code } });
    await call('POST', `/mosques/${otherMosque}/org`, { token: admin.token, body: { code: org.json.code.toLowerCase() } });
    const page = await call('GET', `/orgs/${org.json.id}`, { token: admin.token });
    expect(page.json.mosques).toHaveLength(2);
    expect(page.json.org.code).toBe(org.json.code);
    expect(page.json.top.length).toBeGreaterThan(3);
    expect((await call('GET', `/orgs/${org.json.id}`, { token: ali.token })).json.org.code).toBeNull();
    const ch = await call('POST', '/challenges', { token: admin.token, body: { scopeType: 'org', scopeId: org.json.id, name: 'League', startDate: addDays(DAY, -5), endDate: addDays(DAY, 5) } });
    expect(ch.status).toBe(200);
    expect((await call('GET', `/challenges/${ch.json.id}`)).json.rows.length).toBeGreaterThan(3);
  });

  it('forms squads inside a mosque', async () => {
    const made = await call('POST', '/squads', { token: ali.token, body: { name: 'Dawn Patrol' } });
    expect(made.status).toBe(200);
    const stranger = await signup('stranger@example.com', 'Stranger');
    expect((await call('POST', '/squads/join', { token: stranger.token, body: { code: made.json.code } })).json.error.code).toBe('other_mosque');
    const list = await call('GET', `/mosques/${mosqueId}/squads`, { token: ali.token });
    expect(list.json.squads[0]).toMatchObject({ name: 'Dawn Patrol', members: 1, days: 2 });
    expect(list.json.mine.code).toBe(made.json.code);
  });

  it('takes sponsor offers and shows them only to the people who run a mosque', async () => {
    const shop = await signup('shop@example.com', 'Noor Cycles');
    const offer = { name: 'Noor Cycles', email: 'hello@noorcycles.example', phone: '0121 000 000', country: 'united kingdom', city: 'Birmingham', kinds: ['prizes', 'breakfast'], note: 'Two bikes a year.' };
    expect((await call('POST', '/sponsors', { body: { ...offer, scope: 'country' } })).status).toBe(401);
    expect((await call('POST', '/sponsors', { token: shop.token, body: { ...offer, scope: 'mosque' } })).status).toBe(400);
    expect((await call('POST', '/sponsors', { token: shop.token, body: { ...offer, kinds: [], scope: 'country' } })).status).toBe(400);
    const wide = await call('POST', '/sponsors', { token: shop.token, body: { ...offer, scope: 'country' } });
    expect(wide.status).toBe(200);
    await call('POST', '/sponsors', { token: shop.token, body: { ...offer, name: 'Just for Leeds', scope: 'mosque', mosqueId: otherMosque } });
    await call('POST', '/sponsors', { token: shop.token, body: { ...offer, name: 'Far away', country: 'Malaysia', scope: 'country' } });

    const home = await call('GET', `/mosques/${mosqueId}/sponsors`, { token: admin.token });
    expect(home.json.sponsors.map((x: any) => x.name)).toEqual(['Noor Cycles']);
    expect(home.json.sponsors[0]).toMatchObject({ email: 'hello@noorcycles.example', kinds: ['prizes', 'breakfast'], scope: 'country' });
    const leeds = await call('GET', `/mosques/${otherMosque}/sponsors`, { token: admin.token });
    expect(leeds.json.sponsors.map((x: any) => x.name)).toEqual(['Just for Leeds', 'Noor Cycles']);
    expect((await call('GET', `/mosques/${mosqueId}/sponsors`, { token: shop.token })).status).toBe(403);
    expect((await call('GET', `/mosques/${mosqueId}/sponsors`)).status).toBe(401);

    const mine = await call('GET', '/sponsors/mine', { token: shop.token });
    expect(mine.json.sponsors).toHaveLength(3);
    expect((await call('PUT', `/sponsors/${wide.json.id}`, { token: admin.token, body: { ...offer, scope: 'country' } })).status).toBe(404);
    await call('DELETE', `/sponsors/${wide.json.id}`, { token: admin.token });
    expect((await call('GET', '/sponsors/mine', { token: shop.token })).json.sponsors).toHaveLength(3);
    await call('DELETE', `/sponsors/${wide.json.id}`, { token: shop.token });
    expect((await call('GET', `/mosques/${mosqueId}/sponsors`, { token: admin.token })).json.sponsors).toHaveLength(0);
  });

  it('deletes an account with its check-ins', async () => {
    const before = await call('GET', `/mosques/${mosqueId}/leaderboard?period=week`);
    expect(before.json.rows.some((r: any) => r.striverId === ali.self)).toBe(true);
    expect((await call('DELETE', '/me', { token: ali.token, body: { password: 'wrong' } })).status).toBe(403);
    expect((await call('DELETE', '/me', { token: ali.token, body: { password: 'password123' } })).status).toBe(200);
    expect((await call('GET', '/me', { token: ali.token })).status).toBe(401);
    const after = await call('GET', `/mosques/${mosqueId}/leaderboard?period=week`);
    expect(after.json.rows.some((r: any) => r.striverId === ali.self)).toBe(false);
  });
});

describe('more ways to take part', () => {
  let today: string;
  let kid: string;
  let friend: Awaited<ReturnType<typeof signup>>;
  const stats = async (id: string, token = admin.token) => (await call('GET', `/strivers/${id}/stats`, { token })).json;

  it('uses the mosque\u2019s own Fajr and iqamah times when it sets them', async () => {
    today = (await call('GET', `/mosques/${mosqueId}`)).json.window.today;
    await call('PATCH', `/mosques/${mosqueId}`, { token: admin.token, body: { fajrTime: '06:10', iqamahTime: '06:30' } });
    const w = (await call('GET', `/mosques/${mosqueId}`)).json.window;
    const local = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    expect([local(w.fajr), local(w.iqamah), local(w.opens)]).toEqual(['06:10', '06:30', '05:40']);
    expect((await call('PATCH', `/mosques/${mosqueId}`, { token: admin.token, body: { fajrTime: '6.10' } })).status).toBe(400);
    await call('PATCH', `/mosques/${mosqueId}`, { token: admin.token, body: { fajrTime: null, iqamahTime: null } });
    expect((await call('GET', `/mosques/${mosqueId}`)).json.mosque.fajrTime).toBeNull();
  });

  it('keeps a streak through a day the mosque excused', async () => {
    kid = (await call('POST', `/mosques/${mosqueId}/roster`, { token: admin.token, body: { name: 'Sami Khan', grp: 'kids' } })).json.id;
    await call('POST', `/mosques/${mosqueId}/mark`, { token: admin.token, body: { striverId: kid, date: addDays(today, -2) } });
    await call('POST', `/mosques/${mosqueId}/mark`, { token: admin.token, body: { striverId: kid, date: today } });
    expect((await stats(kid)).streak).toBe(1);
    expect((await call('POST', `/mosques/${mosqueId}/excuse`, { token: admin.token, body: { striverId: kid, date: addDays(today, -1), excused: true } })).status).toBe(200);
    const st = await stats(kid);
    expect(st).toMatchObject({ streak: 2, best: 2, total: 2 });
    expect(st.excused).toEqual([addDays(today, -1)]);
    const roster = await call('GET', `/mosques/${mosqueId}/roster?date=${addDays(today, -1)}`, { token: admin.token });
    expect(roster.json.people.find((p: any) => p.id === kid).excused).toBe(true);
    expect((await call('GET', `/mosques/${mosqueId}/leaderboard?period=week`, { token: admin.token })).json.rows.find((r: any) => r.striverId === kid).bestStreak).toBe(2);
    await call('POST', `/mosques/${mosqueId}/excuse`, { token: admin.token, body: { striverId: kid, date: addDays(today, -1), excused: false } });
    expect((await stats(kid)).streak).toBe(1);
    expect((await call('POST', `/mosques/${mosqueId}/excuse`, { token: admin.token, body: { striverId: kid, date: addDays(today, -30), excused: true } })).status).toBe(400);
  });

  it('invites a friend, who starts at the same mosque as a buddy', async () => {
    const code = (await call('GET', '/me', { token: admin.token })).json.user.inviteCode;
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    const r = await call('POST', '/auth/signup', { body: { email: 'friend@example.com', password: 'password123', name: 'Faris Friend', inviteCode: code.toLowerCase() } });
    const me = await call('GET', '/me', { token: r.json.token });
    friend = { token: r.json.token, self: me.json.strivers[0].id, userId: me.json.user.id };
    const adminMe = (await call('GET', '/me', { token: admin.token })).json;
    expect(me.json.strivers[0].homeMosqueId).toBe(adminMe.strivers[0].homeMosqueId);
    const list = await call('GET', '/buddies', { token: friend.token });
    expect(list.json.buddies.map((b: any) => b.name)).toEqual(['Imam Yusuf']);
    // The badge counts friends who have actually come to Fajr.
    expect((await stats(adminMe.strivers[0].id)).badges.find((b: any) => b.id === 'caller').progress).toBe(0);
    await call('POST', `/mosques/${mosqueId}/mark`, { token: admin.token, body: { striverId: friend.self } });
    expect((await stats(adminMe.strivers[0].id)).badges.find((b: any) => b.id === 'caller').progress).toBe(1);
  });

  it('lets buddies see each other and nudge once a day', async () => {
    const mine = await call('GET', '/buddies', { token: admin.token });
    expect(mine.json.buddies[0]).toMatchObject({ name: 'Faris Friend', doneToday: true, streak: 1, nudged: false });
    expect((await call('POST', `/buddies/${friend.self}/nudge`, { token: admin.token })).json.sent).toBe(true);
    expect((await call('POST', `/buddies/${friend.self}/nudge`, { token: admin.token })).json.sent).toBe(false);
    expect((await call('POST', `/buddies/${kid}/nudge`, { token: admin.token })).status).toBe(403);
    expect((await call('GET', '/buddies', { token: friend.token })).json.nudges.map((n: any) => n.name)).toEqual(['Imam Yusuf']);
    await call('POST', '/nudges/seen', { token: friend.token });
    expect((await call('GET', '/buddies', { token: friend.token })).json.nudges).toHaveLength(0);
    const other = await signup('pal@example.com', 'Pal');
    const palCode = (await call('GET', '/me', { token: other.token })).json.user.inviteCode;
    expect((await call('POST', '/buddies', { token: other.token, body: { code: palCode } })).json.error.code).toBe('self');
    expect((await call('POST', '/buddies', { token: friend.token, body: { code: palCode } })).json.name).toBe('Pal');
    await call('DELETE', `/buddies/${other.self}`, { token: friend.token });
    expect((await call('GET', '/buddies', { token: other.token })).json.buddies).toHaveLength(0);
  });

  it('tracks a personal weekly goal and a year in review', async () => {
    await call('PATCH', '/me', { token: friend.token, body: { weeklyGoal: 5 } });
    expect(await stats(friend.self, friend.token)).toMatchObject({ weeklyGoal: 5, weekDays: 1 });
    const review = await call('GET', `/strivers/${friend.self}/review?year=${today.slice(0, 4)}`, { token: friend.token });
    expect(review.json).toMatchObject({ total: 1, best: 1, mosques: 1, topMosque: { name: 'East London Masjid', days: 1 } });
    expect(review.json.months[Number(today.slice(5, 7)) - 1]).toBe(1);
    expect((await call('GET', `/strivers/${friend.self}/review`, { token: admin.token })).status).toBe(403);
  });

  it('shows the podium without an account, with shortened names, unless the mosque hides it', async () => {
    const open = await call('GET', `/mosques/${mosqueId}/leaderboard?period=week`);
    expect(open.json.rows.map((r: any) => r.name)).toContain('Sami K.');
    expect(open.json.rows.map((r: any) => r.name)).not.toContain('Sami Khan');
    const signedIn = await call('GET', `/mosques/${mosqueId}/leaderboard?period=week`, { token: friend.token });
    expect(signedIn.json.rows.map((r: any) => r.name)).toContain('Sami Khan');
    await call('PATCH', `/mosques/${mosqueId}`, { token: admin.token, body: { publicBoard: false } });
    const hidden = await call('GET', `/mosques/${mosqueId}/leaderboard?period=week`);
    expect(hidden.json).toMatchObject({ hidden: true, rows: [] });
    expect((await call('GET', `/mosques/${mosqueId}`)).json.earlyBirds).toEqual([]);
    expect((await call('GET', `/mosques/${mosqueId}/leaderboard?period=week`, { token: friend.token })).json.rows.length).toBeGreaterThan(0);
    await call('PATCH', `/mosques/${mosqueId}`, { token: admin.token, body: { publicBoard: true } });
  });

  it('posts what is on after Fajr and counts who is staying', async () => {
    expect((await call('POST', `/mosques/${mosqueId}/events`, { token: friend.token, body: { title: 'Breakfast', date: today } })).status).toBe(403);
    expect((await call('POST', `/mosques/${mosqueId}/events`, { token: admin.token, body: { title: 'Breakfast', date: addDays(today, -1) } })).status).toBe(400);
    const ev = await call('POST', `/mosques/${mosqueId}/events`, { token: admin.token, body: { title: 'Breakfast and football', detail: 'In the hall', date: today } });
    await call('POST', `/events/${ev.json.id}/going`, { token: friend.token, body: { going: true } });
    await call('POST', `/events/${ev.json.id}/going`, { token: friend.token, body: { going: true } });
    expect((await call('GET', `/mosques/${mosqueId}`, { token: friend.token })).json.events[0]).toMatchObject({ title: 'Breakfast and football', going: 1, mine: true });
    expect((await call('GET', `/mosques/${mosqueId}`)).json.events[0]).toMatchObject({ going: 1, mine: false });
    await call('POST', `/events/${ev.json.id}/going`, { token: friend.token, body: { going: false } });
    expect((await call('GET', `/mosques/${mosqueId}`, { token: friend.token })).json.events[0].going).toBe(0);
    await call('DELETE', `/events/${ev.json.id}`, { token: admin.token });
    expect((await call('GET', `/mosques/${mosqueId}`)).json.events).toHaveLength(0);
  });

  it('counts the whole mosque toward a shared target', async () => {
    const body = { reward: 'Breakfast for everyone', target: 5, startDate: addDays(today, -3), endDate: addDays(today, 3), sponsor: 'Baraka Bakery' };
    expect((await call('POST', `/mosques/${mosqueId}/pledges`, { token: friend.token, body })).status).toBe(403);
    const made = await call('POST', `/mosques/${mosqueId}/pledges`, { token: admin.token, body });
    const p = (await call('GET', `/mosques/${mosqueId}`)).json.pledges[0];
    expect(p).toMatchObject({ reward: 'Breakfast for everyone', target: 5, sponsor: 'Baraka Bakery' });
    expect(p.progress).toBeGreaterThanOrEqual(5);
    await call('DELETE', `/pledges/${made.json.id}`, { token: admin.token });
    expect((await call('GET', `/mosques/${mosqueId}`)).json.pledges).toHaveLength(0);
  });

  it('runs a class with its own leaderboard', async () => {
    const made = await call('POST', `/mosques/${mosqueId}/classes`, { token: admin.token, body: { name: 'Saturday madrasa' } });
    expect((await call('POST', `/classes/${made.json.id}/members`, { token: friend.token, body: { striverId: kid, member: true } })).status).toBe(403);
    await call('POST', `/classes/${made.json.id}/members`, { token: admin.token, body: { striverId: kid, member: true } });
    expect((await call('GET', `/mosques/${mosqueId}/classes`, { token: admin.token })).json.classes).toEqual([{ id: made.json.id, name: 'Saturday madrasa', members: 1 }]);
    const page = await call('GET', `/classes/${made.json.id}?period=week`, { token: admin.token });
    expect(page.json.rows.map((r: any) => r.name)).toEqual(['Sami Khan']);
    expect(page.json.members).toHaveLength(1);
    expect((await call('GET', `/mosques/${mosqueId}/roster`, { token: admin.token })).json.people.find((x: any) => x.id === kid).classId).toBe(made.json.id);
    await call('POST', `/classes/${made.json.id}/members`, { token: admin.token, body: { striverId: kid, member: false } });
    expect((await call('GET', `/classes/${made.json.id}`, { token: admin.token })).json.rows).toHaveLength(0);
  });

  it('adds up the world by city and country, and by season', async () => {
    const owner = (await call('POST', '/auth/login', { body: { email: 'owner@example.com', password: 'password123' } })).json.token;
    const countries = await call('GET', '/world?period=month&group=country');
    expect(countries.json.groups[0]).toMatchObject({ name: 'United Kingdom', mosques: 1 });
    expect((await call('GET', '/world?period=month&group=city')).json.groups[0].name).toBe('London');
    expect((await call('POST', '/owner/seasons', { token: admin.token, body: { name: 'x', startDate: today, endDate: today } })).status).toBe(403);
    const season = await call('POST', '/owner/seasons', { token: owner, body: { name: 'Winter 40', startDate: today, endDate: addDays(today, 39) } });
    const w = await call('GET', `/world?season=${season.json.id}`);
    expect(w.json.seasons[0]).toMatchObject({ name: 'Winter 40', status: 'active' });
    // Only check-ins inside the season count: today's two, not the earlier ones.
    expect(w.json.rows[0].total).toBe(2);
    await call('DELETE', `/owner/seasons/${season.json.id}`, { token: owner });
    expect((await call('GET', '/world')).json.seasons).toHaveLength(0);
  });
});

