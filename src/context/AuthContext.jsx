// src/context/AuthContext.jsx
// ─────────────────────────────────────────────────────────────
// KEY FIX: createFarm now calls a single atomic Supabase RPC
// instead of 4 separate chained inserts that could race/fail.
// Everything else (auth, profile, license loading) unchanged.
// ─────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import supabase from '../services/supabase.js';
import { initialPull, startBackgroundSync, stopBackgroundSync } from '../services/sync.js';

const AuthContext = createContext(null);

const withTimeout = (promise, ms = 8000, msg = 'Request timed out. Check your internet and try again.') =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
  ]);

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null);
  const [profile,    setProfile]    = useState(null);
  const [farm,       setFarm]       = useState(null);
  const [license,    setLicense]    = useState(null);
  const [farmUser,   setFarmUser]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [syncStatus, setSyncStatus] = useState('synced');

  const loadProfile = useCallback(async (userId) => {
    try {
      const { data } = await withTimeout(
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(), 5000
      );
      setProfile(data);
      return data;
    } catch { return null; }
  }, []);

  const loadFarmData = useCallback(async (userId) => {
    try {
      const { data: fu } = await withTimeout(
        supabase.from('farm_users').select('*, farms(*)').eq('user_id', userId).maybeSingle(),
        5000
      );
      if (!fu) return;
      setFarmUser(fu);
      setFarm(fu.farms);

      const { data: lic } = await withTimeout(
        supabase.from('licenses').select('*').eq('farm_id', fu.farm_id).maybeSingle(),
        5000
      ).catch(() => ({ data: null }));
      setLicense(lic);

      setTimeout(() => {
        initialPull(fu.farm_id).catch(() => {}).finally(() => {
          startBackgroundSync(fu.farm_id, () => setSyncStatus('synced'));
        });
      }, 1000);
    } catch (err) {
      console.warn('[Auth] loadFarmData:', err.message);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const killSwitch = setTimeout(() => {
      if (mounted) { console.warn('[Auth] Kill switch'); setLoading(false); }
    }, 4000);

    const init = async () => {
      try {
        const { data: { session }, error } = await withTimeout(supabase.auth.getSession(), 5000);
        if (error) throw error;
        if (session?.user && mounted) {
          setUser(session.user);
          await loadProfile(session.user.id);
          if (mounted) loadFarmData(session.user.id);
        }
      } catch (e) {
        console.warn('[Auth] init error:', e.message);
      } finally {
        clearTimeout(killSwitch);
        if (mounted) setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          setLoading(true);
          const kill2 = setTimeout(() => { if (mounted) setLoading(false); }, 4000);
          try {
            await loadProfile(session.user.id);
            loadFarmData(session.user.id);
          } finally {
            clearTimeout(kill2);
            if (mounted) setLoading(false);
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null); setProfile(null); setFarm(null);
          setLicense(null); setFarmUser(null);
          stopBackgroundSync();
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(killSwitch);
      subscription.unsubscribe();
    };
  }, [loadFarmData, loadProfile]);

  // ── SIGN UP ───────────────────────────────────────────────────
  const signUp = async ({ email, password, fullName }) => {
    const { data, error } = await withTimeout(
      supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
    );
    if (error) throw error;
    return data;
  };

  // ── SIGN IN ───────────────────────────────────────────────────
  const signIn = async ({ email, password }) => {
    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password })
    );
    if (error) throw error;
    return data;
  };

  // ── SIGN OUT ──────────────────────────────────────────────────
  const signOut = async () => {
    stopBackgroundSync();
    await supabase.auth.signOut();
  };

  // ── CREATE FARM — ATOMIC RPC (the fix!) ───────────────────────
  // One database function does farm + farm_users + license + event log
  // atomically. No partial state, no race conditions, no spinning.
  const createFarm = async ({ name, county, currency = 'KES', activeSpecies }) => {
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await withTimeout(
      supabase.rpc('create_farm_with_license', {
        p_farm_name: name,
        p_country:   'Kenya',
        p_county:    county   || null,
        p_currency:  currency,
        p_species:   activeSpecies || ['cattle','pigs','goats','sheep','poultry'],
      }),
      12000,
      'Farm creation timed out. Please check your internet and try again.'
    );

    if (error) throw error;

    // Reload farm data — single query, no race conditions
    await loadFarmData(user.id);

    return { id: data.farm_id };
  };

  // ── REFRESH LICENSE ───────────────────────────────────────────
  const refreshLicense = async () => {
    if (!farm) return;
    const { data } = await supabase.from('licenses')
      .select('*').eq('farm_id', farm.id).maybeSingle();
    setLicense(data);
  };

  // ── REFRESH FARM ──────────────────────────────────────────────
  const refreshFarm = async () => {
    if (!user) return;
    await loadFarmData(user.id);
  };

  const isSuperAdmin =
    profile?.is_super_admin === true ||
    (import.meta.env.VITE_SUPER_ADMIN_EMAILS || '')
      .split(',').map(e => e.trim()).includes(user?.email);

  return (
    <AuthContext.Provider value={{
      user, profile, farm, license, farmUser,
      loading, syncStatus, isSuperAdmin,
      signUp, signIn, signOut,
      createFarm, refreshLicense, refreshFarm,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
