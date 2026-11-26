import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LocateFixed, MapPin, ShieldCheck, Timer, Trash2, UsersRound } from 'lucide-react';
import { api, DEFAULT_LABELS, GROUPS, type Labels, type MosquePage as MosqueData } from '../api';
import { Eyebrow, Field, Loading, Screen, Switch, useAction, useSession, useToast } from '../ui';
import { getPosition, useLoad, groupName } from '../lib/util';
import { COUNTRIES } from '../lib/countries';
import { t, tx } from '../lib/i18n';

const METHODS: [string, string][] = [
  ['MuslimWorldLeague', t('Muslim World League')],
  ['NorthAmerica', t('ISNA (North America)')],
  ['Egyptian', t('Egyptian General Authority')],
  ['UmmAlQura', t('Umm al-Qura (Makkah)')],
  ['Karachi', t('University of Islamic Sciences, Karachi')],
  ['Dubai', t('Dubai')],
  ['Qatar', t('Qatar')],
  ['Kuwait', t('Kuwait')],
  ['Singapore', t('Singapore, Malaysia, Indonesia')],
  ['Turkey', t('Diyanet (Türkiye)')],
  ['Tehran', t('Tehran')],
  ['MoonsightingCommittee', t('Moonsighting Committee')],
];

export function MosqueSettings() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { reload: reloadMe } = useSession();
  const act = useAction();
  const [loaded, setLoaded] = useState(!id);
  const [f, setF] = useState({
    name: '', city: '', country: '', lat: '', lng: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    calcMethod: 'MuslimWorldLeague', openBeforeMin: 30, iqamahAfterMin: 20, closeAfterSunriseMin: 0, radiusM: 200, dailyGoal: 0, practice: false,
    labels: DEFAULT_LABELS as Labels,
    fajrTime: null as string | null, iqamahTime: null as string | null, publicBoard: true,
  });
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!id) return;
    api<MosqueData>(`/mosques/${id}`).then((d) => {
      const m = d.mosque;
      setF({ ...m, lat: String(m.lat), lng: String(m.lng) });
      setOrg(d.org);
      setLoaded(true);
    }, (e) => act.setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const locate = () =>
    act.run(async () => {
      const p = await getPosition();
      setF((x) => ({ ...x, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }));
      toast(t('Location set to where you are now'));
    });

  const save = () =>
    act.run(async () => {
      const lat = Number(f.lat);
      const lng = Number(f.lng);
      if (f.lat === '' || f.lng === '' || !Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(t('Set the mosque location first.'));
      const body = { ...f, lat, lng };
      if (id) {
        await api(`/mosques/${id}`, { method: 'PATCH', body });
        toast(t('Saved'));
        nav(`/manage/${id}`);
      } else {
        const r = await api<{ id: string }>('/mosques', { body });
        await api(`/mosques/${r.id}`, { method: 'PATCH', body: { fajrTime: f.fajrTime, iqamahTime: f.iqamahTime, publicBoard: f.publicBoard } });
        await reloadMe();
        nav(`/manage/${r.id}`, { replace: true });
      }
    });

  if (!loaded) return <Screen title={t('Mosque settings')} back>{act.error ? <div className="note err">{act.error}</div> : <Loading />}</Screen>;
  const num = (k: 'openBeforeMin' | 'iqamahAfterMin' | 'closeAfterSunriseMin' | 'radiusM' | 'dailyGoal') => ({
    type: 'number' as const, inputMode: 'numeric' as const, value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value)),
  });

  return (
    <Screen title={id ? t('Mosque settings') : t('Register a mosque')} back>
      <section className="card form">
        <Field label={t('Mosque name')}><input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} placeholder={t('e.g. Masjid an-Noor')} /></Field>
        <div className="grid2">
          <Field label={t('City')}><input value={f.city} onChange={(e) => set('city', e.target.value)} maxLength={60} /></Field>
          <Field label={t('Country')}>
            <select value={f.country} onChange={(e) => set('country', e.target.value)}>
              <option value="">{t('Choose')}</option>
              {f.country && !COUNTRIES.includes(f.country) && <option>{f.country}</option>}
              {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section className="card form">
        <Eyebrow icon={<MapPin size={15} />}>{t('Location')}</Eyebrow>
        <p className="muted small">{t('Used to work out Fajr time, and to confirm people are at the mosque when they scan the printed poster.')}</p>
        <button className="btn soft" onClick={locate} disabled={act.busy}><LocateFixed size={18} />{' '}{t('I am at the mosque now: use my location')}</button>
        <div className="grid2">
          <Field label={t('Latitude')}><input value={f.lat} onChange={(e) => set('lat', e.target.value)} inputMode="decimal" placeholder="51.5074" /></Field>
          <Field label={t('Longitude')}><input value={f.lng} onChange={(e) => set('lng', e.target.value)} inputMode="decimal" placeholder="-0.1278" /></Field>
        </div>
        <Field label={t('Timezone')} hint={t('For example Europe/London or Asia/Kuala_Lumpur.')}><input value={f.timezone} onChange={(e) => set('timezone', e.target.value)} /></Field>
        <Field label={t('Poster check-in distance, in metres')} hint={t('How close a phone must be when it scans the printed poster.')}><input {...num('radiusM')} min={50} max={2000} /></Field>
      </section>

      <section className="card form">
        <Eyebrow icon={<Timer size={15} />}>{t('Fajr and check-in times')}</Eyebrow>
        <Field label={t('Prayer time method')} hint={t('Pick the one your mosque\'s timetable follows.')}>
          <select value={f.calcMethod} onChange={(e) => set('calcMethod', e.target.value)}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </Field>
        <div className="grid2">
          <Field label={t('Opens, minutes before the adhan')}><input {...num('openBeforeMin')} min={0} max={120} /></Field>
          <Field label={t('Iqamah, minutes after the adhan')}><input {...num('iqamahAfterMin')} min={0} max={90} /></Field>
        </div>
        <div className="grid2">
          <Field label={t('Your own Fajr time')} hint={t('Leave empty to use the calculated time.')}><input type="time" value={f.fajrTime ?? ''} onChange={(e) => set('fajrTime', e.target.value || null)} /></Field>
          <Field label={t('Your own iqamah time')} hint={t('From your timetable. Update it when it changes.')}><input type="time" value={f.iqamahTime ?? ''} onChange={(e) => set('iqamahTime', e.target.value || null)} /></Field>
        </div>
        <Field label={t('Closes, minutes after sunrise')} hint={t('0 closes check-in at sunrise. Use a negative number to close earlier.')}><input {...num('closeAfterSunriseMin')} min={-60} max={120} /></Field>
        <Field label={t('Daily goal')} hint={t('How many people you hope to see at Fajr. 0 hides the goal.')}><input {...num('dailyGoal')} min={0} /></Field>
        <Switch label={t('Practice mode')} hint={t('Check-in works at any time and from anywhere, so you can try it. The mosque stays off the world leaderboard while this is on.')} checked={f.practice} onChange={(v) => set('practice', v)} />
      </section>

      <section className="card form">
        <Switch label={t('Public leaderboard')} hint={t('Anyone with the link can see the podium without an account, with names shown as a first name and an initial. Turn off to show names only to people who are signed in.')} checked={f.publicBoard} onChange={(v) => set('publicBoard', v)} />
      </section>

      <section className="card form">
        <Eyebrow icon={<UsersRound size={15} />}>{t('Group names')}</Eyebrow>
        <div className="grid2">
          {GROUPS.map((g) => (
            <Field key={g} label={groupName(g)}><input value={f.labels[g]} onChange={(e) => set('labels', { ...f.labels, [g]: e.target.value })} maxLength={30} /></Field>
          ))}
        </div>
      </section>

      {act.error && <div className="note err" role="alert">{act.error}</div>}
      <button className="btn block" disabled={act.busy || f.name.trim().length < 2} onClick={save}>{id ? t('Save') : t('Register mosque')}</button>
      {!id && <p className="muted small">{t('Your mosque works straight away. It joins the world leaderboard once it has been approved.')}</p>}

      {id && <Staff mosqueId={id} />}
      {id && <OrgJoin mosqueId={id} org={org} onChange={setOrg} />}
    </Screen>
  );
}

