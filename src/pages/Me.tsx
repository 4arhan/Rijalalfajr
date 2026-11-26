import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Award, Baby, Building2, CalendarRange, HandHeart, HeartHandshake, Send, CalendarDays, Crown, Flame, Footprints, Landmark, LogOut, MapPinned, Medal, Moon, Plus, Share2, ShieldCheck, Sparkles, Star,
  Sun, Sunrise, Trash2, Trophy, UserRound, Users, UsersRound,
} from 'lucide-react';
import { api, GROUPS, type Group, type Stats, type Striver } from '../api';
import { Eyebrow, Field, LinkRow, Loading, Problem, Screen, Sheet, Switch, useAction, useMe, useSession, useToast } from '../ui';
import { addDays, plural, useLoad, groupName } from '../lib/util';
import { shareInvite } from './Personal';
import { shareCard } from '../lib/share';
import { LanguagePicker, dateLocale, t, tn } from '../lib/i18n';

const BADGE_ICON: Record<string, React.ReactNode> = {
  first: <Sunrise size={24} />, three: <Footprints size={24} />, week: <Flame size={24} />, fortnight: <Star size={24} />, steadfast: <Medal size={24} />,
  rijal: <Crown size={24} />, hundred: <Trophy size={24} />, musafir: <MapPinned size={24} />, early: <Sparkles size={24} />,
};

function Calendar({ stats }: { stats: Stats }) {
  const on = new Set(stats.dates);
  const excused = new Set(stats.excused);
  // Five weeks ending this week, Monday first.
  const [y, m, d] = stats.today.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const start = addDays(stats.today, -dow - 28);
  const days = Array.from({ length: 35 }, (_, i) => addDays(start, i));
  return (
    <div className="cal">
      {/* 1 January 2024 was a Monday. */}
      {Array.from({ length: 7 }, (_, i) => <span className="dow" key={i}>{new Intl.DateTimeFormat(dateLocale(), { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i)))}</span>)}
      {days.map((day) => (
        <i key={day} className={`${on.has(day) ? 'on' : excused.has(day) ? 'ex' : ''}${day === stats.today ? ' today' : ''}`} style={day > stats.today ? { opacity: 0.35 } : undefined}
          aria-label={`${day}${on.has(day) ? `, ${t('at Fajr')}` : excused.has(day) ? `, ${t('excused')}` : ''}`}>
          {Number(day.slice(8))}
        </i>
      ))}
    </div>
  );
}

