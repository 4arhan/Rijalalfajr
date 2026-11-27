import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award, ArrowRight, Check, ClipboardCheck, ClipboardList, Crown, FileUp, Flame, Gift, Globe, GraduationCap, HandHeart, Heart, HeartHandshake, MonitorSmartphone, ScanLine, Sun, Sunrise,
  Swords, Trophy, Users, WifiOff,
} from 'lucide-react';
import { api, GROUPS, type Group } from '../api';
import { Field, Seg, useAction, useSession } from '../ui';
import { groupName } from '../lib/util';
import { LANGS, LanguagePicker, currentLang, setLang, t, tx } from '../lib/i18n';

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

const STEPS: [React.ReactNode, string, string][] = [
  [<MonitorSmartphone size={24} />, t('The mosque puts up a code'), t('An admin registers the mosque and opens the mosque screen on a tablet or TV by the entrance. It shows a QR code that changes every 30 seconds, so a forwarded screenshot is useless.')],
  [<ScanLine size={24} />, t('You check in at dawn'), t('Point your phone camera at the code. Check-in opens shortly before the adhan and closes at sunrise, worked out from the mosque\'s own location. Children are ticked on the attendance list or show a printed card.')],
  [<Trophy size={24} />, t('The streak and the podium do the rest'), t('Every dawn adds to your streak and your place on your mosque\'s leaderboard. Every check-in also counts for the mosque on the world leaderboard.')],
];

const TOUR: [string, string, string][] = [
  ['today', t('Today'), t('Your dawn streak, your weekly goal, your buddies, and what is on at your mosque after Fajr.')],
  ['done', t('Check in'), t('Scan once and choose who is with you. A parent checks in the children on the same scan.')],
  ['mosque', t('Mosque'), t('The podium: first, second and third, with the full leaderboard, by week, month or all time.')],
  ['challenge', t('Challenge'), t('40 days of Fajr with the prize for each place, set by the mosque, and rewards for reaching a number of days.')],
  ['world', t('World'), t('Mosques, cities and countries ranked across the world, by size of jama‘ah or by consistency.')],
  ['me', t('Me'), t('A calendar of your dawns, ten badges to earn, your family, your buddies and your year in review.')],
];

/** [icon, title, text, new?] */
const HIGHLIGHTS: [React.ReactNode, string, string, boolean?][] = [
  [<Flame size={22} />, t('A streak that travels with you'), t('Pray Fajr at any registered mosque and it counts. Away for work or visiting family, you keep your streak and your place at your home mosque.')],
  [<Trophy size={22} />, t('A podium at every mosque'), t('First, second and third, for everyone or by group: Kids, Youth and Adults, or whatever names the mosque prefers. Ties go to the longest streak, then to whoever arrives earliest.')],
  [<Gift size={22} />, t('Prizes the mosque decides'), t('A bicycle for first place among the kids, a medal for 40 days: the admin sets a prize for each place and for reaching a number of days, with the sponsor\'s name if there is one.')],
  [<Sun size={22} />, t('I’m awake'), t('One tap when you get up, from three hours before the adhan. Your buddies and your squad see who is already up.'), true],
  [<Heart size={22} />, t('Masha’Allah'), t('A first Fajr, a week in a row, forty in a row: milestones show on the mosque’s page, and anyone can tap Masha’Allah for them.'), true],
  [<Crown size={22} />, t('Roll of honour'), t('Forty dawns in a row puts your name on your mosque’s roll of honour, and it stays there.'), true],
  [<HeartHandshake size={22} />, t('Fajr buddies'), t('Pair up with a friend. Each of you sees whether the other made it to Fajr today, and can send a nudge.')],
  [<Users size={22} />, t('Families together'), t('A parent and children on one account are ranked as a family, by days per member, with a family of the month.'), true],
  [<Award size={22} />, t('Weekly awards'), t('Every Monday: the most consistent, the most improved and the best newcomer, for people at each mosque and for mosques across the world.'), true],
  [<Swords size={22} />, t('Friendly match'), t('Two mosques, one week. The score is the share of each mosque’s members at Fajr, so a small mosque can win.'), true],
  [<ClipboardCheck size={22} />, t('Children without phones'), t('A volunteer ticks names on the attendance list, or scans the printed card each child carries. A parent can also check in the whole family with one scan.')],
  [<Globe size={22} />, t('Mosques, cities and countries'), t('The world leaderboard ranks approved mosques by total check-ins and by consistency, so a small mosque can beat a big one. The same numbers add up into city and country tables, and worldwide seasons such as a winter 40 days.')],
];

