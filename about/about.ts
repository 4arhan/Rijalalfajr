import '@fontsource-variable/manrope';
import './about.css';
import {
  createIcons, Award, Baby, BadgeCheck, CalendarRange, ChartColumn, ClipboardCheck, ClipboardList, Clock, Coffee, EyeOff, FlaskConical, Gift, Globe,
  GraduationCap, HandHeart, HeartHandshake, IdCard, Image as ImageIcon, Languages, MapPin, Medal, Network, Printer, QrCode, ScanLine, Send, Share2, ShieldCheck,
  Sparkles, Star, Sunrise, Target, Trophy, Users, UsersRound, WifiOff,
} from 'lucide';

document.documentElement.classList.add('js');
const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- languages ----------
// The page is written in English. A translation is a JSON file in ./locales
// whose keys are the English text of each element and whose values replace it.
const LANGS: [string, string, boolean][] = [
  ['en', 'English', false], ['ar', 'العربية', true], ['ur', 'اردو', true], ['fa', 'فارسی', true], ['tr', 'Türkçe', false],
  ['id', 'Bahasa Indonesia', false], ['ms', 'Bahasa Melayu', false], ['bn', 'বাংলা', false], ['hi', 'हिन्दी', false], ['fr', 'Français', false],
  ['es', 'Español', false], ['pt', 'Português', false], ['ru', 'Русский', false], ['zh', '中文', false], ['sw', 'Kiswahili', false],
];
const files = import.meta.glob<{ default: Record<string, string> }>('./locales/*.json');

/** Elements that hold a sentence of their own, outermost first. Decorative parts opt out with data-notranslate. */
function sentences(): HTMLElement[] {
  const out: HTMLElement[] = [];
  const walk = (el: Element) => {
    if (el instanceof HTMLElement && el.dataset.notranslate !== undefined) return;
    if (el instanceof HTMLElement && !['SCRIPT', 'STYLE', 'SELECT', 'SVG'].includes(el.tagName.toUpperCase())) {
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue!.trim());
      if (ownText) return void out.push(el);
    }
    [...el.children].forEach(walk);
  };
  walk(document.body);
  return out;
}

/** The text of an element as a key: icons and images become numbered markers. */
function keyOf(el: HTMLElement): { key: string; kept: string[] } {
  const copy = el.cloneNode(true) as HTMLElement;
  const kept: string[] = [];
  copy.querySelectorAll('svg, img').forEach((n) => {
    kept.push(n.outerHTML);
    n.replaceWith(`[[${kept.length - 1}]]`);
  });
  return { key: copy.innerHTML.replace(/\s+/g, ' ').trim(), kept };
}

function collect(): string[] {
  const keys = new Set<string>([document.title]);
  const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (desc) keys.add(desc.content);
  sentences().forEach((el) => keys.add(keyOf(el).key));
  document.querySelectorAll<HTMLImageElement>('img[alt]').forEach((i) => i.alt && keys.add(i.alt));
  return [...keys];
}
// Used by the script that writes locales/en.json.
(window as unknown as { __aboutKeys: () => string[] }).__aboutKeys = collect;

function translate(dict: Record<string, string>) {
  for (const el of sentences()) {
    const { key, kept } = keyOf(el);
    const to = dict[key];
    if (to) el.innerHTML = to.replace(/\[\[(\d+)\]\]/g, (_, i) => kept[Number(i)] ?? '');
  }
  document.querySelectorAll<HTMLImageElement>('img[alt]').forEach((i) => {
    if (dict[i.alt]) i.alt = dict[i.alt];
  });
  if (dict[document.title]) document.title = dict[document.title];
}

function chosen(): string {
  const known = (c: string | null | undefined) => LANGS.find((l) => l[0] === c)?.[0];
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('raf.lang');
  } catch {
    /* storage is blocked: fall back to the browser's language */
  }
  if (known(saved)) return saved!;
  for (const want of navigator.languages ?? [navigator.language]) {
    const hit = known(want.toLowerCase().split('-')[0]);
    if (hit) return hit;
  }
  return 'en';
}

const lang = chosen();
const picker = document.getElementById('lang') as HTMLSelectElement | null;
if (picker) {
  picker.innerHTML = LANGS.map(([code, name]) => `<option value="${code}"${code === lang ? ' selected' : ''}>${name}</option>`).join('');
  picker.addEventListener('change', () => {
    try {
      localStorage.setItem('raf.lang', picker.value);
    } catch {
      /* not saved; the choice still applies to this visit */
    }
    location.reload();
  });
}
if (lang !== 'en' && files[`./locales/${lang}.json`]) {
  document.documentElement.lang = lang;
  document.documentElement.dir = LANGS.find((l) => l[0] === lang)![2] ? 'rtl' : 'ltr';
  files[`./locales/${lang}.json`]().then((m) => translate(m.default)).catch(() => {});
}

