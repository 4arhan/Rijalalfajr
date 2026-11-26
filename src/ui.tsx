import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { api, ApiError, getToken, setToken, type Me, type Standing } from './api';
import { initials, plural } from './lib/util';

// ---------- session ----------

interface Session {
  me: Me | null;
  ready: boolean;
  reload: () => Promise<void>;
  signIn: (token: string) => Promise<void>;
  signOut: () => void;
}
const SessionCtx = createContext<Session>(null as never);
export const useSession = () => useContext(SessionCtx);
/** For screens behind sign-in, where the account is always loaded. */
export const useMe = () => useContext(SessionCtx).me!;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const reload = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setReady(true);
      return;
    }
    try {
      const fresh = await api<Me>('/me');
      localStorage.setItem('raf.me', JSON.stringify(fresh));
      setMe(fresh);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setToken(null);
        setMe(null);
      } else if (e instanceof ApiError && e.code === 'offline') {
        // No signal: carry on as the account that was last signed in on this phone.
        try {
          setMe(JSON.parse(localStorage.getItem('raf.me') ?? 'null'));
        } catch {
          /* nothing saved */
        }
      }
    }
    setReady(true);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  const signIn = useCallback(
    async (token: string) => {
      setToken(token);
      await reload();
    },
    [reload],
  );
  const signOut = useCallback(() => {
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('raf.me');
    setToken(null);
    setMe(null);
  }, []);
  return <SessionCtx.Provider value={{ me, ready, reload, signIn, signOut }}>{children}</SessionCtx.Provider>;
}

// ---------- toast ----------

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

// ---------- layout ----------

export function Screen(props: { title: string; eyebrow?: ReactNode; back?: string | true; action?: ReactNode; children: ReactNode }) {
  const nav = useNavigate();
  useEffect(() => {
    document.title = `${props.title} · Rijal al-Fajr`;
  }, [props.title]);
  return (
    <>
      <header className="topbar">
        {props.back && (
          <button className="iconbtn" aria-label="Back" onClick={() => (props.back === true ? nav(-1) : nav(props.back as string))}>
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="titles">
          {props.eyebrow && <div className="eyebrow">{props.eyebrow}</div>}
          <h1>{props.title}</h1>
        </div>
        {props.action}
      </header>
      <main className="stack">{props.children}</main>
    </>
  );
}

export function Loading() {
  return (
    <div className="center">
      <div className="spinner" role="status" aria-label="Loading" />
    </div>
  );
}

export function Problem({ error, retry }: { error: { message: string }; retry?: () => void }) {
  return (
    <div className="card empty">
      <b>That did not load</b>
      {error.message}
      {retry && (
        <div>
          <button className="btn ghost sm" onClick={retry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export function Eyebrow({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="eyebrow">
      {icon}
      {children}
    </div>
  );
}

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch">
      <span>
        <b style={{ fontWeight: 650 }}>{label}</b>
        {hint && <span className="muted small" style={{ display: 'block' }}>{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function LinkRow({ to, icon, title, sub, end }: { to: string; icon: ReactNode; title: string; sub?: string; end?: ReactNode }) {
  return (
    <Link className="item" to={to}>
      <span className="icon">{icon}</span>
      <span className="grow">
        <b className="truncate" style={{ display: 'block' }}>{title}</b>
        {sub && <span className="sub">{sub}</span>}
      </span>
      {end ?? <ArrowRight size={18} className="muted" />}
    </Link>
  );
}

/** Runs an action with a busy flag and shows its error. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}

// ---------- competition ----------

export function Podium({ rows, prizes }: { rows: Standing[]; prizes?: (string | undefined)[] }) {
  const order = [1, 0, 2];
  return (
    <div className="podium">
      {order.map((i) => {
        const r = rows[i];
        return (
          <div key={i} className={`place p${i + 1}`}>
            <div className="medal">{r ? initials(r.name) : '–'}</div>
            <div className="who">{r?.name ?? 'Open'}</div>
            <div className="days">{r ? plural(r.days, 'day') : 'No one yet'}</div>
            <div className="step">
              <b>{i + 1}</b>
              {prizes?.[i] && <span className="prize">{prizes[i]}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RankList({ rows, mine, from = 0 }: { rows: Standing[]; mine: Set<string>; from?: number }) {
  return (
    <div className="list">
      {rows.slice(from).map((r) => (
        <div key={r.striverId} className={`item${mine.has(r.striverId) ? ' me' : ''}`}>
          <span className="rank num">{r.rank}</span>
          <span className="avatar">{initials(r.name)}</span>
          <span className="grow">
            <b className="truncate" style={{ display: 'block' }}>
              {r.name}
              {mine.has(r.striverId) && <span className="muted"> · you</span>}
            </b>
            <span className="sub">Best streak {r.bestStreak}</span>
          </span>
          <span className="score num">
            <b>{r.days}</b>
            <small>{r.days === 1 ? 'day' : 'days'}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

export function Ring({ value, size = 104, children }: { value: number; size?: number; children?: ReactNode }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`${Math.round(value * 100)} percent`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(168,240,207,.16)" strokeWidth="9" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#a8f0cf"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="mid">{children}</div>
    </div>
  );
}

// ---------- QR ----------

export function Qr({ text, size = 640, alt }: { text: string; size?: number; alt: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' }).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [text, size]);
  return src ? <img src={src} alt={alt} width={size} height={size} /> : <div style={{ aspectRatio: '1' }} />;
}

/** Camera QR reader. Calls onCode once per distinct code. */
export function Scanner({ onCode, paused }: { onCode: (text: string) => void; paused?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const cb = useRef(onCode);
  cb.current = onCode;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let stream: MediaStream | undefined;
    let raf = 0;
    let stopped = false;
    let last = '';
    let lastAt = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const Detector = (window as any).BarcodeDetector;
    const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null;

    const found = (text: string) => {
      const t = Date.now();
      if (text === last && t - lastAt < 4000) return;
      last = text;
      lastAt = t;
      cb.current(text);
    };

    const tick = async () => {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2 && !pausedRef.current) {
        const scale = Math.min(1, 640 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        try {
          if (detector) {
            const codes = await detector.detect(canvas);
            if (codes[0]?.rawValue) found(codes[0].rawValue);
          } else {
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height);
            if (code?.data) found(code.data);
          }
        } catch {
          /* a bad frame: try the next one */
        }
      }
      raf = window.setTimeout(tick, 180);
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      setProblem('This browser cannot open the camera. Use your phone camera on the QR code instead.');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => {});
        }
        tick();
      })
      .catch(() => setProblem('The camera is blocked. Allow camera access, or scan the QR code with your phone camera.'));
    return () => {
      stopped = true;
      clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="viewfinder">
      <video ref={video} playsInline muted />
      {problem ? <div className="msg">{problem}</div> : <div className="frame" />}
    </div>
  );
}
