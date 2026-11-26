import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { HandHeart, Mail, Phone, Trash2 } from 'lucide-react';
import { api } from '../api';
import { Eyebrow, Field, Loading, Problem, Screen, Seg, useAction, useMe, useToast } from '../ui';
import { COUNTRIES } from '../lib/countries';
import { useLoad } from '../lib/util';

export const KINDS: [string, string, string][] = [
  ['prizes', 'Prizes', 'Bicycles, medals, gifts for the podium'],
  ['breakfast', 'Breakfast after Fajr', 'Food and drink for those who came'],
  ['funds', 'Money toward prizes', 'Arranged directly with the mosque'],
  ['vouchers', 'Vouchers or products', 'From your shop or business'],
  ['other', 'Something else', 'Say what in the note'],
];
const kindLabel = (k: string) => KINDS.find((x) => x[0] === k)?.[1] ?? k;

export interface Sponsor {
  id: string; name: string; email: string; phone: string; country: string; city: string; kinds: string[]; note: string;
  scope: 'country' | 'mosque'; mosqueId: string | null; mosqueName: string | null;
}
interface Found { id: string; name: string; city: string; country: string }

const EMPTY = { name: '', email: '', phone: '', country: '', city: '', kinds: [] as string[], note: '', scope: 'country' as 'country' | 'mosque', mosqueId: null as string | null };

