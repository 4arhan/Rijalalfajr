import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, CalendarRange, Globe, Search, Sprout, TrendingUp } from 'lucide-react';
import { api } from '../api';
import { Empty, Eyebrow, Problem, Screen, Seg, Skeleton, useSession } from '../ui';
import { niceDate, plural, useLoad } from '../lib/util';
import { t, tn } from '../lib/i18n';

interface Row { id: string; name: string; city: string; country: string; total: number; strivers: number; consistency: number | null }
interface GroupRow { name: string; country: string; total: number; mosques: number }
interface Season { id: string; name: string; startDate: string; endDate: string; status: 'upcoming' | 'active' | 'ended' }
interface MosqueAward { kind: 'consistent' | 'improved' | 'newcomer'; id: string; name: string; city: string; country: string; value: number }
interface WorldData { rows: Row[]; groups: GroupRow[]; countries: string[]; seasons: Season[]; awards?: MosqueAward[]; week?: { from: string; to: string } }

const AWARD: Record<MosqueAward['kind'], { icon: React.ReactNode; label: () => string; detail: (v: number) => string }> = {
  consistent: { icon: <Award size={20} />, label: () => t('Most consistent'), detail: (v) => t('{value}% of its strivers each day', { value: v }) },
  improved: { icon: <TrendingUp size={20} />, label: () => t('Most improved'), detail: (v) => t('{value}% more check-ins than the week before', { value: v }) },
  newcomer: { icon: <Sprout size={20} />, label: () => t('Best newcomer'), detail: (v) => tn(v, '{n} check-in in its first weeks', '{n} check-ins in its first weeks') },
};

type View = 'mosque' | 'city' | 'country';

