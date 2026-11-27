// Buddies, the year in review and the kids' view.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, BellRing, Check, HeartHandshake, IdCard, Share2, Star, Sun, Trash2, UserPlus } from 'lucide-react';
import { api, type ExcuseRequest, type Patterns, type Stats, type Striver } from '../api';
import { Avatar, Eyebrow, Field, Loading, Problem, Qr, Screen, Sheet, Skeleton, useAction, useMe, useToast } from '../ui';
import { addDays, niceDate, plural, useLoad } from '../lib/util';
import { shareReview } from '../lib/share';
import { dateLocale, t, tn, tx } from '../lib/i18n';

export interface Buddy { striverId: string; name: string; mosque: string | null; doneToday: boolean; streak: number; nudged: boolean; awake: boolean }
export interface BuddyData { buddies: Buddy[]; nudges: { id: string; name: string }[] }

/** Share your invitation link through the phone's share sheet, or copy it. */
export async function shareInvite(code: string, toast: (m: string) => void) {
  const url = `${location.origin}/i/${code}`;
  const text = t('Join me for Fajr at the mosque. We keep each other going on Rijal al-Fajr.');
  try {
    if (navigator.share) await navigator.share({ text, url });
    else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast(t('Invitation link copied'));
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') toast(url);
  }
}

