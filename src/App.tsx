import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
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

function Nav() {
  return (
    <nav className="nav" aria-label="Main">
      <NavLink to="/" end aria-label="Today"><Sunrise size={21} /><span>Today</span></NavLink>
      <NavLink to="/mosque" aria-label="Mosque"><Landmark size={21} /><span>Mosque</span></NavLink>
      <NavLink to="/checkin" className={({ isActive }) => `scan${isActive ? ' active' : ''}`} aria-label="Check in"><ScanLine size={22} /></NavLink>
      <NavLink to="/world" aria-label="World"><Globe size={21} /><span>World</span></NavLink>
      <NavLink to="/me" aria-label="Me"><User size={21} /><span>Me</span></NavLink>
    </nav>
  );
}

export function App() {
  const { me, ready } = useSession();
  const loc = useLocation();
  if (!ready) return <div className="shell bare"><Loading /></div>;

  // These work signed out: a scanned code keeps its place through sign-up.
  const open = /^\/(c\/|privacy|rules)/.test(loc.pathname);
  if (!me && !open) {
    return (
      <div className="shell bare">
        <Routes>
          <Route path="*" element={<AuthPage />} />
        </Routes>
      </div>
    );
  }
  const bare = /^\/(c\/|manage\/[^/]+\/screen)/.test(loc.pathname) || !me;
  return (
    <div className={`shell${bare ? ' bare' : ''}`}>
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/mosque" element={<MyMosque />} />
        <Route path="/m/:id" element={<MosquePage />} />
        <Route path="/find" element={<FindPage />} />
        <Route path="/checkin" element={<ScanPage />} />
        <Route path="/c/:code" element={<CheckinPage />} />
        <Route path="/world" element={<WorldPage />} />
        <Route path="/me" element={<MePage />} />
        <Route path="/challenge/new" element={<ChallengeEdit />} />
        <Route path="/challenge/:id" element={<ChallengePage />} />
        <Route path="/challenge/:id/edit" element={<ChallengeEdit />} />
        <Route path="/org/:id" element={<OrgPage />} />
        <Route path="/new-mosque" element={<MosqueSettings />} />
        <Route path="/manage/:id" element={<ManagePage />} />
        <Route path="/manage/:id/settings" element={<MosqueSettings />} />
        <Route path="/manage/:id/list" element={<AttendancePage />} />
        <Route path="/manage/:id/screen" element={<ScreenPage />} />
        <Route path="/manage/:id/print" element={<PrintPage />} />
        <Route path="/manage/:id/sponsors" element={<MosqueSponsors />} />
        <Route path="/sponsor" element={<SponsorPage />} />
        <Route path="/owner" element={<OwnerPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!bare && <Nav />}
    </div>
  );
}
