import '@fontsource-variable/manrope';
import './about.css';

// ---------- languages ----------
// The page is written in English. A translation is a JSON file in ./locales
// whose keys are the English text of each element and whose values replace it.
const LANGS: [string, string, boolean][] = [
  ['en', 'English', false], ['ar', 'العربية', true], ['ur', 'اردو', true], ['fa', 'فارسی', true], ['tr', 'Türkçe', false],
  ['id', 'Bahasa Indonesia', false], ['ms', 'Bahasa Melayu', false], ['bn', 'বাংলা', false], ['hi', 'हिन्दी', false], ['fr', 'Français', false],
  ['es', 'Español', false], ['pt', 'Português', false], ['ru', 'Русский', false], ['zh', '中文', false], ['sw', 'Kiswahili', false],
];
const files = import.meta.glob<{ default: Record<string, string> }>('./locales/*.json');

/** Elements that hold a sentence of their own, outermost first. */
function sentences(): HTMLElement[] {
  const out: HTMLElement[] = [];
  const walk = (el: Element) => {
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

// ---------- the tour: each tab swaps the phone's screenshot ----------
const shot = document.getElementById('tour-shot') as HTMLImageElement | null;
const tabs = [...document.querySelectorAll<HTMLButtonElement>('.tabs [role="tab"]')];
for (const tab of tabs) {
  tab.addEventListener('click', () => {
    if (!shot) return;
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    shot.style.opacity = '0';
    const next = new Image();
    next.onload = () => {
      shot.src = next.src;
      shot.style.opacity = '1';
    };
    next.src = `/shots/${tab.dataset.shot}.webp`;
  });
}
