// Attendance ticks made with no signal are kept on the phone and sent later.
import { api, ApiError } from '../api';

export interface Tick {
  mosqueId: string;
  striverId: string;
  date: string;
  present: boolean;
}

const KEY = 'raf.ticks';

function read(): Tick[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}
const write = (list: Tick[]) => localStorage.setItem(KEY, JSON.stringify(list));
const same = (a: Tick, b: Tick) => a.mosqueId === b.mosqueId && a.striverId === b.striverId && a.date === b.date;

export const pendingTicks = (mosqueId: string) => read().filter((t) => t.mosqueId === mosqueId);

/** Keep a tick for later. A newer tick for the same person and day replaces the older one. */
export function keepTick(tick: Tick) {
  write([...read().filter((t) => !same(t, tick)), tick]);
}

/** Send what is waiting. Stops at the first tick that still cannot reach the server. */
export async function sendTicks(mosqueId: string): Promise<{ sent: number; left: number; refused: number }> {
  let sent = 0;
  let refused = 0;
  for (const tick of pendingTicks(mosqueId)) {
    try {
      await api(`/mosques/${mosqueId}/mark`, { body: { striverId: tick.striverId, date: tick.date, present: tick.present } });
      sent++;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'offline') break;
      // The server said no (for example the day is now too old): do not keep retrying.
      refused++;
    }
    write(read().filter((t) => !same(t, tick)));
  }
  return { sent, left: pendingTicks(mosqueId).length, refused };
}

export function saveList(key: string, value: unknown) {
  try {
    localStorage.setItem(`raf.list.${key}`, JSON.stringify(value));
  } catch {
    /* storage is full: the list still works online */
  }
}

export function savedList<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(`raf.list.${key}`) ?? 'null');
  } catch {
    return null;
  }
}
