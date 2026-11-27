import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, Clock, Crown, IdCard, MapPin, ScanLine, Sparkles } from 'lucide-react';
import { api, ApiError, type Win } from '../api';
import { Confetti, Eyebrow, Loading, Qr, Scanner, Screen, Sheet, Skeleton, useAction, useMe, useSession } from '../ui';
import { AuthForm } from './Auth';
import { deviceId, getPosition, niceDate, plural, timeIn } from '../lib/util';
import { shareCard } from '../lib/share';
import { t, tn, tx } from '../lib/i18n';
import { milestoneText } from './Social';

const isCheckinCode = (t: string) => /(^|\/c\/)[rsh]\.[a-z0-9]+\./.test(t.trim());

export function ScanPage() {
  const me = useMe();
  const nav = useNavigate();
  const [note, setNote] = useState<string | null>(null);
  const [card, setCard] = useState(false);
  return (
    <Screen title={t('Check in')} eyebrow={t('Scan the mosque QR code')}>
      <Scanner
        paused={card}
        onCode={(text) => {
          if (isCheckinCode(text)) nav(`/c/${text.trim().replace(/^.*\/c\//, '')}`);
          else setNote(t('That QR code is not a Rijal al-Fajr check-in code.'));
        }}
      />
      {note && <div className="note err" role="alert">{note}</div>}
      <section className="card">
        <Eyebrow icon={<ScanLine size={15} />}>{t('How it works')}</Eyebrow>
        <p className="small">{t('Point your camera at the code on the mosque\'s screen or poster. Check-in is open from shortly before Fajr until sunrise, once per day, at any registered mosque.')}</p>
      </section>
      <button className="btn ghost" onClick={() => setCard(true)}><IdCard size={18} />{' '}{t('Show my card instead')}</button>
      {card && (
        <Sheet title={t('My card')} onClose={() => setCard(false)}>
          <p className="muted small" style={{ marginBottom: 14 }}>{t('A volunteer at the mosque can scan this to check you in.')}</p>
          <div className="cards">
            {me.strivers.map((s) => (
              <div className="pcard" key={s.id}>
                <Qr text={`${location.origin}/k/${s.cardCode}`} size={300} alt={t('Card for {name}', { name: s.name })} />
                <b style={{ display: 'block' }}>{s.name}</b>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </Screen>
  );
}

interface Preview {
  mosque: { id: string; name: string; city: string };
  window: Win;
  practice: boolean;
  needsLocation: boolean;
  code: string;
}
interface Result {
  mosque: { id: string; name: string };
  date: string;
  results: { striverId: string; name: string; fresh: boolean; streak: number; best: number; reached?: { kind: string; value: number }[] }[];
}

export function CheckinPage() {
  const { code } = useParams();
  const { me } = useSession();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [fail, setFail] = useState<ApiError | null>(null);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const act = useAction();
  const auto = useRef(false);

  useEffect(() => {
    let live = true;
    api<Preview>('/checkin/preview', { body: { code } }).then(
      (p) => live && setPreview(p),
      (e) => live && setFail(e),
    );
    return () => {
      live = false;
    };
  }, [code]);

  useEffect(() => {
    if (me && !picked) setPicked(new Set(me.strivers.map((s) => s.id)));
  }, [me, picked]);

  const submit = (ids: string[]) =>
    act.run(async () => {
      let where = {};
      if (preview!.needsLocation) {
        const p = await getPosition();
        where = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
      }
      setResult(await api<Result>('/checkin', { body: { code: preview!.code, striverIds: ids, device: deviceId(), ...where } }));
    });

  // One person, nothing to choose: check in straight away.
  const single = me?.strivers.length === 1;
  useEffect(() => {
    if (preview && preview.window.open && me && single && !auto.current) {
      auto.current = true;
      submit([me.strivers[0].id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, me, single]);

  if (fail) {
    return (
      <Screen title={t('Check in')} back="/">
        <section className="card empty">
          <b>{fail.code === 'expired_code' ? t('That code has expired') : t('This code did not work')}</b>
          {fail.message}
          <div><Link className="btn" to="/checkin">{t('Scan again')}</Link></div>
        </section>
      </Screen>
    );
  }
  if (!preview) return <Screen title={t('Check in')}><Skeleton cards={1} /></Screen>;
  const { mosque, window: win } = preview;

  if (result) return <Done result={result} />;

  return (
    <Screen title={mosque.name} eyebrow={t('Fajr check-in')} back="/">
      {!win.open ? (
        <section className="card empty">
          <span className="icon" style={{ margin: '0 auto 10px' }}><Clock size={20} /></span>
          <b>{t('Check-in is closed right now')}</b>
          {t('It opens around Fajr. Next: {day} at {time} your time.', { day: niceDate(win.date, { weekday: 'long' }), time: timeIn(win.opens, Intl.DateTimeFormat().resolvedOptions().timeZone) })}
          <p className="small" style={{ marginTop: 10 }}>{t('Are you the admin? Turn on practice mode in the mosque settings to try it now.')}</p>
        </section>
      ) : !me ? (
        <>
          <div className="note">{tx('You are at <b>{name}</b>. Create an account or sign in, and your Fajr is checked in.', { name: mosque.name })}</div>
          <section className="card"><AuthForm /></section>
        </>
      ) : (
        <>
          {preview.practice && <div className="note">{t('Practice mode is on for this mosque, so check-in works at any time.')}</div>}
          {!single && picked && (
            <section className="card">
              <Eyebrow>{t('Who is here?')}</Eyebrow>
              <div className="list">
                {me.strivers.map((s) => {
                  const on = picked.has(s.id);
                  return (
                    <button key={s.id} className="item" aria-pressed={on}
                      onClick={() => { const n = new Set(picked); if (on) n.delete(s.id); else n.add(s.id); setPicked(n); }}>
                      <span className={`check${on ? ' on' : ''}`}><Check size={16} /></span>
                      <span className="grow"><b>{s.name}</b>{s.self && <span className="sub">{' '}{t('· you')}</span>}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {preview.needsLocation && <p className="muted small row"><MapPin size={16} />{' '}{t('We check your location once, to confirm you are at the mosque. It is not saved.')}</p>}
          {act.error && <div className="note err" role="alert">{act.error}</div>}
          {act.busy ? <Loading /> : (!single || act.error) && (
            <button className="btn block" disabled={!picked?.size} onClick={() => submit(single ? [me.strivers[0].id] : [...picked!])}>
              {act.error ? t('Try again') : tn(picked?.size ?? 0, 'Check in {n} person', 'Check in {n} people')}
            </button>
          )}
        </>
      )}
    </Screen>
  );
}

function Done({ result }: { result: Result }) {
  const first = result.results[0];
  const anyFresh = result.results.some((r) => r.fresh);
  return (
    <Screen title={t('Checked in')} eyebrow={niceDate(result.date, { weekday: 'long', day: 'numeric', month: 'long' })}>
      <section className="hero done-hero" style={{ textAlign: 'center' }}>
        {anyFresh && <Confetti />}
        <div className="done-mark"><Check size={44} strokeWidth={2.6} /></div>
        <h2 style={{ fontSize: 24, fontWeight: 750 }}>{anyFresh ? t('Fajr checked in') : t('Already checked in today')}</h2>
        <p className="muted" style={{ marginTop: 4 }}>{result.mosque.name}</p>
        <div className="stats" style={{ gridTemplateColumns: '1fr 1fr', textAlign: 'left' }}>
          <div><label>{t('Streak')}</label><b className="num">{plural(first.streak, 'day')}</b></div>
          <div><label>{t('Best')}</label><b className="num">{plural(first.best, 'day')}</b></div>
        </div>
      </section>
      {result.results.flatMap((r) => (r.reached ?? []).map((m) => ({ ...m, name: r.name }))).map((m, i) => (
        <div className={`note reached${m.kind === 'streak' && m.value >= 40 ? ' gold' : ''}`} key={i}>
          {m.kind === 'streak' && m.value >= 40 ? <Crown size={20} /> : <Sparkles size={20} />}
          <span>
            <b style={{ display: 'block' }}>{result.results.length > 1 ? `${m.name}: ${milestoneText(m.kind, m.value)}` : milestoneText(m.kind, m.value)}</b>
            {m.kind === 'streak' && m.value >= 40 ? t('Forty dawns in a row. This name is now on the mosque’s roll of honour.') : t('A new milestone. Your mosque can say Masha’Allah.')}
          </span>
        </div>
      ))}
      {result.results.length > 1 && (
        <section className="card tight">
          <div className="list">
            {result.results.map((r) => (
              <div className="item" key={r.striverId}>
                <span className="check on"><Check size={16} /></span>
                <span className="grow"><b>{r.name}</b></span>
                <span className="sub num">{tn(r.streak, '{n} day in a row', '{n} days in a row')}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="muted small" style={{ textAlign: 'center' }}>{t('May Allah accept it from you.')}</p>
      <Link className="btn block" to={`/m/${result.mosque.id}`}>{t('See the leaderboard')}</Link>
      <button className="btn ghost block" onClick={() => shareCard({ name: first.name, streak: first.streak, mosque: result.mosque.name })}>{t('Share my streak')}</button>
      <Link className="btn ghost block" to="/">{t('Done')}</Link>
    </Screen>
  );
}
