import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Flame, Gift, Globe, HeartHandshake, Sunrise, Trophy } from 'lucide-react';
import { api, GROUPS, type Group } from '../api';
import { Field, Seg, useAction, useSession } from '../ui';
import { groupName } from '../lib/util';
import { LanguagePicker, t, tx } from '../lib/i18n';

const GROUP_HINT: Record<Group, string> = { kids: t('Under 12'), youth: t('12 to 17'), adults: t('18 and over') };

export function AuthForm({ onDone }: { onDone?: () => void }) {
  const { signIn } = useSession();
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [grp, setGrp] = useState<Group>('adults');
  const act = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    act.run(async () => {
      const inviteCode = localStorage.getItem('raf.invite') ?? undefined;
      const body = mode === 'signup' ? { email, password, name, grp, inviteCode } : { email, password };
      const { token } = await api<{ token: string }>(`/auth/${mode}`, { body });
      localStorage.removeItem('raf.invite');
      await signIn(token);
      onDone?.();
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <Seg value={mode} onChange={setMode} options={[{ value: 'signup', label: t('Create account') }, { value: 'login', label: t('Sign in') }]} />
      {mode === 'signup' && localStorage.getItem('raf.invite') && (
        <div className="note">{t('A friend invited you. You will start at their mosque, as their Fajr buddy.')}</div>
      )}
      {mode === 'signup' && (
        <>
          <Field label={t('Your name')} hint={t('Shown on your mosque\'s leaderboard. You can hide it later.')}>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="name" placeholder={t('e.g. Yusuf A.')} />
          </Field>
          <Field label={t('Your group')} hint={GROUP_HINT[grp]}>
            <select value={grp} onChange={(e) => setGrp(e.target.value as Group)}>
              {GROUPS.map((g) => (
                <option key={g} value={g}>{groupName(g)}</option>
              ))}
            </select>
          </Field>
        </>
      )}
      <Field label={t('Email')}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" />
      </Field>
      <Field label={t('Password')} hint={mode === 'signup' ? t('At least 8 characters') : undefined}>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'signup' ? 8 : 1} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
      </Field>
      {act.error && <div className="note err" role="alert">{act.error}</div>}
      <button className="btn block" disabled={act.busy}>{mode === 'signup' ? t('Create account') : t('Sign in')}</button>
      {mode === 'signup' && (
        <p className="muted small">
          {tx('By creating an account you agree to the {rules} and {privacy}.', { rules: <Link to="/rules">{t('rules')}</Link>, privacy: <Link to="/privacy">{t('privacy policy')}</Link> })}
        </p>
      )}
    </form>
  );
}

/** The mosque skyline at the foot of the dawn sky. */
function Skyline() {
  return (
    <svg className="l-skyline" viewBox="0 0 1440 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <g fill="var(--paper)">
        <rect x="0" y="196" width="1440" height="24" />
        <path d="M0 196v-34h46v-18h38v24h52v-40h30v40h44v-22h58v22h36v-52h26v52h62v-30h48v30h40v36z" opacity=".5" />
        <path d="M1440 196v-40h-52v-22h-40v30h-46v-46h-28v46h-58v-26h-44v26h-50v-58h-24v58h-70v-28h-46v28h-34v32z" opacity=".5" />
        <path d="M498 196V74l-5-6 9-34 9 34-5 6v122z" />
        <path d="M934 196V74l-5-6 9-34 9 34-5 6v122z" />
        <path d="M396 196v-84l-4-5 7-24 7 24-4 5v84z" />
        <path d="M1038 196v-84l-4-5 7-24 7 24-4 5v84z" />
        <rect x="540" y="136" width="360" height="60" />
        <path d="M620 136a100 86 0 0 1 200 0z" />
        <path d="M548 136a44 38 0 0 1 88 0z" />
        <path d="M804 136a44 38 0 0 1 88 0z" />
        <rect x="430" y="158" width="110" height="38" />
        <rect x="900" y="158" width="110" height="38" />
        <path d="M444 158a34 28 0 0 1 68 0z" />
        <path d="M928 158a34 28 0 0 1 68 0z" />
        <rect x="718" y="30" width="4" height="22" />
      </g>
      <path d="M727 20a9 9 0 1 1-10-8 7 7 0 1 0 10 8z" fill="#f0c066" />
    </svg>
  );
}

