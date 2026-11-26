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
