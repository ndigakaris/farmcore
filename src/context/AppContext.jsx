// src/context/AppContext.jsx
// ─────────────────────────────────────────────────────────────
// Provides UI state: sidebar open/close, online status,
// sync status, unread notifications count, farm display name.
// ─────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext.jsx';
import supabase    from '../services/supabase.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const { farm, user } = useAuth();

  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [isOnline,     setIsOnline]     = useState(navigator.onLine);
  const [syncStatus,   setSyncStatus]   = useState('synced');
  const [unreadCount,  setUnreadCount]  = useState(0);

  // ── Online/offline detection ──────────────────────────────
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

  // ── Unread notification count ─────────────────────────────
  useEffect(() => {
    if (!farm?.id) { setUnreadCount(0); return; }

    const fetchCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('farm_id', farm.id)
        .eq('read', false);
      setUnreadCount(count || 0);
    };

    fetchCount();

    // Subscribe to new notifications
    const channel = supabase
      .channel(`notifications:${farm.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `farm_id=eq.${farm.id}`,
      }, () => fetchCount())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [farm?.id]);

  const farmName = farm?.name || 'FarmCore';

  return (
    <AppContext.Provider value={{
      farmName,
      sidebarOpen, setSidebarOpen,
      isOnline,
      syncStatus,  setSyncStatus,
      unreadCount, setUnreadCount,
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