const FACTS: [string, string][] = [
  [t('30 s'), t('how often the check-in code on the mosque screen changes')],
  [t('3'), t('ways to check in: scan the code, show a card, or be ticked on the list')],
  [t('1'), t('check-in per Fajr, at any registered mosque in the world')],
  [t('0'), t('ads, fees or data sold. Children need no account at all')],
];

const HIGHLIGHTS: [React.ReactNode, string, string][] = [
  [<Flame size={22} />, t('A streak that travels with you'), t('Pray Fajr at any registered mosque and it counts. Away for work or visiting family, you keep your streak and your place at your home mosque.')],
  [<Trophy size={22} />, t('A podium at every mosque'), t('First, second and third, for everyone or by group: Kids, Youth and Adults, or whatever names the mosque prefers. Ties go to the longest streak, then to whoever arrives earliest.')],
  [<Gift size={22} />, t('Prizes the mosque decides'), t('A bicycle for first place among the kids, a medal for 40 days: the admin sets a prize for each place and for reaching a number of days, with the sponsor\'s name if there is one.')],
  [<HeartHandshake size={22} />, t('Fajr buddies'), t('Pair up with a friend. Each of you sees whether the other made it to Fajr today, and can send a nudge.')],
  [<ClipboardCheck size={22} />, t('Children without phones'), t('A volunteer ticks names on the attendance list, or scans the printed card each child carries. A parent can also check in the whole family with one scan.')],
  [<Globe size={22} />, t('Mosques, cities and countries'), t('The world leaderboard ranks approved mosques by total check-ins and by consistency, so a small mosque can beat a big one. The same numbers add up into city and country tables, and worldwide seasons such as a winter 40 days.')],
];

/** The first screen a visitor sees: what the app is, and the form to join. */
export function AuthPage() {
  return (
    <div className="landing">
      <section className="l-hero">
        <div className="l-sky" aria-hidden="true">
          <div className="l-stars" />
          <div className="l-sun" />
        </div>
        <header className="l-bar">
          <a className="l-brand" href="/about/"><img src="/icon.svg" alt="" width="34" height="34" /> Rijal al-Fajr</a>
          <a className="l-link" href="/about/">{t('How it works')}</a>
          <LanguagePicker />
        </header>
        <div className="l-grid">
          <div className="l-copy">
            <p className="l-eyebrow"><Sunrise size={17} /> {t('The men of Fajr')}</p>
            <h1>{t('Be counted among the people of Fajr.')}</h1>
            <p className="l-lede">{t('Check in at your mosque each dawn, keep your streak, and help your mosque climb the world leaderboard.')}</p>
            <p className="l-fine">{t('Free, with no ads. Works in any phone browser today, with nothing to install.')}</p>
            <div className="l-phones" aria-hidden="true">
              <img src="/shots/mosque.webp" alt="" width="585" height="1200" loading="lazy" />
              <img src="/shots/today.webp" alt="" width="585" height="1200" />
              <img src="/shots/done.webp" alt="" width="585" height="1200" loading="lazy" />
            </div>
          </div>
          <section className="l-card card">
            <AuthForm />
          </section>
        </div>
        <Skyline />
      </section>

      <section className="l-body">
        <div className="l-facts">
          {FACTS.map(([n, text]) => (
            <div key={text}><b>{n}</b><span>{text}</span></div>
          ))}
        </div>
        <div className="l-features">
          {HIGHLIGHTS.map(([icon, title, text]) => (
            <article className="card" key={title}>
              <span className="icon">{icon}</span>
              <h3>{title}</h3>
              <p className="muted small">{text}</p>
            </article>
          ))}
        </div>
        <div className="l-foot">
          <a className="btn" href="/about/">{t('See how it works')}</a>
          <p className="muted small">{t('Coming soon to the App Store and Google Play.')}</p>
          <p className="muted small">
            <Link to="/rules">{t('Rules and fair play')}</Link> · <Link to="/privacy">{t('Privacy')}</Link> · <a href="/about/">{t('What is Rijal al-Fajr?')}</a>
          </p>
        </div>
      </section>
    </div>
  );
}
