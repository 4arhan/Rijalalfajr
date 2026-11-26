// Fajr time, the check-in window and date helpers, all in the mosque's own timezone.
import { CalculationMethod, Coordinates, PrayerTimes } from 'adhan';

export const CALC_METHODS = [
  'MuslimWorldLeague',
  'NorthAmerica',
  'Egyptian',
  'UmmAlQura',
  'Karachi',
  'Dubai',
  'Qatar',
  'Kuwait',
  'Singapore',
  'Turkey',
  'Tehran',
  'MoonsightingCommittee',
] as const;
export type CalcMethod = (typeof CALC_METHODS)[number];

export interface MosqueTiming {
  lat: number;
  lng: number;
  timezone: string;
  calc_method: string;
  open_before_min: number;
  iqamah_after_min: number;
  close_after_sunrise_min: number;
  /** The mosque's own timetable, as HH:MM local time. Null means calculated. */
  fajr_time?: string | null;
  iqamah_time?: string | null;
}

export interface FajrWindow {
  date: string;
  fajr: Date;
  iqamah: Date;
  sunrise: Date;
  opens: Date;
  closes: Date;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date (YYYY-MM-DD) at the given instant in a timezone. */
export function localDate(at: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

/** The instant of a wall-clock time (HH:MM) on a date in a timezone. */
export function zonedInstant(date: string, hhmm: string, timezone: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const offset = (t: number) => {
    const parts = fmt.formatToParts(new Date(t));
    const g = (k: string) => Number(parts.find((p) => p.type === k)!.value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - t;
  };
  // Two passes, so a time just after a clock change still lands right.
  return new Date(guess - offset(guess - offset(guess)));
}

export function fajrWindow(m: MosqueTiming, date: string): FajrWindow {
  const [y, mo, d] = date.split('-').map(Number);
  const make = (CalculationMethod as unknown as Record<string, () => ReturnType<typeof CalculationMethod.MuslimWorldLeague>>)[
    m.calc_method
  ];
  const params = (make ?? CalculationMethod.MuslimWorldLeague)();
  // adhan reads the year, month and day from the Date in the runtime's own
  // timezone, so build it from local components to get the date we mean.
  const times = new PrayerTimes(new Coordinates(m.lat, m.lng), new Date(y, mo - 1, d, 12), params);
  const sunrise = times.sunrise;
  const fajr = m.fajr_time ? zonedInstant(date, m.fajr_time, m.timezone) : times.fajr;
  return {
    date,
    fajr,
    sunrise,
    iqamah: m.iqamah_time ? zonedInstant(date, m.iqamah_time, m.timezone) : new Date(fajr.getTime() + m.iqamah_after_min * 60000),
    opens: new Date(fajr.getTime() - m.open_before_min * 60000),
    closes: new Date(sunrise.getTime() + m.close_after_sunrise_min * 60000),
  };
}

export interface WindowState {
  open: boolean;
  /** The Fajr this moment belongs to: today's while it is open or still ahead, otherwise tomorrow's. */
  current: FajrWindow;
  /** The local date at the mosque right now. */
  today: string;
}

export function windowState(m: MosqueTiming, now: Date): WindowState {
  const today = localDate(now, m.timezone);
  const w = fajrWindow(m, today);
  if (now <= w.closes) return { open: now >= w.opens, current: w, today };
  return { open: false, current: fajrWindow(m, addDays(today, 1)), today };
}

/** Distance in metres between two points. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
