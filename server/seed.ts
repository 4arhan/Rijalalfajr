// Fills the database with demo mosques and a few weeks of check-ins, so there
// is something to look at. Run with `npm run seed`. Never run it on real data.
import { openDb } from './db.js';
import { addDays, fajrWindow, localDate } from './fajr.js';
import { hashPassword, newCode, newId } from './security.js';

const MOSQUES = [
  { name: 'Masjid an-Noor', city: 'Birmingham', country: 'United Kingdom', lat: 52.4862, lng: -1.8904, timezone: 'Europe/London', method: 'MuslimWorldLeague', size: 34, keen: 0.72 },
  { name: 'Masjid al-Falah', city: 'Kuala Lumpur', country: 'Malaysia', lat: 3.139, lng: 101.6869, timezone: 'Asia/Kuala_Lumpur', method: 'Singapore', size: 58, keen: 0.6 },
  { name: 'Şafak Camii', city: 'Istanbul', country: 'Türkiye', lat: 41.0082, lng: 28.9784, timezone: 'Europe/Istanbul', method: 'Turkey', size: 46, keen: 0.66 },
  { name: 'Masjid as-Salam', city: 'Sydney', country: 'Australia', lat: -33.8688, lng: 151.2093, timezone: 'Australia/Sydney', method: 'MuslimWorldLeague', size: 21, keen: 0.81 },
  { name: 'Masjid ar-Rahman', city: 'Toronto', country: 'Canada', lat: 43.6532, lng: -79.3832, timezone: 'America/Toronto', method: 'NorthAmerica', size: 27, keen: 0.55 },
  { name: 'Masjid al-Huda', city: 'Cape Town', country: 'South Africa', lat: -33.9249, lng: 18.4241, timezone: 'Africa/Johannesburg', method: 'MuslimWorldLeague', size: 12, keen: 0.9 },
  { name: 'Masjid at-Taqwa', city: 'Leicester', country: 'United Kingdom', lat: 52.6369, lng: -1.1398, timezone: 'Europe/London', method: 'MuslimWorldLeague', size: 30, keen: 0.63 },
];
const FIRST = ['Yusuf', 'Ibrahim', 'Musa', 'Hamza', 'Bilal', 'Omar', 'Ali', 'Zaid', 'Idris', 'Ismail', 'Harun', 'Sulaiman', 'Ayyub', 'Yahya', 'Adam', 'Nuh', 'Khalid', 'Salman', 'Anas', 'Talha', 'Zubair', 'Saad', 'Muadh', 'Ammar', 'Tariq', 'Hasan', 'Husain', 'Ilyas', 'Luqman', 'Uthman'];
const LAST = ['A.', 'B.', 'C.', 'D.', 'H.', 'K.', 'M.', 'N.', 'R.', 'S.', 'T.', 'Y.'];
const GRP = ['kids', 'kids', 'youth', 'youth', 'adults', 'adults', 'adults'];
const DAYS = 45;

// A small seeded generator, so every seed run gives the same demo.
let seed = 20261126;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const db = await openDb();
const [existing] = await db.query<{ n: number }>(`select count(*)::int as n from mosques`);
if (existing.n > 0) {
  console.log('The database already has mosques. Seeding is only for an empty database.');
  process.exit(0);
}

const demoEmail = 'demo@rijalalfajr.app';
const demoPassword = 'fajr-demo-1';
const userId = newId();
await db.query(`insert into users (id, email, pass_hash, name) values ($1,$2,$3,$4)`, [userId, demoEmail, await hashPassword(demoPassword), 'Yusuf Rahman']);
const orgId = newId(10);
await db.query(`insert into orgs (id, name, code, owner_user_id) values ($1,$2,$3,$4)`, [orgId, 'UK Fajr League', newCode(6), userId]);

