import { Link } from 'react-router-dom';
import { ArrowRight, Award, BellRing, BookOpen, Check, HeartHandshake, Landmark, MoonStar, Target, Trophy, Users } from 'lucide-react';
import { api, type MosquePage as MosqueData, type Stats } from '../api';
import { Eyebrow, Loading, Problem, Ring, Screen, useMe } from '../ui';
import { HADITH, addDays, hijri, plural, timeIn, untilText, useLoad, useNow } from '../lib/util';
import { EventList, PledgeList } from './Community';
import type { BuddyData } from './Personal';
import { currentLang, t, tn, tx } from '../lib/i18n';

const MILESTONES = [3, 7, 14, 21, 40, 100, 200, 365];

export function TodayPage() {
  const me = useMe();
  const self = me.strivers.find((s) => s.self)!;
  const family = me.strivers.filter((s) => !s.self);
  const now = useNow();
  const { data, error, reload } = useLoad(async () => {
    const [stats, home, fam, pals] = await Promise.all([
      api<Stats>(`/strivers/${self.id}/stats`),
      self.homeMosqueId ? api<MosqueData>(`/mosques/${self.homeMosqueId}`) : null,
      Promise.all(family.map((f) => api<Stats>(`/strivers/${f.id}/stats`))),
      api<BuddyData>('/buddies'),
    ]);
    return { stats, home, fam, pals };
  }, [self.id, self.homeMosqueId, family.length]);

  if (error) return <Screen title={t('Today')}><Problem error={error} retry={reload} /></Screen>;
  if (!data) return <Screen title={t('Today')}><Loading /></Screen>;
  const { stats, home, fam, pals } = data;
  // A challenge that finished in the last two weeks is announced here.
  const finished = home?.challenges.find((c) => c.status === 'ended' && c.endDate >= addDays(stats.today, -14));
  const week = Array.from({ length: 7 }, (_, i) => addDays(stats.today, i - 6));
  const goal = MILESTONES.find((m) => m > stats.streak) ?? 365;
  const win = home?.window;
  const tz = home?.mosque.timezone ?? 'UTC';
  const hadith = HADITH[Math.floor(now.getTime() / 86400000) % HADITH.length];
  const active = home?.challenges.filter((c) => c.status === 'active') ?? [];
  // The mosque's own challenge comes before its organisation's.
  const challenge = active.find((c) => c.scopeType === 'mosque') ?? active[0];

  return (
    <Screen title={t('Today')} eyebrow={hijri(now)}>
      <section className="hero">
        <Eyebrow icon={<MoonStar size={15} />}>{stats.doneToday ? t('Fajr prayed at the mosque') : t('Your dawn streak')}</Eyebrow>
        <div className="between" style={{ marginTop: 12 }}>
          <div>
            <div className="big num">
              {stats.streak}
              <small>{stats.streak === 1 ? t('day') : t('days')}</small>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              {stats.doneToday
                ? t('{n} more to reach {goal} in a row.', { n: goal - stats.streak, goal })
                : stats.streak > 0
                  ? t('Pray Fajr at a mosque today to keep it going.')
                  : t('Your streak starts with one Fajr at the mosque.')}
            </p>
          </div>
          <Ring value={stats.streak / goal}>
            <div>
              <b className="num">{stats.streak}/{goal}</b>
              <small>{t('next goal')}</small>
            </div>
          </Ring>
        </div>
        <div className="stats">
          <div><label>{t('Best streak')}</label><b className="num">{stats.best}</b></div>
          <div><label>{t('All dawns')}</label><b className="num">{stats.total}</b></div>
          <div><label>{t('Mosque rank')}</label><b className="num">{stats.rank ? `#${stats.rank}` : '–'}</b></div>
        </div>
        {stats.doneToday ? (
          <div className="cta" style={{ cursor: 'default' }}>
            <span>
              <small>{t('Today')}</small>
              <b>{t('Checked in. May Allah accept it.')}</b>
            </span>
            <i><Check size={20} /></i>
          </div>
        ) : (
          <Link className="cta" to="/checkin">
            <span>
              <small>
                {win ? (win.inWindow ? t('Open until {time}', { time: timeIn(win.closes, tz) }) : t('Fajr {time} · in {wait}', { time: timeIn(win.fajr, tz), wait: untilText(win.fajr, now) })) : t('Check in')}
              </small>
              <b>{win?.open ? t('Check in for Fajr') : t('Scan the mosque QR code')}</b>
            </span>
            <i><ArrowRight size={20} /></i>
          </Link>
        )}
      </section>

      {pals.nudges.length > 0 && (
        <div className="note between">
          <span className="row"><BellRing size={18} /> <span>{tx('<b>{names}</b> nudged you: see you at Fajr.', { names: pals.nudges.map((n) => n.name.split(' ')[0]).join(', ') })}</span></span>
          <button className="btn soft sm" onClick={async () => { await api('/nudges/seen', { method: 'POST' }); reload(); }}>{t('OK')}</button>
        </div>
      )}

      {stats.weeklyGoal > 0 && (
        <section className="card">
          <div className="between">
            <Eyebrow icon={<Target size={15} />}>{t('My week')}</Eyebrow>
            <span className="small num">{tx('<b>{weekDays}</b> of {weeklyGoal} dawns', { weekDays: stats.weekDays, weeklyGoal: stats.weeklyGoal })}</span>
          </div>
          <div className="meter"><i style={{ width: `${Math.min(100, (stats.weekDays / stats.weeklyGoal) * 100)}%` }} /></div>
          <p className="muted small" style={{ marginTop: 8 }}>
            {stats.weekDays >= stats.weeklyGoal ? t('You reached your goal for this week. Keep going.') : t('{n} more to reach your goal by Sunday.', { n: stats.weeklyGoal - stats.weekDays })}
          </p>
        </section>
      )}

      {finished && (
        <Link to={`/challenge/${finished.id}`} className="card row" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="icon"><Award size={20} /></span>
          <span className="grow">
            <span className="eyebrow">{t('The results are in')}</span>
            <b className="truncate" style={{ display: 'block' }}>{t('{name}: see the winners', { name: finished.name })}</b>
          </span>
          <ArrowRight size={18} className="muted" />
        </Link>
      )}

      {home ? (
        <section className="card">
          <Eyebrow icon={<Landmark size={15} />}>{t('Your mosque')}</Eyebrow>
          <div className="between">
            <h2 className="truncate">{home.mosque.name}</h2>
            <Link to="/mosque" className="btn soft sm">{t('Leaderboard')}</Link>
          </div>
          <p className="muted small" style={{ margin: '4px 0 12px' }}>{t('Fajr {fajr} · Iqamah {iqamah} · Sunrise {sunrise}', { fajr: timeIn(home.window.fajr, tz), iqamah: timeIn(home.window.iqamah, tz), sunrise: timeIn(home.window.sunrise, tz) })}</p>
          <div className="between small" style={{ marginBottom: 6 }}>
            <b>{tn(home.todayCount, '{n} person at Fajr today', '{n} people at Fajr today')}</b>
            {home.mosque.dailyGoal > 0 && <span className="muted">{t('Goal {dailyGoal}', { dailyGoal: home.mosque.dailyGoal })}</span>}
          </div>
          {home.mosque.dailyGoal > 0 && (
            <div className="meter"><i style={{ width: `${Math.min(100, (home.todayCount / home.mosque.dailyGoal) * 100)}%` }} /></div>
          )}
          {home.earlyBirds.length > 0 && (
            <p className="small" style={{ marginTop: 12 }}>
              <span className="pill gold">{t('First in today')}</span> {home.earlyBirds.map((e) => e.name).join(', ')}
            </p>
          )}
        </section>
      ) : (
        <section className="card empty">
          <b>{t('Choose your mosque')}</b>
          {t('Your Fajr counts wherever you pray. Your home mosque is where you appear on the leaderboard.')}
          <div><Link className="btn" to="/find">{t('Find my mosque')}</Link></div>
        </section>
      )}

      {home && <PledgeList pledges={home.pledges} admin={false} onChange={reload} />}
      {home && <EventList events={home.events} signedIn staff={false} onChange={reload} />}

      {challenge && (
        <Link to={`/challenge/${challenge.id}`} className="card row" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="icon"><Trophy size={20} /></span>
          <span className="grow">
            <span className="eyebrow">{t('Challenge on now')}</span>
            <b className="truncate" style={{ display: 'block' }}>{challenge.name}</b>
          </span>
          <ArrowRight size={18} className="muted" />
        </Link>
      )}

      {fam.length > 0 && (
        <section className="card">
          <Eyebrow icon={<Users size={15} />}>{t('Family')}</Eyebrow>
          <div className="list">
            {fam.map((f) => (
              <Link className="item" key={f.striver.id} to={`/kids/${f.striver.id}`}>
                <span className={`check${f.doneToday ? ' on' : ''}`}><Check size={16} /></span>
                <span className="grow">
                  <b>{f.striver.name}</b>
                  <span className="sub num" style={{ display: 'block' }}>{tn(f.streak, '{n} day in a row', '{n} days in a row')}</span>
                </span>
                <span className="dots" aria-hidden="true">{week.map((d) => <i key={d} className={f.dates.includes(d) ? 'on' : ''} />)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="between" style={{ marginBottom: 6 }}>
          <Eyebrow icon={<HeartHandshake size={15} />}>{t('Fajr buddies')}</Eyebrow>
          <Link to="/buddies" className="btn soft sm">{pals.buddies.length ? t('All buddies') : t('Find a buddy')}</Link>
        </div>
        {pals.buddies.length ? (
          <div className="list">
            {pals.buddies.slice(0, 3).map((b) => (
              <div className="item" key={b.striverId}>
                <span className={`check${b.doneToday ? ' on' : ''}`}><Check size={16} /></span>
                <span className="grow"><b>{b.name}</b></span>
                <span className="sub num">{`${b.doneToday ? t('At Fajr today') : t('Not yet today')} · ${tn(b.streak, '{n} day in a row', '{n} days in a row')}`}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">{t('Pair up with a friend. You each see whether the other made it to Fajr, and can nudge.')}</p>
        )}
      </section>

      {/* Hadith wording is shown in English only until each translation has been checked by someone qualified. */}
      {currentLang() === 'en' && <section className="card">
        <Eyebrow icon={<BookOpen size={15} />}>{t('Why Fajr')}</Eyebrow>
        <p style={{ fontSize: 17, lineHeight: 1.5 }}>{hadith.text}</p>
        <p className="muted small" style={{ marginTop: 8 }}>{hadith.source}</p>
      </section>}
    </Screen>
  );
}
