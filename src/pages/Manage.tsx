import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BarChart3, Check, ClipboardList, CalendarPlus, Download, GraduationCap, HandHeart, ImageDown, Share2, Target, Monitor, Plus, Printer, QrCode, ScanLine, Settings2, Sunrise, Trophy, UserPlus, WifiOff, X } from 'lucide-react';
import { api, ApiError, GROUPS, type Group, type MosquePage as MosqueData, type Standing, type Win } from '../api';
import { keepTick, pendingTicks, saveList, savedList, sendTicks } from '../lib/offline';
import { Eyebrow, Field, LinkRow, Loading, Problem, Qr, Scanner, Screen, Seg, Sheet, useAction, useToast } from '../ui';
import { addDays, niceDate, plural, timeIn, useLoad } from '../lib/util';
import { EmbedSheet, EventList, EventSheet, PledgeList, PledgeSheet } from './Community';
import { sharePoster } from '../lib/share';

interface StatsData { today: string; days: { date: string; count: number; byPhone: number }[]; members: number; visitors: number; flags: { fajr_date: string; n: number }[] }

export function ManagePage() {
  const { id } = useParams();
  const toast = useToast();
  const page = useLoad(() => api<MosqueData>(`/mosques/${id}`), [id]);
  const stats = useLoad(() => api<StatsData>(`/mosques/${id}/stats`), [id]);
  const [sheet, setSheet] = useState<'event' | 'pledge' | 'embed' | null>(null);
  if (page.error || stats.error) return <Screen title="Manage" back="/me"><Problem error={(page.error ?? stats.error)!} retry={() => { page.reload(); stats.reload(); }} /></Screen>;
  if (!page.data || !stats.data) return <Screen title="Manage" back="/me"><Loading /></Screen>;
  const { mosque, window: win } = page.data;
  const admin = page.data.role === 'admin';
  const max = Math.max(1, ...stats.data.days.map((d) => d.count));
  const avg = Math.round(stats.data.days.reduce((a, d) => a + d.count, 0) / 14);

  // An image of this week's podium and attendance, for the mosque's own Instagram.
  const poster = async () => {
    try {
      const board = await api<{ rows: Standing[] }>(`/mosques/${id}/leaderboard?period=week`);
      const week = stats.data!.days.slice(-7);
      const total = week.reduce((a, d) => a + d.count, 0);
      // A public image: first name and an initial.
      const short = (n: string) => { const w = n.trim().split(/\s+/); return w.length < 2 ? n : `${w[0]} ${w[w.length - 1][0]}.`; };
      await sharePoster({
        mosque: mosque.name,
        place: [mosque.city, mosque.country].filter(Boolean).join(', '),
        podium: board.rows.slice(0, 3).map((r) => ({ name: short(r.name), days: r.days })),
        total,
        average: Math.round(total / 7),
        best: Math.max(...week.map((d) => d.count)),
      });
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const exportCsv = async () => {
    try {
      const blob = await api<Blob>(`/mosques/${id}/export.csv`, { raw: true });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `fajr-attendance-${mosque.name.replace(/\W+/g, '-').toLowerCase()}.csv`;
      a.click();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <Screen title={mosque.name} eyebrow={admin ? 'Mosque admin' : 'Volunteer'} back="/me"
      action={admin && <Link className="iconbtn" to={`/manage/${id}/settings`} aria-label="Mosque settings"><Settings2 size={19} /></Link>}>
      <section className="hero">
        <Eyebrow icon={<Sunrise size={15} />}>{win.inWindow ? `Check-in open until ${timeIn(win.closes, mosque.timezone)}` : `Next Fajr ${timeIn(win.fajr, mosque.timezone)}`}</Eyebrow>
        <div className="big num" style={{ marginTop: 12 }}>{page.data.todayCount}<small>at Fajr today</small></div>
        {mosque.dailyGoal > 0 && <div className="meter" style={{ marginTop: 12 }}><i style={{ width: `${Math.min(100, (page.data.todayCount / mosque.dailyGoal) * 100)}%` }} /></div>}
        <div className="stats">
          <div><label>Members</label><b className="num">{stats.data.members}</b></div>
          <div><label>14-day average</label><b className="num">{avg}</b></div>
          <div><label>Visitors, 30 days</label><b className="num">{stats.data.visitors}</b></div>
        </div>
        <Link className="cta" to={`/manage/${id}/screen`}>
          <span><small>For a tablet or TV at the entrance</small><b>Open the mosque screen</b></span>
          <i><QrCode size={20} /></i>
        </Link>
      </section>

      {!mosque.verified && <div className="note">This mosque is waiting for approval. Check-in and your own leaderboard work now; it joins the world leaderboard once approved.</div>}
      {mosque.practice && <div className="note">Practice mode is on: check-in works at any time and from anywhere, and the mosque stays off the world leaderboard. Turn it off in settings before you launch.</div>}
      {stats.data.flags.map((f) => (
        <div className="note err" key={f.fajr_date}>On {niceDate(f.fajr_date)}, {f.n} different accounts checked in from one phone. Have a look at that day's list.</div>
      ))}

      <section className="card tight">
        <LinkRow to={`/manage/${id}/list`} icon={<ClipboardList size={19} />} title="Attendance list" sub="Tick children and anyone without a phone" />
        <LinkRow to={`/manage/${id}/print`} icon={<Printer size={19} />} title="Poster and member cards" sub="Print a QR poster, and a card for each child" />
        {admin && <LinkRow to={`/manage/${id}/sponsors`} icon={<HandHeart size={19} />} title="Sponsors" sub="People offering prizes, breakfast or funds" />}
        {admin && <LinkRow to={`/challenge/new?scope=mosque:${id}`} icon={<Trophy size={19} />} title="New challenge" sub="Set the dates and the prizes" />}
        <button className="item" onClick={exportCsv}>
          <span className="icon"><Download size={19} /></span>
          <span className="grow"><b>Export attendance</b><span className="sub" style={{ display: 'block' }}>A spreadsheet of the last 90 days</span></span>
        </button>
        <LinkRow to={`/m/${id}`} icon={<Monitor size={19} />} title="Public page" sub="What your congregation sees" />
      </section>

      <section className="card tight">
        <LinkRow to={`/manage/${id}/classes`} icon={<GraduationCap size={19} />} title="Classes" sub="A leaderboard and attendance for each class" />
        <button className="item" onClick={() => setSheet('event')}>
          <span className="icon"><CalendarPlus size={19} /></span>
          <span className="grow"><b>After Fajr</b><span className="sub" style={{ display: 'block' }}>Post breakfast, a halaqah or football</span></span>
        </button>
        {admin && (
          <button className="item" onClick={() => setSheet('pledge')}>
            <span className="icon"><Target size={19} /></span>
            <span className="grow"><b>Shared target</b><span className="sub" style={{ display: 'block' }}>A reward when the whole mosque reaches a number</span></span>
          </button>
        )}
        <button className="item" onClick={poster}>
          <span className="icon"><ImageDown size={19} /></span>
          <span className="grow"><b>Weekly poster</b><span className="sub" style={{ display: 'block' }}>This week's podium as an image to post</span></span>
        </button>
        <button className="item" onClick={() => setSheet('embed')}>
          <span className="icon"><Share2 size={19} /></span>
          <span className="grow"><b>Share your leaderboard</b><span className="sub" style={{ display: 'block' }}>A public link, and code for your website</span></span>
        </button>
      </section>

      <PledgeList pledges={page.data.pledges} admin={admin} onChange={page.reload} />
      <EventList events={page.data.events} signedIn={false} staff onChange={page.reload} />
      {sheet === 'event' && <EventSheet mosqueId={id!} today={win.today} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); page.reload(); toast('Posted'); }} />}
      {sheet === 'pledge' && <PledgeSheet mosqueId={id!} today={win.today} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); page.reload(); toast('Target set'); }} />}
      {sheet === 'embed' && <EmbedSheet mosqueId={id!} onClose={() => setSheet(null)} />}

      <section className="card">
        <div className="between" style={{ marginBottom: 12 }}>
          <Eyebrow icon={<BarChart3 size={15} />}>Last 14 days</Eyebrow>
          <span className="muted small">Peak {max}</span>
        </div>
        <div className="bars" role="img" aria-label={`Attendance for the last 14 days, peak ${max}`}>
          {stats.data.days.map((d) => (
            <div key={d.date} title={`${niceDate(d.date)}: ${d.count}`}>
              <span className="num">{d.count || ''}</span>
              <i style={{ height: `${(d.count / max) * 78}%` }} />
              <span>{Number(d.date.slice(8))}</span>
            </div>
          ))}
        </div>
      </section>

      {page.data.challenges.length > 0 && (
        <section className="card tight">
          {page.data.challenges.map((c) => (
            <LinkRow key={c.id} to={`/challenge/${c.id}`} icon={<Trophy size={19} />} title={c.name} sub={`${niceDate(c.startDate)} to ${niceDate(c.endDate)}`}
              end={<span className={`pill${c.status === 'active' ? '' : ' grey'}`}>{c.status === 'active' ? 'On now' : c.status === 'upcoming' ? 'Soon' : 'Ended'}</span>} />
          ))}
        </section>
      )}
    </Screen>
  );
}

