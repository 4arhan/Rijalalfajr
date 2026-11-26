// Thin client for the API, with the response shapes the screens use.
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
    throw new ApiError(0, 'offline', 'No connection. Check your internet and try again.');
  }
  if (opts.raw && res.ok) return (await res.blob()) as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'error', e.message ?? 'Something went wrong.', e);
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
}
export interface Me {
  user: { id: string; email: string; name: string; owner: boolean };
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
export interface MosquePage {
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
export interface Stats {
  striver: { id: string; name: string; grp: Group };
  today: string;
  total: number;
  streak: number;
  best: number;
  doneToday: boolean;
  dates: string[];
  recent: { date: string; mosque: string }[];
  mosques: number;
  rank: number | null;
  ranked: number;
  home: { id: string; name: string } | null;
  badges: Badge[];
}
