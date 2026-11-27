// Streaks, standings and badges, computed from check-in rows.
import { addDays, daysBetween } from './fajr.js';

export type Group = 'kids' | 'youth' | 'adults';

export interface StriverRow {
  id: string;
  name: string;
  grp: Group;
  anonymous: boolean;
  squad_id: string | null;
}

export interface CheckinRow {
  striver_id: string;
  fajr_date: string;
  offset_sec: number;
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

/** Longest run of consecutive dates, and the run that is still alive at `today`. */
export function streaks(dates: string[], today: string, excused?: Set<string>): { best: number; current: number } {
  const sorted = [...new Set(dates)].sort();
  // True when every day strictly between two dates was excused by the mosque.
  const bridged = (from: string, to: string) => {
    const gap = daysBetween(from, to);
    if (gap <= 1) return gap === 1;
    if (!excused?.size || gap > 60) return false;
    for (let i = 1; i < gap; i++) if (!excused.has(addDays(from, i))) return false;
    return true;
  };
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && bridged(prev, d) ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  // A streak is alive until a Fajr is actually missed: yesterday still counts
  // while today's Fajr has not been prayed yet, and an excused day is not a miss.
  const last = sorted[sorted.length - 1];
  const current = last && (last >= addDays(today, -1) || bridged(last, today)) ? run : 0;
  return { best, current };
}

/**
 * Rank strivers by days attended. Ties are broken by the longest streak, then
 * by who arrives earliest on average.
 */
export function standings(strivers: StriverRow[], checkins: CheckinRow[], today: string, excused?: Map<string, Set<string>>): Standing[] {
  const by = new Map<string, CheckinRow[]>();
  for (const c of checkins) {
    const list = by.get(c.striver_id);
    if (list) list.push(c);
    else by.set(c.striver_id, [c]);
  }
  const rows: Standing[] = [];
  for (const s of strivers) {
    const list = by.get(s.id);
    if (!list?.length) continue;
    const st = streaks(
      list.map((c) => c.fajr_date),
      today,
      excused?.get(s.id),
    );
    rows.push({
      striverId: s.id,
      name: s.anonymous ? 'Anonymous striver' : s.name,
      grp: s.grp,
      squadId: s.squad_id,
      rank: 0,
      days: list.length,
      bestStreak: st.best,
      streak: st.current,
      avgOffsetSec: Math.round(list.reduce((a, c) => a + c.offset_sec, 0) / list.length),
    });
  }
  rows.sort(
    (a, b) =>
      b.days - a.days ||
      b.bestStreak - a.bestStreak ||
      a.avgOffsetSec - b.avgOffsetSec ||
      a.name.localeCompare(b.name),
  );
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

/** "Musa Rahman" becomes "Musa R." for people viewing without an account. */
export function shortName(name: string): string {
  // The stand-in for a hidden name is not a name to shorten.
  if (name === 'Anonymous striver') return name;
  const parts = name.trim().split(/\s+/);
  return parts.length < 2 ? name : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function rerank(rows: Standing[]): Standing[] {
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export interface Badge {
  id: string;
  name: string;
  detail: string;
  earned: boolean;
  progress: number;
  goal: number;
}

export function badges(stats: { total: number; best: number; mosques: number; early: number; invited: number }): Badge[] {
  const b = (id: string, name: string, detail: string, progress: number, goal: number): Badge => ({
    id,
    name,
    detail,
    progress: Math.min(progress, goal),
    goal,
    earned: progress >= goal,
  });
  return [
    b('first', 'First Dawn', 'Your first Fajr at the mosque', stats.total, 1),
    b('three', 'Three in a Row', '3 dawns in a row', stats.best, 3),
    b('week', 'A Week of Dawns', '7 dawns in a row', stats.best, 7),
    b('fortnight', 'Fortnight', '14 dawns in a row', stats.best, 14),
    b('steadfast', 'Steadfast', '21 dawns in a row', stats.best, 21),
    b('rijal', 'Rijal al-Fajr', '40 dawns in a row', stats.best, 40),
    b('hundred', 'Hundred Dawns', '100 Fajr prayers at the mosque', stats.total, 100),
    b('musafir', 'Musafir', 'Fajr at 3 different mosques', stats.mosques, 3),
    b('early', 'Before the Adhan', 'Arrived before the adhan 10 times', stats.early, 10),
    b('caller', 'Caller to Good', 'Brought 3 friends to Fajr', stats.invited, 3),
  ];
}

// ---------- milestones, patterns and weekly awards ----------

/** Dawns in a row that are announced the first time a person reaches them. */
export const STREAK_MARKS = [7, 14, 21, 40, 100, 200, 365];
/** Totals that are announced. One is a person's very first Fajr at the mosque. */
export const TOTAL_MARKS = [1, 50, 100, 250, 500, 1000];
/** Forty dawns in a row puts a name on the mosque's roll of honour. */
export const HONOUR_DAYS = 40;

/** 0 for Monday through 6 for Sunday. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** The Monday of the week a date falls in. */
export function mondayOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}

export interface Patterns {
  /** Days looked at: up to twelve weeks, starting from the person's first Fajr. */
  days: number;
  /** Monday first: how many of each weekday were attended, out of how many. */
  weekdays: { came: number; of: number }[];
  hardest: number | null;
  strongest: number | null;
  /** Average arrival in minutes after the adhan (negative is before it), for check-ins by phone or card. */
  arrival: { now: number; before: number | null; samples: number } | null;
}

/**
 * Which weekdays a person makes and misses, and whether they arrive earlier than they did.
 * Excused days are left out. Null until there are two weeks to look at.
 */
export function patterns(
  rows: { fajr_date: string; offset_sec: number; method: string }[],
  excused: Set<string>,
  today: string,
): Patterns | null {
  if (!rows.length) return null;
  const on = new Set(rows.map((r) => r.fajr_date));
  const first = rows.reduce((a, r) => (r.fajr_date < a ? r.fajr_date : a), rows[0].fajr_date);
  const from = first > addDays(today, -83) ? first : addDays(today, -83);
  // Today counts only once it has been prayed.
  const to = on.has(today) ? today : addDays(today, -1);
  const span = daysBetween(from, to) + 1;
  if (span < 14) return null;
  const weekdays = Array.from({ length: 7 }, () => ({ came: 0, of: 0 }));
  for (let i = 0; i < span; i++) {
    const d = addDays(from, i);
    if (excused.has(d) && !on.has(d)) continue;
    const w = weekdays[weekdayOf(d)];
    w.of++;
    if (on.has(d)) w.came++;
  }
  const rate = (w: { came: number; of: number }) => (w.of ? w.came / w.of : 1);
  const usable = weekdays.map((w, i) => ({ i, r: rate(w), of: w.of })).filter((w) => w.of >= 2);
  let hardest: number | null = null;
  let strongest: number | null = null;
  if (usable.length) {
    const low = usable.reduce((a, b) => (b.r < a.r ? b : a));
    const high = usable.reduce((a, b) => (b.r > a.r ? b : a));
    // Only worth saying when one day really is weaker than another.
    if (high.r - low.r >= 0.15) {
      hardest = low.i;
      strongest = high.i;
    }
  }
  // A tick on the attendance list has no real arrival time, so only scans count here.
  const timed = rows.filter((r) => r.method !== 'list');
  const avg = (list: typeof timed) => Math.round(list.reduce((a, r) => a + r.offset_sec, 0) / list.length / 60);
  const recent = timed.filter((r) => r.fajr_date > addDays(today, -30));
  const earlier = timed.filter((r) => r.fajr_date <= addDays(today, -30) && r.fajr_date > addDays(today, -60));
  const arrival = recent.length >= 5 ? { now: avg(recent), before: earlier.length >= 5 ? avg(earlier) : null, samples: recent.length } : null;
  return { days: span, weekdays, hardest, strongest, arrival };
}

export interface Award {
  kind: 'consistent' | 'improved' | 'newcomer';
  striverId: string;
  name: string;
  days: number;
  /** Days in the week before, for "most improved". */
  prev: number;
}

/**
 * The three awards for one finished week, Monday to Sunday. `checkins` covers that week and
 * the one before it; `firsts` is each person's first Fajr ever. Nobody takes two awards.
 */
export function weeklyAwards(strivers: StriverRow[], checkins: CheckinRow[], firsts: Map<string, string>, weekStart: string): Award[] {
  const prevStart = addDays(weekStart, -7);
  const weekEnd = addDays(weekStart, 6);
  const stat = new Map<string, { cur: number; prev: number; offset: number }>();
  for (const c of checkins) {
    if (c.fajr_date < prevStart || c.fajr_date > weekEnd) continue;
    const s = stat.get(c.striver_id) ?? { cur: 0, prev: 0, offset: 0 };
    if (c.fajr_date >= weekStart) {
      s.cur++;
      s.offset += c.offset_sec;
    } else s.prev++;
    stat.set(c.striver_id, s);
  }
  const rows = strivers
    .map((s) => ({ s, ...(stat.get(s.id) ?? { cur: 0, prev: 0, offset: 0 }), first: firsts.get(s.id) ?? '9999-12-31' }))
    .filter((r) => r.cur > 0);
  const taken = new Set<string>();
  const out: Award[] = [];
  const give = (kind: Award['kind'], r: (typeof rows)[number] | undefined) => {
    if (!r) return;
    taken.add(r.s.id);
    out.push({ kind, striverId: r.s.id, name: r.s.anonymous ? 'Anonymous striver' : r.s.name, days: r.cur, prev: r.prev });
  };
  const byName = (a: (typeof rows)[number], b: (typeof rows)[number]) => a.s.name.localeCompare(b.s.name);
  const isNew = (r: (typeof rows)[number]) => r.first >= addDays(weekEnd, -13);
  // Most consistent: the most dawns that week, then the most over both weeks, then the earliest arrival.
  give(
    'consistent',
    rows.filter((r) => r.cur >= 5).sort((a, b) => b.cur - a.cur || b.prev - a.prev || a.offset / a.cur - b.offset / b.cur || byName(a, b))[0],
  );
  // Most improved: the biggest step up from the week before, for people who were already coming.
  give(
    'improved',
    rows
      .filter((r) => !taken.has(r.s.id) && !isNew(r) && r.cur - r.prev >= 2 && r.cur >= 3)
      .sort((a, b) => b.cur - b.prev - (a.cur - a.prev) || b.cur - a.cur || byName(a, b))[0],
  );
  // Best newcomer: started within the last two weeks.
  give('newcomer', rows.filter((r) => !taken.has(r.s.id) && isNew(r) && r.cur >= 2).sort((a, b) => b.cur - a.cur || byName(a, b))[0]);
  return out;
}
