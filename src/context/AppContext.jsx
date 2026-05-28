// src/context/AppContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext.jsx';
import supabase    from '../services/supabase.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const { farm, user, farmUser, profile } = useAuth();

  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [isOnline,     setIsOnline]     = useState(navigator.onLine);
  const [syncStatus,   setSyncStatus]   = useState('synced');
  const [unreadCount,  setUnreadCount]  = useState(0);

  // TopBar state
  const [species,      setSpecies]      = useState('all');
  const [currency,     setCurrency]     = useState('KES');
  const [theme,        setTheme]        = useState('light');

  // formatCurrency — used by Dashboard, Finance, Feed, Assets, Employees, Procurement, Crops, Production
  const formatCurrency = (amount = 0) => {
    const num = Number(amount) || 0;
    if (currency === 'USD') return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `KES ${num.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // activeSpecies — from the farm's stored species list
  const activeSpecies = Array.isArray(farm?.active_species)
    ? farm.active_species
    : ['cattle', 'pigs', 'goats', 'sheep', 'poultry'];

  // currentUser — name and role for TopBar avatar
  const currentUser = {
    name: profile?.full_name || user?.user_metadata?.full_name || user?.email || 'User',
    role: farmUser?.role || 'owner',
  };

  // farmName for Sidebar
  const farmName = farm?.name || 'FarmCore';

  // ── Online/offline ────────────────────────────────────────
  useEffect(() => {
    const online  = () => setIsOnline(true);
    const offline = () => { setIsOnline(false); setSyncStatus('offline'); };
    window.addEventListener('online',  online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online',  online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  // ── Unread notifications ──────────────────────────────────
  useEffect(() => {
    if (!farm?.id) { setUnreadCount(0); return; }

    const fetchCount = async () => {
      try {
        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('farm_id', farm.id)
          .eq('read', false);
        setUnreadCount(count || 0);
      } catch { setUnreadCount(0); }
    };

    fetchCount();

    const channel = supabase
      .channel(`notifications:${farm.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'notifications',
        filter: `farm_id=eq.${farm.id}`,
      }, () => fetchCount())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [farm?.id]);

  return (
    <AppContext.Provider value={{
      // Sidebar
      farmName, sidebarOpen, setSidebarOpen,
      // Network
      isOnline, syncStatus, setSyncStatus,
      // Notifications
      unreadCount, setUnreadCount,
      // TopBar
      species, setSpecies,
      currency, setCurrency,
      theme, setTheme,
      activeSpecies,
      currentUser,
      formatCurrency,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
