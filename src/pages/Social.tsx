// What people do for one another: saying they are awake, Masha'Allah for a milestone,
// the roll of honour, families, weekly awards, friendly matches and the prize wish-list.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Check, Crown, Gift, Heart, MoreVertical, Share, Smartphone, Sparkles, Sprout, Sun, Swords, TrendingUp, Users, X } from 'lucide-react';
import { api, type Award as AwardRow, type Community, type FamilyRow, type FeedItem, type Match, type Pulse, type Wish } from '../api';
import { Avatar, Eyebrow, Field, Seg, Sheet, useAction, useMe, useToast } from '../ui';
import { dateLocale, t, tn, tx } from '../lib/i18n';
import { niceDate, plural, showName } from '../lib/util';

/** "21 days in a row", "First Fajr at the mosque". */
export function milestoneText(kind: string, value: number) {
  if (kind === 'streak') return tn(value, '{n} day in a row', '{n} days in a row');
  if (value === 1) return t('First Fajr at the mosque');
  return tn(value, '{n} Fajr at the mosque', '{n} Fajr prayers at the mosque');
}

/** "Bilal, Omar" or "Bilal, Omar and 3 others". */
function namesText(names: string[], count: number) {
  const shown = names.join(', ');
  return count > names.length ? tn(count - names.length, '{names} and {n} other', '{names} and {n} others', { names: shown }) : shown;
}

// ---------- Today: awake, and Masha'Allah ----------

export function AwakeCard({ awake, onChange }: { awake: Pulse['awake']; onChange: () => void }) {
  const act = useAction();
  if (!awake || !awake.canTap) return null;
  const others = awake.up.join(', ');
  const count = awake.mosqueCount > (awake.mine ? 1 : 0) ? tn(awake.mosqueCount, '{n} person at your mosque is awake', '{n} people at your mosque are awake') : null;
  return (
    <section className={`card awake${awake.mine ? ' on' : ''}`}>
      <span className="awake-sun" aria-hidden="true"><Sun size={26} /></span>
      <div className="awake-text">
        <Eyebrow>{t('Before Fajr')}</Eyebrow>
        <h2>{awake.mine ? t('You are up. See you at the mosque.') : t('Are you up?')}</h2>
        <p className="small muted" style={{ marginTop: 4 }}>
          {others ? t('Also awake: {names}', { names: others }) : awake.mine ? t('Your buddies and squad can see that you are awake.') : t('Tap when you get up. Your buddies and squad see that you are awake.')}
        </p>
        {count && <p className="small muted">{count}</p>}
        {act.error && <p className="small" style={{ color: 'var(--danger)' }}>{act.error}</p>}
      </div>
      {!awake.mine && (
        <button className="btn gold block" disabled={act.busy} onClick={() => act.run(async () => { await api('/awake', { method: 'POST' }); onChange(); })}>
          <Sun size={18} /> {t('I’m awake')}
        </button>
      )}
    </section>
  );
}

export function CheersNote({ cheers, onSeen }: { cheers: Pulse['cheers']; onSeen: () => void }) {
  if (!cheers.length) return null;
  return (
    <div className="note cheer">
      <span className="cheer-icon" aria-hidden="true"><Heart size={18} /></span>
      <span className="grow">
        {cheers.map((c) => (
          <span key={c.milestoneId} style={{ display: 'block' }}>
            {tx('Masha’Allah from <b>{names}</b>', { names: namesText(c.names, c.count) })}
            <span className="sub" style={{ display: 'block' }}>{[c.owner, milestoneText(c.kind, c.value)].filter(Boolean).join(' · ')}</span>
          </span>
        ))}
      </span>
      <button className="btn soft sm" onClick={async () => { await api('/kudos/seen', { method: 'POST' }); onSeen(); }}>{t('OK')}</button>
    </div>
  );
}

