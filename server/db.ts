// Database access. Production uses Postgres through DATABASE_URL; without it the
// app runs on PGlite (Postgres compiled to WASM) so development and tests need
// no database server.

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

const SCHEMA_VERSION = 4;

/** Thrown on a hosted deployment that has no DATABASE_URL yet. */
export class NoDatabaseError extends Error {
  constructor() {
    super('DATABASE_URL is not set');
    this.name = 'NoDatabaseError';
  }
}

const SCHEMA = `
create table if not exists meta (key text primary key, value text not null);

create table if not exists users (
  id text primary key,
  email text unique not null,
  pass_hash text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists orgs (
  id text primary key,
  name text not null,
  code text unique not null,
  owner_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists mosques (
  id text primary key,
  name text not null,
  city text not null default '',
  country text not null default '',
  lat double precision not null,
  lng double precision not null,
  timezone text not null,
  calc_method text not null default 'MuslimWorldLeague',
  open_before_min int not null default 30,
  iqamah_after_min int not null default 20,
  close_after_sunrise_min int not null default 0,
  radius_m int not null default 200,
  daily_goal int not null default 0,
  practice boolean not null default false,
  verified boolean not null default false,
  suspended boolean not null default false,
  qr_secret text not null,
  static_key text not null,
  org_id text references orgs(id) on delete set null,
  labels jsonb not null default '{}',
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists mosque_staff (
  mosque_id text not null references mosques(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('admin','volunteer')),
  primary key (mosque_id, user_id)
);

create table if not exists squads (
  id text primary key,
  mosque_id text not null references mosques(id) on delete cascade,
  name text not null,
  code text unique not null,
  created_at timestamptz not null default now()
);

-- A striver is anyone who attends: an account holder, a child on a parent's
-- account, or a name on a mosque's attendance list with no account at all.
create table if not exists strivers (
  id text primary key,
  name text not null,
  grp text not null check (grp in ('kids','youth','adults')),
  user_id text unique references users(id) on delete cascade,
  guardian_user_id text references users(id) on delete cascade,
  managed_mosque_id text references mosques(id) on delete cascade,
  home_mosque_id text references mosques(id) on delete set null,
  squad_id text references squads(id) on delete set null,
  anonymous boolean not null default false,
  card_code text unique not null,
  created_at timestamptz not null default now()
);
create index if not exists strivers_home on strivers(home_mosque_id);
create index if not exists strivers_guardian on strivers(guardian_user_id);

create table if not exists checkins (
  id text primary key,
  striver_id text not null references strivers(id) on delete cascade,
  mosque_id text not null references mosques(id) on delete cascade,
  fajr_date text not null,
  at timestamptz not null default now(),
  method text not null check (method in ('qr','poster','list','card')),
  by_user_id text references users(id) on delete set null,
  offset_sec int not null default 0,
  distance_m int,
  device text,
  unique (striver_id, fajr_date)
);
create index if not exists checkins_mosque_date on checkins(mosque_id, fajr_date);
create index if not exists checkins_date on checkins(fajr_date);

create table if not exists challenges (
  id text primary key,
  scope_type text not null check (scope_type in ('mosque','org')),
  scope_id text not null,
  name text not null,
  start_date text not null,
  end_date text not null,
  count_away boolean not null default true,
  rules text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists challenges_scope on challenges(scope_type, scope_id);

create table if not exists prizes (
  id text primary key,
  challenge_id text not null references challenges(id) on delete cascade,
  grp text not null check (grp in ('all','kids','youth','adults')),
  place int,
  milestone_days int,
  title text not null,
  detail text not null default '',
  sponsor text not null default ''
);

-- An offer to sponsor: either open to every mosque and organisation in a
-- country, or made to one mosque.
create table if not exists sponsors (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null default '',
  country text not null,
  city text not null default '',
  kinds jsonb not null default '[]',
  note text not null default '',
  scope text not null check (scope in ('country','mosque')),
  mosque_id text references mosques(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists sponsors_country on sponsors(lower(country));
create index if not exists sponsors_mosque on sponsors(mosque_id);

-- Version 3: goals, invitations, buddies, excused days, classes, events,
-- shared targets, seasons, the mosque's own times.
alter table users add column if not exists invite_code text unique;
alter table mosques add column if not exists fajr_time text;
alter table mosques add column if not exists iqamah_time text;
alter table mosques add column if not exists public_board boolean not null default true;

create table if not exists classes (
  id text primary key,
  mosque_id text not null references mosques(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
alter table strivers add column if not exists weekly_goal int not null default 0;
alter table strivers add column if not exists invited_by text references strivers(id) on delete set null;
alter table strivers add column if not exists class_id text references classes(id) on delete set null;

-- A day a mosque admin has excused (illness, travel): it does not break a streak.
create table if not exists excuses (
  striver_id text not null references strivers(id) on delete cascade,
  fajr_date text not null,
  mosque_id text not null references mosques(id) on delete cascade,
  by_user_id text references users(id) on delete set null,
  primary key (striver_id, fajr_date)
);

-- Stored once in each direction.
create table if not exists buddies (
  a text not null references strivers(id) on delete cascade,
  b text not null references strivers(id) on delete cascade,
  primary key (a, b)
);
create table if not exists nudges (
  id text primary key,
  from_striver text not null references strivers(id) on delete cascade,
  to_striver text not null references strivers(id) on delete cascade,
  day text not null,
  seen boolean not null default false,
  created_at timestamptz not null default now(),
  unique (from_striver, to_striver, day)
);

create table if not exists events (
  id text primary key,
  mosque_id text not null references mosques(id) on delete cascade,
  fajr_date text not null,
  title text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists event_going (
  event_id text not null references events(id) on delete cascade,
  striver_id text not null references strivers(id) on delete cascade,
  primary key (event_id, striver_id)
);

-- "If we reach 1,000 check-ins this month, the bakery funds breakfast."
create table if not exists pledges (
  id text primary key,
  mosque_id text not null references mosques(id) on delete cascade,
  reward text not null,
  target int not null,
  start_date text not null,
  end_date text not null,
  sponsor text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists seasons (
  id text primary key,
  name text not null,
  start_date text not null,
  end_date text not null,
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id text primary key,
  reporter_user_id text references users(id) on delete set null,
  target_type text not null,
  target_id text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Version 4: milestones and kudos, "I'm awake", requests to be excused, the prize
-- wish-list, family names and friendly matches.
alter table users add column if not exists family_name text;

-- The first time a person reaches a number of dawns in a row, or a total. Forty in a
-- row is the roll of honour, which is why these rows are kept rather than worked out.
create table if not exists milestones (
  id text primary key,
  striver_id text not null references strivers(id) on delete cascade,
  mosque_id text references mosques(id) on delete set null,
  kind text not null check (kind in ('streak','total')),
  value int not null,
  fajr_date text not null,
  created_at timestamptz not null default now(),
  unique (striver_id, kind, value)
);
create index if not exists milestones_mosque on milestones(mosque_id, fajr_date);

create table if not exists kudos (
  milestone_id text not null references milestones(id) on delete cascade,
  from_striver text not null references strivers(id) on delete cascade,
  seen boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (milestone_id, from_striver)
);

create table if not exists awake (
  striver_id text not null references strivers(id) on delete cascade,
  fajr_date text not null,
  at timestamptz not null default now(),
  primary key (striver_id, fajr_date)
);

create table if not exists excuse_requests (
  id text primary key,
  striver_id text not null references strivers(id) on delete cascade,
  mosque_id text not null references mosques(id) on delete cascade,
  from_date text not null,
  to_date text not null,
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  by_user_id text references users(id) on delete set null,
  decided_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists excuse_requests_mosque on excuse_requests(mosque_id, status);

-- What a mosque would like for its prizes, and who has offered to give it.
create table if not exists wishes (
  id text primary key,
  mosque_id text not null references mosques(id) on delete cascade,
  title text not null,
  qty int not null default 1,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists wish_pledges (
  id text primary key,
  wish_id text not null references wishes(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  qty int not null default 1,
  email text not null,
  phone text not null default '',
  note text not null default '',
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

-- Two mosques, a set of days, and the share of each one's members who show up.
create table if not exists matches (
  id text primary key,
  a_mosque text not null references mosques(id) on delete cascade,
  b_mosque text not null references mosques(id) on delete cascade,
  start_date text not null,
  end_date text not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);
`;