export function BuddiesPage() {
  const me = useMe();
  const toast = useToast();
  const act = useAction();
  const [code, setCode] = useState('');
  const { data, error, reload } = useLoad(() => api<BuddyData>('/buddies'), []);

  const nudge = (b: Buddy) =>
    act.run(async () => {
      await api(`/buddies/${b.striverId}/nudge`, { method: 'POST' });
      toast(t('{name} will see your nudge when they open the app', { name: b.name.split(' ')[0] }));
      reload();
    });

  return (
    <Screen title={t('Fajr buddies')} eyebrow={t('Hold each other to it')} back="/me">
      <section className="hero">
        <Eyebrow icon={<HeartHandshake size={15} />}>{t('Your code')}</Eyebrow>
        <div className="code-box" style={{ margin: '12px 0', background: 'rgba(238,248,242,.06)', borderColor: 'rgba(168,240,207,.3)', color: '#eef8f2' }}>{me.user.inviteCode}</div>
        <p className="muted small">{t('A friend enters this code to become your buddy. Someone new can join with your link: they start at your mosque, already your buddy.')}</p>
        <button className="cta" onClick={() => shareInvite(me.user.inviteCode, toast)}>
          <span><small>{t('Bring a friend to Fajr')}</small><b>{t('Share my invitation link')}</b></span>
          <i><Share2 size={19} /></i>
        </button>
      </section>

      <section className="card form">
        <Field label={t('Add a buddy by their code')}><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} placeholder={t('8 letters and numbers')} /></Field>
        {act.error && <div className="note err" role="alert">{act.error}</div>}
        <button className="btn block" disabled={act.busy || code.length < 8}
          onClick={() => act.run(async () => { const r = await api<{ name: string }>('/buddies', { body: { code } }); toast(t('{name} is now your buddy', { name: r.name })); setCode(''); reload(); })}>
          <UserPlus size={18} />{' '}{t('Add buddy')}
        </button>
      </section>

      <section className="card">
        <Eyebrow icon={<HeartHandshake size={15} />}>{t('Today')}</Eyebrow>
        {error ? <Problem error={error} retry={reload} /> : !data ? <Loading /> : data.buddies.length ? (
          <div className="list">
            {data.buddies.map((b) => (
              <div className="item" key={b.striverId}>
                <span className={`check${b.doneToday ? ' on' : ''}`}><Check size={16} /></span>
                <span className="grow">
                  <b>{b.name}</b>
                  <span className="sub" style={{ display: 'block' }}>{`${b.doneToday ? t('At Fajr today') : t('Not checked in yet')} · ${tn(b.streak, '{n} day in a row', '{n} days in a row')}`}</span>
                </span>
                {b.awake && !b.doneToday && <span className="pill gold"><Sun size={13} /> {t('Awake')}</span>}
                {!b.doneToday && (
                  <button className="btn soft sm" disabled={act.busy || b.nudged} onClick={() => nudge(b)}><BellRing size={15} /> {b.nudged ? t('Nudged') : t('Nudge')}</button>
                )}
                <button className="iconbtn" aria-label={t('Remove {name}', { name: b.name })}
                  onClick={() => confirm(t('Remove {name} as a buddy?', { name: b.name })) && act.run(async () => { await api(`/buddies/${b.striverId}`, { method: 'DELETE' }); reload(); })}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">{t('No buddies yet. Share your code with a friend, or enter theirs.')}</p>
        )}
        <p className="muted small" style={{ marginTop: 10 }}>{t('Buddies see only whether you checked in today and your streak. A nudge appears in the app; phone notifications come with the App Store and Google Play apps.')}</p>
      </section>
    </Screen>
  );
}

interface Review { name: string; year: number; total: number; best: number; months: number[]; mosques: number; topMosque: { name: string; days: number } | null; beforeAdhan: number; first: string | null }
const monthName = (i: number, width: 'long' | 'narrow') => new Intl.DateTimeFormat(dateLocale(), { month: width, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, i, 1)));

export function ReviewPage() {
  const me = useMe();
  const self = me.strivers.find((s) => s.self)!;
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const { data, error, reload } = useLoad(() => api<Review>(`/strivers/${self.id}/review?year=${year}`), [year]);
  const max = Math.max(1, ...(data?.months ?? [1]));
  return (
    <Screen title={t('My {year}', { year: year })} eyebrow={t('Year in review')} back="/me"
      action={data && data.total > 0 && (
        <button className="iconbtn" aria-label={t('Share my year')} onClick={() => shareReview({ ...data, topMosque: data.topMosque?.name ?? null })}><Share2 size={19} /></button>
      )}>
      <div className="seg" role="group">
        {[thisYear - 1, thisYear].map((y) => <button key={y} aria-pressed={y === year} onClick={() => setYear(y)}>{y}</button>)}
      </div>
      {error ? <Problem error={error} retry={reload} /> : !data ? <Loading /> : (
        <>
          <section className="hero">
            <Eyebrow icon={<Star size={15} />}>{data.name}</Eyebrow>
            <div className="big num" style={{ marginTop: 12 }}>{data.total}<small>{data.total === 1 ? t('dawn at the mosque') : t('dawns at the mosque')}</small></div>
            <div className="stats">
              <div><label>{t('Best streak')}</label><b className="num">{data.best}</b></div>
              <div><label>{t('Mosques')}</label><b className="num">{data.mosques}</b></div>
              <div><label>{t('Before the adhan')}</label><b className="num">{data.beforeAdhan}</b></div>
            </div>
          </section>
          <section className="card">
            <Eyebrow>{t('Month by month')}</Eyebrow>
            <div className="bars" role="img" aria-label={t('Dawns at the mosque for each month')}>
              {data.months.map((n, i) => (
                <div key={i}><span className="num">{n || ''}</span><i style={{ height: `${(n / max) * 78}%`, opacity: 1 }} /><span>{monthName(i, 'narrow')}</span></div>
              ))}
            </div>
          </section>
          {data.total > 0 ? (
            <section className="card">
              <p>{data.topMosque && <>{tx('Mostly at <b>{name}</b>, {days}.', { name: data.topMosque.name, days: plural(data.topMosque.days, 'dawn') })} </>}{tx('Your strongest month was <b>{month}</b>.', { month: monthName(data.months.indexOf(max), 'long') })}</p>
              <button className="btn block" style={{ marginTop: 14 }} onClick={() => shareReview({ ...data, topMosque: data.topMosque?.name ?? null })}><Share2 size={18} />{' '}{t('Share my year')}</button>
            </section>
          ) : (
            <section className="card empty"><b>{t('Nothing in {year} yet', { year })}</b>{t('Your year fills in with every Fajr you check in.')}</section>
          )}
        </>
      )}
    </Screen>
  );
}

const KID_GOALS = [3, 7, 14, 21, 40, 100];

export function KidsPage() {
  const { id } = useParams();
  const [card, setCard] = useState(false);
  const me = useMe();
  const who = me.strivers.find((s) => s.id === id);
  const { data, error, reload } = useLoad(() => api<Stats>(`/strivers/${id}/stats`), [id]);
  if (error) return <Screen title={t('My stars')} back="/me"><Problem error={error} retry={reload} /></Screen>;
  if (!data) return <Screen title={t('My stars')} back="/me"><Loading /></Screen>;
  const on = new Set(data.dates);
  const days = Array.from({ length: 40 }, (_, i) => addDays(data.today, i - 39));
  const stars = days.filter((d) => on.has(d)).length;
  const goal = KID_GOALS.find((g) => g > data.streak) ?? 100;
  return (
    <Screen title={data.striver.name.split(' ')[0]} eyebrow={t('My Fajr stars')} back="/me">
      <div className="kids stack" style={{ paddingTop: 0 }}>
        <section className="hero" style={{ textAlign: 'center' }}>
          <div className="big num" style={{ fontSize: 96, fontWeight: 500 }}>{data.streak}</div>
          <h2 style={{ fontWeight: 750 }}>{data.streak === 1 ? t('day in a row') : t('days in a row')}</h2>
          <p className="muted" style={{ marginTop: 8, fontSize: 19 }}>
            {data.doneToday ? t('You came to Fajr today. Well done!') : data.streak > 0 ? t('Come to Fajr today to keep it going.') : t('Come to Fajr to light your first star.')}
          </p>
        </section>
        <section className="card">
          <Eyebrow icon={<Star size={15} />}>{t('{stars} stars in the last 40 days', { stars: stars })}</Eyebrow>
          <div className="stars" role="img" aria-label={t('{stars} of the last 40 days at Fajr', { stars: stars })}>
            {days.map((d) => <Star key={d} className={on.has(d) ? 'on' : ''} strokeWidth={1.6} />)}
          </div>
          <p style={{ marginTop: 14, fontSize: 19, fontWeight: 650 }}>{t('{n} more in a row to reach {goal}.', { n: goal - data.streak, goal })}</p>
        </section>
        <section className="card">
          <Eyebrow>{t('Badges')}</Eyebrow>
          <p style={{ fontSize: 19 }}>
            {data.badges.filter((b) => b.earned).map((b) => t(b.name)).join(', ') || t('Your first badge comes with your first Fajr.')}
          </p>
        </section>
        {who && <button className="btn block" onClick={() => setCard(true)}><IdCard size={24} />{' '}{t('Show my card')}</button>}
        <Link className="btn ghost block" to="/me" style={{ minHeight: 52, fontSize: 17 }}>{t('Back to the grown-up view')}</Link>
      </div>
      {card && who && (
        <Sheet title={t('{name}\'s card', { name: who.name })} onClose={() => setCard(false)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 16 }}><Qr text={`${location.origin}/k/${who.cardCode}`} size={480} alt={t('Check-in card')} /></div>
          <p className="muted" style={{ marginTop: 12, textAlign: 'center' }}>{t('Show this to the volunteer at the mosque.')}</p>
        </Sheet>
      )}
    </Screen>
  );
}