// ---------- attendance list ----------

interface Person { id: string; name: string; grp: Group; managed: boolean; cardCode: string; present: boolean; here: boolean; method: string | null; classId: string | null; excused: boolean; member: boolean; queued?: boolean }
interface Roster { date: string; people: Person[]; offline?: boolean }

export function AttendancePage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const classId = params.get('class');
  const toast = useToast();
  const [back, setBack] = useState(0);
  const [today, setToday] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [grp, setGrp] = useState<Group | 'all'>('all');
  const [sheet, setSheet] = useState<'add' | 'scan' | null>(null);
  const [waiting, setWaiting] = useState(() => pendingTicks(id!).length);
  // Today's list is asked for without a date, so learning today's date does not fetch it a second time
  // (a second answer could arrive after a tick and undo it on screen).
  const date = back === 0 || !today ? undefined : addDays(today, -back);
  const classes = useLoad(() => (classId ? api<{ classes: { id: string; name: string }[] }>(`/mosques/${id}/classes`) : Promise.resolve({ classes: [] })), [id, classId]);

  // With no signal, fall back to the list as it was last loaded on this phone.
  const { data, error, reload, setData } = useLoad(async () => {
    const key = `${id}.${date ?? 'latest'}`;
    try {
      const r = await api<Roster>(`/mosques/${id}/roster${date ? `?date=${date}` : ''}`);
      saveList(key, r);
      saveList(`${id}.${r.date}`, r);
      return { ...r, offline: false };
    } catch (e) {
      const kept = e instanceof ApiError && e.code === 'offline' ? savedList<Roster>(key) : null;
      if (!kept) throw e;
      return { ...kept, offline: true };
    }
  }, [id, date]);
  useEffect(() => {
    if (data && !today) setToday(data.date);
  }, [data, today]);

  const sync = useCallback(async (quiet = false) => {
    if (!pendingTicks(id!).length) return;
    const r = await sendTicks(id!);
    setWaiting(r.left);
    if (r.sent) {
      toast(`${plural(r.sent, 'tick')} sent`);
      reload();
    } else if (!quiet && r.left) toast('Still no signal. Your ticks are safe on this phone.');
  }, [id, reload, toast]);
  useEffect(() => {
    sync(true);
    const again = () => sync(true);
    window.addEventListener('online', again);
    const timer = setInterval(again, 20000);
    return () => {
      window.removeEventListener('online', again);
      clearInterval(timer);
    };
  }, [sync]);

  // What is shown: the loaded list with any waiting ticks laid over it.
  const shown = useMemo(() => {
    if (!data) return [];
    const queued = pendingTicks(id!).filter((t) => t.date === data.date);
    return data.people.map((p) => {
      const t = queued.find((x) => x.striverId === p.id);
      return t ? { ...p, present: t.present, here: t.present, method: t.present ? 'list' : null, queued: true } : { ...p, queued: false };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, waiting, id]);

  const people = useMemo(() => {
    const t = q.trim().toLowerCase();
    return shown.filter((p) => (grp === 'all' || p.grp === grp) && (!classId || p.classId === classId) && (!t || p.name.toLowerCase().includes(t)));
  }, [shown, q, grp, classId]);

  const toggle = async (p: Person) => {
    if (p.present && !p.here) return toast(`${p.name} checked in at another mosque that day`);
    const present = !p.present;
    // Tick straight away; undo if the server says no.
    setData((d) => d && { ...d, people: d.people.map((x) => (x.id === p.id ? { ...x, present, here: present, method: present ? 'list' : null } : x)) });
    try {
      await api(`/mosques/${id}/mark`, { body: { striverId: p.id, date: data!.date, present } });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'offline') {
        keepTick({ mosqueId: id!, striverId: p.id, date: data!.date, present });
        setWaiting(pendingTicks(id!).length);
        if (!waiting) toast('No signal. Saved on this phone; it will send when the signal is back.');
        return;
      }
      toast((e as Error).message);
      reload();
    }
  };

  const excuse = async (p: Person) => {
    const excused = !p.excused;
    setData((d) => d && { ...d, people: d.people.map((x) => (x.id === p.id ? { ...x, excused } : x)) });
    try {
      await api(`/mosques/${id}/excuse`, { body: { striverId: p.id, date: data!.date, excused } });
      toast(excused ? `${p.name} is excused for this day. Their streak is safe.` : `${p.name} is no longer excused`);
    } catch (e) {
      toast((e as Error).message);
      reload();
    }
  };

  // Type a name: if it is not on the list yet, add it and mark it here in one tap.
  const typed = q.trim();
  const known = shown.some((p) => p.name.toLowerCase() === typed.toLowerCase());
  const quickAdd = async (g: Group) => {
    try {
      const r = await api<{ id: string }>(`/mosques/${id}/roster`, { body: { name: typed, grp: g } });
      await api(`/mosques/${id}/mark`, { body: { striverId: r.id, date: data!.date } });
      if (classId) await api(`/classes/${classId}/members`, { body: { striverId: r.id, member: true } });
      toast(`${typed} is added and marked here`);
      setQ('');
      reload();
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'offline' ? 'Adding a new name needs a signal. Ticking names works without one.' : (e as Error).message);
    }
  };

  const count = people.filter((p) => p.here).length;
  const className = classes.data?.classes.find((k) => k.id === classId)?.name;
  return (
    <Screen title={className ?? 'Attendance list'} eyebrow={data ? niceDate(data.date, { weekday: 'long', day: 'numeric', month: 'long' }) : ''} back={classId ? `/class/${classId}` : `/manage/${id}`}
      action={<button className="iconbtn" aria-label="Scan a member card" onClick={() => setSheet('scan')}><ScanLine size={19} /></button>}>
      <Seg value={String(back)} onChange={(v) => setBack(Number(v))} options={[{ value: '0', label: 'Today' }, { value: '1', label: 'Yesterday' }, { value: '2', label: '2 days ago' }]} />
      {(waiting > 0 || data?.offline) && (
        <div className="note between">
          <span className="row"><WifiOff size={18} /> <span>{waiting > 0 ? `${plural(waiting, 'tick')} saved on this phone, waiting for a signal.` : 'No signal. Showing the list saved on this phone.'}</span></span>
          <button className="btn soft sm" onClick={() => (waiting ? sync() : reload())}>Try now</button>
        </div>
      )}
      <div className="row">
        <label className="field grow"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name" aria-label="Type a name" /></label>
        <button className="btn soft" onClick={() => setSheet('add')}><UserPlus size={18} /> Add</button>
      </div>
      {classId
        ? <div className="between small"><span className="pill">Class: {className ?? '…'}</span><button className="btn ghost sm" onClick={() => setParams({})}>Show everyone</button></div>
        : <Seg value={grp} onChange={setGrp} options={[{ value: 'all', label: 'Everyone' }, ...GROUPS.map((g) => ({ value: g, label: g[0].toUpperCase() + g.slice(1) }))]} />}
      {data && typed.length >= 2 && !known && people.length === 0 && (
        <div className="note">
          <b>“{typed}”</b> is not on the list. Add and mark here as:
          <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            {GROUPS.map((g) => <button key={g} className="btn sm" onClick={() => quickAdd(g)}>{g[0].toUpperCase() + g.slice(1)}</button>)}
          </div>
        </div>
      )}
      <section className="card">
        <div className="between" style={{ marginBottom: 6 }}>
          <Eyebrow icon={<ClipboardList size={15} />}>{plural(count, 'person', 'people')} here</Eyebrow>
          <span className="muted small">{data ? `${people.length} on the list` : ''}</span>
        </div>
        {error ? <Problem error={error} retry={reload} /> : !data ? <Loading /> : people.length ? (
          <div className="list">
            {people.map((p) => (
              <div key={p.id} className="item">
                <button className="rowbtn" onClick={() => toggle(p)} aria-pressed={p.present}>
                  <span className={`check${p.present ? ' on' : ''}`}><Check size={16} /></span>
                  <span className="grow">
                    <b>{p.name}</b>
                    <span className="sub" style={{ display: 'block' }}>
                      {p.grp[0].toUpperCase() + p.grp.slice(1)}
                      {p.present && (p.here ? ` · ${p.queued ? 'waiting to send' : p.method === 'list' ? 'ticked here' : p.method === 'card' ? 'card scanned' : 'checked in by phone'}` : ' · at another mosque')}
                      {!p.present && p.excused && ' · excused'}
                    </span>
                  </span>
                </button>
                {!p.present && p.member && (
                  <button className={`btn sm ${p.excused ? 'soft' : 'ghost'}`} aria-pressed={p.excused} onClick={() => excuse(p)}>{p.excused ? 'Excused' : 'Excuse'}</button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty"><b>{shown.length ? 'No one matches' : 'The list is empty'}</b>Add children and anyone without a phone. People with the app appear here once this is their home mosque.</div>
        )}
      </section>
      {data && typed.length >= 2 && !known && people.length > 0 && (
        <p className="muted small">
          Someone else? Add “{typed}” and mark here as{' '}
          {GROUPS.map((g, i) => <span key={g}>{i > 0 && ', '}<button className="btn soft sm" onClick={() => quickAdd(g)}>{g[0].toUpperCase() + g.slice(1)}</button></span>)}
        </p>
      )}
      <p className="muted small">Excuse a member for illness or travel and the day does not break their streak. It does not count as a day attended.</p>
      {sheet === 'add' && <AddPerson mosqueId={id!} onClose={() => setSheet(null)} onAdded={() => { setSheet(null); reload(); }} />}
      {sheet === 'scan' && <CardScan mosqueId={id!} date={data?.date} onClose={() => { setSheet(null); reload(); }} />}
    </Screen>
  );
}

function AddPerson({ mosqueId, onClose, onAdded }: { mosqueId: string; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [grp, setGrp] = useState<Group>('kids');
  const [markNow, setMarkNow] = useState(true);
  const act = useAction();
  return (
    <Sheet title="Add to the list" onClose={onClose}>
      <div className="form">
        <Field label="Name" hint="Only a name and a group. No account is needed."><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus /></Field>
        <Field label="Group"><select value={grp} onChange={(e) => setGrp(e.target.value as Group)}>{GROUPS.map((g) => <option key={g} value={g}>{g[0].toUpperCase() + g.slice(1)}</option>)}</select></Field>
        <label className="row small"><input type="checkbox" checked={markNow} onChange={(e) => setMarkNow(e.target.checked)} /> Mark as here today</label>
        {act.error && <div className="note err">{act.error}</div>}
        <button className="btn block" disabled={act.busy || !name.trim()}
          onClick={() => act.run(async () => {
            const r = await api<{ id: string }>(`/mosques/${mosqueId}/roster`, { body: { name, grp } });
            if (markNow) await api(`/mosques/${mosqueId}/mark`, { body: { striverId: r.id } });
            onAdded();
          })}>
          Add
        </button>
      </div>
    </Sheet>
  );
}

function CardScan({ mosqueId, date, onClose }: { mosqueId: string; date?: string; onClose: () => void }) {
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([]);
  const onCode = async (text: string) => {
    try {
      const r = await api<{ striver: { name: string }; fresh: boolean }>(`/mosques/${mosqueId}/mark`, { body: { cardCode: text, date } });
      setLog((l) => [{ ok: true, text: r.fresh ? `${r.striver.name} is checked in` : `${r.striver.name} was already checked in` }, ...l].slice(0, 5));
    } catch (e) {
      setLog((l) => [{ ok: false, text: (e as Error).message }, ...l].slice(0, 5));
    }
  };
  return (
    <Sheet title="Scan member cards" onClose={onClose}>
      <div className="form">
        <Scanner onCode={onCode} />
        {log.length ? log.map((l, i) => <div key={i} className={`note${l.ok ? '' : ' err'}`} role="status">{l.text}</div>) : <p className="muted small">Hold each card in front of the camera. One after another works.</p>}
        <button className="btn ghost block" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}

// ---------- mosque screen ----------

interface ScreenData {
  mosque: { id: string; name: string; city: string; dailyGoal: number; practice: boolean };
  window: Win;
  code: string;
  posterCode: string;
  refreshInSec: number;
  todayCount: number;
  recent: { name: string; at: string }[];
  top: Standing[];
}

export function ScreenPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<ScreenData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const d = await api<ScreenData>(`/mosques/${id}/screen`);
        if (!live) return;
        setData(d);
        setError(null);
        // Fetch again just after the code rolls over, and at least every 5 seconds for the live count.
        timer = setTimeout(load, Math.min(5, d.refreshInSec + 0.3) * 1000);
      } catch (e) {
        if (!live) return;
        setError((e as Error).message);
        timer = setTimeout(load, 5000);
      }
    };
    load();
    // Keep a tablet from going to sleep while it shows the code.
    let lock: { release: () => void } | undefined;
    (navigator as any).wakeLock?.request('screen').then((l: { release: () => void }) => (lock = l)).catch(() => {});
    return () => {
      live = false;
      clearTimeout(timer);
      lock?.release();
    };
  }, [id]);

  if (!data) return <div className="kiosk" style={{ gridTemplateColumns: '1fr' }}>{error ? <p>{error}</p> : <Loading />}</div>;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className="kiosk">
      <button className="iconbtn close" onClick={() => nav(`/manage/${id}`)} aria-label="Close the screen"><X size={20} /></button>
      <div>
        {data.window.open ? (
          <div className="qrbox"><Qr text={`${location.origin}/c/${data.code}`} size={900} alt="Check-in QR code" /></div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <Sunrise size={64} />
            <h1 style={{ marginTop: 16 }}>Check-in opens at {timeIn(data.window.opens, tz)}</h1>
            <p className="k-muted">Fajr {timeIn(data.window.fajr, tz)} · {niceDate(data.window.date, { weekday: 'long' })}</p>
          </div>
        )}
      </div>
      <div>
        <p className="k-muted" style={{ fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{data.mosque.name}</p>
        <h1>{data.window.open ? 'Scan to check in for Fajr' : 'Rijal al-Fajr'}</h1>
        <p className="k-muted" style={{ marginTop: 8 }}>
          {data.window.open ? 'Open your phone camera and point it here. The code changes every 30 seconds.' : 'See you at dawn, in sha Allah.'}
        </p>
        <div className="count num" style={{ marginTop: '3vw' }}>{data.todayCount}</div>
        <p className="k-muted">{data.mosque.dailyGoal > 0 ? `of ${data.mosque.dailyGoal} at Fajr today` : 'at Fajr today'}</p>
        {data.recent.length > 0 && (
          <div className="k-list">
            {data.recent.slice(0, 4).map((r, i) => <div key={i} className="row"><Check size={20} color="#a8f0cf" /> {r.name}</div>)}
          </div>
        )}
        {error && <p className="k-muted" style={{ marginTop: 16 }}>Reconnecting.</p>}
      </div>
    </div>
  );
}

// ---------- print ----------

export function PrintPage() {
  const { id } = useParams();
  const [tab, setTab] = useState<'poster' | 'cards'>('poster');
  const screen = useLoad(() => api<ScreenData>(`/mosques/${id}/screen`), [id]);
  const roster = useLoad(() => api<Roster>(`/mosques/${id}/roster`), [id]);
  if (screen.error) return <Screen title="Print" back={`/manage/${id}`}><Problem error={screen.error} retry={screen.reload} /></Screen>;
  if (!screen.data) return <Screen title="Print" back={`/manage/${id}`}><Loading /></Screen>;
  const cards = roster.data?.people.filter((p) => p.managed) ?? [];
  return (
    <Screen title="Print" back={`/manage/${id}`}>
      <div className="no-print stack" style={{ paddingTop: 0 }}>
        <Seg value={tab} onChange={setTab} options={[{ value: 'poster', label: 'QR poster' }, { value: 'cards', label: `Member cards (${cards.length})` }]} />
        <button className="btn" onClick={() => window.print()}><Printer size={18} /> Print</button>
        <p className="muted small">
          {tab === 'poster'
            ? 'The poster code never changes, so it only works when the phone is at the mosque. Put it at the entrance. For the strongest check, use the mosque screen instead.'
            : 'One card for each person you added to the list. A volunteer scans the card from the attendance list.'}
        </p>
      </div>
      {tab === 'poster' ? (
        <div className="sheet-print">
          <p style={{ fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0a7a57', fontSize: 13 }}>Rijal al-Fajr</p>
          <h1 style={{ fontSize: 30, fontWeight: 750, margin: '6px 0 4px' }}>Check in for Fajr</h1>
          <p style={{ color: '#45524c', marginBottom: 16 }}>{screen.data.mosque.name}</p>
          <Qr text={`${location.origin}/c/${screen.data.posterCode}`} size={640} alt="Check-in poster QR code" />
          <p style={{ margin: '16px auto 0', maxWidth: 380, color: '#45524c' }}>Open your phone camera and point it at this code after you arrive for Fajr. It works from shortly before the adhan until sunrise.</p>
        </div>
      ) : cards.length ? (
        <div className="cards">
          {cards.map((p) => (
            <div className="pcard" key={p.id}>
              <Qr text={`${location.origin}/k/${p.cardCode}`} size={300} alt={`Card for ${p.name}`} />
              <b style={{ display: 'block', fontSize: 15 }}>{p.name}</b>
              <span style={{ fontSize: 12, color: '#647069' }}>{screen.data!.mosque.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="card empty"><b>No cards yet</b>Add children to the attendance list and their cards appear here.
          <div><Link className="btn" to={`/manage/${id}/list`}><Plus size={17} /> Open the list</Link></div>
        </div>
      )}
    </Screen>
  );
}