const FOR_MOSQUES: [React.ReactNode, string, string][] = [
  [<MonitorSmartphone size={20} />, t('The mosque screen'), t('A tablet or TV at the entrance shows the code, today\'s count against your goal and the latest names as they come in.')],
  [<ClipboardList size={20} />, t('Attendance list'), t('Type a name to find it and tick it. A new name is added and marked in one tap, and the last two days can be corrected.')],
  [<WifiOff size={20} />, t('Works with no signal'), t('Prayer halls often have poor reception. Ticks are kept on the phone and sent by themselves when the signal comes back.')],
  [<GraduationCap size={20} />, t('Classes'), t('A madrasa teacher gets a leaderboard and an attendance list for just their class.')],
  [<HeartHandshake size={20} />, t('Who haven’t we seen?'), t('A list for the imam of regulars who have missed three dawns or more, so someone can check on them.')],
  [<FileUp size={20} />, t('Add many names'), t('Paste a class register from a spreadsheet and a hundred children are on the attendance list at once.')],
  [<Trophy size={20} />, t('Challenges and prizes'), t('Pick the dates, choose whether Fajr at other mosques counts, and set the prizes. When it ends the winners are announced and certificates are ready to print.')],
  [<Gift size={20} />, t('Prize wish-list'), t('The mosque lists what it needs, such as two bicycles. A sponsor offers an item, and once the mosque confirms it their name is thanked on the page, the challenge and the mosque screen.')],
];

const QUESTIONS: [string, string][] = [
  [t('Does it cost anything?'), t('No. It is free for people and for mosques, with no ads.')],
  [t('Do I need to install an app?'), t('No. It runs in your phone\'s browser, and you can add it to your home screen. Native apps for iPhone and Android are coming soon.')],
  [t('What if I pray Fajr at a different mosque?'), t('It counts. Scan that mosque\'s code and your streak and your place at your home mosque are kept. The mosque you prayed in gets the check-in on the world leaderboard.')],
  [t('How do children take part?'), t('Three ways: a parent adds them to the family and checks them in with the parent\'s own scan, a volunteer ticks them on the attendance list, or they show their printed card to be scanned.')],
  [t('Who gives the prizes?'), t('The mosque or organisation that announced them. The app shows the prizes and the standings; it does not sell or hand out anything.')],
  [t('Can someone check in from home?'), t('The code on the mosque screen changes every 30 seconds and the printed poster checks that the phone is at the mosque. Check-in is also closed outside the Fajr window. Admins can remove a check-in that should not be there.')],
];

