import { Link } from 'react-router-dom';
import { useState } from 'react';
import { CalendarRange, Flag, HandHeart, Landmark } from 'lucide-react';
import { kindLabel, type Sponsor } from './Sponsor';
import { api } from '../api';
import { Eyebrow, Field, Loading, Problem, Screen, useAction } from '../ui';
import { useLoad } from '../lib/util';
import { t } from '../lib/i18n';

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
  if (error) return <Screen title={t('Owner console')} back="/me"><Problem error={error} retry={reload} /></Screen>;
  if (!data) return <Screen title={t('Owner console')} back="/me"><Loading /></Screen>;
  const setMosque = (id: string, body: object) => act.run(async () => { await api(`/owner/mosques/${id}`, { body }); reload(); });
  return (
    <Screen title={t('Owner console')} back="/me">
      <section className="hero">
        <Eyebrow>{t('Everything so far')}</Eyebrow>
        <div className="big num" style={{ marginTop: 12 }}>{data.totals.checkins.toLocaleString()}<small>{t('Fajr check-ins')}</small></div>
        <div className="stats">
          <div><label>{t('Mosques')}</label><b className="num">{data.totals.mosques}</b></div>
          <div><label>{t('Accounts')}</label><b className="num">{data.totals.users}</b></div>
          <div><label>{t('Strivers')}</label><b className="num">{data.totals.strivers}</b></div>
        </div>
      </section>
      {act.error && <div className="note err">{act.error}</div>}
      <section className="card">
        <Eyebrow icon={<Flag size={15} />}>{t('Open reports')}</Eyebrow>
        {data.reports.length ? (
          <div className="list">
            {data.reports.map((r) => (
              <div className="item" key={r.id}>
                <span className="grow">
                  <b>{r.reason}</b>
                  <span className="sub" style={{ display: 'block' }}>
                    {r.target_type === 'mosque' ? <Link to={`/m/${r.target_id}`}>{t('Open the mosque')}</Link> : `${r.target_type} ${r.target_id}`} · {t('from {who}', { who: r.reporter ?? t('a deleted account') })}
                  </span>
                </span>
                <button className="btn soft sm" disabled={act.busy} onClick={() => act.run(async () => { await api(`/owner/reports/${r.id}/resolve`, { method: 'POST' }); reload(); })}>{t('Done')}</button>
              </div>
            ))}
          </div>
        ) : <p className="muted small">{t('No open reports.')}</p>}
      </section>
      <section className="card form">
        <Eyebrow icon={<CalendarRange size={15} />}>{t('Worldwide seasons')}</Eyebrow>
        <p className="muted small">{t('A season is a world table for a set of dates, such as a winter 40 days. Every approved mosque takes part.')}</p>
        {data.seasons.map((s) => (
          <div className="between" key={s.id}>
            <span><b>{s.name}</b><span className="muted small" style={{ display: 'block' }}>{t('{startDate} to {endDate}', { startDate: s.startDate, endDate: s.endDate })}</span></span>
            <button className="btn sm danger" disabled={act.busy} onClick={() => confirm(t('Delete this season?')) && act.run(async () => { await api(`/owner/seasons/${s.id}`, { method: 'DELETE' }); reload(); })}>{t('Delete')}</button>
          </div>
        ))}
        <Field label={t('New season')}><input value={season.name} onChange={(e) => setSeason({ ...season, name: e.target.value })} maxLength={60} placeholder={t('e.g. Winter 40 Days of Fajr')} /></Field>
        <div className="grid2">
          <Field label={t('First day')}><input type="date" value={season.startDate} onChange={(e) => setSeason({ ...season, startDate: e.target.value })} /></Field>
          <Field label={t('Last day')}><input type="date" value={season.endDate} onChange={(e) => setSeason({ ...season, endDate: e.target.value })} /></Field>
        </div>
        <button className="btn" disabled={act.busy || season.name.trim().length < 2} onClick={() => act.run(async () => { await api('/owner/seasons', { body: season }); setSeason({ ...season, name: '' }); reload(); })}>{t('Start season')}</button>
      </section>
      <section className="card">
        <Eyebrow icon={<HandHeart size={15} />}>{t('Sponsor offers')}</Eyebrow>
        {data.sponsors.length ? (
          <div className="list">
            {data.sponsors.map((s) => (
              <div className="item" key={s.id}>
                <span className="grow">
                  <b>{s.name}</b>
                  <span className="sub" style={{ display: 'block' }}>{s.scope === 'mosque' ? t('For {mosqueName}', { mosqueName: s.mosqueName }) : t('Open to {country}', { country: s.country })} · {s.kinds.map(kindLabel).join(', ')} · {s.email}</span>
                </span>
                <button className="btn sm danger" disabled={act.busy} onClick={() => confirm(t('Remove this offer?')) && act.run(async () => { await api(`/sponsors/${s.id}`, { method: 'DELETE' }); reload(); })}>{t('Remove')}</button>
              </div>
            ))}
          </div>
        ) : <p className="muted small">{t('No sponsor offers yet.')}</p>}
      </section>
      <section className="card">
        <Eyebrow icon={<Landmark size={15} />}>{t('Mosques')}</Eyebrow>
        <p className="muted small" style={{ marginBottom: 6 }}>{t('Approved mosques appear on the world leaderboard. Waiting mosques come first.')}</p>
        <div className="list">
          {data.mosques.map((m) => (
            <div className="item" key={m.id} style={{ flexWrap: 'wrap' }}>
              <span className="grow">
                <Link to={`/m/${m.id}`}><b>{m.name}</b></Link>
                <span className="sub" style={{ display: 'block' }}>{[[m.city, m.country].filter(Boolean).join(', '), t('{n} members', { n: m.members }), t('{n} check-ins', { n: m.checkins }), m.practice && t('practice mode')].filter(Boolean).join(' · ')}</span>
              </span>
              <button className={`btn sm ${m.verified ? 'ghost' : ''}`} disabled={act.busy} onClick={() => setMosque(m.id, { verified: !m.verified })}>{m.verified ? t('Unapprove') : t('Approve')}</button>
              <button className="btn sm danger" disabled={act.busy} onClick={() => setMosque(m.id, { suspended: !m.suspended })}>{m.suspended ? t('Restore') : t('Suspend')}</button>
            </div>
          ))}
        </div>
      </section>
    </Screen>
  );
}
