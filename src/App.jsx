// src/App.jsx
// ─────────────────────────────────────────────────────────────
// Main app shell — fixed & seamless.
// Flow:
//   loading         → BootLoader spinner
//   no user         → AuthPage  (login / register)
//   user, no farm   → FarmSetup (create farm wizard)
//   farm, expired   → ExpiredScreen
//   all good        → Sidebar + TopBar + feature pages
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useAuth }  from './context/AuthContext.jsx';
import { useApp }   from './context/AppContext.jsx';

// Auth & onboarding
import AuthPage, { FarmSetup } from './features/auth/AuthPages.jsx';

// License
import { ExpiredScreen, TrialBanner } from './features/license/LicenseGate.jsx';

// Shell components
import Sidebar from './components/Sidebar.jsx';
import TopBar  from './components/TopBar.jsx';

// Feature pages
import Dashboard    from './features/dashboard/Dashboard.jsx';
import Animals      from './features/animals/Animals.jsx';
import Production   from './features/production/Production.jsx';
import Health       from './features/health/Health.jsx';
import Reproduction from './features/reproduction/Reproduction.jsx';
import Feed         from './features/feed/Feed.jsx';
import Finance      from './features/finance/Finance.jsx';
import Employees    from './features/employees/Employees.jsx';
import Procurement  from './features/procurement/Procurement.jsx';
import Assets       from './features/assets/Assets.jsx';
import Crops        from './features/crops/Crops.jsx';
import Calendar     from './features/calendar/Calendar.jsx';
import Misc         from './features/misc/Misc.jsx';
import TeamManagement from './features/team/TeamManagement.jsx';
import AdminDashboard from './features/admin/AdminDashboard.jsx';

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

// ── Feature page router ───────────────────────────────────────
function FeaturePage({ page }) {
  switch (page) {
    case 'dashboard':    return <Dashboard />;
    case 'animals':      return <Animals />;
    case 'production':   return <Production />;
    case 'health':       return <Health />;
    case 'reproduction': return <Reproduction />;
    case 'feed':         return <Feed />;
    case 'finance':      return <Finance />;
    case 'employees':    return <Employees />;
    case 'procurement':  return <Procurement />;
    case 'assets':       return <Assets />;
    case 'crops':        return <Crops />;
    case 'calendar':     return <Calendar />;
    case 'team':         return <TeamManagement />;
    case 'notifications':
    case 'settings':
    case 'lab':
    case 'reports':      return <Misc page={page} />;
    default:             return <Dashboard />;
  }
}

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const { user, farm, license, loading, isSuperAdmin } = useAuth();
  const [page, setPage] = useState('dashboard');

  // 1. Loading
  if (loading) return <BootLoader />;

  // 2. Not logged in
  if (!user) return <AuthPage />;

  // 3. Logged in but no farm yet → onboarding
  if (!farm) return <FarmSetup />;

  // 4. Farm exists but license expired
  if (license && license.status !== 'active') {
    return <ExpiredScreen onUpgrade={() => setPage('settings')} />;
  }

  // 5. Admin dashboard (accessible via nav)
  if (page === 'admin' && isSuperAdmin) {
    return (
      <div className="flex h-screen overflow-hidden bg-[#faf9f6]">
        <Sidebar active={page} onNav={setPage} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar page={page} onNav={setPage} />
          <main className="flex-1 overflow-auto">
            <AdminDashboard />
          </main>
        </div>
      </div>
    );
  }

  // 6. Main app shell
  return (
    <div className="flex h-screen overflow-hidden bg-[#faf9f6]">
      <Sidebar active={page} onNav={setPage} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TrialBanner />
        <TopBar page={page} onNav={setPage} />
        <main className="flex-1 overflow-auto">
          <FeaturePage page={page} />
        </main>
      </div>
    </div>
  );
}