interface StaffRow { id: string; name: string; email: string; role: 'admin' | 'volunteer' }

function Staff({ mosqueId }: { mosqueId: string }) {
  const { data, reload } = useLoad(() => api<{ staff: StaffRow[] }>(`/mosques/${mosqueId}/staff`), [mosqueId]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'volunteer'>('volunteer');
  const act = useAction();
  return (
    <section className="card form">
      <Eyebrow icon={<ShieldCheck size={15} />}>{t('Admins and volunteers')}</Eyebrow>
      <p className="muted small">{t('Volunteers can open the mosque screen and the attendance list. Admins can also change settings, challenges and prizes.')}</p>
      <div className="list">
        {data?.staff.map((s) => (
          <div className="item" key={s.id}>
            <span className="grow"><b>{s.name}</b><span className="sub" style={{ display: 'block' }}>{s.email} · {s.role === 'admin' ? t('Admin') : t('Volunteer')}</span></span>
            <button className="iconbtn" aria-label={t('Remove {name}', { name: s.name })} onClick={() => act.run(async () => { await api(`/mosques/${mosqueId}/staff/${s.id}`, { method: 'DELETE' }); reload(); })}><Trash2 size={17} /></button>
          </div>
        ))}
      </div>
      <Field label={t('Add someone by the email they signed up with')}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></Field>
      <div className="grid2">
        <select className="btn ghost" value={role} onChange={(e) => setRole(e.target.value as typeof role)} aria-label={t('Role')}><option value="volunteer">{t('Volunteer')}</option><option value="admin">{t('Admin')}</option></select>
        <button className="btn soft" disabled={act.busy || !email.includes('@')} onClick={() => act.run(async () => { await api(`/mosques/${mosqueId}/staff`, { body: { email, role } }); setEmail(''); reload(); })}>{t('Add')}</button>
      </div>
      {act.error && <div className="note err">{act.error}</div>}
    </section>
  );
}

function OrgJoin({ mosqueId, org, onChange }: { mosqueId: string; org: { id: string; name: string } | null; onChange: (o: { id: string; name: string } | null) => void }) {
  const [code, setCode] = useState('');
  const act = useAction();
  const send = (c: string | null) => act.run(async () => { const r = await api<{ org: { id: string; name: string } | null }>(`/mosques/${mosqueId}/org`, { body: { code: c } }); onChange(r.org); setCode(''); });
  return (
    <section className="card form">
      <Eyebrow icon={<UsersRound size={15} />}>{t('Organisation')}</Eyebrow>
      {org ? (
        <>
          <p className="small">{tx('This mosque is part of <b>{name}</b>.', { name: org.name })}</p>
          <button className="btn danger" disabled={act.busy} onClick={() => send(null)}>{t('Leave the organisation')}</button>
        </>
      ) : (
        <>
          <p className="muted small">{t('Join a council or league to appear on its leaderboard and take part in its challenges.')}</p>
          <div className="grid2">
            <input className="btn ghost" style={{ textAlign: 'left' }} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('Join code')} maxLength={6} aria-label={t('Organisation join code')} />
            <button className="btn soft" disabled={act.busy || code.length < 6} onClick={() => send(code)}>{t('Join')}</button>
          </div>
        </>
      )}
      {act.error && <div className="note err">{act.error}</div>}
    </section>
  );
}
