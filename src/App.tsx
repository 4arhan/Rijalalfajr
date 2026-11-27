import { useEffect } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Globe, Landmark, ScanLine, Sunrise, User } from 'lucide-react';
import { Loading, useSession } from './ui';
import { AuthPage } from './pages/Auth';
import { TodayPage } from './pages/Today';
import { MosquePage, MyMosque } from './pages/Mosque';
import { FindPage } from './pages/Find';
import { CheckinPage, ScanPage } from './pages/Checkin';
import { WorldPage } from './pages/World';
import { MePage } from './pages/Me';
import { ChallengePage, ChallengeEdit } from './pages/Challenge';
import { OrgPage } from './pages/Org';
import { ManagePage, AttendancePage, ScreenPage, PrintPage } from './pages/Manage';
import { MosqueSettings } from './pages/MosqueSettings';
import { OwnerPage } from './pages/Owner';
import { PrivacyPage, RulesPage } from './pages/Legal';
import { MosqueSponsors, SponsorPage } from './pages/Sponsor';
import { BuddiesPage, KidsPage, ReviewPage } from './pages/Personal';
import { CertificatesPage, ClassPage, ClassesPage, EmbedPage } from './pages/Community';
import { ImportPage, MissingPage, WishesPage } from './pages/Staff';
import { t } from './lib/i18n';

function Nav() {
  return (
    <nav className="nav" aria-label={t('Main')}>
      <NavLink to="/" end aria-label={t('Today')}><Sunrise size={21} /><span>{t('Today')}</span></NavLink>
      <NavLink to="/mosque" aria-label={t('Mosque')}><Landmark size={21} /><span>{t('Mosque')}</span></NavLink>
      <NavLink to="/checkin" className={({ isActive }) => `scan${isActive ? ' active' : ''}`} aria-label={t('Check in')}><ScanLine size={22} /></NavLink>
      <NavLink to="/world" aria-label={t('World')}><Globe size={21} /><span>{t('World')}</span></NavLink>
      <NavLink to="/me" aria-label={t('Me')}><User size={21} /><span>{t('Me')}</span></NavLink>
    </nav>
  );
}

/** An invitation link: remember who invited, then go to sign-up. */
function Invite() {
  const { code } = useParams();
  useEffect(() => {
    if (code) localStorage.setItem('raf.invite', code.toUpperCase());
  }, [code]);
  return <Navigate to="/" replace />;
}

/** After signing up from a public page, go back to where you were. */
function Join() {
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/';
  return <Navigate to={next.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />;
}

/** Shown to visitors who are looking at a public page without an account. */
function GuestBar() {
  const loc = useLocation();
  return (
    <div className="guestbar">
      <span><b>Rijal al-Fajr</b><small>{t('Check in for Fajr and join the leaderboard')}</small></span>
      <Link className="btn sm" to={`/join?next=${encodeURIComponent(loc.pathname)}`}>{t('Join free')}</Link>
    </div>
  );
}

export function App() {
  const { me, ready } = useSession();
  const loc = useLocation();
  const nav = useNavigate();
  const path = loc.pathname;
  // An invitation is remembered even if the person is already looking around.
  useEffect(() => {
    const m = /^\/i\/([A-Za-z0-9]+)/.exec(path);
    if (m) {
      localStorage.setItem('raf.invite', m[1].toUpperCase());
      nav('/', { replace: true });
    }
  }, [path, nav]);
  if (!ready) return <div className="shell bare"><Loading /></div>;

  if (path.startsWith('/embed/')) {
    return (
      <Routes>
        <Route path="/embed/m/:id" element={<EmbedPage />} />
      </Routes>
    );
  }

  // Pages anyone can open from a link. A scanned code keeps its place through sign-up.
  const open = /^\/(c\/|privacy|rules|world|m\/|org\/|class\/|challenge\/[^/]+$)/.test(path) && path !== '/challenge/new';
  if (!me && !open) {
    return (
      <Routes>
        <Route path="*" element={<AuthPage />} />
      </Routes>
    );
  }
  const bare = /^\/(c\/|manage\/[^/]+\/screen)/.test(path) || !me;
  const guest = !me && !/^\/(c\/|privacy|rules)/.test(path);
  return (
    <div className={`shell${bare && !guest ? ' bare' : ''}`}>
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/i/:code" element={<Invite />} />
        <Route path="/join" element={<Join />} />
        <Route path="/mosque" element={<MyMosque />} />
        <Route path="/m/:id" element={<MosquePage />} />
        <Route path="/find" element={<FindPage />} />
        <Route path="/checkin" element={<ScanPage />} />
        <Route path="/c/:code" element={<CheckinPage />} />
        <Route path="/world" element={<WorldPage />} />
        <Route path="/me" element={<MePage />} />
        <Route path="/buddies" element={<BuddiesPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/kids/:id" element={<KidsPage />} />
        <Route path="/challenge/new" element={<ChallengeEdit />} />
        <Route path="/challenge/:id" element={<ChallengePage />} />
        <Route path="/challenge/:id/edit" element={<ChallengeEdit />} />
        <Route path="/challenge/:id/certificates" element={<CertificatesPage />} />
        <Route path="/org/:id" element={<OrgPage />} />
        <Route path="/class/:id" element={<ClassPage />} />
        <Route path="/new-mosque" element={<MosqueSettings />} />
        <Route path="/manage/:id" element={<ManagePage />} />
        <Route path="/manage/:id/settings" element={<MosqueSettings />} />
        <Route path="/manage/:id/list" element={<AttendancePage />} />
        <Route path="/manage/:id/screen" element={<ScreenPage />} />
        <Route path="/manage/:id/print" element={<PrintPage />} />
        <Route path="/manage/:id/classes" element={<ClassesPage />} />
        <Route path="/manage/:id/sponsors" element={<MosqueSponsors />} />
        <Route path="/manage/:id/missing" element={<MissingPage />} />
        <Route path="/manage/:id/wishes" element={<WishesPage />} />
        <Route path="/manage/:id/import" element={<ImportPage />} />
        <Route path="/sponsor" element={<SponsorPage />} />
        <Route path="/owner" element={<OwnerPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {guest ? <GuestBar /> : !bare && <Nav />}
    </div>
  );
}