// ---------- my patterns ----------

const weekday = (i: number, width: 'long' | 'narrow') => new Intl.DateTimeFormat(dateLocale(), { weekday: width, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i)));

/** Which weekday a person misses most, and whether they arrive earlier than they did. Only they see it. */
export function PatternsCard({ patterns }: { patterns: Patterns | null }) {
  const p = patterns;
  const arrival = p?.arrival;
  const diff = arrival && arrival.before !== null ? arrival.before - arrival.now : 0;
  return (
    <section className="card">
      <Eyebrow icon={<Activity size={15} />}>{t('My patterns')}</Eyebrow>
      {!p ? (
        <p className="muted small">{t('Your patterns appear after two weeks of Fajr at the mosque: the weekday you miss most, and whether you are arriving earlier.')}</p>
      ) : (
        <>
          <div className="wk-bars" role="img" aria-label={t('How often you came on each day of the week')}>
            {p.weekdays.map((w, i) => (
              <div key={i} className={i === p.hardest ? 'low' : i === p.strongest ? 'high' : ''} title={`${weekday(i, 'long')}: ${w.came}/${w.of}`}>
                <i style={{ height: `${w.of ? Math.max(6, (w.came / w.of) * 100) : 6}%` }} />
                <span>{weekday(i, 'narrow')}</span>
              </div>
            ))}
          </div>
          <p className="small" style={{ marginTop: 12 }}>
            {p.hardest !== null && p.strongest !== null ? (
              <>
                {tx('<b>{day}</b> is your hardest day: {came} of the last {of}.', { day: weekday(p.hardest, 'long'), came: p.weekdays[p.hardest].came, of: p.weekdays[p.hardest].of })}{' '}
                {tx('<b>{day}</b> is your strongest.', { day: weekday(p.strongest, 'long') })}
              </>
            ) : (
              t('No weekday stands out. You are about as steady on one day as on another.')
            )}
          </p>
          {arrival && (
            <p className="small" style={{ marginTop: 8 }}>
              {arrival.now === 0
                ? t('On average you arrive right at the adhan.')
                : arrival.now < 0
                  ? tn(-arrival.now, 'On average you arrive {n} minute before the adhan.', 'On average you arrive {n} minutes before the adhan.')
                  : tn(arrival.now, 'On average you arrive {n} minute after the adhan.', 'On average you arrive {n} minutes after the adhan.')}{' '}
              {arrival.before === null
                ? ''
                : diff >= 1
                  ? tn(diff, 'That is {n} minute earlier than the month before.', 'That is {n} minutes earlier than the month before.')
                  : diff <= -1
                    ? tn(-diff, 'That is {n} minute later than the month before.', 'That is {n} minutes later than the month before.')
                    : t('That is the same as the month before.')}
            </p>
          )}
          <p className="muted small" style={{ marginTop: 10 }}>{t('From your last twelve weeks. Only you see this.')}</p>
        </>
      )}
    </section>
  );
}

