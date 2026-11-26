// Classes, certificates, the embeddable leaderboard, and the sheets mosque staff use
// for events, shared targets and the embed code.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, ClipboardList, Copy, GraduationCap, Plus, Printer, Share2, Trash2, Trophy, Users } from 'lucide-react';
import { api, type Group, type Labels, type MosquePage as MosqueData, type Prize, type Standing } from '../api';
import { Eyebrow, Field, LinkRow, Loading, Podium, Problem, RankList, Screen, Seg, Sheet, useAction, useSession, useToast } from '../ui';
import { addDays, niceDate, plural, useLoad } from '../lib/util';

// ---------- classes ----------

interface ClassRow { id: string; name: string; members: number }

export function ClassesPage() {
  const { id } = useParams();
  const [name, setName] = useState('');
  const act = useAction();
  const { data, error, reload } = useLoad(() => api<{ classes: ClassRow[] }>(`/mosques/${id}/classes`), [id]);
  return (
    <Screen title="Classes" eyebrow="For madrasa teachers" back={`/manage/${id}`}>
      <p className="muted small">A class is a group of names from your attendance list with its own leaderboard. A teacher takes attendance for just their class.</p>
      <section className="card tight">
        {error ? <Problem error={error} retry={reload} /> : !data ? <Loading /> : data.classes.length ? (
          data.classes.map((k) => <LinkRow key={k.id} to={`/class/${k.id}`} icon={<GraduationCap size={19} />} title={k.name} sub={plural(k.members, 'member')} />)
        ) : (
          <div className="empty"><b>No classes yet</b>Name your first class below.</div>
        )}
      </section>
      <section className="card form">
        <Field label="New class"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Saturday madrasa, Year 5" /></Field>
        {act.error && <div className="note err">{act.error}</div>}
        <button className="btn block" disabled={act.busy || name.trim().length < 2}
          onClick={() => act.run(async () => { await api(`/mosques/${id}/classes`, { body: { name } }); setName(''); reload(); })}>
          <Plus size={18} /> Create class
        </button>
      </section>
    </Screen>
  );
}

interface ClassData {
  class: { id: string; name: string; mosqueId: string; mosqueName: string };
  rows: Standing[];
  members: { id: string; name: string }[];
  role: 'admin' | 'volunteer' | null;
  hidden: boolean;
}
interface RosterPerson { id: string; name: string; grp: Group; classId: string | null }

export function ClassPage() {
  const { id } = useParams();
  const { me } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const act = useAction();
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('month');
  const [sheet, setSheet] = useState(false);
  const { data, error, reload } = useLoad(() => api<ClassData>(`/classes/${id}?period=${period}`), [id, period]);
  const mine = useMemo(() => new Set(me?.strivers.map((s) => s.id) ?? []), [me]);
  if (error) return <Screen title="Class" back><Problem error={error} retry={reload} /></Screen>;
  if (!data) return <Screen title="Class" back><Loading /></Screen>;
  const k = data.class;
  return (
    <Screen title={k.name} eyebrow={k.mosqueName} back={data.role ? `/manage/${k.mosqueId}/classes` : `/m/${k.mosqueId}`}
      action={<button className="iconbtn" aria-label="Copy the link to this class" onClick={() => navigator.clipboard.writeText(location.href).then(() => toast('Link copied'))}><Share2 size={18} /></button>}>
      <section className="hero">
        <Eyebrow icon={<Trophy size={15} />}>Class podium</Eyebrow>
        {data.hidden ? <p className="muted" style={{ marginTop: 10 }}>Sign in to see this class.</p> : <Podium rows={data.rows} />}
      </section>
      <Seg value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'all', label: 'All time' }]} />
      {data.role && (
        <section className="card tight">
          <LinkRow to={`/manage/${k.mosqueId}/list?class=${k.id}`} icon={<ClipboardList size={19} />} title="Take attendance" sub={`${plural(data.members.length, 'child', 'children')} in this class`} />
          <button className="item" onClick={() => setSheet(true)}>
            <span className="icon"><Users size={19} /></span>
            <span className="grow"><b>Choose who is in the class</b><span className="sub" style={{ display: 'block' }}>From your attendance list</span></span>
          </button>
          {data.role === 'admin' && (
            <button className="item" style={{ color: 'var(--danger)' }}
              onClick={() => confirm('Delete this class? The children stay on your attendance list.') && act.run(async () => { await api(`/classes/${k.id}`, { method: 'DELETE' }); nav(`/manage/${k.mosqueId}/classes`, { replace: true }); })}>
              <span className="icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><Trash2 size={19} /></span>
              <span className="grow"><b>Delete class</b></span>
            </button>
          )}
        </section>
      )}
      <section className="card">
        <Eyebrow icon={<Users size={15} />}>Leaderboard</Eyebrow>
        {data.rows.length > 3 ? <RankList rows={data.rows} mine={mine} from={3} /> : (
          <p className="muted small">{data.rows.length ? 'Everyone who has checked in is on the podium.' : 'No one in this class has checked in during this period yet.'}</p>
        )}
      </section>
      {sheet && <ClassMembers classId={k.id} mosqueId={k.mosqueId} onClose={() => { setSheet(false); reload(); }} />}
    </Screen>
  );
}