export function WorldPage() {
  const { me } = useSession();
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('week');
  const [season, setSeason] = useState<string | null>(null);
  const [view, setView] = useState<View>('mosque');
  const [sort, setSort] = useState<'total' | 'consistency'>('total');
  const [country, setCountry] = useState('');
  const { data, error, reload } = useLoad(
    () => api<WorldData>(`/world?${season ? `season=${season}` : `period=${period}`}&sort=${sort}&group=${view}&country=${encodeURIComponent(country)}`),
    [period, season, sort, view, country],
  );
  const top = data?.rows[0];
  const current = data?.seasons.find((s) => s.id === season);
  return (
    <Screen title={t('World')} eyebrow={t('Mosques competing in good')} action={me && <Link className="iconbtn" to="/find" aria-label={t('Find a mosque')}><Search size={19} /></Link>}>
      <section className="hero">
        <Eyebrow icon={<Globe size={15} />}>{current ? current.name : sort === 'total' ? t('Most Fajr check-ins') : t('Most consistent')}</Eyebrow>
        {top ? (
          <>
            <h2 style={{ fontSize: 26, fontWeight: 750, letterSpacing: '-0.02em', margin: '10px 0 2px' }}>{top.name}</h2>
            <p className="muted">{[top.city, top.country].filter(Boolean).join(', ')}</p>
            <div className="stats">
              <div><label>{t('Check-ins')}</label><b className="num">{top.total.toLocaleString()}</b></div>
              <div><label>{t('Strivers')}</label><b className="num">{top.strivers}</b></div>
              <div><label>{t('Consistency')}</label><b className="num">{top.consistency === null ? '–' : `${top.consistency}%`}</b></div>
            </div>
          </>
        ) : (
          <p className="muted" style={{ marginTop: 10 }}>{data ? t('No approved mosque has check-ins in this period yet.') : t('Loading the leaderboard.')}</p>
        )}
      </section>

      {data && data.seasons.length > 0 && (
        <section className="card">
          <Eyebrow icon={<CalendarRange size={15} />}>{t('Worldwide seasons')}</Eyebrow>
          <div className="list">
            {data.seasons.map((s) => (
              <button key={s.id} className="item" aria-pressed={season === s.id} onClick={() => setSeason(season === s.id ? null : s.id)}>
                <span className="grow"><b>{s.name}</b><span className="sub" style={{ display: 'block' }}>{t('{from} to {to}', { from: niceDate(s.startDate), to: niceDate(s.endDate) })}</span></span>
                <span className={`pill${season === s.id ? '' : ' grey'}`}>{season === s.id ? t('Showing') : s.status === 'active' ? t('On now') : s.status === 'upcoming' ? t('Soon') : t('Ended')}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {data && !!data.awards?.length && data.week && (
        <section className="card">
          <div className="between" style={{ marginBottom: 10 }}>
            <Eyebrow icon={<Award size={15} />}>{t('Awards for last week')}</Eyebrow>
            <span className="muted small">{t('{from} to {to}', { from: niceDate(data.week.from), to: niceDate(data.week.to) })}</span>
          </div>
          <div className="awards">
            {data.awards.map((a) => (
              <Link to={`/m/${a.id}`} className={`award ${a.kind}`} key={a.kind}>
                <span className="award-icon">{AWARD[a.kind].icon}</span>
                <small>{AWARD[a.kind].label()}</small>
                <b>{a.name}</b>
                <span className="sub num">{AWARD[a.kind].detail(a.value)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!season && <Seg value={period} onChange={setPeriod} options={[{ value: 'week', label: t('Week') }, { value: 'month', label: t('Month') }, { value: 'all', label: t('All time') }]} />}
      <Seg value={view} onChange={setView} options={[{ value: 'mosque', label: t('Mosques') }, { value: 'city', label: t('Cities') }, { value: 'country', label: t('Countries') }]} />
      {view === 'mosque' && <Seg value={sort} onChange={setSort} options={[{ value: 'total', label: t('Biggest jama‘ah') }, { value: 'consistency', label: t('Most consistent') }]} />}
      {view !== 'country' && data && data.countries.length > 1 && (
        <label className="field">
          <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label={t('Country')}>
            <option value="">{t('All countries')}</option>
            {data.countries.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      )}

      <section className="card tight">
        {error ? <Problem error={error} retry={reload} /> : !data ? <Skeleton hero={false} cards={1} /> : view === 'mosque' ? (
          data.rows.length ? (
            <div className="list">
              {data.rows.map((r, i) => (
                <Link key={r.id} to={`/m/${r.id}`} className="item">
                  <span className={`rank num${i < 3 ? ` top${i + 1}` : ''}`}>{i + 1}</span>
                  <span className="grow">
                    <b className="truncate" style={{ display: 'block' }}>{r.name}</b>
                    <span className="sub">{[r.city, r.country].filter(Boolean).join(', ')} · {plural(r.strivers, 'striver')}</span>
                  </span>
                  <span className="score num">
                    <b>{sort === 'total' ? r.total.toLocaleString() : r.consistency === null ? '–' : `${r.consistency}%`}</b>
                    <small>{sort === 'total' ? t('check-ins') : t('show up')}</small>
                  </span>
                </Link>
              ))}
            </div>
          ) : <Empty icon={<Globe size={24} />} title={t('Nothing here yet')}>{t('Mosques appear once they are approved and have check-ins.')}</Empty>
        ) : data.groups.length ? (
          <div className="list">
            {data.groups.map((g, i) => (
              <div key={`${g.name}|${g.country}`} className="item">
                <span className={`rank num${i < 3 ? ` top${i + 1}` : ''}`}>{i + 1}</span>
                <span className="grow">
                  <b className="truncate" style={{ display: 'block' }}>{g.name}</b>
                  <span className="sub">{view === 'city' ? `${g.country} · ` : ''}{plural(g.mosques, 'mosque')}</span>
                </span>
                <span className="score num"><b>{g.total.toLocaleString()}</b><small>{t('check-ins')}</small></span>
              </div>
            ))}
          </div>
        ) : <Empty icon={<Globe size={24} />} title={t('Nothing here yet')}>{view === 'city' ? t('Cities appear once their mosques have check-ins.') : t('Countries appear once their mosques have check-ins.')}</Empty>}
      </section>
      {view === 'mosque' && (
        <p className="muted small">
          {t('Consistency is the share of a mosque\'s strivers who show up each day, for mosques with at least 5 strivers. It lets a small mosque beat a big one.')}
        </p>
      )}
    </Screen>
  );
}
