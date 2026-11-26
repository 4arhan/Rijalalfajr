import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BadgeCheck, Flag, HandHeart, Settings2, Share2, Sunrise, Trophy, Users, UsersRound } from 'lucide-react';
import { api, GROUPS, type Group, type MosquePage as MosqueData, type Standing } from '../api';
import { Eyebrow, Field, LinkRow, Loading, Podium, Problem, RankList, Screen, Seg, Sheet, useAction, useMe, useSession, useToast } from '../ui';
import { niceDate, plural, timeIn, useLoad } from '../lib/util';
import { EventList, PledgeList } from './Community';

type Period = 'week' | 'month' | 'all';
interface Squads {
  squads: { id: string; name: string; members: number; days: number; perMember: number }[];
  mine: { id: string; name: string; code: string } | null;
}

export function MyMosque() {
  const me = useMe();
  const home = me.strivers.find((s) => s.self)?.homeMosqueId;
  if (home) return <MosqueView id={home} />;
  return (
    <Screen title="Mosque">
      <section className="card empty">
        <b>You have not chosen a mosque yet</b>
        Find yours, or check in at any mosque and it becomes your home mosque.
        <div><Link className="btn" to="/find">Find my mosque</Link></div>
      </section>
    </Screen>
  );
}

export function MosquePage() {
  const { id } = useParams();
  return <MosqueView id={id!} back />;
}

