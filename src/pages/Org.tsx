import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HandHeart, Landmark, Plus, Trophy, Users, UsersRound } from 'lucide-react';
import { api, type ChallengeBrief, type Standing } from '../api';
import { Eyebrow, LinkRow, Loading, Problem, RankList, Screen, useSession } from '../ui';
import { niceDate, plural, useLoad } from '../lib/util';
import { SponsorCards, type Sponsor } from './Sponsor';

interface OrgData {
  org: { id: string; name: string; code: string | null };
  mosques: { id: string; name: string; city: string; total: number; strivers: number }[];
  top: Standing[];
  challenges: ChallengeBrief[];
  canEdit: boolean;
}

export function OrgPage() {
  const { id } = useParams();
  const { me } = useSession();
  const mine = useMemo(() => new Set(me?.strivers.map((s) => s.id) ?? []), [me]);
  const { data, error, reload } = useLoad(() => api<OrgData>(`/orgs/${id}`), [id]);
  const sponsors = useLoad(() => api<{ sponsors: Sponsor[] }>(`/orgs/${id}/sponsors`).catch(() => ({ sponsors: [] })), [id]);
  if (error) return <Screen title="Organisation" back><Problem error={error} retry={reload} /></Screen>;
  if (!data) return <Screen title="Organisation" back><Loading /></Screen>;
  const total = data.mosques.reduce((a, m) => a + m.total, 0);
  return (
    <Screen title={data.org.name} eyebrow="Organisation" back>
      <section className="hero">
        <Eyebrow icon={<UsersRound size={15} />}>Last 30 days</Eyebrow>
        <div className="big num" style={{ marginTop: 12 }}>{total.toLocaleString()}<small>Fajr check-ins</small></div>
        <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div><label>Mosques</label><b className="num">{data.mosques.length}</b></div>
          <div><label>Challenges</label><b className="num">{data.challenges.length}</b></div>
        </div>
      </section>

      {data.org.code && (
        <div className="note">Mosque admins join with this code in their mosque settings: <b style={{ letterSpacing: '0.12em' }}>{data.org.code}</b></div>
      )}

      <section className="card">
        <Eyebrow icon={<Landmark size={15} />}>Mosques</Eyebrow>
        {data.mosques.length ? (
          <div className="list">
            {data.mosques.map((m, i) => (
              <Link key={m.id} to={`/m/${m.id}`} className="item">
                <span className="rank num">{i + 1}</span>
                <span className="grow"><b className="truncate" style={{ display: 'block' }}>{m.name}</b><span className="sub">{m.city} · {plural(m.strivers, 'striver')}</span></span>
                <span className="score num"><b>{m.total.toLocaleString()}</b><small>check-ins</small></span>
              </Link>
            ))}
          </div>
        ) : <p className="muted small">No mosque has joined yet. Share the code above with mosque admins.</p>}
      </section>

      <section className="card tight">
        {data.challenges.map((c) => (
          <LinkRow key={c.id} to={`/challenge/${c.id}`} icon={<Trophy size={19} />} title={c.name} sub={`${niceDate(c.startDate)} to ${niceDate(c.endDate)}`}
            end={<span className={`pill${c.status === 'active' ? '' : ' grey'}`}>{c.status === 'active' ? 'On now' : c.status === 'upcoming' ? 'Soon' : 'Ended'}</span>} />
        ))}
        {data.canEdit && <LinkRow to={`/challenge/new?scope=org:${data.org.id}`} icon={<Plus size={19} />} title="New challenge" sub="With prizes across all your mosques" />}
        {!data.canEdit && data.challenges.length === 0 && <p className="muted small" style={{ padding: '12px 0' }}>No challenges yet.</p>}
      </section>

      {data.canEdit && (
        <>
          <Eyebrow icon={<HandHeart size={15} />}>Sponsor offers for your mosques and their countries</Eyebrow>
          {sponsors.data?.sponsors.length ? <SponsorCards sponsors={sponsors.data.sponsors} /> : <p className="muted small">No offers yet. Only you can see this section.</p>}
        </>
      )}

      <section className="card">
        <Eyebrow icon={<Users size={15} />}>Top strivers, last 30 days</Eyebrow>
        {data.top.length ? <RankList rows={data.top} mine={mine} /> : <p className="muted small">No check-ins yet.</p>}
      </section>
    </Screen>
  );
}