function KudosButton({ id, name, count, mine, disabled, onDone }: { id: string; name: string; count: number; mine: boolean; disabled?: boolean; onDone: (r: { kudos: number; mine: boolean }) => void }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const tap = async () => {
    setBusy(true);
    try {
      onDone(await api<{ kudos: number; mine: boolean }>(`/milestones/${id}/kudos`, { body: { on: !mine } }));
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <button className={`kudos${mine ? ' on' : ''}`} aria-pressed={mine} disabled={disabled || busy} onClick={tap} aria-label={t('Say Masha’Allah to {name}', { name })}>
      <Heart size={15} />
      <span className="num">{count > 0 ? count : t('Masha’Allah')}</span>
    </button>
  );
}

export function CheerList({ items, onChange }: { items: Pulse['toCheer']; onChange: () => void }) {
  const [sent, setSent] = useState<Set<string>>(new Set());
  if (!items.length) return null;
  return (
    <section className="card">
      <Eyebrow icon={<Sparkles size={15} />}>{t('Your friends this week')}</Eyebrow>
      <div className="list">
        {items.map((m) => (
          <div className="item" key={m.id}>
            <Avatar name={m.name} />
            <span className="grow">
              <b className="truncate" style={{ display: 'block' }}>{m.name}</b>
              <span className="sub">{milestoneText(m.kind, m.value)}</span>
            </span>
            {sent.has(m.id) ? (
              <span className="pill"><Check size={13} /> {t('Sent')}</span>
            ) : (
              <KudosButton id={m.id} name={m.name} count={0} mine={false} onDone={() => { setSent((s) => new Set(s).add(m.id)); setTimeout(onChange, 1200); }} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- mosque page ----------

export function MatchCard({ match, home, children }: { match: Match; home: string; children?: React.ReactNode }) {
  // The mosque whose page this is comes first.
  const [us, them] = match.b.id === home ? [match.b, match.a] : [match.a, match.b];
  const total = 7;
  const day = Math.min(total, Math.max(1, Math.round((Date.now() - Date.parse(match.startDate)) / 86400000) + 1));
  const lead = us.share === them.share ? null : us.share > them.share ? us : them;
  const side = (s: Match['a'], winning: boolean) => (
    <div className={`side${winning ? ' lead' : ''}`}>
      <div className="between">
        <b className="truncate">{s.name}</b>
        <b className="num pct">{match.status === 'upcoming' || match.status === 'invited' ? '–' : `${s.share}%`}</b>
      </div>
      <div className="meter"><i style={{ width: `${match.status === 'upcoming' || match.status === 'invited' ? 0 : s.share}%` }} /></div>
      <span className="sub">{[s.city, plural(s.members, 'member')].filter(Boolean).join(' · ')}</span>
    </div>
  );
  return (
    <section className="card match">
      <div className="between">
        <Eyebrow icon={<Swords size={15} />}>{t('Friendly match')}</Eyebrow>
        <span className="muted small">
          {match.status === 'active' ? t('Day {day} of {total}', { day, total }) : match.status === 'ended' ? t('Final score') : t('Starts {date}', { date: niceDate(match.startDate, { weekday: 'short', day: 'numeric', month: 'short' }) })}
        </span>
      </div>
      {side(us, lead === us)}
      <div className="vs" aria-hidden="true">{t('vs')}</div>
      {side(them, lead === them)}
      <p className="muted small" style={{ marginTop: 10 }}>
        {match.status === 'ended' ? (lead ? t('{name} won this one.', { name: lead.name }) : t('A draw. Well played, both.')) : t('The score is the share of each mosque’s members at Fajr each day, so a small mosque can win.')}
      </p>
      {children}
    </section>
  );
}

const AWARD: Record<AwardRow['kind'], { icon: React.ReactNode; label: () => string }> = {
  consistent: { icon: <Award size={20} />, label: () => t('Most consistent') },
  improved: { icon: <TrendingUp size={20} />, label: () => t('Most improved') },
  newcomer: { icon: <Sprout size={20} />, label: () => t('Best newcomer') },
};

export function AwardsCard({ awards, week }: { awards: AwardRow[]; week: Community['week'] }) {
  if (!awards.length) return null;
  return (
    <section className="card">
      <div className="between" style={{ marginBottom: 10 }}>
        <Eyebrow icon={<Award size={15} />}>{t('Awards for last week')}</Eyebrow>
        <span className="muted small">{t('{from} to {to}', { from: niceDate(week.from), to: niceDate(week.to) })}</span>
      </div>
      <div className="awards">
        {awards.map((a) => (
          <div className={`award ${a.kind}`} key={a.kind}>
            <span className="award-icon">{AWARD[a.kind].icon}</span>
            <small>{AWARD[a.kind].label()}</small>
            <b>{showName(a.name)}</b>
            <span className="sub num">{a.kind === 'improved' ? t('From {prev} to {days} dawns', { prev: a.prev, days: a.days }) : plural(a.days, 'dawn')}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HonourCard({ honour }: { honour: Community['honour'] }) {
  const [all, setAll] = useState(false);
  const shown = all ? honour : honour.slice(0, 8);
  return (
    <section className="card honour">
      <Eyebrow icon={<Crown size={15} />}>{t('Roll of honour')}</Eyebrow>
      <p className="small">{t('Forty dawns in a row at the mosque. Once a name is here, it stays.')}</p>
      {honour.length ? (
        <>
          <ol className="honour-list">
            {shown.map((h) => (
              <li key={h.striverId}>
                <Crown size={15} aria-hidden="true" />
                <b>{showName(h.name)}</b>
                <span className="num">{niceDate(h.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </li>
            ))}
          </ol>
          {!all && honour.length > 8 && <button className="btn ghost sm block" style={{ marginTop: 10 }} onClick={() => setAll(true)}>{t('Show all {length}', { length: honour.length })}</button>}
        </>
      ) : (
        <p className="small muted" style={{ marginTop: 8 }}>{t('No names yet. The first to reach forty in a row opens the roll.')}</p>
      )}
    </section>
  );
}

export function FeedCard({ feed, signedIn, onChange }: { feed: FeedItem[]; signedIn: boolean; onChange: (items: FeedItem[]) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? feed : feed.slice(0, 6);
  return (
    <section className="card">
      <Eyebrow icon={<Sparkles size={15} />}>{t('Milestones')}</Eyebrow>
      {feed.length ? (
        <>
          <div className="list">
            {shown.map((f) => (
              <div className="item" key={f.id}>
                <Avatar name={f.name} />
                <span className="grow">
                  <b className="truncate" style={{ display: 'block' }}>
                    {showName(f.name)}
                    {f.own && <span className="muted">{' '}{t('· you')}</span>}
                  </b>
                  <span className="sub">
                    {f.kind === 'streak' && f.value >= 40 && <Crown size={13} className="crown-inline" aria-hidden="true" />}
                    {milestoneText(f.kind, f.value)}
                  </span>
                </span>
                <span className="feed-end">
                  <small className="muted num">{niceDate(f.date)}</small>
                  {signedIn && !f.own ? (
                    <KudosButton id={f.id} name={f.name} count={f.kudos} mine={f.mine} onDone={(r) => onChange(feed.map((x) => (x.id === f.id ? { ...x, ...r } : x)))} />
                  ) : (
                    f.kudos > 0 && <span className="kudos on static"><Heart size={15} /><span className="num">{f.kudos}</span></span>
                  )}
                </span>
              </div>
            ))}
          </div>
          {!all && feed.length > 6 && <button className="btn ghost sm block" style={{ marginTop: 8 }} onClick={() => setAll(true)}>{t('Show all {length}', { length: feed.length })}</button>}
        </>
      ) : (
        <p className="small muted">{t('A first Fajr, a week in a row, forty in a row: what people here reach shows up for everyone to say Masha’Allah.')}</p>
      )}
    </section>
  );
}

export const familyName = (f: FamilyRow) => f.name ?? (f.first ? t('Family of {name}', { name: f.first }) : t('Anonymous family'));

export function FamiliesCard({ families, month }: { families: FamilyRow[]; month: Community['familyOfMonth'] }) {
  const monthName = (ym: string) => new Intl.DateTimeFormat(dateLocale(), { month: 'long', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`));
  return (
    <section className="card">
      <Eyebrow icon={<Users size={15} />}>{t('Families')}</Eyebrow>
      {month && (
        <div className="fom">
          <span className="fom-icon" aria-hidden="true"><Crown size={20} /></span>
          <span className="grow">
            <small>{t('Family of the month · {month}', { month: monthName(month.month) })}</small>
            <b>{familyName(month.family)}</b>
          </span>
          <span className="score num"><b>{month.family.perMember}</b><small>{t('days each')}</small></span>
        </div>
      )}
      {families.length ? (
        <div className="list">
          {families.map((f, i) => (
            <div key={f.id} className={`item${f.mine ? ' me' : ''}`}>
              <span className={`rank num${i < 3 ? ` top${i + 1}` : ''}`}>{i + 1}</span>
              <span className="grow">
                <b className="truncate" style={{ display: 'block' }}>
                  {familyName(f)}
                  {f.mine && <span className="muted">{' '}{t('· you')}</span>}
                </b>
                <span className="sub">{plural(f.members, 'member')}</span>
              </span>
              <span className="score num"><b>{f.perMember}</b><small>{t('days each')}</small></span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">{t('A family is a parent and children on one account. Add yours in Me and you are ranked here together.')}</p>
      )}
      {families.length > 0 && <p className="muted small" style={{ marginTop: 10 }}>{t('Ranked by days at Fajr per family member over the last 30 days.')}</p>}
    </section>
  );
}

export function WishCard({ wishes, mosqueId, signedIn, admin, onChange }: { wishes: Wish[]; mosqueId: string; signedIn: boolean; admin: boolean; onChange: () => void }) {
  const [giving, setGiving] = useState<Wish | null>(null);
  if (!wishes.length && !admin) return null;
  return (
    <section className="card">
      <div className="between">
        <Eyebrow icon={<Gift size={15} />}>{t('Prize wish-list')}</Eyebrow>
        {admin && <Link className="btn soft sm" to={`/manage/${mosqueId}/wishes`}>{t('Edit')}</Link>}
      </div>
      {wishes.length ? (
        <>
          <p className="small muted" style={{ margin: '6px 0 4px' }}>{t('What this mosque would love for its prizes. Offer an item and the mosque contacts you.')}</p>
          <div className="list">
            {wishes.map((w) => {
              const covered = w.given >= w.qty;
              return (
                <div className="item" key={w.id} style={{ flexWrap: 'wrap' }}>
                  <span className="grow">
                    <b>{w.qty > 1 ? `${w.title} × ${w.qty}` : w.title}</b>
                    <span className="sub" style={{ display: 'block' }}>
                      {[w.detail, w.given > 0 && w.qty > 1 ? t('{given} of {qty} given', { given: w.given, qty: w.qty }) : '', w.givenBy.length ? t('Given by {sponsor}', { sponsor: w.givenBy.join(', ') }) : ''].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {covered ? <span className="pill gold"><Check size={13} /> {t('Covered')}</span>
                    : w.mine ? <span className="pill grey">{t('Offered')}</span>
                      : signedIn ? <button className="btn soft sm" onClick={() => setGiving(w)}>{t('I’ll give this')}</button>
                        : <Link className="btn soft sm" to={`/join?next=${encodeURIComponent(`/m/${mosqueId}`)}`}>{t('I’ll give this')}</Link>}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="small muted" style={{ marginTop: 6 }}>{t('List what you would like for your prizes, and people can offer to give them.')}</p>
      )}
      {giving && <GiftSheet wish={giving} onClose={() => setGiving(null)} onSent={() => { setGiving(null); onChange(); }} />}
    </section>
  );
}

function GiftSheet({ wish, onClose, onSent }: { wish: Wish; onClose: () => void; onSent: () => void }) {
  const me = useMe();
  const toast = useToast();
  const act = useAction();
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [email, setEmail] = useState(me.user.email);
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const left = Math.max(1, wish.qty - wish.given);
  return (
    <Sheet title={wish.title} onClose={onClose}>
      <div className="form">
        <p className="muted small">{t('The mosque admin sees your details and contacts you. Your name shows on the mosque’s page once they confirm the gift. Nothing is paid in the app.')}</p>
        <Field label={t('Your name or business')}><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t('e.g. Noor Cycles')} /></Field>
        {left > 1 && <Field label={t('How many?')}><input type="number" inputMode="numeric" min={1} max={left} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></Field>}
        <Field label={t('Email to reach you')}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label={t('Phone or WhatsApp (optional)')}><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} /></Field>
        <Field label={t('A note (optional)')}><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
        {act.error && <div className="note err" role="alert">{act.error}</div>}
        <button className="btn block" disabled={act.busy || name.trim().length < 2 || !email.includes('@') || qty < 1}
          onClick={() => act.run(async () => { await api(`/wishes/${wish.id}/pledge`, { body: { name, qty, email, phone, note } }); toast(t('Thank you. The mosque will be in touch.')); onSent(); })}>
          {t('Send my offer')}
        </button>
      </div>
    </Sheet>
  );
}

// ---------- add to home screen ----------

interface InstallEvent extends Event { prompt: () => Promise<void> }
let installEvent: InstallEvent | null = null;
const waiting = new Set<() => void>();
if (typeof window !== 'undefined') {
  // Chrome on Android offers a real install; keep the offer until the person asks for it.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as InstallEvent;
    waiting.forEach((fn) => fn());
  });
}

export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function InstallSheet({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState<'iphone' | 'android'>(isIos() ? 'iphone' : 'android');
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick((n) => n + 1);
    waiting.add(fn);
    return () => void waiting.delete(fn);
  }, []);
  const steps = phone === 'iphone'
    ? [
        <>{t('Open this page in Safari.')}</>,
        <>{tx('Tap the <b>Share</b> button at the bottom of the screen.')} <Share size={16} className="step-ico" aria-hidden="true" /></>,
        <>{tx('Scroll down and tap <b>Add to Home Screen</b>.')}</>,
        <>{tx('Tap <b>Add</b>. The icon appears on your home screen.')}</>,
      ]
    : [
        <>{t('Open this page in Chrome.')}</>,
        <>{tx('Tap the <b>three dots</b> at the top of the screen.')} <MoreVertical size={16} className="step-ico" aria-hidden="true" /></>,
        <>{tx('Tap <b>Add to Home screen</b>, or <b>Install app</b>.')}</>,
        <>{tx('Tap <b>Install</b>. The icon appears on your home screen.')}</>,
      ];
  return (
    <Sheet title={t('Add to your home screen')} onClose={onClose}>
      <div className="form">
        <p className="muted small">{t('Rijal al-Fajr then opens like any other app, full screen, one tap from check-in. There is nothing to download from a store.')}</p>
        {installEvent && phone === 'android' && (
          <button className="btn block" onClick={async () => { await installEvent?.prompt(); installEvent = null; onClose(); }}><Smartphone size={18} /> {t('Install now')}</button>
        )}
        <Seg value={phone} onChange={setPhone} options={[{ value: 'iphone', label: 'iPhone' }, { value: 'android', label: 'Android' }]} />
        <ol className="steps">
          {steps.map((s, i) => <li key={i}><span className="num">{i + 1}</span><span>{s}</span></li>)}
        </ol>
        <button className="btn ghost block" onClick={onClose}>{t('Done')}</button>
      </div>
    </Sheet>
  );
}

/** Offered once on Today to people using the site in a phone browser. */
export function InstallCard() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => isInstalled() || !window.matchMedia('(pointer: coarse)').matches || !!localStorage.getItem('raf.install'));
  const dismiss = () => {
    localStorage.setItem('raf.install', '1');
    setHidden(true);
  };
  if (hidden && !open) return null;
  return (
    <>
      {!hidden && (
        <section className="card row install">
          <span className="icon"><Smartphone size={20} /></span>
          <span className="grow">
            <b style={{ display: 'block' }}>{t('Put Rijal al-Fajr on your home screen')}</b>
            <span className="muted small">{t('It opens like an app, one tap from check-in.')}</span>
            <span style={{ display: 'block', marginTop: 10 }}><button className="btn soft sm" onClick={() => setOpen(true)}>{t('Show me how')}</button></span>
          </span>
          <button className="iconbtn" aria-label={t('Not now')} onClick={dismiss}><X size={17} /></button>
        </section>
      )}
      {open && <InstallSheet onClose={() => { setOpen(false); dismiss(); }} />}
    </>
  );
}