function ClassMembers({ classId, mosqueId, onClose }: { classId: string; mosqueId: string; onClose: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const { data, setData } = useLoad(() => api<{ people: RosterPerson[] }>(`/mosques/${mosqueId}/roster`), [mosqueId]);
  const toggle = async (p: RosterPerson) => {
    const member = p.classId !== classId;
    setData((d) => d && { ...d, people: d.people.map((x) => (x.id === p.id ? { ...x, classId: member ? classId : null } : x)) });
    try {
      await api(`/classes/${classId}/members`, { body: { striverId: p.id, member } });
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const people = (data?.people ?? []).filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet title="Who is in this class?" onClose={onClose}>
      <div className="form">
        <label className="field"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name" aria-label="Search a name" /></label>
        {!data ? <Loading /> : (
          <div className="list">
            {people.map((p) => (
              <button key={p.id} className="item" aria-pressed={p.classId === classId} onClick={() => toggle(p)}>
                <span className={`check${p.classId === classId ? ' on' : ''}`}><Check size={16} /></span>
                <span className="grow"><b>{p.name}</b><span className="sub" style={{ display: 'block' }}>{p.grp[0].toUpperCase() + p.grp.slice(1)}{p.classId && p.classId !== classId ? ' · in another class' : ''}</span></span>
              </button>
            ))}
          </div>
        )}
        <button className="btn block" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}

// ---------- certificates ----------

interface ChallengeData {
  challenge: { id: string; name: string; startDate: string; endDate: string; scopeName: string; status: string };
  labels: Labels;
  prizes: Prize[];
  rows: Standing[];
  canEdit: boolean;
}
const ORDINAL = ['1st', '2nd', '3rd'];

export function CertificatesPage() {
  const { id } = useParams();
  const { me } = useSession();
  const [params] = useSearchParams();
  const { data, error, reload } = useLoad(() => api<ChallengeData>(`/challenges/${id}`), [id]);
  if (error) return <Screen title="Certificates" back><Problem error={error} retry={reload} /></Screen>;
  if (!data) return <Screen title="Certificates" back><Loading /></Screen>;
  const ch = data.challenge;
  const total = Math.round((Date.parse(ch.endDate) - Date.parse(ch.startDate)) / 86400000) + 1;
  // Place within the person's own group, which is how the prizes are given.
  const place = (r: Standing) => data.rows.filter((x) => x.grp === r.grp).findIndex((x) => x.striverId === r.striverId) + 1;
  const mine = new Set(me?.strivers.map((s) => s.id) ?? []);
  const all = params.get('all') === '1' && data.canEdit;
  const rows = data.rows.filter((r) => (all ? true : mine.has(r.striverId)));
  return (
    <Screen title="Certificates" eyebrow={ch.name} back={`/challenge/${ch.id}`}>
      <div className="no-print stack" style={{ paddingTop: 0 }}>
        <button className="btn" onClick={() => window.print()} disabled={!rows.length}><Printer size={18} /> Print {rows.length > 1 ? `${rows.length} certificates` : 'certificate'}</button>
        {data.canEdit && (
          <Link className="btn ghost" to={`/challenge/${ch.id}/certificates${all ? '' : '?all=1'}`}>{all ? 'Show only mine' : `One for everyone who took part (${data.rows.length})`}</Link>
        )}
        <p className="muted small">Each certificate prints on its own page. Choose “Save as PDF” in the print window to keep a copy.</p>
      </div>
      {rows.length ? rows.map((r) => {
        const p = place(r);
        return (
          <div className="cert" key={r.striverId}>
            <div className="c-kicker">Rijal al-Fajr · Certificate</div>
            <p style={{ marginTop: 14 }}>This certifies that</p>
            <div className="c-name">{r.name}</div>
            <p className="c-big">prayed Fajr at the mosque on <b>{r.days} of {total}</b> dawns in <b>{ch.name}</b>, with a best streak of {plural(r.bestStreak, 'day')}.</p>
            {p <= 3 && <div className="c-place">{ORDINAL[p - 1]} place · {data.labels[r.grp]}</div>}
            <p className="c-foot">{ch.scopeName} · {niceDate(ch.startDate, { day: 'numeric', month: 'long' })} to {niceDate(ch.endDate, { day: 'numeric', month: 'long', year: 'numeric' })}<br />May Allah accept it and keep you steadfast.</p>
          </div>
        );
      }) : (
        <div className="card empty"><b>No certificate yet</b>A certificate appears for everyone who checked in during this challenge.</div>
      )}
    </Screen>
  );
}

// ---------- embeddable leaderboard ----------

export function EmbedPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const period = params.get('period') === 'week' ? 'week' : 'month';
  const page = useLoad(() => api<MosqueData>(`/mosques/${id}`), [id]);
  const board = useLoad(() => api<{ rows: Standing[]; hidden: boolean }>(`/mosques/${id}/leaderboard?period=${period}`), [id, period]);
  if (page.error || board.error) return <div className="embed"><Problem error={(page.error ?? board.error)!} /></div>;
  if (!page.data || !board.data) return <div className="embed"><Loading /></div>;
  return (
    <div className="embed stack">
      <section className="hero">
        <div className="between">
          <Eyebrow icon={<Trophy size={15} />}>{page.data.mosque.name}</Eyebrow>
          <span className="muted small">{period === 'week' ? 'Last 7 days' : 'Last 30 days'}</span>
        </div>
        {board.data.hidden ? <p className="muted" style={{ marginTop: 10 }}>This mosque keeps its leaderboard for members.</p> : <Podium rows={board.data.rows} />}
      </section>
      {board.data.rows.length > 3 && <section className="card"><RankList rows={board.data.rows.slice(3, 10)} mine={new Set()} /></section>}
      <p className="muted small" style={{ textAlign: 'center' }}>
        {plural(page.data.todayCount, 'person', 'people')} at Fajr today · <a href={`/m/${id}`} target="_blank" rel="noreferrer">Rijal al-Fajr</a>
      </p>
    </div>
  );
}

// ---------- sheets for mosque staff ----------

export function EventSheet({ mosqueId, today, onClose, onSaved }: { mosqueId: string; today: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [date, setDate] = useState(addDays(today, 1));
  const act = useAction();
  return (
    <Sheet title="After Fajr" onClose={onClose}>
      <div className="form">
        <p className="muted small">Tell people what is on after the prayer. They tap to say they are staying, so you know how many to expect.</p>
        <Field label="What is on?"><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Breakfast and football" /></Field>
        <Field label="Details (optional)"><input value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={300} placeholder="e.g. In the hall, bring trainers" /></Field>
        <Field label="Which morning?"><input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} /></Field>
        {act.error && <div className="note err">{act.error}</div>}
        <button className="btn block" disabled={act.busy || title.trim().length < 2}
          onClick={() => act.run(async () => { await api(`/mosques/${mosqueId}/events`, { body: { title, detail, date } }); onSaved(); })}>Post</button>
      </div>
    </Sheet>
  );
}

export function PledgeSheet({ mosqueId, today, sponsor = '', onClose, onSaved }: { mosqueId: string; today: string; sponsor?: string; onClose: () => void; onSaved: () => void }) {
  const [reward, setReward] = useState('');
  const [target, setTarget] = useState(500);
  const [startDate, setStart] = useState(today);
  const [endDate, setEnd] = useState(addDays(today, 29));
  const [by, setBy] = useState(sponsor);
  const act = useAction();
  return (
    <Sheet title="Shared target" onClose={onClose}>
      <div className="form">
        <p className="muted small">A target the whole mosque reaches together. Every Fajr checked in here counts toward it.</p>
        <Field label="If we reach this many check-ins"><input type="number" inputMode="numeric" min={1} value={target} onChange={(e) => setTarget(Number(e.target.value))} /></Field>
        <div className="grid2">
          <Field label="From"><input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="To"><input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="Then"><input value={reward} onChange={(e) => setReward(e.target.value)} maxLength={120} placeholder="e.g. Breakfast for everyone" /></Field>
        <Field label="Promised by (optional)" hint="A sponsor who has agreed to this."><input value={by} onChange={(e) => setBy(e.target.value)} maxLength={80} placeholder="e.g. Baraka Bakery" /></Field>
        {act.error && <div className="note err">{act.error}</div>}
        <button className="btn block" disabled={act.busy || reward.trim().length < 2 || target < 1}
          onClick={() => act.run(async () => { await api(`/mosques/${mosqueId}/pledges`, { body: { reward, target, startDate, endDate, sponsor: by } }); onSaved(); })}>Set target</button>
      </div>
    </Sheet>
  );
}

export function EmbedSheet({ mosqueId, onClose }: { mosqueId: string; onClose: () => void }) {
  const toast = useToast();
  const link = `${location.origin}/m/${mosqueId}`;
  const code = `<iframe src="${location.origin}/embed/m/${mosqueId}" title="Fajr leaderboard" width="100%" height="620" style="border:0;max-width:520px"></iframe>`;
  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast(`${what} copied`), () => toast('Select the text and copy it'));
  return (
    <Sheet title="Share your leaderboard" onClose={onClose}>
      <div className="form">
        <Field label="Link to your public page" hint="Anyone can open it without an account. Names show as a first name and an initial."><pre className="snippet">{link}</pre></Field>
        <button className="btn block" onClick={() => copy(link, 'Link')}><Copy size={17} /> Copy link</button>
        <Field label="Code for your mosque's website" hint="Paste it into a page and the live podium appears there."><pre className="snippet">{code}</pre></Field>
        <button className="btn ghost block" onClick={() => copy(code, 'Code')}><Copy size={17} /> Copy code</button>
      </div>
    </Sheet>
  );
}

// ---------- what a congregation sees: events and shared targets ----------

export function EventList({ events, signedIn, staff, onChange }: { events: MosqueData['events']; signedIn: boolean; staff: boolean; onChange: () => void }) {
  const act = useAction();
  if (!events.length) return null;
  return (
    <section className="card">
      <Eyebrow icon={<Users size={15} />}>After Fajr</Eyebrow>
      <div className="list">
        {events.map((e) => (
          <div className="item" key={e.id} style={{ flexWrap: 'wrap' }}>
            <span className="grow">
              <b>{e.title}</b>
              <span className="sub" style={{ display: 'block' }}>{niceDate(e.date, { weekday: 'long', day: 'numeric', month: 'short' })}{e.detail ? ` · ${e.detail}` : ''} · {plural(e.going, 'person', 'people')} staying</span>
            </span>
            {signedIn && (
              <button className={`btn sm${e.mine ? '' : ' soft'}`} disabled={act.busy} aria-pressed={e.mine}
                onClick={() => act.run(async () => { await api(`/events/${e.id}/going`, { body: { going: !e.mine } }); onChange(); })}>
                {e.mine ? <><Check size={15} /> I'm staying</> : "I'll stay"}
              </button>
            )}
            {staff && (
              <button className="iconbtn" aria-label={`Remove ${e.title}`} onClick={() => confirm('Remove this?') && act.run(async () => { await api(`/events/${e.id}`, { method: 'DELETE' }); onChange(); })}><Trash2 size={16} /></button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function PledgeList({ pledges, admin, onChange }: { pledges: MosqueData['pledges']; admin: boolean; onChange: () => void }) {
  const act = useAction();
  if (!pledges.length) return null;
  return (
    <>
      {pledges.map((p) => {
        const done = p.progress >= p.target;
        return (
          <section className="card" key={p.id}>
            <div className="between">
              <Eyebrow icon={<Trophy size={15} />}>{done ? 'Target reached' : 'Together'}</Eyebrow>
              {admin && <button className="iconbtn" aria-label="Remove this target" onClick={() => confirm('Remove this target?') && act.run(async () => { await api(`/pledges/${p.id}`, { method: 'DELETE' }); onChange(); })}><Trash2 size={16} /></button>}
            </div>
            <h3 style={{ margin: '6px 0 2px' }}>{p.reward}</h3>
            <p className="muted small">
              {done ? 'Alhamdulillah, the mosque reached it.' : `When the mosque reaches ${p.target.toLocaleString()} check-ins by ${niceDate(p.endDate)}.`}
              {p.sponsor ? ` Promised by ${p.sponsor}.` : ''}
            </p>
            <div className="meter" style={{ margin: '12px 0 6px' }}><i style={{ width: `${Math.min(100, (p.progress / p.target) * 100)}%` }} /></div>
            <p className="small num"><b>{p.progress.toLocaleString()}</b> of {p.target.toLocaleString()}</p>
          </section>
        );
      })}
    </>
  );
}
