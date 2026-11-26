import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Landmark, LocateFixed, Plus } from 'lucide-react';
import { api } from '../api';
import { Loading, Problem, Screen } from '../ui';
import { distanceText, getPosition, plural, useLoad } from '../lib/util';
import { t } from '../lib/i18n';

interface Found { id: string; name: string; city: string; country: string; verified: boolean; members: number; distanceM: number | null }

export function FindPage() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, reload } = useLoad(
    () => api<{ mosques: Found[] }>(`/mosques?q=${encodeURIComponent(term)}${pos ? `&lat=${pos.lat}&lng=${pos.lng}` : ''}`),
    [term, pos],
  );
  const locate = async () => {
    setLocating(true);
    setLocError(null);
    try {
      const p = await getPosition();
      setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
    } catch (e) {
      setLocError((e as Error).message);
    }
    setLocating(false);
  };
  return (
    <Screen title={t('Find a mosque')} back>
      <label className="field">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search by name, city or country')} aria-label={t('Search mosques')} />
      </label>
      <button className="btn ghost" onClick={locate} disabled={locating}><LocateFixed size={18} /> {pos ? t('Sorted by distance') : locating ? t('Finding you') : t('Mosques near me')}</button>
      {locError && <div className="note err">{locError}</div>}
      <section className="card tight">
        {error ? <Problem error={error} retry={reload} /> : !data ? <Loading /> : data.mosques.length ? (
          <div className="list">
            {data.mosques.map((m) => (
              <Link key={m.id} to={`/m/${m.id}`} className="item">
                <span className="icon"><Landmark size={19} /></span>
                <span className="grow">
                  <b className="truncate" style={{ display: 'block' }}>{m.name} {m.verified && <BadgeCheck size={14} style={{ verticalAlign: '-2px' }} aria-label={t('Approved')} />}</b>
                  <span className="sub">{[m.city, m.country].filter(Boolean).join(', ')} · {plural(m.members, 'member')}</span>
                </span>
                {m.distanceM !== null && <span className="pill grey">{distanceText(m.distanceM)}</span>}
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty"><b>{t('No mosque found')}</b>{t('Is yours missing? Register it and start its leaderboard.')}</div>
        )}
      </section>
      <Link to="/new-mosque" className="btn soft"><Plus size={18} />{' '}{t('Register a mosque')}</Link>
    </Screen>
  );
}
