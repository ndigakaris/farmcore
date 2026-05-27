import { useState } from 'react';
import { AppProvider } from './context/AppContext.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Sidebar   from './components/Sidebar.jsx';
import TopBar    from './components/TopBar.jsx';

// Auth & License
import AuthPage, { FarmSetup }   from './features/auth/AuthPages.jsx';
import { TrialBanner, LicenseGate, ExpiredScreen, PricingModal } from './features/license/LicenseGate.jsx';
import AdminDashboard            from './features/admin/AdminDashboard.jsx';
import { validateLicense }       from './services/license.js';

// Feature modules
import Dashboard    from './features/dashboard/Dashboard.jsx';
import Animals      from './features/animals/Animals.jsx';
import Production   from './features/production/Production.jsx';
import Health       from './features/health/Health.jsx';
import Reproduction from './features/reproduction/Reproduction.jsx';
import Feed         from './features/feed/Feed.jsx';
import Finance      from './features/finance/Finance.jsx';
import Employees    from './features/employees/Employees.jsx';
import Procurement  from './features/procurement/Procurement.jsx';
import Calendar     from './features/calendar/Calendar.jsx';
import Crops        from './features/crops/Crops.jsx';
import { Assets }   from './features/assets/Assets.jsx';
import { Lab, Reports, Notifications, Settings } from './features/misc/Misc.jsx';

// Feature → license gate mapping
const FEATURE_MAP = {
  reproduction: 'reproduction',
  procurement:  'procurement',
  assets:       'assets',
  crops:        'crops',
  lab:          'lab',
  reports:      'reports',
};

function AppShell() {
  const [page, setPage] = useState('dashboard');

  const renderPage = () => {
    const feature = FEATURE_MAP[page];
    const PageComponent = {
      dashboard:    <Dashboard    onNav={setPage}/>,
      animals:      <Animals/>,
      production:   <Production/>,
      health:       <Health/>,
      reproduction: <Reproduction/>,
      feed:         <Feed/>,
      finance:      <Finance/>,
      employees:    <Employees/>,
      procurement:  <Procurement/>,
      assets:       <Assets/>,
      crops:        <Crops/>,
      calendar:     <Calendar/>,
      lab:          <Lab/>,
      reports:      <Reports/>,
      notifications:<Notifications/>,
      settings:     <Settings/>,
    }[page] || <Dashboard onNav={setPage}/>;

    if (feature) {
      return (
        <LicenseGate feature={feature}>
          {PageComponent}
        </LicenseGate>
      );
    }
    return PageComponent;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F0E8]">
      <Sidebar active={page} onNav={setPage}/>
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TrialBanner/>
        <TopBar onNav={setPage}/>
        {renderPage()}
      </div>
    </div>
  );
}

// ── SYNC LOADING SCREEN ────────────────────────────────────────
function SyncScreen() {
  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4 animate-pulse">🌾</div>
        <p style={{fontFamily:'Fraunces,serif'}} className="text-xl font-semibold text-[#2D5016] mb-2">FarmCore FMIS</p>
        <p className="text-sm text-gray-400 mb-4">Syncing your farm data…</p>
        <div className="w-48 h-1.5 bg-[#e8e0d0] rounded-full mx-auto overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#2D5016] to-[#4e8628] rounded-full animate-[loading_1.5s_ease-in-out_infinite]"
            style={{width:'60%',animation:'pulse 1s ease-in-out infinite'}}/>
        </div>
      </div>
    </div>
  );
}

// ── MAIN AUTH ROUTER ──────────────────────────────────────────
function AuthRouter() {
  const { user, farm, license, loading, syncStatus, isSuperAdmin } = useAuth();

  // 1. Loading / initial sync
 if (loading) return <SyncScreen/>;
if (!user) return <AuthPage/>;
if (isSuperAdmin) return <AdminDashboard/>;

  // 4. Logged in but no farm → onboarding
  if (!farm) return <FarmSetup/>;

  // 5. License expired
  const validation = validateLicense(license);
  if (!validation.valid) return (
    <ExpiredScreen onUpgrade={()=>{ /* open pricing */ }}/>
  );

  // 6. Full app
  return (
    <AppProvider farmId={farm?.id}>
      <AppShell/>
    </AppProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthRouter/>
    </AuthProvider>
  );
}