// ---------- asking to be excused ----------

const REASONS: [string, string][] = [['illness', t('Illness')], ['travel', t('Travel')], ['other', t('Something else')]];

export function ExcuseSheet({ people, today, onClose }: { people: Striver[]; today: string; onClose: () => void }) {
  const toast = useToast();
  const act = useAction();
  const able = people.filter((s) => s.homeMosqueId);
  const [who, setWho] = useState(able[0]?.id ?? '');
  const [fromDate, setFrom] = useState(addDays(today, 1));
  const [toDate, setTo] = useState(addDays(today, 1));
  const [why, setWhy] = useState('illness');
  const [note, setNote] = useState('');
  const mine = useLoad(() => api<{ requests: ExcuseRequest[] }>('/excuse-requests'), []);
  const send = () =>
    act.run(async () => {
      const label = REASONS.find((r) => r[0] === why)![1];
      await api('/excuse-requests', { body: { striverId: who, fromDate, toDate: toDate < fromDate ? fromDate : toDate, reason: [why === 'other' ? '' : label, note.trim()].filter(Boolean).join(': ') } });
      toast(t('Sent. Your mosque will answer.'));
      setNote('');
      mine.reload();
    });
  const STATUS: Record<ExcuseRequest['status'], [string, string]> = { pending: [t('Waiting'), ' grey'], approved: [t('Approved'), ''], declined: [t('Declined'), ' grey'] };
  return (
    <Sheet title={t('Ask to be excused')} onClose={onClose}>
      <div className="form">
        <p className="muted small">{t('Ill, or travelling where there is no registered mosque? Ask your mosque to excuse the days. If it agrees, your streak carries on.')}</p>
        {!able.length ? (
          <div className="note">{t('Choose your home mosque first.')}</div>
        ) : (
          <>
            {able.length > 1 && (
              <Field label={t('Who is it for?')}>
                <select value={who} onChange={(e) => setWho(e.target.value)}>{able.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </Field>
            )}
            <div className="grid2">
              <Field label={t('From')}><input type="date" value={fromDate} min={addDays(today, -7)} max={addDays(today, 14)} onChange={(e) => { setFrom(e.target.value); if (toDate < e.target.value) setTo(e.target.value); }} /></Field>
              <Field label={t('To')}><input type="date" value={toDate} min={fromDate} max={addDays(today, 14)} onChange={(e) => setTo(e.target.value)} /></Field>
            </div>
            <Field label={t('Reason')}>
              <select value={why} onChange={(e) => setWhy(e.target.value)}>{REASONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>
            </Field>
            <Field label={t('A note (optional)')}><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={150} /></Field>
            {act.error && <div className="note err" role="alert">{act.error}</div>}
            <button className="btn block" disabled={act.busy || !who} onClick={send}>{t('Send to my mosque')}</button>
          </>
        )}
        {mine.data && mine.data.requests.length > 0 && (
          <div>
            <Eyebrow>{t('My requests')}</Eyebrow>
            <div className="list">
              {mine.data.requests.map((r) => (
                <div className="item" key={r.id}>
                  <Avatar name={r.name} />
                  <span className="grow">
                    <b className="truncate" style={{ display: 'block' }}>{r.fromDate === r.toDate ? niceDate(r.fromDate) : t('{from} to {to}', { from: niceDate(r.fromDate), to: niceDate(r.toDate) })}</b>
                    <span className="sub">{[people.length > 1 ? r.name.split(' ')[0] : '', r.reason].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className={`pill${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
                  {r.status === 'pending' && (
                    <button className="iconbtn" aria-label={t('Withdraw this request')} onClick={async () => { await api(`/excuse-requests/${r.id}`, { method: 'DELETE' }); mine.reload(); }}><Trash2 size={16} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {!mine.data && !mine.error && <Skeleton hero={false} cards={1} />}
      </div>
    </Sheet>
  );
}