// ---------- icons ----------
createIcons({
  attrs: { 'stroke-width': '1.9', 'aria-hidden': 'true' },
  icons: {
    Award, Baby, BadgeCheck, CalendarRange, ChartColumn, ClipboardCheck, ClipboardList, Clock, Coffee, EyeOff, FlaskConical, Gift, Globe, GraduationCap,
    HandHeart, HeartHandshake, IdCard, Image: ImageIcon, Languages, MapPin, Medal, Network, Printer, QrCode, ScanLine, Send, Share2, ShieldCheck, Sparkles,
    Star, Sunrise, Target, Trophy, Users, UsersRound, WifiOff,
  },
});

// ---------- things appear as they scroll into view ----------
const seen = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      seen.unobserve(e.target);
    }
  },
  { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
);
// Cards in a grid follow one another rather than landing all at once.
document.querySelectorAll<HTMLElement>('.bento').forEach((grid) => {
  [...grid.children].forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i % 3)));
});
document.querySelectorAll('.reveal').forEach((el) => seen.observe(el));

// ---------- reading progress ----------
const bar = document.getElementById('progress');
const onScroll = () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (bar) bar.style.width = `${max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0}%`;
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ---------- the code on the mosque screen: a new pattern every few seconds ----------
const qr = document.getElementById('qr');
if (qr) {
  const N = 21;
  // The three corner squares every QR code has.
  const finder = (r: number, c: number) => {
    for (const [fr, fc] of [[0, 0], [0, N - 7], [N - 7, 0]]) {
      const y = r - fr;
      const x = c - fc;
      if (y >= 0 && y < 7 && x >= 0 && x < 7) return y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4) ? 1 : 0;
      if (y >= -1 && y <= 7 && x >= -1 && x <= 7) return 0;
    }
    return -1;
  };
  const cells: HTMLElement[] = [];
  for (let i = 0; i < N * N; i++) {
    const cell = document.createElement('i');
    qr.appendChild(cell);
    cells.push(cell);
  }
  const shuffle = () =>
    cells.forEach((cell, i) => {
      const f = finder(Math.floor(i / N), i % N);
      cell.classList.toggle('off', f === -1 ? Math.random() < 0.52 : f === 0);
    });
  shuffle();
  if (!calm) setInterval(shuffle, 4000);
}

// ---------- the streak counts up when its tile appears ----------
const streakN = document.getElementById('streak-n');
const streakTile = streakN?.closest('.show');
if (streakN && streakTile) {
  const target = 22;
  if (calm) streakN.textContent = String(target);
  else {
    new IntersectionObserver((entries, o) => {
      if (!entries[0].isIntersecting) return;
      o.disconnect();
      const start = performance.now() + 300;
      const step = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - start) / 2000));
        streakN.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.4 }).observe(streakTile);
  }
}

// ---------- every language, drifting past ----------
for (const [id, list] of [['marquee-a', LANGS], ['marquee-b', [...LANGS].reverse()]] as const) {
  const track = document.getElementById(id);
  // Written out twice so the loop has no seam.
  if (track) track.innerHTML = [...list, ...list].map(([code, name]) => `<span lang="${code}">${name}</span>`).join('');
}

// ---------- the tour: tabs swap the phone's screenshot, and play by themselves ----------
const shot = document.getElementById('tour-shot') as HTMLImageElement | null;
const tablist = document.querySelector<HTMLElement>('.tabs');
const tabs = [...document.querySelectorAll<HTMLButtonElement>('.tabs [role="tab"]')];
let timer: ReturnType<typeof setTimeout> | undefined;

function show(tab: HTMLButtonElement) {
  if (!shot) return;
  tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
  shot.style.opacity = '0';
  shot.style.transform = 'scale(0.97)';
  const next = new Image();
  next.onload = () => {
    shot.src = next.src;
    shot.style.opacity = '1';
    shot.style.transform = 'none';
  };
  next.src = `/shots/${tab.dataset.shot}.webp`;
}
function play() {
  clearTimeout(timer);
  if (calm || !tablist) return;
  tablist.classList.add('playing');
  timer = setTimeout(() => {
    const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    show(tabs[(i + 1) % tabs.length]);
    play();
  }, 5000);
}
function stop() {
  clearTimeout(timer);
  tablist?.classList.remove('playing');
}
for (const tab of tabs) {
  // Choosing a screen yourself stops the slideshow.
  tab.addEventListener('click', () => {
    stop();
    show(tab);
  });
}
if (tablist && !calm) {
  // Only play while the tour is on screen.
  new IntersectionObserver((entries) => (entries[0].isIntersecting ? play() : stop()), { threshold: 0.35 }).observe(tablist);
}