const now = new Date();
let homeId = '';
for (const [mi, m] of MOSQUES.entries()) {
  const id = newId(10);
  if (mi === 0) homeId = id;
  const uk = m.country === 'United Kingdom';
  await db.query(
    `insert into mosques (id, name, city, country, lat, lng, timezone, calc_method, daily_goal, verified, qr_secret, static_key, org_id, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11,$12,$13)`,
    [id, m.name, m.city, m.country, m.lat, m.lng, m.timezone, m.method, Math.round(m.size * 0.9), newId(32), newId(16), uk ? orgId : null, userId],
  );
  if (mi === 0) await db.query(`insert into mosque_staff (mosque_id, user_id, role) values ($1,$2,'admin')`, [id, userId]);

  const squads: string[] = [];
  if (mi === 0) {
    for (const name of ['Dawn Patrol', 'First Row', 'Ashab al-Fajr']) {
      const sid = newId();
      squads.push(sid);
      await db.query(`insert into squads (id, mosque_id, name, code) values ($1,$2,$3,$4)`, [sid, id, name, newCode(6)]);
    }
  }

  const today = localDate(now, m.timezone);
  const timing = { lat: m.lat, lng: m.lng, timezone: m.timezone, calc_method: m.method, open_before_min: 30, iqamah_after_min: 20, close_after_sunrise_min: 0 };
  const people: { id: string; keen: number }[] = [];
  for (let i = 0; i < m.size; i++) {
    const sid = newId();
    const grp = GRP[i % GRP.length];
    const managed = grp === 'kids' && i % 2 === 0;
    await db.query(
      `insert into strivers (id, name, grp, managed_mosque_id, home_mosque_id, squad_id, card_code) values ($1,$2,$3,$4,$5,$6,$7)`,
      [sid, `${FIRST[(i * 7 + mi * 3) % FIRST.length]} ${pick(LAST)}`, grp, managed ? id : null, id, squads.length && i < 15 ? squads[i % 3] : null, newId(14)],
    );
    people.push({ id: sid, keen: Math.min(0.98, Math.max(0.15, m.keen + (rnd() - 0.5) * 0.7)) });
  }
  if (mi === 0) {
    // The demo account and a child, with a streak worth looking at.
    const self = newId();
    const kid = newId();
    await db.query(`insert into strivers (id, name, grp, user_id, home_mosque_id, squad_id, card_code) values ($1,'Yusuf Rahman','adults',$2,$3,$4,$5)`, [self, userId, id, squads[0], newId(14)]);
    await db.query(`insert into strivers (id, name, grp, guardian_user_id, home_mosque_id, card_code) values ($1,'Musa Rahman','kids',$2,$3,$4)`, [kid, userId, id, newId(14)]);
    people.push({ id: self, keen: 2 }, { id: kid, keen: 0.86 });
  }

  for (let d = DAYS; d >= 1; d--) {
    const date = addDays(today, -d);
    const fajr = fajrWindow(timing, date).fajr.getTime();
    for (const p of people) {
      // The demo account missed one morning three weeks ago, then kept going.
      if (p.keen === 2 ? d === 22 : rnd() > p.keen) continue;
      const offset = Math.round((rnd() * 34 - 8) * 60);
      await db.query(
        `insert into checkins (id, striver_id, mosque_id, fajr_date, at, method, offset_sec) values ($1,$2,$3,$4,$5,$6,$7)`,
        [newId(), p.id, id, date, new Date(fajr + offset * 1000), rnd() < 0.3 ? 'list' : 'qr', offset],
      );
    }
  }

  if (mi === 0) {
    const ch = newId(10);
    await db.query(`insert into challenges (id, scope_type, scope_id, name, start_date, end_date, count_away, rules) values ($1,'mosque',$2,$3,$4,$5,true,$6)`, [
      ch, id, '40 Days of Fajr', addDays(today, -26), addDays(today, 13), 'Prizes are handed out after Jumu‘ah on the last Friday.',
    ]);
    const prizes: [string, number | null, number | null, string, string][] = [
      ['kids', 1, null, 'Bicycle', 'Noor Cycles'], ['kids', 2, null, 'Scooter', ''], ['kids', 3, null, 'Football', ''],
      ['youth', 1, null, 'Sports voucher', ''], ['adults', 1, null, 'Umrah fund contribution', ''],
      ['all', null, 40, 'Rijal al-Fajr medal and certificate', ''], ['all', null, 30, 'Breakfast with the imam', ''],
    ];
    for (const [g, place, days, title, sponsor] of prizes) {
      await db.query(`insert into prizes (id, challenge_id, grp, place, milestone_days, title, sponsor) values ($1,$2,$3,$4,$5,$6,$7)`, [newId(), ch, g, place, days, title, sponsor]);
    }
  }
  console.log(`Seeded ${m.name}, ${m.city}`);
}
await db.query(
  `insert into challenges (id, scope_type, scope_id, name, start_date, end_date) values ($1,'org',$2,'Winter Fajr League',$3,$4)`,
  [newId(10), orgId, addDays(localDate(now, 'Europe/London'), -20), addDays(localDate(now, 'Europe/London'), 40)],
);
await db.close();
console.log(`\nDemo account: ${demoEmail} / ${demoPassword}\nIts home mosque is ${MOSQUES[0].name} (${homeId}).`);
