import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Award, Gift, HandHeart, Pencil, Plus, ScrollText, Trash2, Trophy, Users } from 'lucide-react';
import { api, DEFAULT_LABELS, GROUPS, type Group, type Labels, type Prize, type Standing } from '../api';
import { Eyebrow, Field, Loading, Podium, Problem, RankList, Screen, Seg, Skeleton, Switch, useAction, useSession } from '../ui';
import { addDays, niceDate, plural, useLoad, showLabel, showName } from '../lib/util';
import { t, tn } from '../lib/i18n';

interface ChallengeData {
  challenge: {
    id: string; name: string; startDate: string; endDate: string; countAway: boolean; rules: string;
    scopeType: 'mosque' | 'org'; scopeId: string; scopeName: string; status: 'upcoming' | 'active' | 'ended';
  };
  labels: Labels;
  today: string;
  prizes: Prize[];
  rows: Standing[];
  hidden?: boolean;
  thanks?: { name: string; gift: string }[];
  canEdit: boolean;
}

const dayCount = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
const ORDINAL = [t('1st'), t('2nd'), t('3rd')];

export function ChallengePage() {
  const { id } = useParams();
  const { me } = useSession();
  const [grp, setGrp] = useState<Group | 'all'>('all');
  const { data, error, reload } = useLoad(() => api<ChallengeData>(`/challenges/${id}`), [id]);
  const mine = useMemo(() => new Set(me?.strivers.map((s) => s.id) ?? []), [me]);
  // Open on a group that has podium prizes when there are none for everyone.
  useEffect(() => {
    const podium = data?.prizes.filter((p) => p.place !== null) ?? [];
    if (podium.length && !podium.some((p) => p.grp === 'all')) setGrp(GROUPS.find((g) => podium.some((p) => p.grp === g)) ?? 'all');
  }, [data]);
  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    return grp === 'all' ? all : all.filter((r) => r.grp === grp).map((r, i) => ({ ...r, rank: i + 1 }));
  }, [data, grp]);

  if (error) return <Screen title={t('Challenge')} back><Problem error={error} retry={reload} /></Screen>;
  if (!data) return <Screen title={t('Challenge')} back><Skeleton /></Screen>;
  const ch = data.challenge;
  const total = dayCount(ch.startDate, ch.endDate);
  const day = Math.min(total, Math.max(0, dayCount(ch.startDate, data.today)));
  // A prize set for one group wins over a prize set for everyone.
  const placePrize = (place: number) =>
    (data.prizes.find((p) => p.place === place && p.grp === grp) ?? data.prizes.find((p) => p.place === place && p.grp === 'all'))?.title;
  const milestones = data.prizes.filter((p) => p.milestoneDays !== null && (p.grp === 'all' || grp === 'all' || p.grp === grp));
  const label = (g: Group | 'all') => (g === 'all' ? t('Everyone') : showLabel(data.labels[g]));
  const back = ch.scopeType === 'mosque' ? `/m/${ch.scopeId}` : `/org/${ch.scopeId}`;

  return (
    <Screen title={ch.name} eyebrow={ch.scopeName} back={back}
      action={data.canEdit && <Link className="iconbtn" to={`/challenge/${ch.id}/edit`} aria-label={t('Edit challenge')}><Pencil size={18} /></Link>}>
      <section className="hero">
        <div className="between">
          <Eyebrow icon={<Trophy size={15} />}>{ch.status === 'ended' ? t('Final podium') : ch.status === 'upcoming' ? t('Starts soon') : t('Day {day} of {total}', { day: day, total: total })}</Eyebrow>
          <span className="muted small">{t('{from} to {to}', { from: niceDate(ch.startDate), to: niceDate(ch.endDate) })}</span>
        </div>
        {ch.status === 'upcoming' ? (
          <p className="muted" style={{ marginTop: 14 }}>{t('Starts on {date}. Every Fajr at the mosque from then on counts.', { date: niceDate(ch.startDate, { weekday: 'long', day: 'numeric', month: 'long' }) })}</p>
        ) : (
          <>
            <Podium rows={rows} prizes={[placePrize(1), placePrize(2), placePrize(3)]} />
            {ch.status === 'active' && <div className="meter" style={{ marginTop: 14 }}><i style={{ width: `${(day / total) * 100}%` }} /></div>}
          </>
        )}
      </section>

      <Seg value={grp} onChange={setGrp} options={[{ value: 'all', label: t('Everyone') }, ...GROUPS.map((g) => ({ value: g, label: showLabel(data.labels[g]) }))]} />

      {data.prizes.length > 0 && (
        <section className="card">
          <Eyebrow icon={<Gift size={15} />}>{t('Prizes')}</Eyebrow>
          <div className="list">
            {data.prizes.filter((p) => p.place !== null && (grp === 'all' || p.grp === 'all' || p.grp === grp)).map((p, i) => (
              <div className="item" key={`p${i}`}>
                <span className="pill gold">{ORDINAL[p.place! - 1]}</span>
                <span className="grow"><b>{p.title}</b><span className="sub" style={{ display: 'block' }}>{[label(p.grp), p.detail, p.sponsor && t('Given by {sponsor}', { sponsor: p.sponsor })].filter(Boolean).join(' · ')}</span></span>
              </div>
            ))}
            {milestones.map((p, i) => {
              const reached = rows.filter((r) => r.days >= p.milestoneDays! && (p.grp === 'all' || r.grp === p.grp)).length;
              return (
                <div className="item" key={`m${i}`}>
                  <span className="pill">{t('{milestoneDays} days', { milestoneDays: p.milestoneDays })}</span>
                  <span className="grow"><b>{p.title}</b><span className="sub" style={{ display: 'block' }}>{[label(p.grp), p.detail, p.sponsor && t('Given by {sponsor}', { sponsor: p.sponsor })].filter(Boolean).join(' · ')}</span></span>
                  <span className="sub num">{t('{reached} reached', { reached: reached })}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!!data.thanks?.length && (
        <section className="card">
          <Eyebrow icon={<HandHeart size={15} />}>{t('With thanks to')}</Eyebrow>
          <div className="list">
            {data.thanks.map((x, i) => (
              <div className="item" key={i}>
                <span className="icon gold"><Gift size={18} /></span>
                <span className="grow"><b>{x.name}</b><span className="sub" style={{ display: 'block' }}>{x.gift}</span></span>
              </div>
            ))}
          </div>
        </section>
      )}

      {ch.status === 'ended' && !data.hidden && data.rows.length > 0 && (
        <section className="card">
          <Eyebrow icon={<Award size={15} />}>{t('Winners')}</Eyebrow>
          <div className="list">
            {GROUPS.filter((g) => data.rows.some((r) => r.grp === g)).map((g) => (
              <div className="item" key={g}>
                <span className="grow">
                  <b>{showLabel(data.labels[g])}</b>
                  <span className="sub" style={{ display: 'block' }}>
                    {data.rows.filter((r) => r.grp === g).slice(0, 3).map((r, i) => `${ORDINAL[i]} ${showName(r.name)} (${r.days})`).join(' · ')}
                  </span>
                </span>
              </div>
            ))}
          </div>
          {me && <Link className="btn block" style={{ marginTop: 12 }} to={`/challenge/${ch.id}/certificates`}><Award size={18} /> {data.canEdit ? t('Print certificates') : t('My certificate')}</Link>}
        </section>
      )}

      {data.hidden && <div className="note">{t('This mosque shows its standings to people who are signed in.')}</div>}

      {ch.status !== 'upcoming' && !data.hidden && (
        <section className="card">
          <Eyebrow icon={<Users size={15} />}>{t('Standings')}</Eyebrow>
          {rows.length > 3 ? <RankList rows={rows} mine={mine} from={3} /> : <p className="muted small">{rows.length ? t('Everyone taking part is on the podium so far.') : t('No one has checked in during this challenge yet.')}</p>}
        </section>
      )}

      <section className="card">
        <Eyebrow icon={<ScrollText size={15} />}>{t('Rules')}</Eyebrow>
        <p className="small">{[t('One Fajr a day, checked in at the mosque.'), ch.countAway ? t('Fajr at any registered mosque counts, so you keep your place when you travel.') : ch.scopeType === 'mosque' ? t('Only Fajr prayed at {mosque} counts.', { mosque: ch.scopeName }) : t('Only Fajr prayed at the organisation’s mosques counts.'), t('Ranking is by days attended, then longest streak, then earliest arrival.')].join(' ')}</p>
        {ch.rules && <p className="small" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{ch.rules}</p>}
        <p className="muted small" style={{ marginTop: 10 }}>{t('Prizes are offered and handed out by {scopeName}, not by Rijal al-Fajr. Apple and Google are not sponsors and are not involved in any way.', { scopeName: ch.scopeName })}</p>
      </section>
    </Screen>
  );
}

type Draft = Omit<Prize, 'place' | 'milestoneDays'> & { kind: 'place' | 'days'; place: number; milestoneDays: number };

export function ChallengeEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const act = useAction();
  const today = new Date().toISOString().slice(0, 10);
  const [scope, setScope] = useState<{ type: string; id: string } | null>(() => {
    const [type, sid] = (params.get('scope') ?? '').split(':');
    return type && sid ? { type, id: sid } : null;
  });
  const [labels, setLabels] = useState<Labels>(DEFAULT_LABELS);
  const [name, setName] = useState(t('40 Days of Fajr'));
  const [startDate, setStart] = useState(addDays(today, 1));
  const [endDate, setEnd] = useState(addDays(today, 40));
  const [countAway, setCountAway] = useState(true);
  const [rules, setRules] = useState('');
  const [prizes, setPrizes] = useState<Draft[]>([]);
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    if (!id) return;
    api<ChallengeData>(`/challenges/${id}`).then((d) => {
      const c = d.challenge;
      setScope({ type: c.scopeType, id: c.scopeId });
      setLabels(d.labels);
      setName(c.name); setStart(c.startDate); setEnd(c.endDate); setCountAway(c.countAway); setRules(c.rules);
      setPrizes(d.prizes.map((p) => ({ ...p, kind: p.place !== null ? 'place' : 'days', place: p.place ?? 1, milestoneDays: p.milestoneDays ?? 40 })));
      setLoaded(true);
    }, (e) => act.setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const blank = (over: Partial<Draft>): Draft => ({ kind: 'place', grp: 'all', place: 1, milestoneDays: 40, title: '', detail: '', sponsor: '', ...over });
  const edit = (i: number, patch: Partial<Draft>) => setPrizes((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const save = () =>
    act.run(async () => {
      const body = {
        scopeType: scope!.type, scopeId: scope!.id, name, startDate, endDate, countAway, rules,
        prizes: prizes.filter((p) => p.title.trim()).map((p) => ({
          grp: p.grp, title: p.title, detail: p.detail, sponsor: p.sponsor,
          place: p.kind === 'place' ? p.place : null, milestoneDays: p.kind === 'days' ? p.milestoneDays : null,
        })),
      };
      const r = id ? (await api(`/challenges/${id}`, { method: 'PUT', body }), { id }) : await api<{ id: string }>('/challenges', { body });
      nav(`/challenge/${r.id}`, { replace: true });
    });

  if (!scope && !id) return <Screen title={t('New challenge')} back><div className="note err">{t('Open this from a mosque or organisation you manage.')}</div></Screen>;
  if (!loaded) return <Screen title={t('Challenge')} back>{act.error ? <div className="note err">{act.error}</div> : <Loading />}</Screen>;

  return (
    <Screen title={id ? t('Edit challenge') : t('New challenge')} back>
      <section className="card form">
        <Field label={t('Name')}><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
        <div className="grid2">
          <Field label={t('First day')}><input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label={t('Last day')}><input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        {endDate >= startDate && <p className="muted small">{tn(dayCount(startDate, endDate), '{n} day of Fajr.', '{n} days of Fajr.')}</p>}
        <Switch label={t('Count Fajr at other mosques')} hint={t('People keep their place when they travel.')} checked={countAway} onChange={setCountAway} />
        <Field label={t('Extra rules (optional)')} hint={t('For example who can take part and when prizes are handed out.')}><textarea value={rules} onChange={(e) => setRules(e.target.value)} maxLength={2000} /></Field>
      </section>

      <section className="card form">
        <div className="between">
          <Eyebrow icon={<Gift size={15} />}>{t('Prizes')}</Eyebrow>
          {prizes.length === 0 && (
            <button className="btn soft sm" onClick={() => setPrizes([1, 2, 3].map((place) => blank({ place })))}>{t('Add 1st, 2nd, 3rd')}</button>
          )}
        </div>
        {prizes.map((p, i) => (
          <div key={i} className="form" style={{ paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <div className="grid2">
              <Field label={t('Prize for')}>
                <select value={p.kind === 'place' ? `p${p.place}` : 'days'}
                  onChange={(e) => (e.target.value === 'days' ? edit(i, { kind: 'days' }) : edit(i, { kind: 'place', place: Number(e.target.value.slice(1)) }))}>
                  <option value="p1">{t('1st place')}</option><option value="p2">{t('2nd place')}</option><option value="p3">{t('3rd place')}</option><option value="days">{t('Reaching a number of days')}</option>
                </select>
              </Field>
              <Field label={t('Group')}>
                <select value={p.grp} onChange={(e) => edit(i, { grp: e.target.value as Draft['grp'] })}>
                  <option value="all">{t('Everyone')}</option>{GROUPS.map((g) => <option key={g} value={g}>{labels[g]}</option>)}
                </select>
              </Field>
            </div>
            {p.kind === 'days' && <Field label={t('Days needed')}><input type="number" min={1} max={366} value={p.milestoneDays} onChange={(e) => edit(i, { milestoneDays: Number(e.target.value) })} /></Field>}
            <Field label={t('Prize')}><input value={p.title} onChange={(e) => edit(i, { title: e.target.value })} maxLength={80} placeholder={t('e.g. Bicycle')} /></Field>
            <div className="grid2">
              <Field label={t('Given by (optional)')}><input value={p.sponsor} onChange={(e) => edit(i, { sponsor: e.target.value })} maxLength={80} placeholder={t('e.g. Baraka Bakery')} /></Field>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn danger block" onClick={() => setPrizes((ps) => ps.filter((_, j) => j !== i))}><Trash2 size={16} />{' '}{t('Remove')}</button></div>
            </div>
          </div>
        ))}
        <button className="btn ghost" onClick={() => setPrizes((ps) => [...ps, blank({ kind: ps.length ? 'days' : 'place' })])}><Plus size={17} />{' '}{t('Add a prize')}</button>
      </section>

      {act.error && <div className="note err" role="alert">{act.error}</div>}
      <button className="btn block" disabled={act.busy || name.trim().length < 2} onClick={save}>{id ? t('Save changes') : t('Create challenge')}</button>
      {id && (
        <button className="btn danger block" disabled={act.busy}
          onClick={() => confirm(t('Delete this challenge and its prizes?')) && act.run(async () => { await api(`/challenges/${id}`, { method: 'DELETE' }); nav(scope!.type === 'mosque' ? `/manage/${scope!.id}` : `/org/${scope!.id}`, { replace: true }); })}>
          {t('Delete challenge')}
        </button>
      )}
    </Screen>
  );
}
