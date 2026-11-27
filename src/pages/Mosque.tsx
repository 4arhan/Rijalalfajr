import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Flag, Gift, HandHeart, Landmark, Settings2, Share2, Sparkles, Sunrise, Trophy, Users, UsersRound } from 'lucide-react';
import { api, GROUPS, type Community, type Group, type MosquePage as MosqueData, type Standing } from '../api';
import { Empty, Eyebrow, Field, LinkRow, Loading, Podium, Problem, RankList, Screen, Seg, Sheet, Skeleton, Tabs, useAction, useMe, useSession, useToast } from '../ui';
import { niceDate, plural, timeIn, useLoad, showLabel } from '../lib/util';
import { EventList, PledgeList } from './Community';
import { AwardsCard, FamiliesCard, FeedCard, HonourCard, MatchCard, WishCard } from './Social';
import { t, tn } from '../lib/i18n';

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
    <Screen title={t('Mosque')}>
      <section className="card empty">
        <span className="empty-icon"><Landmark size={24} /></span>
        <b>{t('You have not chosen a mosque yet')}</b>
        {t('Find yours, or check in at any mosque and it becomes your home mosque.')}
        <div><Link className="btn" to="/find">{t('Find my mosque')}</Link></div>
      </section>
    </Screen>
  );
}

export function MosquePage() {
  const { id } = useParams();
  return <MosqueView id={id!} back />;
}

type Tab = 'board' | 'life' | 'prizes';

