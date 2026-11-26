// Collects every piece of text the app can show into src/locales/en.json, and
// checks each translation against it. Run with `npm run i18n`.
//
// A key is the English text. A plural key is two English forms joined by "|";
// its translation has one form for each plural category the language has.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');
const files = ['src/ui.tsx', 'src/App.tsx', 'src/api.ts', 'src/lib/util.ts', 'src/lib/share.ts', 'src/lib/i18n.tsx', ...readdirSync(join(root, 'src/pages')).map((f) => 'src/pages/' + f)];

const STR = `'((?:[^'\\\\]|\\\\.)*)'`;
const unq = (s) => s.replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
const keys = new Set();

for (const f of files) {
  const src = read(f);
  for (const m of src.matchAll(new RegExp(`(?<![\\w.])tx?\\(${STR}`, 'g'))) keys.add(unq(m[1]));
  for (const m of src.matchAll(new RegExp(`(?<![\\w.])tn\\([^']*?,\\s*${STR},\\s*${STR}`, 'g'))) keys.add(`${unq(m[1])}|${unq(m[2])}`);
  for (const m of src.matchAll(new RegExp(`(?<![\\w.])plural\\((?:[^()']|\\([^()]*\\))*?,\\s*'(\\w+)'(?:,\\s*'(\\w+)')?\\)`, 'g'))) {
    keys.add(`{n} ${m[1]}|{n} ${m[2] ?? m[1] + 's'}`);
  }
}

// Text that comes from the server in English and is translated when shown.
const server = read('server/app.ts');
for (const m of server.matchAll(new RegExp(`new HttpError\\(\\s*\\d+,\\s*'\\w+',\\s*(?:[^,'\`]*\\?\\s*)?${STR}`, 'g'))) keys.add(unq(m[1]));
for (const m of server.matchAll(new RegExp(`:\\s*${STR}\\s*\\)?;?\\s*$`, 'gm'))) if (/^[A-Z].*\.$/.test(unq(m[1])) && server.includes(`'${m[1]}')`)) keys.add(unq(m[1]));
for (const m of server.matchAll(new RegExp(`message: ${STR}`, 'g'))) keys.add(unq(m[1]));
for (const m of read('server/board.ts').matchAll(new RegExp(`b\\('\\w+',\\s*${STR},\\s*${STR}`, 'g'))) {
  keys.add(unq(m[1]));
  keys.add(unq(m[2]));
}
keys.add('Anonymous striver');
keys.delete('');

const en = Object.fromEntries([...keys].sort((a, b) => a.localeCompare(b)).map((k) => [k, k]));
writeFileSync(join(root, 'src/locales/en.json'), JSON.stringify(en, null, 1) + '\n');
console.log(`en.json: ${keys.size} entries`);

// ---- check the translations ----
const FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'];
const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const tags = (s) => (s.match(/<\/?b>/g) ?? []).join('');
let bad = 0;
for (const f of readdirSync(join(root, 'src/locales')).filter((x) => x.endsWith('.json') && x !== 'en.json')) {
  const code = f.replace('.json', '');
  let dict;
  try {
    dict = JSON.parse(read('src/locales/' + f));
  } catch (e) {
    console.log(`${code}: NOT VALID JSON (${e.message})`);
    bad++;
    continue;
  }
  const cats = FORMS.filter((c) => new Intl.PluralRules(code).resolvedOptions().pluralCategories.includes(c));
  const problems = [];
  let missing = 0;
  for (const k of keys) {
    const v = dict[k];
    if (typeof v !== 'string' || !v.trim()) {
      missing++;
      if (missing <= 5) problems.push(`missing: ${k.slice(0, 70)}`);
      continue;
    }
    if (k.includes('|') && /\{n\}/.test(k)) {
      const forms = v.split('|');
      if (forms.length !== cats.length) problems.push(`needs ${cats.length} plural forms (${cats.join(', ')}), has ${forms.length}: ${k}`);
      for (const form of forms) if (holes(form.replace('{n}', '')) !== holes(k.split('|')[1].replace('{n}', ''))) problems.push(`placeholders differ: ${k}`);
    } else {
      if (holes(v) !== holes(k)) problems.push(`placeholders differ: ${k.slice(0, 70)}  =>  ${v.slice(0, 70)}`);
      if (tags(v) !== tags(k)) problems.push(`<b> tags differ: ${k.slice(0, 70)}`);
    }
  }
  const extra = Object.keys(dict).filter((k) => !keys.has(k)).length;
  console.log(`${code}: ${keys.size - missing}/${keys.size} translated${extra ? `, ${extra} unused` : ''}${problems.length ? `, ${problems.length} problems` : ''}`);
  problems.slice(0, 12).forEach((p) => console.log('   ' + p));
  if (problems.length) bad++;
}
if (existsSync(join(root, 'about/locales'))) {
  const base = JSON.parse(read('about/locales/en.json'));
  for (const f of readdirSync(join(root, 'about/locales')).filter((x) => x.endsWith('.json') && x !== 'en.json')) {
    try {
      const d = JSON.parse(read('about/locales/' + f));
      const miss = Object.keys(base).filter((k) => typeof d[k] !== 'string' || !d[k].trim()).length;
      const tagBad = Object.keys(base).filter((k) => d[k] && (d[k].match(/<[^>]+>/g) ?? []).length !== (base[k].match(/<[^>]+>/g) ?? []).length);
      console.log(`about ${f.replace('.json', '')}: ${Object.keys(base).length - miss}/${Object.keys(base).length}${tagBad.length ? `, ${tagBad.length} with different markup` : ''}`);
      tagBad.slice(0, 5).forEach((k) => console.log('   markup differs: ' + k));
      if (miss || tagBad.length) bad++;
    } catch (e) {
      console.log(`about ${f}: NOT VALID JSON (${e.message})`);
      bad++;
    }
  }
}
process.exit(bad ? 1 : 0);