function MosqueView({ id, back }: { id: string; back?: true }) {
  // Visitors can open this page from a link without an account.
  const { me, reload: reloadMe } = useSession();
  const toast = useToast();
  const [period, setPeriod] = useState<Period>('month');
  const [grp, setGrp] = useState<Group | 'all'>('all');
  const [sheet, setSheet] = useState<'squad' | 'report' | null>(null);
  const [showAll, setShowAll] = useState(false);
  const page = useLoad(() => api<MosqueData>(`/mosques/${id}`), [id]);
  const board = useLoad(() => api<{ rows: Standing[]; hidden: boolean }>(`/mosques/${id}/leaderboard?period=${period}`), [id, period]);
  const squads = useLoad(() => api<Squads>(`/mosques/${id}/squads`), [id]);
  const act = useAction();

  const mine = useMemo(() => new Set(me?.strivers.map((s) => s.id) ?? []), [me]);
  const rows = useMemo(() => {
    const all = board.data?.rows ?? [];
    return grp === 'all' ? all : all.filter((r) => r.grp === grp).map((r, i) => ({ ...r, rank: i + 1 }));
  }, [board.data, grp]);

  if (page.error) return <Screen title="Mosque" back={back}><Problem error={page.error} retry={page.reload} /></Screen>;
  if (!page.data) return <Screen title="Mosque" back={back}><Loading /></Screen>;
  const { mosque, window: win, role } = page.data;
  const isHome = me?.strivers.find((s) => s.self)?.homeMosqueId === mosque.id;
  const share = async () => {
    const url = `${location.origin}/m/${mosque.id}`;
    try {
      if (navigator.share) await navigator.share({ title: mosque.name, text: `Fajr at ${mosque.name}: the podium`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      }
    } catch {
      /* the share sheet was closed */
    }
  };

  const makeHome = () =>
    act.run(async () => {
      await api('/me', { method: 'PATCH', body: { homeMosqueId: mosque.id } });
      await reloadMe();
      toast(`${mosque.name} is now your home mosque`);
    });

  return (
    <Screen
      title={mosque.name}
      back={back}
      eyebrow={<>{[mosque.city, mosque.country].filter(Boolean).join(', ') || 'Mosque'}{mosque.verified && <BadgeCheck size={14} aria-label="Approved mosque" />}</>}
      action={<>
        <button className="iconbtn" onClick={share} aria-label="Share this mosque's page"><Share2 size={18} /></button>
        {role && <Link className="iconbtn" to={`/manage/${mosque.id}`} aria-label="Manage mosque"><Settings2 size={19} /></Link>}
      </>}
    >
      <section className="hero">
        <div className="between">
          <Eyebrow icon={<Trophy size={15} />}>Podium</Eyebrow>
          <span className="muted small">{period === 'week' ? 'Last 7 days' : period === 'month' ? 'Last 30 days' : 'All time'}</span>
        </div>
        {!board.data ? <Loading /> : board.data.hidden ? <p className="muted" style={{ marginTop: 12 }}>This mosque shows its leaderboard to people who are signed in.</p> : <Podium rows={rows} />}
      </section>

      <Seg value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'all', label: 'All time' }]} />
      <Seg value={grp} onChange={setGrp} options={[{ value: 'all', label: 'Everyone' }, ...GROUPS.map((g) => ({ value: g, label: mosque.labels[g] }))]} />

      {me && !isHome && (
        <button className="btn block" onClick={makeHome} disabled={act.busy}>Make this my home mosque</button>
      )}

      <PledgeList pledges={page.data.pledges} admin={role === 'admin'} onChange={page.reload} />
      <EventList events={page.data.events} signedIn={!!me} staff={!!role} onChange={page.reload} />

      <section className="card">
        <Eyebrow icon={<Users size={15} />}>Leaderboard</Eyebrow>
        {rows.length > 3 ? (
          <>
            <RankList rows={showAll ? rows.slice(3) : rows.slice(3).filter((r, i) => i < 10 || mine.has(r.striverId))} mine={mine} />
            {!showAll && rows.length > 13 && <button className="btn ghost sm block" style={{ marginTop: 8 }} onClick={() => setShowAll(true)}>Show all {rows.length}</button>}
          </>
        ) : rows.length ? (
          <p className="muted small">Everyone who has checked in is on the podium. Bring a friend to Fajr.</p>
        ) : (
          <div className="empty"><b>No check-ins yet</b>The first Fajr checked in here takes first place.</div>
        )}
        {rows.length > 0 && <p className="muted small" style={{ marginTop: 10 }}>Ranked by days at Fajr, then longest streak, then earliest arrival.</p>}
      </section>

      <section className="card">
        <Eyebrow icon={<Sunrise size={15} />}>Fajr here</Eyebrow>
        <div className="between">
          <div>
            <h2 className="num">{timeIn(win.fajr, mosque.timezone)}</h2>
            <p className="muted small">Iqamah {timeIn(win.iqamah, mosque.timezone)} · check-in {timeIn(win.opens, mosque.timezone)} to {timeIn(win.closes, mosque.timezone)}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h2 className="num">{page.data.todayCount}</h2>
            <p className="muted small">at Fajr today</p>
          </div>
        </div>
        {page.data.earlyBirds.length > 0 && (
          <p className="small" style={{ marginTop: 12 }}><span className="pill gold">First in today</span> {page.data.earlyBirds.map((e) => e.name).join(', ')}</p>
        )}
        <p className="muted small" style={{ marginTop: 10 }}>{plural(page.data.members, 'member')}{mosque.practice ? ' · practice mode is on' : ''}</p>
      </section>

      {(page.data.challenges.length > 0 || page.data.org) && (
        <section className="card tight">
          {page.data.challenges.map((c) => (
            <LinkRow key={c.id} to={`/challenge/${c.id}`} icon={<Trophy size={19} />} title={c.name}
              sub={`${niceDate(c.startDate)} to ${niceDate(c.endDate)}`}
              end={<span className={`pill${c.status === 'active' ? '' : ' grey'}`}>{c.status === 'active' ? 'On now' : c.status === 'upcoming' ? 'Soon' : 'Ended'}</span>} />
          ))}
          {page.data.org && <LinkRow to={`/org/${page.data.org.id}`} icon={<UsersRound size={19} />} title={page.data.org.name} sub="Organisation leaderboard" />}
        </section>
      )}

      <section className="card">
        <div className="between" style={{ marginBottom: 10 }}>
          <Eyebrow icon={<UsersRound size={15} />}>Squads</Eyebrow>
          {isHome && <button className="btn soft sm" onClick={() => setSheet('squad')}>{squads.data?.mine ? 'My squad' : 'Join or start'}</button>}
        </div>
        {squads.data?.squads.length ? (
          <div className="list">
            {squads.data.squads.map((s, i) => (
              <div key={s.id} className={`item${squads.data!.mine?.id === s.id ? ' me' : ''}`}>
                <span className="rank num">{i + 1}</span>
                <span className="grow"><b>{s.name}</b><span className="sub" style={{ display: 'block' }}>{plural(s.members, 'member')}</span></span>
                <span className="score num"><b>{s.perMember}</b><small>days each</small></span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">A squad is up to 10 friends who hold each other to Fajr. Squads are ranked by days per member over the last 30 days.</p>
        )}
      </section>

      <Link to={`/sponsor?mosque=${mosque.id}`} className="card row" style={{ textDecoration: 'none', color: 'inherit' }}>
        <span className="icon"><HandHeart size={20} /></span>
        <span className="grow"><b style={{ display: 'block' }}>Sponsor this mosque</b><span className="muted small">Offer prizes or breakfast. The mosque contacts you.</span></span>
      </Link>

      {me && <button className="btn ghost sm" style={{ alignSelf: 'center' }} onClick={() => setSheet('report')}><Flag size={15} /> Report a problem</button>}

      {sheet === 'squad' && <SquadSheet mine={squads.data?.mine ?? null} onClose={() => setSheet(null)} onChange={() => { squads.reload(); reloadMe(); }} />}
      {sheet === 'report' && <ReportSheet targetType="mosque" targetId={mosque.id} onClose={() => setSheet(null)} />}
      {act.error && <div className="note err">{act.error}</div>}
    </Screen>
  );
}

function SquadSheet({ mine, onClose, onChange }: { mine: Squads['mine']; onClose: () => void; onChange: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const act = useAction();
  const toast = useToast();
  const done = (msg: string) => { toast(msg); onChange(); onClose(); };
  if (mine) {
    return (
      <Sheet title={mine.name} onClose={onClose}>
        <div className="form">
          <div className="note">Share this code with friends at your mosque: <b style={{ letterSpacing: '0.12em' }}>{mine.code}</b></div>
          {act.error && <div className="note err">{act.error}</div>}
          <button className="btn danger block" disabled={act.busy} onClick={() => act.run(async () => { await api('/squads/leave', { method: 'POST' }); done('You left the squad'); })}>Leave squad</button>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title="Squads" onClose={onClose}>
      <div className="form">
        <Field label="Have a code?"><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="6 letters and numbers" maxLength={6} /></Field>
        <button className="btn block" disabled={act.busy || code.length < 6} onClick={() => act.run(async () => { await api('/squads/join', { body: { code } }); done('You joined the squad'); })}>Join squad</button>
        <Field label="Or start a new squad"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dawn Patrol" maxLength={40} /></Field>
        <button className="btn ghost block" disabled={act.busy || name.trim().length < 2} onClick={() => act.run(async () => { await api('/squads', { body: { name } }); done('Squad created'); })}>Start squad</button>
        {act.error && <div className="note err">{act.error}</div>}
      </div>
    </Sheet>
  );
}

export function ReportSheet({ targetType, targetId, onClose }: { targetType: string; targetId: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const act = useAction();
  const toast = useToast();
  return (
    <Sheet title="Report a problem" onClose={onClose}>
      <div className="form">
        <Field label="What is wrong?" hint="For example a fake mosque, an offensive name, or cheating.">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
        {act.error && <div className="note err">{act.error}</div>}
        <button className="btn block" disabled={act.busy || reason.trim().length < 3}
          onClick={() => act.run(async () => { await api('/reports', { body: { targetType, targetId, reason } }); toast('Thank you. We will look into it.'); onClose(); })}>
          Send report
        </button>
      </div>
    </Sheet>
  );
}
