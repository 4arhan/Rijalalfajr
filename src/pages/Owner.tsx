import { Link } from 'react-router-dom';
import { useState } from 'react';
import { CalendarRange, Flag, HandHeart, Landmark } from 'lucide-react';
import type { Sponsor } from './Sponsor';
import { api } from '../api';
import { Eyebrow, Field, Loading, Problem, Screen, useAction } from '../ui';
import { useLoad } from '../lib/util';

interface OwnerData {
  mosques: { id: string; name: string; city: string; country: string; verified: boolean; suspended: boolean; practice: boolean; checkins: number; members: number }[];
  reports: { id: string; target_type: string; target_id: string; reason: string; reporter: string | null }[];
  totals: { users: number; strivers: number; mosques: number; checkins: number };
  sponsors: Sponsor[];
  seasons: { id: string; name: string; startDate: string; endDate: string }[];
}

export function OwnerPage() {
  const { data, error, reload } = useLoad(() => api<OwnerData>('/owner'), []);
  const act = useAction();
  const today = new Date().toISOString().slice(0, 10);
  const [season, setSeason] = useState({ name: '', startDate: today, endDate: today });
  if (error) return <Screen title="Owner console" back="/me"><Problem error={error} retry={reload} /></Screen>;
  if (!data) return <Screen title="Owner console" back="/me"><Loading /></Screen>;
  const setMosque = (id: string, body: object) => act.run(async () => { await api(`/owner/mosques/${id}`, { body }); reload(); });
  return (
    <Screen title="Owner console" back="/me">
      <section className="hero">
        <Eyebrow>Everything so far</Eyebrow>
        <div className="big num" style={{ marginTop: 12 }}>{data.totals.checkins.toLocaleString()}<small>Fajr check-ins</small></div>
        <div className="stats">
          <div><label>Mosques</label><b className="num">{data.totals.mosques}</b></div>
          <div><label>Accounts</label><b className="num">{data.totals.users}</b></div>
          <div><label>Strivers</label><b className="num">{data.totals.strivers}</b></div>
        </div>
      </section>
      {act.error && <div className="note err">{act.error}</div>}
      <section className="card">
        <Eyebrow icon={<Flag size={15} />}>Open reports</Eyebrow>
        {data.reports.length ? (
          <div className="list">
            {data.reports.map((r) => (
              <div className="item" key={r.id}>
                <span className="grow">
                  <b>{r.reason}</b>
                  <span className="sub" style={{ display: 'block' }}>
                    {r.target_type === 'mosque' ? <Link to={`/m/${r.target_id}`}>Open the mosque</Link> : `${r.target_type} ${r.target_id}`} · from {r.reporter ?? 'a deleted account'}
                  </span>
                </span>
                <button className="btn soft sm" disabled={act.busy} onClick={() => act.run(async () => { await api(`/owner/reports/${r.id}/resolve`, { method: 'POST' }); reload(); })}>Done</button>
              </div>
            ))}
          </div>
        ) : <p className="muted small">No open reports.</p>}
      </section>
      <section className="card form">
        <Eyebrow icon={<CalendarRange size={15} />}>Worldwide seasons</Eyebrow>
        <p className="muted small">A season is a world table for a set of dates, such as a winter 40 days. Every approved mosque takes part.</p>
        {data.seasons.map((s) => (
          <div className="between" key={s.id}>
            <span><b>{s.name}</b><span className="muted small" style={{ display: 'block' }}>{s.startDate} to {s.endDate}</span></span>
            <button className="btn sm danger" disabled={act.busy} onClick={() => confirm('Delete this season?') && act.run(async () => { await api(`/owner/seasons/${s.id}`, { method: 'DELETE' }); reload(); })}>Delete</button>
          </div>
        ))}
        <Field label="New season"><input value={season.name} onChange={(e) => setSeason({ ...season, name: e.target.value })} maxLength={60} placeholder="e.g. Winter 40 Days of Fajr" /></Field>
        <div className="grid2">
          <Field label="First day"><input type="date" value={season.startDate} onChange={(e) => setSeason({ ...season, startDate: e.target.value })} /></Field>
          <Field label="Last day"><input type="date" value={season.endDate} onChange={(e) => setSeason({ ...season, endDate: e.target.value })} /></Field>
        </div>
        <button className="btn" disabled={act.busy || season.name.trim().length < 2} onClick={() => act.run(async () => { await api('/owner/seasons', { body: season }); setSeason({ ...season, name: '' }); reload(); })}>Start season</button>
      </section>
      <section className="card">
        <Eyebrow icon={<HandHeart size={15} />}>Sponsor offers</Eyebrow>
        {data.sponsors.length ? (
          <div className="list">
            {data.sponsors.map((s) => (
              <div className="item" key={s.id}>
                <span className="grow">
                  <b>{s.name}</b>
                  <span className="sub" style={{ display: 'block' }}>{s.scope === 'mosque' ? `For ${s.mosqueName}` : `Open to ${s.country}`} · {s.kinds.join(', ')} · {s.email}</span>
                </span>
                <button className="btn sm danger" disabled={act.busy} onClick={() => confirm('Remove this offer?') && act.run(async () => { await api(`/sponsors/${s.id}`, { method: 'DELETE' }); reload(); })}>Remove</button>
              </div>
            ))}
          </div>
        ) : <p className="muted small">No sponsor offers yet.</p>}
      </section>
      <section className="card">
        <Eyebrow icon={<Landmark size={15} />}>Mosques</Eyebrow>
        <p className="muted small" style={{ marginBottom: 6 }}>Approved mosques appear on the world leaderboard. Waiting mosques come first.</p>
        <div className="list">
          {data.mosques.map((m) => (
            <div className="item" key={m.id} style={{ flexWrap: 'wrap' }}>
              <span className="grow">
                <Link to={`/m/${m.id}`}><b>{m.name}</b></Link>
                <span className="sub" style={{ display: 'block' }}>{[m.city, m.country].filter(Boolean).join(', ')} · {m.members} members · {m.checkins} check-ins{m.practice ? ' · practice mode' : ''}</span>
              </span>
              <button className={`btn sm ${m.verified ? 'ghost' : ''}`} disabled={act.busy} onClick={() => setMosque(m.id, { verified: !m.verified })}>{m.verified ? 'Unapprove' : 'Approve'}</button>
              <button className="btn sm danger" disabled={act.busy} onClick={() => setMosque(m.id, { suspended: !m.suspended })}>{m.suspended ? 'Restore' : 'Suspend'}</button>
            </div>
          ))}
        </div>
      </section>
    </Screen>
  );
}
