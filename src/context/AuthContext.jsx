// src/context/AuthContext.jsx
// ─────────────────────────────────────────────────────────────
// Auth + profile + farm loading. Licensing has been removed —
// the app runs standalone with no tiers, trials, or feature gates.
// createFarm uses a single atomic Supabase RPC.
// ─────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
  const [farmUser,   setFarmUser]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [syncStatus, setSyncStatus] = useState('synced');

  // Tracks the currently authenticated user-id so we can detect repeat
  // SIGNED_IN events (e.g. Supabase re-fires SIGNED_IN when you focus the tab
  // after a token refresh). We must NOT show the loading screen for those.
  const userIdRef = useRef(null);

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
      if (!fu) {
        // No farm yet — user will be sent to onboarding
        setFarmUser(null);
        setFarm(null);
        return;
      }
      setFarmUser(fu);
      setFarm(fu.farms);

      // Kick off background sync — non-blocking, done well after loading flips
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

    // Safety net — never trap the user on the boot loader. Bumped to 10s so
    // we have headroom to await both the profile and the farm query.
    const killSwitch = setTimeout(() => {
      if (mounted) { console.warn('[Auth] Kill switch'); setLoading(false); }
    }, 10000);

    const init = async () => {
      try {
        const { data: { session }, error } = await withTimeout(supabase.auth.getSession(), 5000);
        if (error) throw error;
        if (session?.user && mounted) {
          userIdRef.current = session.user.id;
          setUser(session.user);
          // Await both so we don't flicker through "<FarmSetup/>" before
          // the farm row arrives.
          await loadProfile(session.user.id);
          if (mounted) await loadFarmData(session.user.id);
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
          // Re-fires on tab focus / token refresh for the SAME user.
          // Silently refresh the user object — do NOT enter loading state.
          if (userIdRef.current === session.user.id) {
            setUser(session.user);
            return;
          }
          // Genuine new sign-in
          userIdRef.current = session.user.id;
          setUser(session.user);
          setLoading(true);
          const kill2 = setTimeout(() => { if (mounted) setLoading(false); }, 10000);
          try {
            await loadProfile(session.user.id);
            if (mounted) await loadFarmData(session.user.id);
          } finally {
            clearTimeout(kill2);
            if (mounted) setLoading(false);
          }
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Pure token refresh — keep the user object current, no UI churn.
          setUser(session.user);
        } else if (event === 'USER_UPDATED' && session?.user) {
          setUser(session.user);
        } else if (event === 'SIGNED_OUT') {
          userIdRef.current = null;
          setUser(null); setProfile(null); setFarm(null);
          setFarmUser(null);
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
    userIdRef.current = null;
    await supabase.auth.signOut();
  };

  // ── CREATE FARM — ATOMIC RPC ──────────────────────────────────
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

    await loadFarmData(user.id);
    return { id: data.farm_id };
  };

  // ── REFRESH FARM ──────────────────────────────────────────────
  const refreshFarm = async () => {
    if (!user) return;
    await loadFarmData(user.id);
  };

  return (
    <AuthContext.Provider value={{
      user, profile, farm, farmUser,
      loading, syncStatus,
      signUp, signIn, signOut,
      createFarm, refreshFarm,
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
