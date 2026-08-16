// src/App.jsx
import { useState, lazy, Suspense } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { useApp }  from './context/AppContext.jsx';

// Auth (farm-creation wizard is parked for now — not routed to on reload)
import AuthPage from './features/auth/AuthPages.jsx';

// Shell — always needed, loaded eagerly
import Sidebar from './components/Sidebar.jsx';
import TopBar  from './components/TopBar.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// Feature pages are code-split. Loading all eighteen up front pushed the
// initial download past a megabyte; on the 2G connections these farms
// actually run on that is the difference between usable and abandoned.
// Each page now arrives only when it is first opened.
const Dashboard      = lazy(() => import('./features/dashboard/Dashboard.jsx'));
const Animals        = lazy(() => import('./features/animals/Animals.jsx'));
const Production     = lazy(() => import('./features/production/Production.jsx'));
const Health         = lazy(() => import('./features/health/Health.jsx'));
const Reproduction   = lazy(() => import('./features/reproduction/Reproduction.jsx'));
const Feed           = lazy(() => import('./features/feed/Feed.jsx'));
const Finance        = lazy(() => import('./features/finance/Finance.jsx'));
const Employees      = lazy(() => import('./features/employees/Employees.jsx'));
const Procurement    = lazy(() => import('./features/procurement/Procurement.jsx'));
const Crops          = lazy(() => import('./features/crops/Crops.jsx'));
const Calendar       = lazy(() => import('./features/calendar/Calendar.jsx'));
const TeamManagement = lazy(() => import('./features/team/TeamManagement.jsx'));
const CostCalculator = lazy(() => import('./features/cost/CostCalculator.jsx'));

// Named exports need unwrapping for lazy()
const Assets        = lazy(() => import('./features/assets/Assets.jsx').then(m => ({ default: m.Assets })));
const Lab           = lazy(() => import('./features/misc/Misc.jsx').then(m => ({ default: m.Lab })));
const Reports       = lazy(() => import('./features/misc/Misc.jsx').then(m => ({ default: m.Reports })));
const Notifications = lazy(() => import('./features/misc/Misc.jsx').then(m => ({ default: m.Notifications })));
const Settings      = lazy(() => import('./features/misc/Misc.jsx').then(m => ({ default: m.Settings })));

// ── Boot loader ───────────────────────────────────────────────
function BootLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F0E8]">
      <div className="flex flex-col items-center gap-4">
        <div className="text-5xl">🌾</div>
        <div className="w-8 h-8 border-4 border-[#2D5016] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500 font-medium">Loading FarmCore…</p>
      </div>
    </div>
  );
}

// ── Lazy-page loader ──────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-7 h-7 border-4 border-[#2D5016] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── Blocked page ──────────────────────────────────────────────
// The last-open page is restored from localStorage, so a user whose role
// changed (or who was demoted) could land straight back on a screen the
// database will no longer serve. Catch it here rather than showing an
// empty page full of failed queries.
function NoAccess({ onNav }) {
  return (
    <div className="flex items-center justify-center p-6 min-h-[60vh]">
      <div className="bg-white rounded-2xl shadow-sm border border-[#e8e0d0] p-8 w-full max-w-sm text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h2 className="text-lg font-semibold text-[#2D5016] mb-1">Not available for your role</h2>
        <p className="text-sm text-gray-500 mb-6">
          Ask the farm owner if you need access to this section.
        </p>
        <button onClick={() => onNav('dashboard')} className="btn btn-primary w-full justify-center">
          Back to dashboard
        </button>
      </div>
    </div>
  );
}

// ── Feature page router ───────────────────────────────────────
function FeaturePage({ page, onNav }) {
  switch (page) {
    case 'dashboard':     return <Dashboard onNav={onNav} />;
    case 'animals':       return <Animals />;
    case 'production':    return <Production />;
    case 'health':        return <Health />;
    case 'reproduction':  return <Reproduction />;
    case 'feed':          return <Feed />;
    case 'finance':       return <Finance />;
    case 'employees':     return <Employees />;
    case 'procurement':   return <Procurement />;
    case 'assets':        return <Assets />;
    case 'crops':         return <Crops />;
    case 'calendar':      return <Calendar />;
    case 'team':          return <TeamManagement />;
    case 'lab':           return <Lab />;
    case 'reports':       return <Reports />;
    case 'notifications': return <Notifications />;
    case 'cost':          return <CostCalculator />;
    case 'settings':      return <Settings />;
    default:              return <Dashboard onNav={onNav} />;
  }
}

// ── Farm load error (network / RLS) — offer retry, never silently onboard ──
function FarmLoadError({ error, onRetry }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F0E8] p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
        <div className="text-5xl mb-4">🌾</div>
        <h2 className="text-lg font-semibold text-[#2D5016] mb-1">Couldn't load your farm</h2>
        <p className="text-sm text-gray-500 mb-6">
          {error || 'Something went wrong reaching the server.'} Your data is safe.
        </p>
        <button onClick={onRetry} className="btn btn-primary w-full justify-center py-2.5">
          Try again
        </button>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────
const ACTIVE_PAGE_KEY = 'farmcore_active_page';

export default function App() {
  const { user, farm, loading, farmError, refreshFarm } = useAuth();
  const { mobileNavOpen, setMobileNavOpen, permissions } = useApp();

  // Restore the last-open feature so a reload returns there instead of
  // resetting to the dashboard.
  const [page, setPage] = useState(() => {
    try { return localStorage.getItem(ACTIVE_PAGE_KEY) || 'dashboard'; }
    catch { return 'dashboard'; }
  });

  if (loading) return <BootLoader />;
  if (!user)   return <AuthPage />;

  // User is authenticated. The farm is rehydrated from local cache on reload,
  // so we land straight on the dashboard/last page. Farm creation + licensing
  // are intentionally parked, so we NEVER route to the setup wizard here. If
  // the background refresh failed AND we have no cached farm, show a retry
  // (not onboarding); otherwise keep loading.
  if (!farm) {
    if (farmError) return <FarmLoadError error={farmError} onRetry={refreshFarm} />;
    return <BootLoader />;
  }

  // Navigate + remember the page + auto-close the mobile drawer
  const handleNav = (id) => {
    setPage(id);
    try { localStorage.setItem(ACTIVE_PAGE_KEY, id); } catch { /* noop */ }
    setMobileNavOpen(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#faf9f6]">
      {/* Sidebar — static column on lg+, slide-in drawer on mobile */}
      <Sidebar active={page} onNav={handleNav} />

      {/* Mobile overlay behind the drawer */}
      {mobileNavOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar page={page} onNav={handleNav} />
        <main className="flex-1 overflow-auto">
          {/* Keyed on `page` so a crash on one screen doesn't strand the
              user — navigating elsewhere remounts a fresh boundary. */}
          <ErrorBoundary key={page}>
            <Suspense fallback={<PageLoader />}>
              {permissions.canSeePage(page)
                ? <FeaturePage page={page} onNav={handleNav} />
                : <NoAccess onNav={handleNav} />}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
