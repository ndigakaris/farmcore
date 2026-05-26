import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import db from '../db/schema.js';

const AppContext = createContext(null);

export function AppProvider({ children, farmId }) {
  const [species, setSpecies]     = useState('all');
  const [currency, setCurrency]   = useState('KES');
  const [language, setLanguage]   = useState('en');
  const [theme, setTheme]         = useState('light');
  const [farmName, setFarmName]   = useState('My Farm');
  const [currentUser, setCurrentUser] = useState({ name: 'User', role: 'worker' });
  const [syncStatus, setSyncStatus] = useState('synced');
  const [isOnline, setIsOnline]   = useState(navigator.onLine);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeSpecies, setActiveSpecies] = useState(['cattle','pigs','goats','sheep','poultry']);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const onOnline  = () => { setIsOnline(true);  setSyncStatus('synced'); };
    const onOffline = () => { setIsOnline(false); setSyncStatus('offline'); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  useEffect(() => {
    db.settings.toArray().then(rows => {
      rows.forEach(r => {
        if (r.key === 'farmName')      setFarmName(r.value);
        if (r.key === 'currency')      setCurrency(r.value);
        if (r.key === 'language')      setLanguage(r.value);
        if (r.key === 'theme')         setTheme(r.value);
        if (r.key === 'currentUser')   { try { setCurrentUser(JSON.parse(r.value)); } catch(e){} }
        if (r.key === 'activeSpecies') { try { setActiveSpecies(JSON.parse(r.value)); } catch(e){} }
      });
    }).catch(()=>{});
    db.notifications?.where('read').equals(0).count().then(setUnreadCount).catch(()=>{});
  }, [farmId]);

  const saveSetting = useCallback(async (key, value) => {
    try {
      await db.settings.where('key').equals(key).modify({ value: typeof value === 'object' ? JSON.stringify(value) : value });
    } catch(e) {}
  }, []);

  const formatCurrency = useCallback((amount) => {
    const n = Number(amount) || 0;
    if (currency === 'KES') return `KES ${n.toLocaleString()}`;
    if (currency === 'USD') return `$${(n / 130).toFixed(2)}`;
    return `${currency} ${n.toLocaleString()}`;
  }, [currency]);

  const value = {
    species, setSpecies,
    currency, setCurrency,
    language, setLanguage,
    theme, setTheme,
    farmName, setFarmName,
    currentUser, setCurrentUser,
    syncStatus, setSyncStatus,
    isOnline,
    unreadCount, setUnreadCount,
    activeSpecies, setActiveSpecies,
    sidebarOpen, setSidebarOpen,
    saveSetting, formatCurrency,
    farmId,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
