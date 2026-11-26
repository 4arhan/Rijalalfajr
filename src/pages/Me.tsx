import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Award, Building2, HandHeart, CalendarDays, Crown, Flame, Footprints, Landmark, LogOut, MapPinned, Medal, Moon, Plus, Share2, ShieldCheck, Sparkles, Star,
  Sun, Sunrise, Trash2, Trophy, UserRound, Users, UsersRound,
} from 'lucide-react';
import { api, GROUPS, type Group, type Stats, type Striver } from '../api';
import { Eyebrow, Field, LinkRow, Loading, Problem, Screen, Sheet, Switch, useAction, useMe, useSession, useToast } from '../ui';
import { addDays, plural, useLoad } from '../lib/util';
import { shareCard } from '../lib/share';

const BADGE_ICON: Record<string, React.ReactNode> = {
  first: <Sunrise size={24} />, three: <Footprints size={24} />, week: <Flame size={24} />, fortnight: <Star size={24} />, steadfast: <Medal size={24} />,
  rijal: <Crown size={24} />, hundred: <Trophy size={24} />, musafir: <MapPinned size={24} />, early: <Sparkles size={24} />,
};

function Calendar({ stats }: { stats: Stats }) {
  const on = new Set(stats.dates);
  // Five weeks ending this week, Monday first.
  const [y, m, d] = stats.today.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const start = addDays(stats.today, -dow - 28);
  const days = Array.from({ length: 35 }, (_, i) => addDays(start, i));
  return (
    <div className="cal">
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <span className="dow" key={i}>{x}</span>)}
      {days.map((day) => (
        <i key={day} className={`${on.has(day) ? 'on' : ''}${day === stats.today ? ' today' : ''}`} style={day > stats.today ? { opacity: 0.35 } : undefined}
          aria-label={`${day}${on.has(day) ? ', at Fajr' : ''}`}>
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
    toast(on ? 'Your name is hidden on leaderboards' : 'Your name shows on leaderboards');
  };

  return (
    <Screen title="Me" eyebrow={me.user.name} action={stats && (
      <button className="iconbtn" aria-label="Share my streak" onClick={() => shareCard({ name: stats.striver.name, streak: stats.streak, mosque: stats.home?.name ?? 'Rijal al-Fajr' })}><Share2 size={19} /></button>
    )}>
      {family.length > 0 && (
        <div className="seg" role="group" style={{ overflowX: 'auto' }}>
          {me.strivers.map((s) => (
            <button key={s.id} aria-pressed={who === s.id} onClick={() => setWho(s.id)}>{s.self ? 'Me' : s.name.split(' ')[0]}</button>
          ))}
        </div>
      )}
      {error ? <Problem error={error} retry={reloadStats} /> : !stats ? <Loading /> : (
        <>
          <section className="hero">
            <Eyebrow icon={<Sunrise size={15} />}>{stats.striver.name}</Eyebrow>
            <div className="big num" style={{ marginTop: 12 }}>{stats.total}<small>{stats.total === 1 ? 'Fajr at the mosque' : 'Fajr prayers at the mosque'}</small></div>
            <div className="stats">
              <div><label>Streak now</label><b className="num">{stats.streak}</b></div>
              <div><label>Best streak</label><b className="num">{stats.best}</b></div>
              <div><label>Mosques</label><b className="num">{stats.mosques}</b></div>
            </div>
          </section>

          <section className="card">
            <Eyebrow icon={<CalendarDays size={15} />}>Last five weeks</Eyebrow>
            <Calendar stats={stats} />
            {stats.recent.length > 0 && <p className="muted small" style={{ marginTop: 12 }}>Last at {stats.recent[0].mosque}.</p>}
          </section>

          <section className="card">
            <div className="between" style={{ marginBottom: 12 }}>
              <Eyebrow icon={<Award size={15} />}>Badges</Eyebrow>
              <span className="muted small">{stats.badges.filter((b) => b.earned).length} of {stats.badges.length}</span>
            </div>
            <div className="badges">
              {stats.badges.map((b) => (
                <div key={b.id} className={`badge${b.earned ? ' earned' : ''}`} title={b.detail}>
                  <div className="disc">{BADGE_ICON[b.id]}</div>
                  {b.name}
                  <div className="muted" style={{ fontWeight: 500, fontSize: 11.5 }}>{b.earned ? b.detail : `${b.progress}/${b.goal}`}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="card">
        <div className="between" style={{ marginBottom: 6 }}>
          <Eyebrow icon={<Users size={15} />}>Family</Eyebrow>
          <button className="btn soft sm" onClick={() => setSheet('family')}><Plus size={16} /> Add</button>
        </div>
        {family.length ? (
          <div className="list">
            {family.map((f) => (
              <button className="item" key={f.id} onClick={() => setSheet(f)}>
                <span className="avatar"><UserRound size={18} /></span>
                <span className="grow"><b>{f.name}</b><span className="sub" style={{ display: 'block' }}>{f.grp[0].toUpperCase() + f.grp.slice(1)}</span></span>
                <span className="sub">Edit</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">Add your children and check them in with your own scan. They need no phone and no account.</p>
        )}
      </section>

      <section className="card tight">
        {me.staff.map((m) => <LinkRow key={m.id} to={`/manage/${m.id}`} icon={<Landmark size={19} />} title={m.name} sub={m.role === 'admin' ? 'You are an admin' : 'You are a volunteer'} />)}
        {me.orgs.map((o) => <LinkRow key={o.id} to={`/org/${o.id}`} icon={<UsersRound size={19} />} title={o.name} sub="Your organisation" />)}
        <LinkRow to="/find" icon={<MapPinned size={19} />} title="Find or change my mosque" sub={stats?.home?.name ?? 'No home mosque yet'} />
        <LinkRow to="/new-mosque" icon={<Building2 size={19} />} title="Register a mosque" sub="Set up check-in, a leaderboard and prizes" />
        <button className="item" onClick={() => setSheet('org')}>
          <span className="icon"><UsersRound size={19} /></span>
          <span className="grow"><b>Start an organisation</b><span className="sub" style={{ display: 'block' }}>Group several mosques under one leaderboard</span></span>
        </button>
        <LinkRow to="/sponsor" icon={<HandHeart size={19} />} title="Offer to sponsor" sub="Prizes, breakfast or funds for a mosque" />
        {me.user.owner && <LinkRow to="/owner" icon={<ShieldCheck size={19} />} title="Owner console" sub="Approve mosques and handle reports" />}
      </section>

      <section className="card form">
        <Switch label="Dark mode" checked={dark} onChange={setTheme} />
        <Switch label="Hide my name on leaderboards" hint="You and your family appear as “Anonymous striver”." checked={self.anonymous} onChange={setAnonymous} />
      </section>

      <section className="card tight">
        <LinkRow to="/rules" icon={<Trophy size={19} />} title="Rules and fair play" />
        <LinkRow to="/privacy" icon={<ShieldCheck size={19} />} title="Privacy" sub={me.user.email} />
        <a className="item" href="/about/"><span className="icon">{dark ? <Moon size={19} /> : <Sun size={19} />}</span><span className="grow"><b>About Rijal al-Fajr</b></span></a>
        <button className="item" onClick={() => { signOut(); nav('/'); }}><span className="icon"><LogOut size={19} /></span><span className="grow"><b>Sign out</b></span></button>
        <button className="item" onClick={() => setSheet('delete')} style={{ color: 'var(--danger)' }}>
          <span className="icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><Trash2 size={19} /></span>
          <span className="grow"><b>Delete my account</b></span>
        </button>
      </section>

      {(sheet === 'family' || (sheet && typeof sheet === 'object')) && (
        <FamilySheet member={typeof sheet === 'object' ? sheet : null} onClose={() => setSheet(null)} onSaved={async () => { await reload(); setWho(self.id); setSheet(null); }} />
      )}
      {sheet === 'org' && <OrgSheet onClose={() => setSheet(null)} onMade={async (id) => { await reload(); nav(`/org/${id}`); }} />}
      {sheet === 'delete' && <DeleteSheet onClose={() => setSheet(null)} onDone={() => { signOut(); nav('/'); }} />}
      <p className="muted small" style={{ textAlign: 'center' }}>Free, with no ads. {plural(me.strivers.length, 'person', 'people')} on this account.</p>
    </Screen>
  );
}

function FamilySheet({ member, onClose, onSaved }: { member: Striver | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(member?.name ?? '');
  const [grp, setGrp] = useState<Group>(member?.grp ?? 'kids');
  const act = useAction();
  return (
    <Sheet title={member ? 'Edit family member' : 'Add a family member'} onClose={onClose}>
      <div className="form">
        <Field label="Name" hint="Only this name and group are stored for a child."><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Musa" /></Field>
        <Field label="Group">
          <select value={grp} onChange={(e) => setGrp(e.target.value as Group)}>{GROUPS.map((g) => <option key={g} value={g}>{g[0].toUpperCase() + g.slice(1)}</option>)}</select>
        </Field>
        {act.error && <div className="note err">{act.error}</div>}
        <button className="btn block" disabled={act.busy || !name.trim()}
          onClick={() => act.run(async () => { await api(member ? `/family/${member.id}` : '/family', { method: member ? 'PATCH' : 'POST', body: { name, grp } }); onSaved(); })}>
          Save
        </button>
        {member && (
          <button className="btn danger block" disabled={act.busy}
            onClick={() => confirm(`Remove ${member.name} and their check-ins?`) && act.run(async () => { await api(`/family/${member.id}`, { method: 'DELETE' }); onSaved(); })}>
            Remove
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
    <Sheet title="Start an organisation" onClose={onClose}>
      <div className="form">
        <p className="muted small">For a council of mosques, a school network or a city. You get a code that mosque admins enter to join, a shared leaderboard and your own challenges with prizes.</p>
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Fajr League of Birmingham" /></Field>
        {act.error && <div className="note err">{act.error}</div>}
        <button className="btn block" disabled={act.busy || name.trim().length < 2}
          onClick={() => act.run(async () => { const r = await api<{ id: string }>('/orgs', { body: { name } }); onMade(r.id); })}>Create</button>
      </div>
    </Sheet>
  );
}

function DeleteSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const act = useAction();
  return (
    <Sheet title="Delete my account" onClose={onClose}>
      <div className="form">
        <p className="small">This deletes your account, your family members and every check-in of yours, for good. It cannot be undone.</p>
        <Field label="Your password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
        {act.error && <div className="note err">{act.error}</div>}
        <button className="btn danger block" disabled={act.busy || !password}
          onClick={() => act.run(async () => { await api('/me', { method: 'DELETE', body: { password } }); onDone(); })}>Delete everything</button>
      </div>
    </Sheet>
  );
}
