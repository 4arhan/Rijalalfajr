import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sunrise } from 'lucide-react';
import { api, GROUPS, type Group } from '../api';
import { Field, Seg, useAction, useSession } from '../ui';
import { groupName } from '../lib/util';
import { LanguagePicker, t, tx } from '../lib/i18n';

const GROUP_HINT: Record<Group, string> = { kids: t('Under 12'), youth: t('12 to 17'), adults: t('18 and over') };

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
      const inviteCode = localStorage.getItem('raf.invite') ?? undefined;
      const body = mode === 'signup' ? { email, password, name, grp, inviteCode } : { email, password };
      const { token } = await api<{ token: string }>(`/auth/${mode}`, { body });
      localStorage.removeItem('raf.invite');
      await signIn(token);
      onDone?.();
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <Seg value={mode} onChange={setMode} options={[{ value: 'signup', label: t('Create account') }, { value: 'login', label: t('Sign in') }]} />
      {mode === 'signup' && localStorage.getItem('raf.invite') && (
        <div className="note">{t('A friend invited you. You will start at their mosque, as their Fajr buddy.')}</div>
      )}
      {mode === 'signup' && (
        <>
          <Field label={t('Your name')} hint={t('Shown on your mosque\'s leaderboard. You can hide it later.')}>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="name" placeholder={t('e.g. Yusuf A.')} />
          </Field>
          <Field label={t('Your group')} hint={GROUP_HINT[grp]}>
            <select value={grp} onChange={(e) => setGrp(e.target.value as Group)}>
              {GROUPS.map((g) => (
                <option key={g} value={g}>{groupName(g)}</option>
              ))}
            </select>
          </Field>
        </>
      )}
      <Field label={t('Email')}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" />
      </Field>
      <Field label={t('Password')} hint={mode === 'signup' ? t('At least 8 characters') : undefined}>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'signup' ? 8 : 1} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
      </Field>
      {act.error && <div className="note err" role="alert">{act.error}</div>}
      <button className="btn block" disabled={act.busy}>{mode === 'signup' ? t('Create account') : t('Sign in')}</button>
      {mode === 'signup' && (
        <p className="muted small">
          {tx('By creating an account you agree to the {rules} and {privacy}.', { rules: <Link to="/rules">{t('rules')}</Link>, privacy: <Link to="/privacy">{t('privacy policy')}</Link> })}
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
          {t('Be counted among the people of Fajr.')}
        </h1>
        <p className="muted">{t('Check in at your mosque each dawn, keep your streak, and help your mosque climb the world leaderboard.')}</p>
      </section>
      <section className="card">
        <AuthForm />
      </section>
      <LanguagePicker />
      <p className="muted small" style={{ textAlign: 'center' }}>
        <a href="/about/">{t('What is Rijal al-Fajr?')}</a>
      </p>
    </main>
  );
}
