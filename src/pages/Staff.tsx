// Screens for the people who run a mosque: who has stopped coming, requests to be
// excused, the prize wish-list, friendly matches and adding many names at once.
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, FileUp, Gift, HeartHandshake, Mail, Phone, Plus, Swords, Trash2, UserRoundCheck } from 'lucide-react';
import { api, GROUPS, type ExcuseRequest, type Group, type Match, type MosquePage as MosqueData, type Wish } from '../api';
import { Avatar, Empty, Eyebrow, Field, Loading, Problem, Screen, Sheet, Skeleton, useAction, useToast } from '../ui';
import { addDays, groupName, niceDate, useLoad } from '../lib/util';
import { t, tn, tx } from '../lib/i18n';
import { MatchCard } from './Social';

// ---------- who haven't we seen? ----------

interface Missing { id: string; name: string; grp: Group; managed: boolean; last: string; recent: number; missed: number }

export function MissingPage() {
  const { id } = useParams();
  const { data, error, reload } = useLoad(() => api<{ people: Missing[] }>(`/mosques/${id}/missing`), [id]);
  return (
    <Screen title={t('Who haven’t we seen?')} eyebrow={t('For the imam')} back={`/manage/${id}`}>
      <p className="muted small">{t('Regulars who have now missed three or more dawns in a row. A message or a visit may be all it takes.')}</p>
      {error ? <Problem error={error} retry={reload} /> : !data ? <Skeleton hero={false} /> : data.people.length ? (
        <section className="card">
          <Eyebrow icon={<HeartHandshake size={15} />}>{tn(data.people.length, '{n} person to check on', '{n} people to check on')}</Eyebrow>
          <div className="list">
            {data.people.map((p) => (
              <div className="item" key={p.id}>
                <Avatar name={p.name} />
                <span className="grow">
                  <b className="truncate" style={{ display: 'block' }}>{p.name}</b>
                  <span className="sub" style={{ display: 'block' }}>{groupName(p.grp)} · {t('last here {date}', { date: niceDate(p.last, { weekday: 'short', day: 'numeric', month: 'short' }) })}</span>
                  <span className="sub">{t('came {n} of the 30 days before', { n: p.recent })}</span>
                </span>
                <span className="score num"><b>{p.missed}</b><small>{t('missed')}</small></span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="card">
          <Empty icon={<UserRoundCheck size={24} />} title={t('Everyone has been seen')}>{t('No regular has missed three dawns in a row.')}</Empty>
        </section>
      )}
      <p className="muted small">{t('Only mosque staff see this list. A regular is someone who came at least 6 times in the month before they stopped. Days you excused are not counted as missed.')}</p>
    </Screen>
  );
}

// ---------- requests to be excused ----------

export const requestDates = (r: { fromDate: string; toDate: string }) =>
  r.fromDate === r.toDate ? niceDate(r.fromDate, { weekday: 'short', day: 'numeric', month: 'short' }) : t('{from} to {to}', { from: niceDate(r.fromDate), to: niceDate(r.toDate) });

export function RequestsCard({ mosqueId, onChange }: { mosqueId: string; onChange: () => void }) {
  const toast = useToast();
  const act = useAction();
  const { data, reload } = useLoad(() => api<{ requests: ExcuseRequest[] }>(`/mosques/${mosqueId}/excuse-requests`), [mosqueId]);
  const pending = data?.requests.filter((r) => r.status === 'pending') ?? [];
  if (!pending.length) return null;
  const decide = (r: ExcuseRequest, approve: boolean) =>
    act.run(async () => {
      await api(`/excuse-requests/${r.id}/decide`, { body: { approve } });
      toast(approve ? t('{name} is excused. Their streak is safe.', { name: r.name }) : t('Declined'));
      reload();
      onChange();
    });
  return (
    <section className="card">
      <Eyebrow icon={<HeartHandshake size={15} />}>{t('Asking to be excused')}</Eyebrow>
      <div className="list">
        {pending.map((r) => (
          <div className="item" key={r.id} style={{ flexWrap: 'wrap' }}>
            <span className="grow">
              <b>{r.name}</b>
              <span className="sub" style={{ display: 'block' }}>{[requestDates(r), r.reason].filter(Boolean).join(' · ')}</span>
            </span>
            <button className="btn sm" disabled={act.busy} onClick={() => decide(r, true)}><Check size={15} /> {t('Approve')}</button>
            <button className="btn ghost sm" disabled={act.busy} onClick={() => decide(r, false)}>{t('Decline')}</button>
          </div>
        ))}
      </div>
      {act.error && <div className="note err" style={{ marginTop: 10 }}>{act.error}</div>}
    </section>
  );
}

// ---------- the prize wish-list ----------

interface GiftOffer { id: string; name: string; qty: number; email: string; phone: string; note: string; confirmed: boolean }
type AdminWish = Wish & { pledges: GiftOffer[] };

export function WishesPage() {
  const { id } = useParams();
  const toast = useToast();
  const act = useAction();
  const [title, setTitle] = useState('');
  const [qty, setQty] = useState(1);
  const [detail, setDetail] = useState('');
  const { data, error, reload } = useLoad(() => api<{ wishes: AdminWish[] }>(`/mosques/${id}/wishes`), [id]);
  const run = (fn: () => Promise<unknown>) => act.run(async () => { await fn(); reload(); });
  return (
    <Screen title={t('Prize wish-list')} eyebrow={t('For your sponsors')} back={`/manage/${id}`}>
      <p className="muted small">{t('List what you would like for your prizes. It shows on your mosque’s page, where anyone can offer to give an item.')}</p>
      {error ? <Problem error={error} retry={reload} /> : !data ? <Skeleton hero={false} /> : data.wishes.map((w) => (
        <section className="card" key={w.id}>
          <div className="between">
            <h3>{w.qty > 1 ? `${w.title} × ${w.qty}` : w.title}</h3>
            <button className="iconbtn" aria-label={t('Remove {title}', { title: w.title })} onClick={() => confirm(t('Remove this from the wish-list?')) && run(() => api(`/wishes/${w.id}`, { method: 'DELETE' }))}><Trash2 size={16} /></button>
          </div>
          {w.detail && <p className="muted small">{w.detail}</p>}
          {w.pledges.length ? w.pledges.map((p) => (
            <div className="offer" key={p.id}>
              <div className="between">
                <b>{p.qty > 1 ? `${p.name} × ${p.qty}` : p.name}</b>
                <span className={`pill${p.confirmed ? ' gold' : ' grey'}`}>{p.confirmed ? t('Confirmed') : t('Offered')}</span>
              </div>
              {p.note && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{p.note}</p>}
              <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
                <a className="btn soft sm" href={`mailto:${p.email}`}><Mail size={15} /> {p.email}</a>
                {p.phone && <a className="btn soft sm" href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}><Phone size={15} /> {p.phone}</a>}
              </div>
              <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
                <button className={`btn sm${p.confirmed ? ' ghost' : ''}`} disabled={act.busy}
                  onClick={() => run(async () => { await api(`/wish-pledges/${p.id}/confirm`, { body: { confirmed: !p.confirmed } }); toast(p.confirmed ? t('No longer shown as given') : t('{name} is now thanked on your page', { name: p.name })); })}>
                  {p.confirmed ? t('Undo') : <><Check size={15} /> {t('Confirm the gift')}</>}
                </button>
                <button className="btn ghost sm" disabled={act.busy} onClick={() => confirm(t('Remove this offer?')) && run(() => api(`/wish-pledges/${p.id}`, { method: 'DELETE' }))}>{t('Remove')}</button>
              </div>
            </div>
          )) : <p className="muted small" style={{ marginTop: 8 }}>{t('No one has offered this yet.')}</p>}
        </section>
      ))}
      {data && data.wishes.some((w) => w.pledges.length > 0) && (
        <p className="muted small">{t('Confirm an offer once the gift is agreed. The giver’s name then shows on your page, your challenges and the mosque screen.')}</p>
      )}
      <section className="card form">
        <Eyebrow icon={<Gift size={15} />}>{t('Add to the wish-list')}</Eyebrow>
        <div className="grid2" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <Field label={t('What would you like?')}><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={t('e.g. Bicycle')} /></Field>
          <Field label={t('How many?')}><input type="number" inputMode="numeric" min={1} max={1000} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></Field>
        </div>
        <Field label={t('Details (optional)')}><input value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={200} placeholder={t('e.g. For first place among the kids')} /></Field>
        {act.error && <div className="note err" role="alert">{act.error}</div>}
        <button className="btn block" disabled={act.busy || title.trim().length < 2 || qty < 1}
          onClick={() => run(async () => { await api(`/mosques/${id}/wishes`, { body: { title, qty, detail } }); setTitle(''); setQty(1); setDetail(''); })}>
          <Plus size={18} /> {t('Add')}
        </button>
      </section>
    </Screen>
  );
}

// ---------- friendly matches ----------

interface Found { id: string; name: string; city: string; country: string }

/** The next Monday after a date. */
function nextMonday(today: string) {
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(today, 7 - dow);
}

export function MatchSheet({ mosque, today, onClose, onSent }: { mosque: MosqueData['mosque']; today: string; onClose: () => void; onSent: () => void }) {
  const [q, setQ] = useState('');
  const [other, setOther] = useState<Found | null>(null);
  const [startDate, setStart] = useState(nextMonday(today));
  const act = useAction();
  const found = useLoad(() => (q.trim().length >= 2 ? api<{ mosques: Found[] }>(`/mosques?q=${encodeURIComponent(q.trim())}`) : Promise.resolve({ mosques: [] })), [q]);
  const others = found.data?.mosques.filter((m) => m.id !== mosque.id) ?? [];
  return (
    <Sheet title={t('Friendly match')} onClose={onClose}>
      <div className="form">
        <p className="muted small">{t('Challenge another mosque for one week. The score is the share of each mosque’s members who come to Fajr, so a small mosque can win.')}</p>
        {other ? (
          <div className="note between">
            <span>{tx('Against <b>{name}</b>', { name: [other.name, other.city].filter(Boolean).join(', ') })}</span>
            <button className="btn ghost sm" onClick={() => setOther(null)}>{t('Change')}</button>
          </div>
        ) : (
          <>
            <Field label={t('Find the mosque')} hint={t('Only mosques registered on Rijal al-Fajr appear.')}>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Name, city or country')} />
            </Field>
            {others.length > 0 && (
              <div className="list">
                {others.slice(0, 6).map((m) => (
                  <button key={m.id} className="item" onClick={() => { setOther(m); setQ(''); }}>
                    <span className="grow"><b>{m.name}</b><span className="sub" style={{ display: 'block' }}>{[m.city, m.country].filter(Boolean).join(', ')}</span></span>
                    <span className="pill">{t('Choose')}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <Field label={t('First day')} hint={t('The match runs for seven days. Their admin has to accept first.')}>
          <input type="date" value={startDate} min={addDays(today, 1)} max={addDays(today, 60)} onChange={(e) => setStart(e.target.value)} />
        </Field>
        {act.error && <div className="note err" role="alert">{act.error}</div>}
        <button className="btn block" disabled={act.busy || !other}
          onClick={() => act.run(async () => { await api(`/mosques/${mosque.id}/matches`, { body: { opponentId: other!.id, startDate } }); onSent(); })}>
          <Swords size={18} /> {t('Send the invitation')}
        </button>
      </div>
    </Sheet>
  );
}

/** Matches as staff see them: invitations to answer, and the ones that are agreed. */
export function MatchesCard({ mosqueId, admin, tick }: { mosqueId: string; admin: boolean; tick: number }) {
  const toast = useToast();
  const act = useAction();
  const { data, reload } = useLoad(() => api<{ matches: Match[] }>(`/mosques/${mosqueId}/matches`), [mosqueId, tick]);
  if (!data?.matches.length) return null;
  const respond = (m: Match, accept: boolean) =>
    act.run(async () => {
      await api(`/matches/${m.id}/respond`, { body: { accept } });
      toast(accept ? t('The match is on') : t('Declined'));
      reload();
    });
  const cancel = (m: Match) => confirm(t('Cancel this match?')) && act.run(async () => { await api(`/matches/${m.id}`, { method: 'DELETE' }); reload(); });
  return (
    <>
      {data.matches.map((m) => {
        const them = m.a.id === mosqueId ? m.b : m.a;
        if (m.status !== 'invited') {
          return (
            <MatchCard key={m.id} match={m} home={mosqueId}>
              {admin && m.status !== 'ended' && <button className="btn ghost sm" style={{ marginTop: 10 }} disabled={act.busy} onClick={() => cancel(m)}>{t('Cancel the match')}</button>}
            </MatchCard>
          );
        }
        return (
          <section className="card" key={m.id}>
            <Eyebrow icon={<Swords size={15} />}>{t('Friendly match')}</Eyebrow>
            <p style={{ margin: '6px 0 4px' }}>
              {m.toAnswer ? tx('<b>{name}</b> invites your mosque to a friendly match.', { name: them.name }) : tx('Waiting for <b>{name}</b> to accept.', { name: them.name })}
            </p>
            <p className="muted small">{t('{from} to {to}', { from: niceDate(m.startDate, { weekday: 'short', day: 'numeric', month: 'short' }), to: niceDate(m.endDate, { weekday: 'short', day: 'numeric', month: 'short' }) })}</p>
            {admin && (
              <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                {m.toAnswer ? (
                  <>
                    <button className="btn sm" disabled={act.busy} onClick={() => respond(m, true)}><Check size={15} /> {t('Accept')}</button>
                    <button className="btn ghost sm" disabled={act.busy} onClick={() => respond(m, false)}>{t('Decline')}</button>
                  </>
                ) : (
                  <button className="btn ghost sm" disabled={act.busy} onClick={() => cancel(m)}>{t('Withdraw the invitation')}</button>
                )}
              </div>
            )}
            {act.error && <div className="note err" style={{ marginTop: 10 }}>{act.error}</div>}
          </section>
        );
      })}
    </>
  );
}

// ---------- many names at once ----------

interface Row { name: string; grp: Group; className?: string }

/** Read pasted rows or a CSV file: a name, then optionally a group and a class. */
function parseNames(text: string, fallback: Group, labels: Record<Group, string>): Row[] {
  const groups = new Map<string, Group>();
  for (const g of GROUPS) {
    for (const word of [g, g.replace(/s$/, ''), groupName(g), labels[g]]) groups.set(word.trim().toLowerCase(), g);
  }
  groups.set('child', 'kids');
  groups.set('children', 'kids');
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/\t|;|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim());
    const name = (cells[0] ?? '').replace(/\s+/g, ' ').slice(0, 60);
    if (!name) continue;
    // A heading row from the spreadsheet is not a person.
    if (!rows.length && ['name', 'names', 'full name', t('Name').toLowerCase()].includes(name.toLowerCase())) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const grp = groups.get((cells[1] ?? '').toLowerCase());
    // With no group column, a second column is the class.
    const className = (grp || cells.length > 2 ? cells[2] : cells[1]) ?? '';
    rows.push({ name, grp: grp ?? fallback, className: className.length >= 2 ? className.slice(0, 40) : undefined });
  }
  return rows;
}

export function ImportPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const act = useAction();
  const file = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [grp, setGrp] = useState<Group>('kids');
  const page = useLoad(() => api<MosqueData>(`/mosques/${id}`), [id]);
  const labels = page.data?.mosque.labels ?? { kids: 'Kids', youth: 'Youth', adults: 'Adults' };
  const rows = useMemo(() => parseNames(text, grp, labels), [text, grp, labels]);
  const pick = async (f: File | undefined) => {
    if (f) setText(await f.text());
  };
  const send = () =>
    act.run(async () => {
      const r = await api<{ added: number; skipped: number }>(`/mosques/${id}/roster/import`, { body: { people: rows.slice(0, 500) } });
      toast(r.skipped ? t('{added} added. {skipped} were already on the list.', r) : tn(r.added, '{n} name added', '{n} names added'));
      nav(`/manage/${id}/list`);
    });
  return (
    <Screen title={t('Add many names')} eyebrow={t('From a spreadsheet')} back={`/manage/${id}/list`}>
      <section className="card form">
        <Field label={t('Paste the names')} hint={t('One name on each line. From a spreadsheet you can copy up to three columns: name, group, class.')}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} style={{ minHeight: 180 }} placeholder={'Musa Ali\nIbrahim Khan\nYahya Noor'} />
        </Field>
        <input ref={file} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <button className="btn ghost" onClick={() => file.current?.click()}><FileUp size={18} /> {t('Or choose a file')}</button>
        <Field label={t('Group for names that have none')}>
          <select value={grp} onChange={(e) => setGrp(e.target.value as Group)}>{GROUPS.map((g) => <option key={g} value={g}>{groupName(g)}</option>)}</select>
        </Field>
      </section>
      {rows.length > 0 && (
        <section className="card">
          <Eyebrow>{tn(rows.length, '{n} name ready', '{n} names ready')}</Eyebrow>
          <div className="list">
            {rows.slice(0, 8).map((r) => (
              <div className="item" key={r.name}>
                <Avatar name={r.name} />
                <span className="grow"><b className="truncate" style={{ display: 'block' }}>{r.name}</b><span className="sub">{[groupName(r.grp), r.className].filter(Boolean).join(' · ')}</span></span>
              </div>
            ))}
          </div>
          {rows.length > 8 && <p className="muted small" style={{ marginTop: 8 }}>{tn(rows.length - 8, 'and {n} more', 'and {n} more')}</p>}
          {rows.length > 500 && <div className="note err" style={{ marginTop: 10 }}>{t('Only the first 500 are added at a time. Add the rest afterwards.')}</div>}
        </section>
      )}
      {act.error && <div className="note err" role="alert">{act.error}</div>}
      <button className="btn block" disabled={act.busy || !rows.length} onClick={send}>{rows.length ? tn(Math.min(rows.length, 500), 'Add {n} name', 'Add {n} names') : t('Add')}</button>
      <p className="muted small">{t('Names already on your list are skipped, so it is safe to paste the whole register again. Each child gets a card you can print.')}</p>
      {page.error && <Link className="btn ghost" to={`/manage/${id}`}>{t('Back')}</Link>}
      {act.busy && <Loading />}
    </Screen>
  );
}
