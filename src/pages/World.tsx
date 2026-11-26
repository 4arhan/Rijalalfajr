import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, Globe, Search } from 'lucide-react';
import { api } from '../api';
import { Eyebrow, Loading, Problem, Screen, Seg, useSession } from '../ui';
import { niceDate, plural, useLoad } from '../lib/util';

interface Row { id: string; name: string; city: string; country: string; total: number; strivers: number; consistency: number | null }
interface GroupRow { name: string; country: string; total: number; mosques: number }
interface Season { id: string; name: string; startDate: string; endDate: string; status: 'upcoming' | 'active' | 'ended' }
interface WorldData { rows: Row[]; groups: GroupRow[]; countries: string[]; seasons: Season[] }

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
    <Screen title="World" eyebrow="Mosques competing in good" action={me && <Link className="iconbtn" to="/find" aria-label="Find a mosque"><Search size={19} /></Link>}>
      <section className="hero">
        <Eyebrow icon={<Globe size={15} />}>{current ? current.name : sort === 'total' ? 'Most Fajr check-ins' : 'Most consistent'}</Eyebrow>
        {top ? (
          <>
            <h2 style={{ fontSize: 26, fontWeight: 750, letterSpacing: '-0.02em', margin: '10px 0 2px' }}>{top.name}</h2>
            <p className="muted">{[top.city, top.country].filter(Boolean).join(', ')}</p>
            <div className="stats">
              <div><label>Check-ins</label><b className="num">{top.total.toLocaleString()}</b></div>
              <div><label>Strivers</label><b className="num">{top.strivers}</b></div>
              <div><label>Consistency</label><b className="num">{top.consistency === null ? '–' : `${top.consistency}%`}</b></div>
            </div>
          </>
        ) : (
          <p className="muted" style={{ marginTop: 10 }}>{data ? 'No approved mosque has check-ins in this period yet.' : 'Loading the leaderboard.'}</p>
        )}
      </section>

      {data && data.seasons.length > 0 && (
        <section className="card">
          <Eyebrow icon={<CalendarRange size={15} />}>Worldwide seasons</Eyebrow>
          <div className="list">
            {data.seasons.map((s) => (
              <button key={s.id} className="item" aria-pressed={season === s.id} onClick={() => setSeason(season === s.id ? null : s.id)}>
                <span className="grow"><b>{s.name}</b><span className="sub" style={{ display: 'block' }}>{niceDate(s.startDate)} to {niceDate(s.endDate)}</span></span>
                <span className={`pill${season === s.id ? '' : ' grey'}`}>{season === s.id ? 'Showing' : s.status === 'active' ? 'On now' : s.status === 'upcoming' ? 'Soon' : 'Ended'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!season && <Seg value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'all', label: 'All time' }]} />}
      <Seg value={view} onChange={setView} options={[{ value: 'mosque', label: 'Mosques' }, { value: 'city', label: 'Cities' }, { value: 'country', label: 'Countries' }]} />
      {view === 'mosque' && <Seg value={sort} onChange={setSort} options={[{ value: 'total', label: 'Biggest jama‘ah' }, { value: 'consistency', label: 'Most consistent' }]} />}
      {view !== 'country' && data && data.countries.length > 1 && (
        <label className="field">
          <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
            <option value="">All countries</option>
            {data.countries.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      )}

      <section className="card tight">
        {error ? <Problem error={error} retry={reload} /> : !data ? <Loading /> : view === 'mosque' ? (
          data.rows.length ? (
            <div className="list">
              {data.rows.map((r, i) => (
                <Link key={r.id} to={`/m/${r.id}`} className="item">
                  <span className="rank num">{i + 1}</span>
                  <span className="grow">
                    <b className="truncate" style={{ display: 'block' }}>{r.name}</b>
                    <span className="sub">{[r.city, r.country].filter(Boolean).join(', ')} · {plural(r.strivers, 'striver')}</span>
                  </span>
                  <span className="score num">
                    <b>{sort === 'total' ? r.total.toLocaleString() : r.consistency === null ? '–' : `${r.consistency}%`}</b>
                    <small>{sort === 'total' ? 'check-ins' : 'show up'}</small>
                  </span>
                </Link>
              ))}
            </div>
          ) : <div className="empty"><b>Nothing here yet</b>Mosques appear once they are approved and have check-ins.</div>
        ) : data.groups.length ? (
          <div className="list">
            {data.groups.map((g, i) => (
              <div key={`${g.name}|${g.country}`} className="item">
                <span className="rank num">{i + 1}</span>
                <span className="grow">
                  <b className="truncate" style={{ display: 'block' }}>{g.name}</b>
                  <span className="sub">{view === 'city' ? `${g.country} · ` : ''}{plural(g.mosques, 'mosque')}</span>
                </span>
                <span className="score num"><b>{g.total.toLocaleString()}</b><small>check-ins</small></span>
              </div>
            ))}
          </div>
        ) : <div className="empty"><b>Nothing here yet</b>{view === 'city' ? 'Cities' : 'Countries'} appear once their mosques have check-ins.</div>}
      </section>
      {view === 'mosque' && (
        <p className="muted small">
          Consistency is the share of a mosque's strivers who show up each day, for mosques with at least 5 strivers. It lets a small mosque beat a big one.
        </p>
      )}
    </Screen>
  );
}
