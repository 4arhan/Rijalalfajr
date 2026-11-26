// Translations. The English text is the key, so the code reads naturally:
//   t('Check in for Fajr')
//   t('{count} of {goal} dawns', { count, goal })
//   tn(n, '{n} day', '{n} days')
// A language is one JSON file in src/locales. Switching language reloads the page.
import { Fragment, type ReactNode } from 'react';

export const LANGS = [
  { code: 'en', name: 'English', rtl: false },
  { code: 'ar', name: 'العربية', rtl: true },
  { code: 'ur', name: 'اردو', rtl: true },
  { code: 'fa', name: 'فارسی', rtl: true },
  { code: 'tr', name: 'Türkçe', rtl: false },
  { code: 'id', name: 'Bahasa Indonesia', rtl: false },
  { code: 'ms', name: 'Bahasa Melayu', rtl: false },
  { code: 'bn', name: 'বাংলা', rtl: false },
  { code: 'hi', name: 'हिन्दी', rtl: false },
  { code: 'fr', name: 'Français', rtl: false },
  { code: 'es', name: 'Español', rtl: false },
  { code: 'pt', name: 'Português', rtl: false },
  { code: 'ru', name: 'Русский', rtl: false },
  { code: 'zh', name: '中文', rtl: false },
  { code: 'sw', name: 'Kiswahili', rtl: false },
] as const;

export type LangCode = (typeof LANGS)[number]['code'];
type Vars = Record<string, string | number | null | undefined>;

const KEY = 'raf.lang';
const FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'];

let lang: LangCode = 'en';
let dict: Record<string, string> = {};
let categories: string[] = ['one', 'other'];
let rules = new Intl.PluralRules('en');

export const currentLang = () => lang;
export const isRtl = () => LANGS.find((l) => l.code === lang)!.rtl;
/** A locale for dates and times: the chosen language, always with Western digits. */
export const dateLocale = () => `${lang}-u-nu-latn`;

function fill(text: string, vars?: Vars) {
  return vars ? text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name] ?? '') : whole)) : text;
}

export function t(key: string, vars?: Vars): string {
  return fill(dict[key] ?? key, vars);
}

/**
 * A count with its noun. English gives two forms; a translation gives one form for
 * each plural category its language has, in the order zero, one, two, few, many, other.
 */
export function tn(n: number, one: string, other: string, vars?: Vars): string {
  const found = dict[`${one}|${other}`];
  let form: string;
  if (!found) form = n === 1 ? one : other;
  else {
    const forms = found.split('|');
    form = forms[categories.indexOf(rules.select(n))] ?? forms[forms.length - 1];
  }
  return fill(form, { n, ...vars });
}

/** Like t(), for a sentence with bold parts or with elements as values. */
export function tx(key: string, vars: Record<string, ReactNode> = {}): ReactNode {
  const parts = (dict[key] ?? key).split(/(<b>.*?<\/b>|\{\w+\})/g).filter(Boolean);
  const piece = (part: string, i: number): ReactNode => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    if (name && name in vars) return <Fragment key={i}>{vars[name]}</Fragment>;
    const bold = /^<b>(.*)<\/b>$/.exec(part)?.[1];
    if (bold !== undefined) return <b key={i}>{bold.split(/(\{\w+\})/g).filter(Boolean).map(piece)}</b>;
    return part;
  };
  return <>{parts.map(piece)}</>;
}

const files = import.meta.glob<{ default: Record<string, string> }>('../locales/*.json');

function pick(): LangCode {
  const known = (code: string | null | undefined) => LANGS.find((l) => l.code === code)?.code;
  const saved = known(localStorage.getItem(KEY));
  if (saved) return saved;
  // First visit: the phone's own language, when we have it.
  for (const want of navigator.languages ?? [navigator.language]) {
    const hit = known(want.toLowerCase().split('-')[0]);
    if (hit) return hit;
  }
  return 'en';
}

/** Load the language before anything is drawn. */
export async function initLang(): Promise<void> {
  lang = pick();
  if (lang !== 'en') {
    try {
      dict = (await files[`../locales/${lang}.json`]()).default;
    } catch {
      lang = 'en';
    }
  }
  rules = new Intl.PluralRules(lang);
  const has = rules.resolvedOptions().pluralCategories;
  categories = FORMS.filter((f) => has.includes(f as Intl.LDMLPluralRule));
  document.documentElement.lang = lang;
  document.documentElement.dir = isRtl() ? 'rtl' : 'ltr';
}

export function setLang(code: LangCode) {
  localStorage.setItem(KEY, code);
  location.reload();
}

export function LanguagePicker({ label }: { label?: string }) {
  return (
    <label className="field">
      {label && <span>{label}</span>}
      <select value={lang} onChange={(e) => setLang(e.target.value as LangCode)} aria-label="Language">
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>{l.name}</option>
        ))}
      </select>
    </label>
  );
}
