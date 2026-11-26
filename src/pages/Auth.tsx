import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sunrise } from 'lucide-react';
import { api, GROUPS, type Group } from '../api';
import { Field, Seg, useAction, useSession } from '../ui';

const GROUP_HINT: Record<Group, string> = { kids: 'Under 12', youth: '12 to 17', adults: '18 and over' };

export function AuthForm({ onDone }: { onDone?: () => void }) {
  const { signIn } = useSession();
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [grp, setGrp] = useState<Group>('adults');
  const act = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    act.run(async () => {
      const body = mode === 'signup' ? { email, password, name, grp } : { email, password };
      const { token } = await api<{ token: string }>(`/auth/${mode}`, { body });
      await signIn(token);
      onDone?.();
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <Seg value={mode} onChange={setMode} options={[{ value: 'signup', label: 'Create account' }, { value: 'login', label: 'Sign in' }]} />
      {mode === 'signup' && (
        <>
          <Field label="Your name" hint="Shown on your mosque's leaderboard. You can hide it later.">
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="name" placeholder="e.g. Yusuf A." />
          </Field>
          <Field label="Your group" hint={GROUP_HINT[grp]}>
            <select value={grp} onChange={(e) => setGrp(e.target.value as Group)}>
              {GROUPS.map((g) => (
                <option key={g} value={g}>{g[0].toUpperCase() + g.slice(1)}</option>
              ))}
            </select>
          </Field>
        </>
      )}
      <Field label="Email">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" />
      </Field>
      <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters' : undefined}>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'signup' ? 8 : 1} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
      </Field>
      {act.error && <div className="note err" role="alert">{act.error}</div>}
      <button className="btn block" disabled={act.busy}>{mode === 'signup' ? 'Create account' : 'Sign in'}</button>
      {mode === 'signup' && (
        <p className="muted small">
          By creating an account you agree to the <Link to="/rules">rules</Link> and <Link to="/privacy">privacy policy</Link>.
        </p>
      )}
    </form>
  );
}

export function AuthPage() {
  return (
    <main className="stack" style={{ paddingTop: 20 }}>
      <section className="hero">
        <div className="eyebrow"><Sunrise size={15} /> Rijal al-Fajr</div>
        <h1 style={{ fontSize: 34, lineHeight: 1.08, letterSpacing: '-0.025em', fontWeight: 750, margin: '12px 0 10px' }}>
          Be counted among the people of Fajr.
        </h1>
        <p className="muted">Check in at your mosque each dawn, keep your streak, and help your mosque climb the world leaderboard.</p>
      </section>
      <section className="card">
        <AuthForm />
      </section>
      <p className="muted small" style={{ textAlign: 'center' }}>
        <a href="/about/">What is Rijal al-Fajr?</a>
      </p>
    </main>
  );
}
