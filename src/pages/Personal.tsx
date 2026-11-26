// Buddies, the year in review and the kids' view.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BellRing, Check, HeartHandshake, IdCard, Share2, Star, Trash2, UserPlus } from 'lucide-react';
import { api, type Stats } from '../api';
import { Eyebrow, Field, Loading, Problem, Qr, Screen, Sheet, useAction, useMe, useToast } from '../ui';
import { addDays, plural, useLoad } from '../lib/util';
import { shareReview } from '../lib/share';
import { dateLocale, t, tn, tx } from '../lib/i18n';

export interface Buddy { striverId: string; name: string; mosque: string | null; doneToday: boolean; streak: number; nudged: boolean }
export interface BuddyData { buddies: Buddy[]; nudges: { id: string; name: string }[] }

/** Share your invitation link through the phone's share sheet, or copy it. */
export async function shareInvite(code: string, toast: (m: string) => void) {
  const url = `${location.origin}/i/${code}`;
  const text = 'Join me for Fajr at the mosque. We keep each other going on Rijal al-Fajr.';
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
