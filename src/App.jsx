// src/App.jsx
import { useState } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { useApp }  from './context/AppContext.jsx';

// Auth & onboarding
import AuthPage, { FarmSetup } from './features/auth/AuthPages.jsx';

// License
import { ExpiredScreen, TrialBanner } from './features/license/LicenseGate.jsx';

// Shell
import Sidebar from './components/Sidebar.jsx';
import TopBar  from './components/TopBar.jsx';

// Feature pages — default exports
import Dashboard     from './features/dashboard/Dashboard.jsx';
import Animals       from './features/animals/Animals.jsx';
import Production    from './features/production/Production.jsx';
import Health        from './features/health/Health.jsx';
import Reproduction  from './features/reproduction/Reproduction.jsx';
import Feed          from './features/feed/Feed.jsx';
import Finance       from './features/finance/Finance.jsx';
import Employees     from './features/employees/Employees.jsx';
import Procurement   from './features/procurement/Procurement.jsx';
import Crops         from './features/crops/Crops.jsx';
import Calendar      from './features/calendar/Calendar.jsx';
import TeamManagement  from './features/team/TeamManagement.jsx';
import AdminDashboard  from './features/admin/AdminDashboard.jsx';

// Named exports
import { Assets } from './features/assets/Assets.jsx';
import { Lab, Reports, Notifications, Settings } from './features/misc/Misc.jsx';

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
    case 'settings':      return <Settings />;
    default:              return <Dashboard onNav={onNav} />;
  }
}

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const { user, farm, license, loading, isSuperAdmin } = useAuth();
  const [page, setPage] = useState('dashboard');

  if (loading) return <BootLoader />;
  if (!user)   return <AuthPage />;
  if (!farm)   return <FarmSetup />;

  if (license && license.status !== 'active') {
    return <ExpiredScreen onUpgrade={() => setPage('settings')} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#faf9f6]">
      <Sidebar active={page} onNav={setPage} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TrialBanner />
        <TopBar page={page} onNav={setPage} />
        <main className="flex-1 overflow-auto">
          {page === 'admin' && isSuperAdmin
            ? <AdminDashboard />
            : <FeaturePage page={page} onNav={setPage} />
          }
        </main>
      </div>
    </div>
  );
}
