import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Search } from 'lucide-react';
import { api } from '../api';
import { Eyebrow, Loading, Problem, Screen, Seg } from '../ui';
import { plural, useLoad } from '../lib/util';

interface Row { id: string; name: string; city: string; country: string; total: number; strivers: number; consistency: number | null }

export function WorldPage() {
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('week');
  const [sort, setSort] = useState<'total' | 'consistency'>('total');
  const [country, setCountry] = useState('');
  const { data, error, reload } = useLoad(
    () => api<{ rows: Row[]; countries: string[] }>(`/world?period=${period}&sort=${sort}&country=${encodeURIComponent(country)}`),
    [period, sort, country],
  );
  const top = data?.rows[0];
  return (
    <Screen title="World" eyebrow="Mosques competing in good" action={<Link className="iconbtn" to="/find" aria-label="Find a mosque"><Search size={19} /></Link>}>
      <section className="hero">
        <Eyebrow icon={<Globe size={15} />}>{sort === 'total' ? 'Most Fajr check-ins' : 'Most consistent'}</Eyebrow>
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
      <Seg value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'all', label: 'All time' }]} />
      <Seg value={sort} onChange={setSort} options={[{ value: 'total', label: 'Biggest jama‘ah' }, { value: 'consistency', label: 'Most consistent' }]} />
      {data && data.countries.length > 1 && (
        <label className="field">
          <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
            <option value="">All countries</option>
            {data.countries.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      )}
      <section className="card tight">
        {error ? <Problem error={error} retry={reload} /> : !data ? <Loading /> : data.rows.length ? (
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
        ) : (
          <div className="empty"><b>Nothing here yet</b>Mosques appear once they are approved and have check-ins.</div>
        )}
      </section>
      <p className="muted small">
        Consistency is the share of a mosque's strivers who show up each day, for mosques with at least 5 strivers. It lets a small mosque beat a big one.
      </p>
    </Screen>
  );
}
