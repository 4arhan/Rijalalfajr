// Thin client for the API, with the response shapes the screens use.
import { t } from './lib/i18n';
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const TOKEN_KEY = 'raf.token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, 'offline', t('No connection. Check your internet and try again.'));
  }
  if (opts.raw && res.ok) return (await res.blob()) as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error ?? {};
    // The server answers in English; a sentence we have a translation for is shown translated.
    throw new ApiError(res.status, e.code ?? 'error', t(e.message ?? 'Something went wrong.'), e);
  }
  return json as T;
}

export type Group = 'kids' | 'youth' | 'adults';
export const GROUPS: Group[] = ['kids', 'youth', 'adults'];
export type Labels = Record<Group, string>;
export const DEFAULT_LABELS: Labels = { kids: 'Kids', youth: 'Youth', adults: 'Adults' };

export interface Striver {
  id: string;
  name: string;
  grp: Group;
  self: boolean;
  homeMosqueId: string | null;
  squadId: string | null;
  anonymous: boolean;
  cardCode: string;
  weeklyGoal: number;
}
export interface Me {
  user: { id: string; email: string; name: string; owner: boolean; inviteCode: string; familyName: string | null };
  strivers: Striver[];
  staff: { id: string; name: string; role: 'admin' | 'volunteer' }[];
  orgs: { id: string; name: string }[];
}
export interface Mosque {
  id: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  timezone: string;
  calcMethod: string;
  openBeforeMin: number;
  iqamahAfterMin: number;
  closeAfterSunriseMin: number;
  radiusM: number;
  dailyGoal: number;
  practice: boolean;
  verified: boolean;
  suspended: boolean;
  orgId: string | null;
  labels: Labels;
  fajrTime: string | null;
  iqamahTime: string | null;
  publicBoard: boolean;
}
export interface Win {
  open: boolean;
  inWindow: boolean;
  today: string;
  date: string;
  fajr: string;
  iqamah: string;
  sunrise: string;
  opens: string;
  closes: string;
}
export interface ChallengeBrief {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  scopeType?: string;
  status: 'upcoming' | 'active' | 'ended';
}
export interface MosqueEvent {
  id: string;
  date: string;
  title: string;
  detail: string;
  going: number;
  mine: boolean;
}
export interface Pledge {
  id: string;
  reward: string;
  target: number;
  startDate: string;
  endDate: string;
  sponsor: string;
  progress: number;
}
/** Something the mosque would like for its prizes, and who has given it. */
export interface Wish {
  id: string;
  title: string;
  qty: number;
  detail: string;
  given: number;
  mine: boolean;
  givenBy: string[];
}
export interface MatchSide {
  id: string;
  name: string;
  city: string;
  members: number;
  checkins: number;
  share: number;
}
export interface Match {
  id: string;
  startDate: string;
  endDate: string;
  a: MatchSide;
  b: MatchSide;
  status: 'invited' | 'upcoming' | 'active' | 'ended';
  toAnswer: boolean;
}
export interface MosquePage {
  wishes: Wish[];
  thanks: string[];
  matches: Match[];
  events: MosqueEvent[];
  pledges: Pledge[];
  mosque: Mosque;
  window: Win;
  todayCount: number;
  members: number;
  earlyBirds: { name: string; at: string }[];
  challenges: ChallengeBrief[];
  org: { id: string; name: string } | null;
  role: 'admin' | 'volunteer' | null;
}
export interface Standing {
  striverId: string;
  name: string;
  grp: Group;
  squadId: string | null;
  rank: number;
  days: number;
  bestStreak: number;
  streak: number;
  avgOffsetSec: number;
}
export interface Prize {
  grp: Group | 'all';
  place: number | null;
  milestoneDays: number | null;
  title: string;
  detail: string;
  sponsor: string;
}
export interface Badge {
  id: string;
  name: string;
  detail: string;
  earned: boolean;
  progress: number;
  goal: number;
}
export interface Patterns {
  days: number;
  weekdays: { came: number; of: number }[];
  hardest: number | null;
  strongest: number | null;
  arrival: { now: number; before: number | null; samples: number } | null;
}
export interface Stats {
  patterns: Patterns | null;
  striver: { id: string; name: string; grp: Group };
  today: string;
  total: number;
  streak: number;
  best: number;
  doneToday: boolean;
  dates: string[];
  excused: string[];
  weeklyGoal: number;
  weekDays: number;
  recent: { date: string; mosque: string }[];
  mosques: number;
  rank: number | null;
  ranked: number;
  home: { id: string; name: string } | null;
  badges: Badge[];
}

export interface FeedItem {
  id: string;
  striverId: string;
  name: string;
  kind: 'streak' | 'total';
  value: number;
  date: string;
  kudos: number;
  mine: boolean;
  own: boolean;
}
export interface FamilyRow {
  id: string;
  name: string | null;
  first: string | null;
  members: number;
  days: number;
  perMember: number;
  mine: boolean;
}
export interface Award {
  kind: 'consistent' | 'improved' | 'newcomer';
  striverId: string;
  name: string;
  days: number;
  prev: number;
}
export interface Community {
  hidden: boolean;
  feed: FeedItem[];
  honour: { striverId: string; name: string; date: string; top: number }[];
  families: FamilyRow[];
  familyOfMonth: { month: string; family: FamilyRow } | null;
  awards: Award[];
  week: { from: string; to: string };
}
export interface Pulse {
  awake: { date: string; canTap: boolean; mine: boolean; up: string[]; mosqueCount: number } | null;
  cheers: { milestoneId: string; kind: 'streak' | 'total'; value: number; owner: string | null; names: string[]; count: number }[];
  toCheer: { id: string; striverId: string; name: string; kind: 'streak' | 'total'; value: number; date: string }[];
}
export interface ExcuseRequest {
  id: string;
  striverId: string;
  name: string;
  mosque: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'declined';
}