/** The first screen a visitor sees: what the app is, and the form to join. */
export function AuthPage() {
  const form = useRef<HTMLElement>(null);
  const [past, setPast] = useState(false);
  const toForm = () => document.getElementById('join')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  useEffect(() => {
    document.title = 'Rijal al-Fajr';
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.landing [data-reveal]').forEach((el) => el.classList.add('in'));
      return;
    }
    // Sections ease in as they are reached.
    const reveal = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        reveal.unobserve(e.target);
      }),
      { rootMargin: '0px 0px -6% 0px' },
    );
    document.querySelectorAll('.landing [data-reveal]').forEach((el) => reveal.observe(el));
    // Once the form has scrolled away, a bar offers the way back to it.
    const gone = new IntersectionObserver(([e]) => setPast(!e.isIntersecting && e.boundingClientRect.top < 0));
    if (form.current) gone.observe(form.current);
    return () => {
      reveal.disconnect();
      gone.disconnect();
    };
  }, []);

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
            <ul className="l-ticks">
              <li><Check size={16} /> {t('Free, with no ads')}</li>
              <li><Check size={16} /> {t('Nothing to install')}</li>
              <li><Check size={16} /> {t('In fifteen languages')}</li>
            </ul>
            <div className="l-phones" aria-hidden="true">
              <img src="/shots/mosque.webp" alt="" width="585" height="1200" loading="lazy" />
              <img src="/shots/today.webp" alt="" width="585" height="1200" />
              <img src="/shots/done.webp" alt="" width="585" height="1200" loading="lazy" />
            </div>
          </div>
          <section className="l-card card" id="join" ref={form}>
            <AuthForm />
          </section>
        </div>
        <Skyline />
      </section>

      <section className="l-body">
        <div className="l-facts" data-reveal>
          {FACTS.map(([n, text]) => (
            <div key={text}><b>{n}</b><span>{text}</span></div>
          ))}
        </div>
      </section>

      <section className="l-section">
        <p className="l-kicker" data-reveal>{t('How it works')}</p>
        <h2 data-reveal>{t('Arrive for Fajr. Scan. Watch your mosque rise.')}</h2>
        <ol className="l-steps">
          {STEPS.map(([icon, title, text], i) => (
            <li key={title} data-reveal style={{ transitionDelay: `${i * 80}ms` }}>
              <span className="l-step-n"><b className="num">{i + 1}</b>{icon}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="l-section l-wide">
        <p className="l-kicker" data-reveal>{t('Take the tour')}</p>
        <h2 data-reveal>{t('Six screens. The whole app.')}</h2>
        <p className="l-sub" data-reveal>{t('These are real screens from the app, filled with sample data.')}</p>
        <div className="l-tour" data-reveal>
          {TOUR.map(([img, title, text]) => (
            <figure key={img}>
              <img src={`/shots/${img}.webp`} alt="" width="585" height="1200" loading="lazy" />
              <figcaption><b>{title}</b><span>{text}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="l-section">
        <p className="l-kicker" data-reveal>{t('Features')}</p>
        <h2 data-reveal>{t('Built around one prayer, and the people who come for it.')}</h2>
        <div className="l-features">
          {HIGHLIGHTS.map(([icon, title, text, fresh], i) => (
            <article className="card" key={title} data-reveal style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
              <span className={`icon${fresh ? ' gold' : ''}`}>{icon}</span>
              <h3>{title}{fresh && <span className="pill gold">{t('New')}</span>}</h3>
              <p className="muted small">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="l-band">
        <div className="l-band-in">
          <div className="l-band-copy">
            <p className="l-kicker" data-reveal>{t('For mosques and organisations')}</p>
            <h2 data-reveal>{t('Run a Fajr challenge without the paper register.')}</h2>
            <p className="l-sub" data-reveal>{t('Register your mosque in a few minutes. It works straight away, and joins the world leaderboard once approved.')}</p>
            <div className="l-band-cta" data-reveal>
              <Link className="btn mint" to="/join?next=/new-mosque" onClick={toForm}>{t('Register a mosque')} <ArrowRight size={18} className="flip" /></Link>
            </div>
            <figure className="l-tablet" data-reveal><img src="/shots/screen.webp" alt="" width="1180" height="760" loading="lazy" /></figure>
          </div>
          <ul className="l-list">
            {FOR_MOSQUES.map(([icon, title, text], i) => (
              <li key={title} data-reveal style={{ transitionDelay: `${(i % 2) * 70}ms` }}>
                <span className="l-list-icon">{icon}</span>
                <span><b>{title}</b>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="l-section l-split">
        <div data-reveal>
          <p className="l-kicker">{t('For sponsors')}</p>
          <h2>{t('Put a bicycle on the podium. Or breakfast on the table.')}</h2>
          <p className="l-sub">{t('A shop, a family or anyone who wants a share in the reward can offer to sponsor. Leave your details, say how you would like to help, and choose who may contact you.')}</p>
          <Link className="btn" to="/join?next=/sponsor" onClick={toForm}><HandHeart size={18} /> {t('Offer to sponsor')}</Link>
        </div>
        <div data-reveal>
          <p className="l-kicker">{t('In fifteen languages')}</p>
          <div className="l-langs">
            {LANGS.map((l) => (
              <button key={l.code} type="button" lang={l.code} aria-pressed={l.code === currentLang()} onClick={() => setLang(l.code)}>{l.name}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="l-section l-narrow">
        <p className="l-kicker" data-reveal>{t('Questions')}</p>
        <h2 data-reveal>{t('Asked before the first Fajr.')}</h2>
        <div className="l-faq">
          {QUESTIONS.map(([q, a]) => (
            <details key={q} data-reveal>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
        <p className="l-more" data-reveal><a href="/about/">{t('See how it works')} <ArrowRight size={16} className="flip" /></a></p>
      </section>

      <section className="l-close">
        <div className="l-close-sun" aria-hidden="true" />
        <h2 data-reveal>{t('Tomorrow\'s Fajr is a good day to start.')}</h2>
        <p data-reveal>{t('Open the app, find your mosque or register it, and be there at dawn.')}</p>
        <button className="btn gold" onClick={toForm} data-reveal>{t('Create account')}</button>
        <p className="l-fine" data-reveal>{t('Free, with no ads. Works in any phone browser today, with nothing to install.')}</p>
        <p className="l-fine" data-reveal>{t('Coming soon to the App Store and Google Play.')}</p>
        <p className="l-links">
          <Link to="/rules">{t('Rules and fair play')}</Link> · <Link to="/privacy">{t('Privacy')}</Link> · <a href="/about/">{t('What is Rijal al-Fajr?')}</a>
        </p>
      </section>

      <div className={`guestbar l-join${past ? ' show' : ''}`} aria-hidden={!past}>
        <span><b>Rijal al-Fajr</b><small>{t('Check in for Fajr and join the leaderboard')}</small></span>
        <button className="btn sm" tabIndex={past ? 0 : -1} onClick={toForm}>{t('Join free')}</button>
      </div>
    </div>
  );
}