function MosqueView({ id, back }: { id: string; back?: true }) {
  // Visitors can open this page from a link without an account.
  const { me, reload: reloadMe } = useSession();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'life' ? 'life' : params.get('tab') === 'prizes' ? 'prizes' : 'board';
  const [period, setPeriod] = useState<Period>('month');
  const [grp, setGrp] = useState<Group | 'all'>('all');
  const [sheet, setSheet] = useState<'squad' | 'report' | null>(null);
  const [showAll, setShowAll] = useState(false);
  const page = useLoad(() => api<MosqueData>(`/mosques/${id}`), [id]);
  const board = useLoad(() => api<{ rows: Standing[]; hidden: boolean }>(`/mosques/${id}/leaderboard?period=${period}`), [id, period]);
  const squads = useLoad(() => api<Squads>(`/mosques/${id}/squads`), [id]);
  const people = useLoad(() => api<Community>(`/mosques/${id}/community`), [id]);
  const act = useAction();

  const mine = useMemo(() => new Set(me?.strivers.map((s) => s.id) ?? []), [me]);
  const rows = useMemo(() => {
    const all = board.data?.rows ?? [];
    return grp === 'all' ? all : all.filter((r) => r.grp === grp).map((r, i) => ({ ...r, rank: i + 1 }));
  }, [board.data, grp]);

  if (page.error) return <Screen title={t('Mosque')} back={back}><Problem error={page.error} retry={page.reload} /></Screen>;
  if (!page.data) return <Screen title={t('Mosque')} back={back}><Skeleton cards={3} /></Screen>;
  const { mosque, window: win, role } = page.data;
  const isHome = me?.strivers.find((s) => s.self)?.homeMosqueId === mosque.id;
  const share = async () => {
    const url = `${location.origin}/m/${mosque.id}`;
    try {
      if (navigator.share) await navigator.share({ title: mosque.name, text: t('Fajr at {name}: the podium', { name: mosque.name }), url });
      else {
        await navigator.clipboard.writeText(url);
        toast(t('Link copied'));
      }
    } catch {
      /* the share sheet was closed */
    }
  };

  const makeHome = () =>
    act.run(async () => {
      await api('/me', { method: 'PATCH', body: { homeMosqueId: mosque.id } });
      await reloadMe();
      toast(t('{name} is now your home mosque', { name: mosque.name }));
    });

  return (
    <Screen
      title={mosque.name}
      back={back}
      eyebrow={<>{[mosque.city, mosque.country].filter(Boolean).join(', ') || t('Mosque')}{mosque.verified && <BadgeCheck size={14} aria-label={t('Approved mosque')} />}</>}
      action={<>
        <button className="iconbtn" onClick={share} aria-label={t('Share this mosque\'s page')}><Share2 size={18} /></button>
        {role && <Link className="iconbtn" to={`/manage/${mosque.id}`} aria-label={t('Manage mosque')}><Settings2 size={19} /></Link>}
      </>}
    >
      <Tabs value={tab} onChange={(v) => setParams(v === 'board' ? {} : { tab: v }, { replace: true })}
        options={[{ value: 'board', label: t('Podium'), icon: <Trophy size={16} /> }, { value: 'life', label: t('Community'), icon: <Sparkles size={16} /> }, { value: 'prizes', label: t('Prizes'), icon: <Gift size={16} /> }]} />

      {tab === 'board' && (
        <>
          <section className="hero">
            <div className="between">
              <Eyebrow icon={<Trophy size={15} />}>{t('Podium')}</Eyebrow>
              <span className="muted small">{period === 'week' ? t('Last 7 days') : period === 'month' ? t('Last 30 days') : t('All time')}</span>
            </div>
            {!board.data ? <Loading /> : board.data.hidden ? <p className="muted" style={{ marginTop: 12 }}>{t('This mosque shows its leaderboard to people who are signed in.')}</p> : <Podium rows={rows} />}
          </section>

          <Seg value={period} onChange={setPeriod} options={[{ value: 'week', label: t('Week') }, { value: 'month', label: t('Month') }, { value: 'all', label: t('All time') }]} />
          <Seg value={grp} onChange={setGrp} options={[{ value: 'all', label: t('Everyone') }, ...GROUPS.map((g) => ({ value: g, label: showLabel(mosque.labels[g]) }))]} />

          {me && !isHome && (
            <button className="btn block" onClick={makeHome} disabled={act.busy}>{t('Make this my home mosque')}</button>
          )}

          <section className="card">
            <Eyebrow icon={<Users size={15} />}>{t('Leaderboard')}</Eyebrow>
            {rows.length > 3 ? (
              <>
                <RankList rows={showAll ? rows.slice(3) : rows.slice(3).filter((r, i) => i < 10 || mine.has(r.striverId))} mine={mine} />
                {!showAll && rows.length > 13 && <button className="btn ghost sm block" style={{ marginTop: 8 }} onClick={() => setShowAll(true)}>{t('Show all {length}', { length: rows.length })}</button>}
              </>
            ) : rows.length ? (
              <p className="muted small">{t('Everyone who has checked in is on the podium. Bring a friend to Fajr.')}</p>
            ) : (
              <Empty icon={<Sunrise size={24} />} title={t('No check-ins yet')}>{t('The first Fajr checked in here takes first place.')}</Empty>
            )}
            {rows.length > 0 && <p className="muted small" style={{ marginTop: 10 }}>{t('Ranked by days at Fajr, then longest streak, then earliest arrival.')}</p>}
          </section>

          {people.data && <AwardsCard awards={people.data.awards} week={people.data.week} />}

          <section className="card">
            <div className="between" style={{ marginBottom: 10 }}>
              <Eyebrow icon={<UsersRound size={15} />}>{t('Squads')}</Eyebrow>
              {isHome && <button className="btn soft sm" onClick={() => setSheet('squad')}>{squads.data?.mine ? t('My squad') : t('Join or start')}</button>}
            </div>
            {squads.data?.squads.length ? (
              <div className="list">
                {squads.data.squads.map((s, i) => (
                  <div key={s.id} className={`item${squads.data!.mine?.id === s.id ? ' me' : ''}`}>
                    <span className={`rank num${i < 3 ? ` top${i + 1}` : ''}`}>{i + 1}</span>
                    <span className="grow"><b>{s.name}</b><span className="sub" style={{ display: 'block' }}>{plural(s.members, 'member')}</span></span>
                    <span className="score num"><b>{s.perMember}</b><small>{t('days each')}</small></span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">{t('A squad is up to 10 friends who hold each other to Fajr. Squads are ranked by days per member over the last 30 days.')}</p>
            )}
          </section>

          {people.data && !people.data.hidden && <FamiliesCard families={people.data.families} month={people.data.familyOfMonth} />}
        </>
      )}

      {tab === 'life' && (
        <>
          <section className="hero">
            <Eyebrow icon={<Sunrise size={15} />}>{t('Fajr here')}</Eyebrow>
            <div className="between" style={{ marginTop: 10 }}>
              <div className="big num" style={{ fontSize: 44 }}>{timeIn(win.fajr, mosque.timezone)}</div>
              <div style={{ textAlign: 'end' }}>
                <div className="big num" style={{ fontSize: 44 }}>{page.data.todayCount}</div>
                <p className="muted small">{t('at Fajr today')}</p>
              </div>
            </div>
            <p className="muted small" style={{ marginTop: 10 }}>{t('Iqamah {iqamah} · check-in {from} to {to}', { iqamah: timeIn(win.iqamah, mosque.timezone), from: timeIn(win.opens, mosque.timezone), to: timeIn(win.closes, mosque.timezone) })}</p>
            {mosque.dailyGoal > 0 && <div className="meter" style={{ marginTop: 12 }}><i style={{ width: `${Math.min(100, (page.data.todayCount / mosque.dailyGoal) * 100)}%` }} /></div>}
            <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div><label>{t('Members')}</label><b className="num">{page.data.members}</b></div>
              <div><label>{t('First in today')}</label><b className="truncate" style={{ display: 'block', fontSize: 15 }}>{page.data.earlyBirds.length ? page.data.earlyBirds.map((e) => e.name.split(' ')[0]).join(', ') : '–'}</b></div>
            </div>
            {mosque.practice && <p className="muted small" style={{ marginTop: 10 }}>{t('practice mode is on')}</p>}
          </section>

          {page.data.matches.map((m) => <MatchCard key={m.id} match={m} home={mosque.id} />)}
          <PledgeList pledges={page.data.pledges} admin={role === 'admin'} onChange={page.reload} />
          <EventList events={page.data.events} signedIn={!!me} staff={!!role} onChange={page.reload} />

          {people.error ? <Problem error={people.error} retry={people.reload} /> : !people.data ? <Skeleton hero={false} /> : people.data.hidden ? (
            <div className="note">{t('This mosque shows its names to people who are signed in.')}</div>
          ) : (
            <>
              <FeedCard feed={people.data.feed} signedIn={!!me} onChange={(feed) => people.setData((d) => d && { ...d, feed })} />
              <HonourCard honour={people.data.honour} />
            </>
          )}
        </>
      )}

      {tab === 'prizes' && (
        <>
          {page.data.challenges.length > 0 || page.data.org ? (
            <section className="card tight">
              {page.data.challenges.map((c) => (
                <LinkRow key={c.id} to={`/challenge/${c.id}`} icon={<Trophy size={19} />} title={c.name}
                  sub={t('{from} to {to}', { from: niceDate(c.startDate), to: niceDate(c.endDate) })}
                  end={<span className={`pill${c.status === 'active' ? '' : ' grey'}`}>{c.status === 'active' ? t('On now') : c.status === 'upcoming' ? t('Soon') : t('Ended')}</span>} />
              ))}
              {page.data.org && <LinkRow to={`/org/${page.data.org.id}`} icon={<UsersRound size={19} />} title={page.data.org.name} sub={t('Organisation leaderboard')} />}
            </section>
          ) : (
            <section className="card">
              <Empty icon={<Trophy size={24} />} title={t('No challenge yet')}>{t('When this mosque announces a challenge, its dates and prizes appear here.')}</Empty>
            </section>
          )}

          <WishCard wishes={page.data.wishes} mosqueId={mosque.id} signedIn={!!me} admin={role === 'admin'} onChange={page.reload} />

          {page.data.thanks.length > 0 && (
            <div className="note thanks"><HandHeart size={18} /> <span>{tn(page.data.thanks.length, 'With thanks to our sponsor: {names}', 'With thanks to our sponsors: {names}', { names: page.data.thanks.join(', ') })}</span></div>
          )}

          <Link to={`/sponsor?mosque=${mosque.id}`} className="card row tap">
            <span className="icon gold"><HandHeart size={20} /></span>
            <span className="grow"><b style={{ display: 'block' }}>{t('Sponsor this mosque')}</b><span className="muted small">{t('Offer prizes or breakfast. The mosque contacts you.')}</span></span>
          </Link>
        </>
      )}

      {me && <button className="btn ghost sm" style={{ alignSelf: 'center' }} onClick={() => setSheet('report')}><Flag size={15} />{' '}{t('Report a problem')}</button>}

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
          <div className="note">{t('Share this code with friends at your mosque:')}{' '}<b style={{ letterSpacing: '0.12em' }}>{mine.code}</b></div>
          {act.error && <div className="note err">{act.error}</div>}
          <button className="btn danger block" disabled={act.busy} onClick={() => act.run(async () => { await api('/squads/leave', { method: 'POST' }); done(t('You left the squad')); })}>{t('Leave squad')}</button>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title={t('Squads')} onClose={onClose}>
      <div className="form">
        <Field label={t('Have a code?')}><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('6 letters and numbers')} maxLength={6} /></Field>
        <button className="btn block" disabled={act.busy || code.length < 6} onClick={() => act.run(async () => { await api('/squads/join', { body: { code } }); done(t('You joined the squad')); })}>{t('Join squad')}</button>
        <Field label={t('Or start a new squad')}><input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Dawn Patrol')} maxLength={40} /></Field>
        <button className="btn ghost block" disabled={act.busy || name.trim().length < 2} onClick={() => act.run(async () => { await api('/squads', { body: { name } }); done(t('Squad created')); })}>{t('Start squad')}</button>
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
    <Sheet title={t('Report a problem')} onClose={onClose}>
      <div className="form">
        <Field label={t('What is wrong?')} hint={t('For example a fake mosque, an offensive name, or cheating.')}>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
        {act.error && <div className="note err">{act.error}</div>}
        <button className="btn block" disabled={act.busy || reason.trim().length < 3}
          onClick={() => act.run(async () => { await api('/reports', { body: { targetType, targetId, reason } }); toast(t('Thank you. We will look into it.')); onClose(); })}>
          {t('Send report')}
        </button>
      </div>
    </Sheet>
  );
}
