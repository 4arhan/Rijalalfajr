import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api';

/** Load data for a screen, with reload. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let live = true;
    fnRef.current().then(
      (d) => live && (setData(d), setError(null)),
      (e) => live && setError(e instanceof ApiError ? e : new ApiError(0, 'error', String(e?.message ?? e))),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, reload, setData };
}

export function useNow(everyMs = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function timeIn(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function untilText(iso: string, now: Date) {
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - now.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function hijri(d = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch {
    return '';
  }
}

export function niceDate(date: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function plural(n: number, one: string, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}

export function distanceText(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This device cannot share its location.'));
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(e.code === 1 ? 'Location permission was refused.' : 'Could not find your location.')), {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
    });
  });
}

/** A stable random id for this browser, sent with check-ins so staff can spot one phone used for many accounts. */
export function deviceId() {
  let id = localStorage.getItem('raf.device');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('raf.device', id);
  }
  return id;
}

/** Fajr hadith shown on the Today screen, one per day. */
export const HADITH = [
  { text: 'Whoever prays the dawn prayer is under the protection of Allah.', source: 'Sahih Muslim 657' },
  { text: 'The two rak‘ahs of Fajr are better than this world and all it contains.', source: 'Sahih Muslim 725' },
  { text: 'Whoever prays Isha in congregation, it is as if he stood half the night. And whoever prays Fajr in congregation, it is as if he prayed the whole night.', source: 'Sahih Muslim 656' },
  { text: 'Whoever prays the two cool prayers will enter Paradise.', source: 'Sahih al-Bukhari 574' },
  { text: 'Give glad tidings to those who walk to the mosques in the dark of complete light on the Day of Resurrection.', source: 'Sunan Abi Dawud 561' },
  { text: 'Angels come to you in succession by night and day, and they gather at the Fajr and Asr prayers.', source: 'Sahih al-Bukhari 555' },
];
