// Draws a story-sized card (1080 x 1920) and hands it to the phone's share sheet.
import { dateLocale, isRtl, t, tn } from './i18n';
export interface CardData {
  name: string;
  streak: number;
  mosque: string;
  total?: number;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export async function drawCard(d: CardData): Promise<Blob> {
  await document.fonts.ready;
  const W = 1080;
  const H = 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  x.direction = isRtl() ? 'rtl' : 'ltr';
  const font = (w: number, s: number) => `${w} ${s}px "Manrope Variable", system-ui, sans-serif`;

  const bg = x.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, '#15402f');
  bg.addColorStop(0.5, '#0b2319');
  bg.addColorStop(1, '#06130f');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);

  // Dawn on the horizon.
  const sun = x.createRadialGradient(W / 2, H * 0.78, 20, W / 2, H * 0.78, 760);
  sun.addColorStop(0, 'rgba(255, 214, 130, 0.9)');
  sun.addColorStop(0.3, 'rgba(240, 176, 80, 0.35)');
  sun.addColorStop(1, 'rgba(240, 176, 80, 0)');
  x.fillStyle = sun;
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#06130f';
  x.fillRect(0, H * 0.78, W, H * 0.22);
  x.fillStyle = '#a8f0cf';
  x.fillRect(120, H * 0.78 - 5, W - 240, 10);

  x.textAlign = 'center';
  x.fillStyle = '#7beabc';
  x.font = font(700, 40);
  x.fillText('R I J A L   A L - F A J R', W / 2, 250);

  x.fillStyle = '#eef8f2';
  x.font = font(300, 460);
  x.fillText(String(d.streak), W / 2, 830);
  x.font = font(700, 64);
  x.fillText(d.streak === 1 ? t('dawn at the mosque') : t('dawns in a row'), W / 2, 950);

  x.fillStyle = '#b4ccc1';
  x.font = font(600, 50);
  let y = 1090;
  for (const line of wrap(x, d.name, W - 200)) {
    x.fillText(line, W / 2, y);
    y += 66;
  }
  x.fillStyle = '#7beabc';
  x.font = font(600, 44);
  for (const line of wrap(x, d.mosque, W - 200)) {
    x.fillText(line, W / 2, y + 10);
    y += 58;
  }

  x.fillStyle = '#b4ccc1';
  x.font = font(600, 38);
  x.fillText(t('Pray Fajr at your mosque. Check in. Keep the streak.'), W / 2, H - 190);
  x.fillStyle = '#eef8f2';
  x.font = font(700, 40);
  x.fillText(location.host, W / 2, H - 120);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card'))), 'image/png'));
}

async function send(blob: Blob, text: string) {
  const file = new File([blob], 'rijal-al-fajr.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function shareCard(d: CardData) {
  await send(await drawCard(d), `${tn(d.streak, '{n} dawn in a row at {mosque}.', '{n} dawns in a row at {mosque}.', { mosque: d.mosque })} #RijalAlFajr`);
}

const FONT = (w: number, size: number) => `${w} ${size}px "Manrope Variable", system-ui, sans-serif`;

function backdrop(W: number, H: number) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  const bg = x.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, '#15402f');
  bg.addColorStop(0.5, '#0b2319');
  bg.addColorStop(1, '#06130f');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(W * 0.86, 0, 10, W * 0.86, 0, W * 0.9);
  glow.addColorStop(0, 'rgba(245, 190, 92, 0.42)');
  glow.addColorStop(1, 'rgba(245, 190, 92, 0)');
  x.fillStyle = glow;
  x.fillRect(0, 0, W, H);
  x.textAlign = 'center';
  x.direction = isRtl() ? 'rtl' : 'ltr';
  return { c, x };
}

const toBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the image'))), 'image/png'));

