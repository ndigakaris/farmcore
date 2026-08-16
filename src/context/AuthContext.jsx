// src/context/AuthContext.jsx
// ─────────────────────────────────────────────────────────────
// Auth + profile + farm loading. Licensing has been removed —
// the app runs standalone with no tiers, trials, or feature gates.
// createFarm uses a single atomic Supabase RPC.
// ─────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import supabase from '../services/supabase.js';
import { initialPull, startBackgroundSync, stopBackgroundSync, onSyncChange } from '../services/sync.js';
import { setActiveFarm } from '../db/repo.js';

const AuthContext = createContext(null);

const withTimeout = (promise, ms = 8000, msg = 'Request timed out. Check your internet and try again.') =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
  ]);

// ── Farm cache ────────────────────────────────────────────────
// We persist the loaded farm locally and rehydrate it on reload. This is what
// keeps a reload on the dashboard instead of flashing the setup wizard while
// the network round-trip happens (or if it briefly fails). Cache is keyed by
// user id so a different account can't pick up a stale farm.
const FARM_CACHE_KEY = 'farmcore_farm_cache';

const readFarmCache = () => {
  try { return JSON.parse(localStorage.getItem(FARM_CACHE_KEY)) || null; }
  catch { return null; }
};
const writeFarmCache = (userId, farm, farmUser) => {
  try { localStorage.setItem(FARM_CACHE_KEY, JSON.stringify({ userId, farm, farmUser })); }
  catch { /* storage full / unavailable — non-fatal */ }
};
const clearFarmCache = () => {
  try { localStorage.removeItem(FARM_CACHE_KEY); } catch { /* noop */ }
};

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null);
  const [profile,    setProfile]    = useState(null);
  // Rehydrate farm from local cache immediately so a reload never flashes the
  // setup wizard. The cached value is verified against the session user-id in
  // init() below, and refreshed from Supabase in the background.
  const [farm,       setFarm]       = useState(() => readFarmCache()?.farm || null);
  const [farmUser,   setFarmUser]   = useState(() => readFarmCache()?.farmUser || null);
  const [loading,    setLoading]    = useState(true);
  // Mirrors the sync engine's real state (idle / syncing / pending / synced /
  // offline / error) plus how many records are still queued, so the UI can
  // tell a farmer the truth instead of showing a permanent green tick.
  const [syncState,  setSyncState]  = useState({ status: 'idle', pending: 0, lastSync: null, error: null });

  useEffect(() => onSyncChange(setSyncState), []);

  // farmResolved: have we DEFINITIVELY determined the user's farm membership?
  //   false  → still loading, or the lookup errored (do NOT show onboarding)
  //   true   → query succeeded; `farm` is either the real farm or genuinely null
  // farmError: set when the farm lookup fails so the UI can offer a retry
  // instead of wrongly forcing the setup wizard.
  const [farmResolved, setFarmResolved] = useState(false);
  const [farmError,    setFarmError]    = useState(null);

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
    setFarmError(null);
    try {
      // NOTE: use a list query, not .maybeSingle(). A user can belong to more
      // than one farm (that's the whole point of farm_users), and .maybeSingle()
      // ERRORS on >1 row, which previously dropped the user into onboarding.
      const { data: rows, error } = await withTimeout(
        supabase
          .from('farm_users')
          .select('*, farms(*)')
          .eq('user_id', userId)
          .order('joined_at', { ascending: true }),
        5000
      );

      // A real error (RLS / network / timeout) is NOT the same as "no farm".
      // Surface it and bail WITHOUT clearing state, so reload doesn't wrongly
      // send an existing user to the setup wizard.
      if (error) throw error;

      const fu = rows?.[0] || null;

      if (!fu || !fu.farms) {
        // Server returned no farm. Farm creation is intentionally parked for
        // now, so we do NOT route to the wizard: if we already have a farm
        // (from cache or a prior load), keep showing it.
        setFarmResolved(true);
        return;
      }

      setFarmUser(fu);
      setFarm(fu.farms);
      setFarmResolved(true);
      writeFarmCache(userId, fu.farms, fu);   // remember for instant reloads

      // Every record written from now on is stamped with this farm. Must
      // complete BEFORE any sync runs: switching farms clears the local
      // cache, and a sync racing that wipe would re-download into it.
      await setActiveFarm(fu.farm_id);

      // Kick off background sync — non-blocking, done well after loading flips
      setTimeout(() => {
        initialPull(fu.farm_id).catch(() => {}).finally(() => {
          startBackgroundSync(fu.farm_id);
        });
      }, 1000);
    } catch (err) {
      // Could not determine farm membership. Leave any existing farm in place
      // (the cached one keeps the user on the dashboard) and just log it.
      console.warn('[Auth] loadFarmData:', err.message);
      setFarmError(err.message || 'Could not load your farm. Check your connection.');
      setFarmResolved(false);
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

          // The cached farm we rehydrated synchronously might belong to a
          // previously signed-in account. If so, drop it before loading.
          const cached = readFarmCache();
          if (cached && cached.userId !== session.user.id) {
            clearFarmCache();
            setFarm(null);
            setFarmUser(null);
          }

          // Refresh profile + farm from the server (background-ish). The cached
          // farm already keeps us on the dashboard, so this just keeps it fresh.
          await loadProfile(session.user.id);
          if (mounted) await loadFarmData(session.user.id);
        } else if (mounted) {
          // No session → make sure no stale farm lingers.
          clearFarmCache();
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
          setFarmResolved(false); setFarmError(null);
          clearFarmCache();
          stopBackgroundSync();
          setActiveFarm(null);
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
      loading,
      syncState, syncStatus: syncState.status,
      farmResolved, farmError,
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