export function MePage() {
  const me = useMe();
  const { reload, signOut } = useSession();
  const toast = useToast();
  const nav = useNavigate();
  const self = me.strivers.find((s) => s.self)!;
  const family = me.strivers.filter((s) => !s.self);
  const [who, setWho] = useState(self.id);
  const [sheet, setSheet] = useState<null | 'family' | 'org' | 'delete' | Striver>(null);
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  const { data: stats, error, reload: reloadStats } = useLoad(() => api<Stats>(`/strivers/${who}/stats`), [who]);

  const setTheme = (on: boolean) => {
    setDark(on);
    document.documentElement.dataset.theme = on ? 'dark' : 'light';
    localStorage.setItem('raf.theme', on ? 'dark' : 'light');
  };
  const setAnonymous = async (on: boolean) => {
    await api('/me', { method: 'PATCH', body: { anonymous: on } });
    await reload();
    toast(on ? t('Your name is hidden on leaderboards') : t('Your name shows on leaderboards'));
  };

  return (
    <Screen title={t('Me')} eyebrow={me.user.name} action={stats && (
      <button className="iconbtn" aria-label={t('Share my streak')} onClick={() => shareCard({ name: stats.striver.name, streak: stats.streak, mosque: stats.home?.name ?? 'Rijal al-Fajr' })}><Share2 size={19} /></button>
    )}>
      {family.length > 0 && (
        <div className="seg" role="group" style={{ overflowX: 'auto' }}>
          {me.strivers.map((s) => (
            <button key={s.id} aria-pressed={who === s.id} onClick={() => setWho(s.id)}>{s.self ? t('Me') : s.name.split(' ')[0]}</button>
          ))}
        </div>
      )}
      {error ? <Problem error={error} retry={reloadStats} /> : !stats ? <Loading /> : (
        <>
          <section className="hero">
            <Eyebrow icon={<Sunrise size={15} />}>{stats.striver.name}</Eyebrow>
            <div className="big num" style={{ marginTop: 12 }}>{stats.total}<small>{stats.total === 1 ? t('Fajr at the mosque') : t('Fajr prayers at the mosque')}</small></div>
            <div className="stats">
              <div><label>{t('Streak now')}</label><b className="num">{stats.streak}</b></div>
              <div><label>{t('Best streak')}</label><b className="num">{stats.best}</b></div>
              <div><label>{t('Mosques')}</label><b className="num">{stats.mosques}</b></div>
            </div>
          </section>

          <section className="card">
            <Eyebrow icon={<CalendarDays size={15} />}>{t('Last five weeks')}</Eyebrow>
            <Calendar stats={stats} />
            {stats.recent.length > 0 && <p className="muted small" style={{ marginTop: 12 }}>{[t('Last at {mosque}.', { mosque: stats.recent[0].mosque }), stats.excused.length > 0 && t('Striped days were excused by your mosque and do not break a streak.')].filter(Boolean).join(' ')}</p>}
          </section>

          <section className="card">
            <div className="between" style={{ marginBottom: 12 }}>
              <Eyebrow icon={<Award size={15} />}>{t('Badges')}</Eyebrow>
              <span className="muted small">{t('{count} of {total}', { count: stats.badges.filter((b) => b.earned).length, total: stats.badges.length })}</span>
            </div>
            <div className="badges">
              {stats.badges.map((b) => (
                <div key={b.id} className={`badge${b.earned ? ' earned' : ''}`} title={t(b.detail)}>
                  <div className="disc">{BADGE_ICON[b.id]}</div>
                  {t(b.name)}
                  <div className="muted" style={{ fontWeight: 500, fontSize: 11.5 }}>{b.earned ? t(b.detail) : `${b.progress}/${b.goal}`}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="card">
        <div className="between" style={{ marginBottom: 6 }}>
          <Eyebrow icon={<Users size={15} />}>{t('Family')}</Eyebrow>
          <button className="btn soft sm" onClick={() => setSheet('family')}><Plus size={16} />{' '}{t('Add')}</button>
        </div>
        {family.length ? (
          <div className="list">
            {family.map((f) => (
              <div className="item" key={f.id}>
                <span className="avatar"><UserRound size={18} /></span>
                <span className="grow"><b>{f.name}</b><span className="sub" style={{ display: 'block' }}>{groupName(f.grp)}</span></span>
                <Link className="btn soft sm" to={`/kids/${f.id}`}><Baby size={15} />{' '}{t('Kids\' view')}</Link>
                <button className="btn ghost sm" onClick={() => setSheet(f)}>{t('Edit')}</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">{t('Add your children and check them in with your own scan. They need no phone and no account.')}</p>
        )}
      </section>

      <section className="card">
        <Eyebrow icon={<Send size={15} />}>{t('Bring a friend to Fajr')}</Eyebrow>
        <p className="small" style={{ marginBottom: 12 }}>{t('Someone who joins with your link starts at your mosque as your buddy. Bring three who come to Fajr and you earn the Caller to Good badge.')}</p>
        <button className="btn block" onClick={() => shareInvite(me.user.inviteCode, toast)}><Send size={17} />{' '}{t('Share my invitation link')}</button>
      </section>

      <section className="card tight">
        <LinkRow to="/buddies" icon={<HeartHandshake size={19} />} title={t('Fajr buddies')} sub={t('See who made it today, and nudge')} />
        <LinkRow to="/review" icon={<CalendarRange size={19} />} title={t('My year in review')} sub={t('Your dawns, month by month')} />
        {me.staff.map((m) => <LinkRow key={m.id} to={`/manage/${m.id}`} icon={<Landmark size={19} />} title={m.name} sub={m.role === 'admin' ? t('You are an admin') : t('You are a volunteer')} />)}
        {me.orgs.map((o) => <LinkRow key={o.id} to={`/org/${o.id}`} icon={<UsersRound size={19} />} title={o.name} sub={t('Your organisation')} />)}
        <LinkRow to="/find" icon={<MapPinned size={19} />} title={t('Find or change my mosque')} sub={stats?.home?.name ?? t('No home mosque yet')} />
        <LinkRow to="/new-mosque" icon={<Building2 size={19} />} title={t('Register a mosque')} sub={t('Set up check-in, a leaderboard and prizes')} />
        <button className="item" onClick={() => setSheet('org')}>
          <span className="icon"><UsersRound size={19} /></span>
          <span className="grow"><b>{t('Start an organisation')}</b><span className="sub" style={{ display: 'block' }}>{t('Group several mosques under one leaderboard')}</span></span>
        </button>
        <LinkRow to="/sponsor" icon={<HandHeart size={19} />} title={t('Offer to sponsor')} sub={t('Prizes, breakfast or funds for a mosque')} />
        {me.user.owner && <LinkRow to="/owner" icon={<ShieldCheck size={19} />} title={t('Owner console')} sub={t('Approve mosques and handle reports')} />}
      </section>

      <section className="card form">
        <Field label={t('My weekly goal')} hint={t('For when every day is not possible. It shows on Today.')}>
          <select value={self.weeklyGoal} onChange={async (e) => { await api('/me', { method: 'PATCH', body: { weeklyGoal: Number(e.target.value) } }); await reload(); reloadStats(); toast(t('Goal saved')); }}>
            <option value={0}>{t('No weekly goal')}</option>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n === 7 ? t('Every dawn') : tn(n, '{n} dawn a week', '{n} dawns a week')}</option>)}
          </select>
        </Field>
        <LanguagePicker label={t('Language')} />
        <Switch label={t('Dark mode')} checked={dark} onChange={setTheme} />
        <Switch label={t('Hide my name on leaderboards')} hint={t('You and your family appear as “Anonymous striver”.')} checked={self.anonymous} onChange={setAnonymous} />
      </section>

      <section className="card tight">
        <LinkRow to="/rules" icon={<Trophy size={19} />} title={t('Rules and fair play')} />
        <LinkRow to="/privacy" icon={<ShieldCheck size={19} />} title={t('Privacy')} sub={me.user.email} />
        <a className="item" href="/about/"><span className="icon">{dark ? <Moon size={19} /> : <Sun size={19} />}</span><span className="grow"><b>{t('About Rijal al-Fajr')}</b></span></a>
        <button className="item" onClick={() => { signOut(); nav('/'); }}><span className="icon"><LogOut size={19} /></span><span className="grow"><b>{t('Sign out')}</b></span></button>
        <button className="item" onClick={() => setSheet('delete')} style={{ color: 'var(--danger)' }}>
          <span className="icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><Trash2 size={19} /></span>
          <span className="grow"><b>{t('Delete my account')}</b></span>
        </button>
      </section>

      {(sheet === 'family' || (sheet && typeof sheet === 'object')) && (
        <FamilySheet member={typeof sheet === 'object' ? sheet : null} onClose={() => setSheet(null)} onSaved={async () => { await reload(); setWho(self.id); setSheet(null); }} />
      )}
      {sheet === 'org' && <OrgSheet onClose={() => setSheet(null)} onMade={async (id) => { await reload(); nav(`/org/${id}`); }} />}
      {sheet === 'delete' && <DeleteSheet onClose={() => setSheet(null)} onDone={() => { signOut(); nav('/'); }} />}
      <p className="muted small" style={{ textAlign: 'center' }}>{tn(me.strivers.length, 'Free, with no ads. {n} person on this account.', 'Free, with no ads. {n} people on this account.')}</p>
    </Screen>
  );
}

function FamilySheet({ member, onClose, onSaved }: { member: Striver | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(member?.name ?? '');
  const [grp, setGrp] = useState<Group>(member?.grp ?? 'kids');
  const act = useAction();
  return (
    <Sheet title={member ? t('Edit family member') : t('Add a family member')} onClose={onClose}>
      <div className="form">
        <Field label={t('Name')} hint={t('Only this name and group are stored for a child.')}><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={t('e.g. Musa')} /></Field>
        <Field label={t('Group')}>
          <select value={grp} onChange={(e) => setGrp(e.target.value as Group)}>{GROUPS.map((g) => <option key={g} value={g}>{groupName(g)}</option>)}</select>
        </Field>
        {act.error && <div className="note err">{act.error}</div>}
        <button className="btn block" disabled={act.busy || !name.trim()}
          onClick={() => act.run(async () => { await api(member ? `/family/${member.id}` : '/family', { method: member ? 'PATCH' : 'POST', body: { name, grp } }); onSaved(); })}>
          {t('Save')}
        </button>
        {member && (
          <button className="btn danger block" disabled={act.busy}
            onClick={() => confirm(t('Remove {name} and their check-ins?', { name: member.name })) && act.run(async () => { await api(`/family/${member.id}`, { method: 'DELETE' }); onSaved(); })}>
            {t('Remove')}
          </button>
        )}
      </div>
    </Sheet>
  );
}

function OrgSheet({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const [name, setName] = useState('');
  const act = useAction();
  return (
    <Sheet title={t('Start an organisation')} onClose={onClose}>
      <div className="form">
        <p className="muted small">{t('For a council of mosques, a school network or a city. You get a code that mosque admins enter to join, a shared leaderboard and your own challenges with prizes.')}</p>
        <Field label={t('Name')}><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t('e.g. Fajr League of Birmingham')} /></Field>
        {act.error && <div className="note err">{act.error}</div>}
        <button className="btn block" disabled={act.busy || name.trim().length < 2}
          onClick={() => act.run(async () => { const r = await api<{ id: string }>('/orgs', { body: { name } }); onMade(r.id); })}>{t('Create')}</button>
      </div>
    </Sheet>
  );
}

function DeleteSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const act = useAction();
  return (
    <Sheet title={t('Delete my account')} onClose={onClose}>
      <div className="form">
        <p className="small">{t('This deletes your account, your family members and every check-in of yours, for good. It cannot be undone.')}</p>
        <Field label={t('Your password')}><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
        {act.error && <div className="note err">{act.error}</div>}
        <button className="btn danger block" disabled={act.busy || !password}
          onClick={() => act.run(async () => { await api('/me', { method: 'DELETE', body: { password } }); onDone(); })}>{t('Delete everything')}</button>
      </div>
    </Sheet>
  );
}
