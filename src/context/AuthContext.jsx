import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import supabase from '../services/supabase.js';
import { initialPull, startBackgroundSync, stopBackgroundSync } from '../services/sync.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,         setUser]         = useState(null);
  const [profile,      setProfile]      = useState(null);
  const [farm,         setFarm]         = useState(null);
  const [license,      setLicense]      = useState(null);
  const [farmUser,     setFarmUser]     = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [syncStatus,   setSyncStatus]   = useState('idle'); // idle|syncing|synced|error
  const [error,        setError]        = useState(null);

  // ── Load farm + license for a user ───────────────────────
  const loadFarmData = useCallback(async (userId) => {
    try {
      // Get farm membership
      const { data: fu } = await supabase
        .from('farm_users')
        .select('*, farms(*)')
        .eq('user_id', userId)
        .single();

      if (!fu) { setLoading(false); return; }

      setFarmUser(fu);
      setFarm(fu.farms);

      // Get license
      const { data: lic } = await supabase
        .from('licenses')
        .select('*')
        .eq('farm_id', fu.farm_id)
        .single();

      setLicense(lic);

      // Initial data sync
     setSyncStatus('syncing');
try {
  await initialPull(fu.farm_id);
} catch(e) {
  console.warn('Sync failed:', e);
} finally {
  setSyncStatus('synced');
}

      // Start background sync
      startBackgroundSync(fu.farm_id, () => setSyncStatus('synced'));
    } catch (err) {
      console.error('[Auth] loadFarmData error:', err);
      setSyncStatus('error');
    }
  }, []);

  // ── Load profile ─────────────────────────────────────────
  const loadProfile = useCallback(async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data);
    return data;
  }, []);

  // ── Init: restore session ─────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        await loadProfile(session.user.id);
        await loadFarmData(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        await loadProfile(session.user.id);
        await loadFarmData(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUser(null); setProfile(null); setFarm(null);
        setLicense(null); setFarmUser(null);
        stopBackgroundSync();
      }
    });
    return () => subscription.unsubscribe();
  }, [loadFarmData, loadProfile]);

  // ── SIGN UP ───────────────────────────────────────────────
  const signUp = async ({ email, password, fullName }) => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } }
    });
    if (error) throw error;
    return data;
  };

  // ── SIGN IN ───────────────────────────────────────────────
  const signIn = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  // ── SIGN OUT ──────────────────────────────────────────────
  const signOut = async () => {
    stopBackgroundSync();
    await supabase.auth.signOut();
  };

  // ── CREATE FARM (onboarding) ──────────────────────────────
  const createFarm = async ({ name, county, currency = 'KES', activeSpecies }) => {
    if (!user) throw new Error('Not authenticated');

    // 1. Create farm
    const { data: newFarm, error: farmErr } = await supabase
      .from('farms')
      .insert({ name, county, currency, active_species: activeSpecies })
      .select()
      .single();
    if (farmErr) throw farmErr;

    // 2. Add user as owner
    const { error: fuErr } = await supabase
      .from('farm_users')
      .insert({ farm_id: newFarm.id, user_id: user.id, role: 'owner' });
    if (fuErr) throw fuErr;

    // 3. Create trial license
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);
    const { data: newLicense, error: licErr } = await supabase
      .from('licenses')
      .insert({
        farm_id: newFarm.id,
        tier: 'trial',
        status: 'active',
        animal_limit: 50,
        user_limit: 2,
        trial_ends_at: trialEnd.toISOString(),
        current_period_end: trialEnd.toISOString(),
        activated_by: user.id,
      })
      .select()
      .single();
    if (licErr) throw licErr;

    // 4. Log license event
    await supabase.from('license_events').insert({
      farm_id: newFarm.id,
      event_type: 'trial_start',
      new_tier: 'trial',
      created_by: user.id,
    });

    setFarm(newFarm);
    setLicense(newLicense);
    return newFarm;
  };

  // ── REFRESH LICENSE ───────────────────────────────────────
  const refreshLicense = async () => {
    if (!farm) return;
    const { data } = await supabase.from('licenses').select('*').eq('farm_id', farm.id).single();
    setLicense(data);
  };

  const isSuperAdmin = profile?.is_super_admin === true
    || (import.meta.env.VITE_SUPER_ADMIN_EMAILS || '')
        .split(',').map(e=>e.trim()).includes(user?.email);

  const value = {
    user, profile, farm, license, farmUser,
    loading, syncStatus, error,
    isSuperAdmin,
    signUp, signIn, signOut,
    createFarm, refreshLicense,
    loadFarmData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