async function migrate(db: Db) {
  const [reg] = await db.query<{ t: string | null }>(`select to_regclass('public.meta')::text as t`);
  if (reg?.t) {
    const [v] = await db.query<{ value: string }>(`select value from meta where key = 'schema'`);
    if (v && Number(v.value) >= SCHEMA_VERSION) return;
  }
  await db.exec(SCHEMA);
  await db.query(
    `insert into meta (key, value) values ('schema', $1) on conflict (key) do update set value = excluded.value`,
    [String(SCHEMA_VERSION)],
  );
}

/**
 * The Postgres address. Hosting integrations name the variable differently from one
 * to the next, and some add a prefix of their own, so after the usual names we take
 * any variable that holds a Postgres address, preferring a pooled connection.
 */
export function findDatabaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.POSTGRES_URL) return env.POSTGRES_URL;
  const found = Object.entries(env).filter(([, v]) => v && /^postgres(ql)?:\/\//.test(v)) as [string, string][];
  const rank = (name: string) => (/UNPOOLED|NON_POOLING|NO_SSL|PRISMA/.test(name) ? 2 : /DATABASE_URL$|POSTGRES_URL$/.test(name) ? 0 : 1);
  found.sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  return found[0]?.[1];
}

async function openPg(url: string): Promise<Db> {
  const { default: pg } = await import('pg');
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    max: 3,
    ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: true },
  });
  return {
    async query(sql, params) {
      const r = await pool.query(sql, params as unknown[]);
      return r.rows;
    },
    async exec(sql) {
      await pool.query(sql);
    },
    close: () => pool.end(),
  };
}

async function openLite(dir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dir) (await import('node:fs')).mkdirSync(dir, { recursive: true });
  const lite = dir ? new PGlite(dir) : new PGlite();
  await lite.waitReady;
  return {
    async query(sql, params) {
      const r = await lite.query(sql, params as unknown[]);
      return r.rows as never;
    },
    async exec(sql) {
      await lite.exec(sql);
    },
    close: () => lite.close(),
  };
}

export async function openDb(opts: { url?: string; memory?: boolean } = {}): Promise<Db> {
  const url = opts.url ?? findDatabaseUrl();
  let db: Db;
  if (!url && !opts.memory && process.env.VERCEL) throw new NoDatabaseError();
  if (url && !opts.memory) db = await openPg(url);
  else db = await openLite(opts.memory ? undefined : process.env.PGLITE_DIR || '.data/pglite');
  await migrate(db);
  return db;
}

let shared: Promise<Db> | undefined;
/** One connection per server instance. */
export function getDb(): Promise<Db> {
  shared ??= openDb().catch((e) => {
    shared = undefined;
    throw e;
  });
  return shared;
}
