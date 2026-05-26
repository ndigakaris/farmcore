import { useState, Suspense } from 'react';
import { AppProvider } from './context/AppContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import TopBar  from './components/TopBar.jsx';
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

function AppShell() {
  const [page, setPage] = useState('dashboard');
  const renderPage = () => {
    switch (page) {
      case 'dashboard':    return <Dashboard    onNav={setPage}/>;
      case 'animals':      return <Animals/>;
      case 'production':   return <Production/>;
      case 'health':       return <Health/>;
      case 'reproduction': return <Reproduction/>;
      case 'feed':         return <Feed/>;
      case 'finance':      return <Finance/>;
      case 'employees':    return <Employees/>;
      case 'procurement':  return <Procurement/>;
      case 'assets':       return <Assets/>;
      case 'crops':        return <Crops/>;
      case 'calendar':     return <Calendar/>;
      case 'lab':          return <Lab/>;
      case 'reports':      return <Reports/>;
      case 'notifications':return <Notifications/>;
      case 'settings':     return <Settings/>;
      default:             return <Dashboard onNav={setPage}/>;
    }
  };
  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F0E8]">
      <Sidebar active={page} onNav={setPage}/>
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar onNav={setPage}/>
        {renderPage()}
      </div>
    </div>
  );
}
export default function App() {
  return (
    <AppProvider>
      <AppShell/>
    </AppProvider>
  );
}
