import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import db from '../db/schema.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [species, setSpecies]       = useState('all');
  const [currency, setCurrency]     = useState('KES');
  const [language, setLanguage]     = useState('en');
  const [theme, setTheme]           = useState('light');
  const [farmName, setFarmName]     = useState('Kilima Fresh Farms');
  const [currentUser, setCurrentUser] = useState({ name: 'James Mwangi', role: 'manager' });
  const [syncStatus, setSyncStatus] = useState('synced');
  const [isOnline, setIsOnline]     = useState(navigator.onLine);
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
        if (r.key === 'currentUser')   setCurrentUser(JSON.parse(r.value));
        if (r.key === 'activeSpecies') setActiveSpecies(JSON.parse(r.value));
      });
    });
    db.notifications.where('read').equals(0).count().then(setUnreadCount);
  }, []);

  const saveSetting = useCallback(async (key, value) => {
    await db.settings.where('key').equals(key).modify({ value: typeof value === 'object' ? JSON.stringify(value) : value });
  }, []);

  const formatCurrency = useCallback((amount) => {
    if (currency === 'KES') return `KES ${Number(amount).toLocaleString()}`;
    return `$${(Number(amount) / 130).toFixed(2)}`;
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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
