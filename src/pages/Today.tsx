import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Check, Landmark, MoonStar, Trophy, Users } from 'lucide-react';
import { api, type MosquePage as MosqueData, type Stats } from '../api';
import { Eyebrow, Loading, Problem, Ring, Screen, useMe } from '../ui';
import { HADITH, hijri, plural, timeIn, untilText, useLoad, useNow } from '../lib/util';

const MILESTONES = [3, 7, 14, 21, 40, 100, 200, 365];

export function TodayPage() {
  const me = useMe();
  const self = me.strivers.find((s) => s.self)!;
  const family = me.strivers.filter((s) => !s.self);
  const now = useNow();
  const { data, error, reload } = useLoad(async () => {
    const [stats, home, fam] = await Promise.all([
      api<Stats>(`/strivers/${self.id}/stats`),
      self.homeMosqueId ? api<MosqueData>(`/mosques/${self.homeMosqueId}`) : null,
      Promise.all(family.map((f) => api<Stats>(`/strivers/${f.id}/stats`))),
    ]);
    return { stats, home, fam };
  }, [self.id, self.homeMosqueId, family.length]);

  if (error) return <Screen title="Today"><Problem error={error} retry={reload} /></Screen>;
  if (!data) return <Screen title="Today"><Loading /></Screen>;
  const { stats, home, fam } = data;
  const goal = MILESTONES.find((m) => m > stats.streak) ?? 365;
  const win = home?.window;
  const tz = home?.mosque.timezone ?? 'UTC';
  const hadith = HADITH[Math.floor(now.getTime() / 86400000) % HADITH.length];
  const active = home?.challenges.filter((c) => c.status === 'active') ?? [];
  // The mosque's own challenge comes before its organisation's.
  const challenge = active.find((c) => c.scopeType === 'mosque') ?? active[0];

  return (
    <Screen title="Today" eyebrow={hijri(now)}>
      <section className="hero">
        <Eyebrow icon={<MoonStar size={15} />}>{stats.doneToday ? 'Fajr prayed at the mosque' : 'Your dawn streak'}</Eyebrow>
        <div className="between" style={{ marginTop: 12 }}>
          <div>
            <div className="big num">
              {stats.streak}
              <small>{stats.streak === 1 ? 'day' : 'days'}</small>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              {stats.doneToday
                ? `${goal - stats.streak} more to reach ${goal} in a row.`
                : stats.streak > 0
                  ? 'Pray Fajr at a mosque today to keep it going.'
                  : 'Your streak starts with one Fajr at the mosque.'}
            </p>
          </div>
          <Ring value={stats.streak / goal}>
            <div>
              <b className="num">{stats.streak}/{goal}</b>
              <small>next goal</small>
            </div>
          </Ring>
        </div>
        <div className="stats">
          <div><label>Best streak</label><b className="num">{stats.best}</b></div>
          <div><label>All dawns</label><b className="num">{stats.total}</b></div>
          <div><label>Mosque rank</label><b className="num">{stats.rank ? `#${stats.rank}` : '–'}</b></div>
        </div>
        {stats.doneToday ? (
          <div className="cta" style={{ cursor: 'default' }}>
            <span>
              <small>Today</small>
              <b>Checked in. May Allah accept it.</b>
            </span>
            <i><Check size={20} /></i>
          </div>
        ) : (
          <Link className="cta" to="/checkin">
            <span>
              <small>
                {win ? (win.inWindow ? `Open until ${timeIn(win.closes, tz)}` : `Fajr ${timeIn(win.fajr, tz)} · in ${untilText(win.fajr, now)}`) : 'Check in'}
              </small>
              <b>{win?.open ? 'Check in for Fajr' : 'Scan the mosque QR code'}</b>
            </span>
            <i><ArrowRight size={20} /></i>
          </Link>
        )}
      </section>

      {home ? (
        <section className="card">
          <Eyebrow icon={<Landmark size={15} />}>Your mosque</Eyebrow>
          <div className="between">
            <h2 className="truncate">{home.mosque.name}</h2>
            <Link to="/mosque" className="btn soft sm">Leaderboard</Link>
          </div>
          <p className="muted small" style={{ margin: '4px 0 12px' }}>
            Fajr {timeIn(home.window.fajr, tz)} · Iqamah {timeIn(home.window.iqamah, tz)} · Sunrise {timeIn(home.window.sunrise, tz)}
          </p>
          <div className="between small" style={{ marginBottom: 6 }}>
            <b>{plural(home.todayCount, 'person', 'people')} at Fajr today</b>
            {home.mosque.dailyGoal > 0 && <span className="muted">Goal {home.mosque.dailyGoal}</span>}
          </div>
          {home.mosque.dailyGoal > 0 && (
            <div className="meter"><i style={{ width: `${Math.min(100, (home.todayCount / home.mosque.dailyGoal) * 100)}%` }} /></div>
          )}
          {home.earlyBirds.length > 0 && (
            <p className="small" style={{ marginTop: 12 }}>
              <span className="pill gold">First in today</span> {home.earlyBirds.map((e) => e.name).join(', ')}
            </p>
          )}
        </section>
      ) : (
        <section className="card empty">
          <b>Choose your mosque</b>
          Your Fajr counts wherever you pray. Your home mosque is where you appear on the leaderboard.
          <div><Link className="btn" to="/find">Find my mosque</Link></div>
        </section>
      )}

      {challenge && (
        <Link to={`/challenge/${challenge.id}`} className="card row" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="icon"><Trophy size={20} /></span>
          <span className="grow">
            <span className="eyebrow">Challenge on now</span>
            <b className="truncate" style={{ display: 'block' }}>{challenge.name}</b>
          </span>
          <ArrowRight size={18} className="muted" />
        </Link>
      )}

      {fam.length > 0 && (
        <section className="card">
          <Eyebrow icon={<Users size={15} />}>Family</Eyebrow>
          <div className="list">
            {fam.map((f) => (
              <div className="item" key={f.striver.id}>
                <span className={`check${f.doneToday ? ' on' : ''}`}><Check size={16} /></span>
                <span className="grow"><b>{f.striver.name}</b></span>
                <span className="sub num">{plural(f.streak, 'day')} in a row</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <Eyebrow icon={<BookOpen size={15} />}>Why Fajr</Eyebrow>
        <p style={{ fontSize: 17, lineHeight: 1.5 }}>{hadith.text}</p>
        <p className="muted small" style={{ marginTop: 8 }}>{hadith.source}</p>
      </section>
    </Screen>
  );
}