/** A square-ish post for the mosque's own page: the week's podium and attendance. */
export async function sharePoster(d: { mosque: string; place: string; podium: { name: string; days: number }[]; total: number; average: number; best: number }) {
  await document.fonts.ready;
  const W = 1080;
  const H = 1350;
  const { c, x } = backdrop(W, H);
  x.fillStyle = '#7beabc';
  x.font = FONT(700, 34);
  x.fillText(t('Fajr this week').toUpperCase(), W / 2, 120);
  x.fillStyle = '#eef8f2';
  x.font = FONT(750, 70);
  wrap(x, d.mosque, W - 160).slice(0, 2).forEach((line, i) => x.fillText(line, W / 2, 220 + i * 78));
  x.fillStyle = '#b4ccc1';
  x.font = FONT(600, 36);
  x.fillText(d.place, W / 2, 330 + (x.measureText(d.mosque).width > W - 160 ? 60 : 0));

  // Podium: second, first, third.
  const cols = [
    { i: 1, cx: 250, h: 190, color: '#c9d4d4' },
    { i: 0, cx: 540, h: 270, color: '#f1c768' },
    { i: 2, cx: 830, h: 140, color: '#d79a6b' },
  ];
  const base = 920;
  for (const col of cols) {
    const p = d.podium[col.i];
    x.fillStyle = 'rgba(168, 240, 207, 0.12)';
    x.fillRect(col.cx - 125, base - col.h, 250, col.h);
    x.fillStyle = col.color;
    x.beginPath();
    x.arc(col.cx, base - col.h - 150, 54, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#1b1405';
    x.font = FONT(800, 46);
    x.fillText(String(col.i + 1), col.cx, base - col.h - 134);
    x.fillStyle = '#eef8f2';
    x.font = FONT(700, 34);
    x.fillText(p ? wrap(x, p.name, 250)[0] : t('Open'), col.cx, base - col.h - 56);
    x.fillStyle = '#b4ccc1';
    x.font = FONT(600, 28);
    x.fillText(p ? tn(p.days, '{n} day', '{n} days') : '', col.cx, base - col.h - 18);
  }
  x.fillStyle = '#a8f0cf';
  x.fillRect(110, base, W - 220, 8);

  const stats: [string, string][] = [[String(d.total), t('check-ins')], [String(d.average), t('a day on average')], [String(d.best), t('on the best day')]];
  stats.forEach(([n, label], i) => {
    const cx = 250 + i * 290;
    x.fillStyle = '#eef8f2';
    x.font = FONT(300, 92);
    x.fillText(n, cx, 1090);
    x.fillStyle = '#b4ccc1';
    x.font = FONT(600, 28);
    x.fillText(label, cx, 1136);
  });
  x.fillStyle = '#7beabc';
  x.font = FONT(700, 34);
  x.fillText(t('Join us at Fajr.') + '  ' + location.host, W / 2, H - 80);
  await send(await toBlob(c), `${t('Fajr this week at {mosque}.', { mosque: d.mosque })} #RijalAlFajr`);
}

/** A story-sized summary of someone's year. */
export async function shareReview(d: { name: string; year: number; total: number; best: number; mosques: number; topMosque: string | null; months: number[] }) {
  await document.fonts.ready;
  const W = 1080;
  const H = 1920;
  const { c, x } = backdrop(W, H);
  x.fillStyle = '#7beabc';
  x.font = FONT(700, 40);
  x.fillText(t('My {year} at Fajr', { year: d.year }).toUpperCase(), W / 2, 230);
  x.fillStyle = '#eef8f2';
  x.font = FONT(300, 400);
  x.fillText(String(d.total), W / 2, 720);
  x.font = FONT(700, 60);
  x.fillText(d.total === 1 ? t('dawn at the mosque') : t('dawns at the mosque'), W / 2, 830);
  x.fillStyle = '#b4ccc1';
  x.font = FONT(600, 46);
  x.fillText(d.name, W / 2, 920);

  // One bar for each month.
  const max = Math.max(1, ...d.months);
  const left = 150;
  const bw = (W - 2 * left) / 12;
  d.months.forEach((n, i) => {
    const h = Math.max(6, (n / max) * 260);
    x.fillStyle = n ? '#a8f0cf' : 'rgba(168, 240, 207, 0.2)';
    x.fillRect(left + i * bw + 8, 1300 - h, bw - 16, h);
    x.fillStyle = '#b4ccc1';
    x.font = FONT(600, 26);
    x.fillText(new Intl.DateTimeFormat(dateLocale(), { month: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, i, 1))), left + i * bw + bw / 2, 1344);
  });
  const facts: [string, string][] = [[String(d.best), t('best streak')], [String(d.mosques), d.mosques === 1 ? t('mosque') : t('mosques')]];
  facts.forEach(([n, label], i) => {
    const cx = 330 + i * 420;
    x.fillStyle = '#eef8f2';
    x.font = FONT(300, 110);
    x.fillText(n, cx, 1530);
    x.fillStyle = '#b4ccc1';
    x.font = FONT(600, 34);
    x.fillText(label, cx, 1584);
  });
  if (d.topMosque) {
    x.fillStyle = '#7beabc';
    x.font = FONT(600, 40);
    x.fillText(wrap(x, t('Mostly at {mosque}', { mosque: d.topMosque }), W - 200)[0], W / 2, 1700);
  }
  x.fillStyle = '#eef8f2';
  x.font = FONT(700, 38);
  x.fillText(location.host, W / 2, H - 110);
  await send(await toBlob(c), `${tn(d.total, '{n} dawn at the mosque in {year}.', '{n} dawns at the mosque in {year}.', { year: d.year })} #RijalAlFajr`);
}