export function SponsorPage() {
  const me = useMe();
  const toast = useToast();
  const [params] = useSearchParams();
  const act = useAction();
  const mine = useLoad(() => api<{ sponsors: Sponsor[] }>('/sponsors/mine'), []);
  const [f, setF] = useState({ ...EMPTY, email: me.user.email });
  const [editing, setEditing] = useState<string | null>(null);
  const [mosque, setMosque] = useState<Found | null>(null);
  const [q, setQ] = useState('');
  const found = useLoad(() => (q.trim().length >= 2 ? api<{ mosques: Found[] }>(`/mosques?q=${encodeURIComponent(q.trim())}`) : Promise.resolve({ mosques: [] })), [q]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  // Arriving from a mosque's page: offer to that mosque.
  useEffect(() => {
    const id = params.get('mosque');
    if (!id) return;
    api<{ mosque: Found }>(`/mosques/${id}`).then((d) => {
      setMosque(d.mosque);
      setF((x) => ({ ...x, scope: 'mosque', mosqueId: d.mosque.id, country: x.country || d.mosque.country, city: x.city || d.mosque.city }));
    }, () => {});
  }, [params]);

  const pick = (m: Found) => { setMosque(m); setQ(''); setF((x) => ({ ...x, mosqueId: m.id, country: x.country || m.country })); };
  const reset = () => { setF({ ...EMPTY, email: me.user.email }); setEditing(null); setMosque(null); };
  const edit = (s: Sponsor) => {
    setEditing(s.id);
    setF({ name: s.name, email: s.email, phone: s.phone, country: s.country, city: s.city, kinds: s.kinds, note: s.note, scope: s.scope, mosqueId: s.mosqueId });
    setMosque(s.mosqueId ? { id: s.mosqueId, name: s.mosqueName ?? 'Mosque', city: '', country: '' } : null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const save = () =>
    act.run(async () => {
      await api(editing ? `/sponsors/${editing}` : '/sponsors', { method: editing ? 'PUT' : 'POST', body: f });
      toast(editing ? 'Your offer is updated' : 'Thank you. Your offer is now visible to the mosque.');
      reset();
      mine.reload();
    });
  const ready = f.name.trim().length >= 2 && f.email.includes('@') && f.country && f.kinds.length > 0 && (f.scope === 'country' || f.mosqueId);

  return (
    <Screen title="Sponsor" eyebrow="Support the people of Fajr" back>
      <section className="hero">
        <Eyebrow icon={<HandHeart size={15} />}>Offer to sponsor</Eyebrow>
        <h2 style={{ fontSize: 24, fontWeight: 750, letterSpacing: '-0.02em', margin: '10px 0 8px' }}>Put a bicycle on the podium. Or breakfast on the table.</h2>
        <p className="muted">Leave your details and how you would like to help. The mosque or organisation contacts you directly. No money passes through the app.</p>
      </section>

      <section className="card form">
        <Eyebrow>Who can contact you?</Eyebrow>
        <Seg value={f.scope} onChange={(v) => set('scope', v)} options={[{ value: 'country', label: 'My whole country' }, { value: 'mosque', label: 'One mosque' }]} />
        {f.scope === 'mosque' && (
          mosque ? (
            <div className="note between">
              <span>For <b>{mosque.name}</b>{mosque.city ? `, ${mosque.city}` : ''}</span>
              <button className="btn ghost sm" onClick={() => { setMosque(null); set('mosqueId', null); }}>Change</button>
            </div>
          ) : (
            <>
              <Field label="Find the mosque" hint="Only mosques registered on Rijal al-Fajr appear.">
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, city or country" />
              </Field>
              {found.data && found.data.mosques.length > 0 && (
                <div className="list">
                  {found.data.mosques.slice(0, 6).map((m) => (
                    <button key={m.id} className="item" onClick={() => pick(m)}>
                      <span className="grow"><b>{m.name}</b><span className="sub" style={{ display: 'block' }}>{[m.city, m.country].filter(Boolean).join(', ')}</span></span>
                      <span className="pill">Choose</span>
                    </button>
                  ))}
                </div>
              )}
              {q.trim().length >= 2 && found.data?.mosques.length === 0 && <p className="muted small">No registered mosque matches. You can offer to any mosque in your country instead.</p>}
            </>
          )
        )}
        <p className="muted small">
          {f.scope === 'country'
            ? 'The admins of every registered mosque and organisation in your country can see your offer and contact details.'
            : 'Only the admins of that mosque, and its organisation, can see your offer and contact details.'}
        </p>
      </section>

      <section className="card form">
        <Eyebrow>How would you like to sponsor?</Eyebrow>
        <div className="list">
          {KINDS.map(([k, label, hint]) => {
            const on = f.kinds.includes(k);
            return (
              <button key={k} className="item" aria-pressed={on} onClick={() => set('kinds', on ? f.kinds.filter((x) => x !== k) : [...f.kinds, k])}>
                <span className={`check${on ? ' on' : ''}`}>✓</span>
                <span className="grow"><b>{label}</b><span className="sub" style={{ display: 'block' }}>{hint}</span></span>
              </button>
            );
          })}
        </div>
        <Field label="A note (optional)" hint="For example how much, how often, or who it is for."><textarea value={f.note} onChange={(e) => set('note', e.target.value)} maxLength={500} /></Field>
      </section>

      <section className="card form">
        <Eyebrow>Your details</Eyebrow>
        <Field label="Your name or business"><input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} placeholder="e.g. Noor Cycles" /></Field>
        <div className="grid2">
          <Field label="Country">
            <select value={f.country} onChange={(e) => set('country', e.target.value)}>
              <option value="">Choose</option>
              {f.country && !COUNTRIES.includes(f.country) && <option>{f.country}</option>}
              {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="City (optional)"><input value={f.city} onChange={(e) => set('city', e.target.value)} maxLength={60} /></Field>
        </div>
        <Field label="Email to reach you"><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Phone or WhatsApp (optional)"><input type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} maxLength={40} /></Field>
        {act.error && <div className="note err" role="alert">{act.error}</div>}
        <button className="btn block" disabled={act.busy || !ready} onClick={save}>{editing ? 'Save changes' : 'Send my offer'}</button>
        {editing && <button className="btn ghost block" onClick={reset}>Cancel</button>}
        <p className="muted small">You can change or withdraw your offer here at any time. Any sponsorship is agreed between you and the mosque.</p>
      </section>

      {mine.data && mine.data.sponsors.length > 0 && (
        <section className="card">
          <Eyebrow icon={<HandHeart size={15} />}>My offers</Eyebrow>
          <div className="list">
            {mine.data.sponsors.map((s) => (
              <div className="item" key={s.id}>
                <span className="grow">
                  <b>{s.name}</b>
                  <span className="sub" style={{ display: 'block' }}>{s.scope === 'mosque' ? `For ${s.mosqueName}` : `Any mosque in ${s.country}`} · {s.kinds.map(kindLabel).join(', ')}</span>
                </span>
                <button className="btn soft sm" onClick={() => edit(s)}>Edit</button>
                <button className="iconbtn" aria-label={`Withdraw the offer from ${s.name}`}
                  onClick={() => confirm('Withdraw this offer?') && act.run(async () => { await api(`/sponsors/${s.id}`, { method: 'DELETE' }); mine.reload(); })}>
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </Screen>
  );
}

/** A sponsor's offer with contact links, as mosque and organisation admins see it. */
export function SponsorCards({ sponsors }: { sponsors: Sponsor[] }) {
  return (
    <>
      {sponsors.map((s) => (
        <section className="card" key={s.id}>
          <span className={`pill${s.scope === 'mosque' ? ' gold' : ' grey'}`}>{s.scope === 'mosque' ? `For ${s.mosqueName ?? 'this mosque'}` : `Open to ${s.country}`}</span>
          <h3 style={{ marginTop: 8 }}>{s.name}</h3>
          <p className="muted small" style={{ margin: '2px 0 10px' }}>{[s.city, s.country].filter(Boolean).join(', ')}</p>
          <p className="small"><b>Offers:</b> {s.kinds.map(kindLabel).join(', ')}</p>
          {s.note && <p className="small" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{s.note}</p>}
          <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
            <a className="btn sm" href={`mailto:${s.email}?subject=${encodeURIComponent('Sponsoring Fajr at our mosque')}`}><Mail size={16} /> {s.email}</a>
            {s.phone && <a className="btn soft sm" href={`tel:${s.phone.replace(/[^\d+]/g, '')}`}><Phone size={16} /> {s.phone}</a>}
          </div>
        </section>
      ))}
    </>
  );
}

export function MosqueSponsors() {
  const { id } = useParams();
  const { data, error, reload } = useLoad(() => api<{ sponsors: Sponsor[]; country: string }>(`/mosques/${id}/sponsors`), [id]);
  return (
    <Screen title="Sponsors" eyebrow="People offering to help" back={`/manage/${id}`}>
      {error ? <Problem error={error} retry={reload} /> : !data ? <Loading /> : (
        <>
          <p className="muted small">
            These people offered to sponsor your mosque, or any mosque in {data.country || 'your country'}. Contact them directly. Their details are shown only to mosque admins, so please do not pass them on.
          </p>
          {data.sponsors.length ? <SponsorCards sponsors={data.sponsors} /> : (
            <div className="card empty">
              <b>No offers yet</b>
              Share your mosque's page and ask local businesses to tap “Sponsor this mosque”.
              {!data.country && <p className="small" style={{ marginTop: 8 }}>Set your mosque's country in settings to also see offers made to the whole country.</p>}
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
