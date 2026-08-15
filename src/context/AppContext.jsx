// src/context/AppContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from './AuthContext.jsx';
import db from '../db/schema.js';
import { onSyncChange, fullSync } from '../services/sync.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const { farm, user, farmUser, profile } = useAuth();

  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isOnline,     setIsOnline]     = useState(navigator.onLine);

  // Real state from the sync engine, not a local guess. The previous
  // version kept its own `syncStatus` that only ever flipped to 'offline'
  // — so the sidebar showed "Synced" even while records were stuck in the
  // queue, which is exactly the reassurance a farmer must not be given.
  const [syncState, setSyncState] = useState({ status: 'idle', pending: 0, lastSync: null, error: null });
  useEffect(() => onSyncChange(setSyncState), []);

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
    const offline = () => setIsOnline(false);
    window.addEventListener('online',  online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online',  online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  // ── Unread notifications ──────────────────────────────────
  // Counted from the local database, not over the network. The old
  // version asked Supabase on every mount, so the badge was blank for
  // any farmer working out of signal — the exact situation in which the
  // app is supposed to keep working.
  const liveUnread = useLiveQuery(
    () => db.notifications.filter(n => !n.read && !n.deletedAt).count(),
    [], 0
  );
  const [unreadOverride, setUnreadCount] = useState(null);
  const unreadCount = unreadOverride ?? liveUnread ?? 0;

  // Reset the manual override whenever the live count moves.
  useEffect(() => { setUnreadCount(null); }, [liveUnread]);

  /** "Sync now" — used by the sidebar/topbar. */
  const syncNow = () => fullSync(farm?.id);

  return (
    <AppContext.Provider value={{
      // Sidebar
      farmName, sidebarOpen, setSidebarOpen,
      mobileNavOpen, setMobileNavOpen,
      // Network / sync
      isOnline,
      syncStatus: syncState.status,
      syncState,
      pendingCount: syncState.pending,
      syncNow,
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
