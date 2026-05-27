import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import supabase from '../services/supabase.js';
import { initialPull, startBackgroundSync, stopBackgroundSync } from '../services/sync.js';

const AuthContext = createContext(null);

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
      const { data } = await supabase
        .from('profiles').select('*').eq('id', userId).maybeSingle();
      setProfile(data);
      return data;
    } catch { return null; }
  }, []);

  const loadFarmData = useCallback(async (userId) => {
    try {
      const { data: fu } = await supabase
        .from('farm_users').select('*, farms(*)')
        .eq('user_id', userId).maybeSingle();
      if (!fu) return;
      setFarmUser(fu);
      setFarm(fu.farms);
      const { data: lic } = await supabase
        .from('licenses').select('*')
        .eq('farm_id', fu.farm_id).maybeSingle();
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

    // ── HARD 4-SECOND KILL SWITCH ─────────────────────────────
    // App ALWAYS shows login/dashboard within 4 seconds no matter what
    const killSwitch = setTimeout(() => {
      if (mounted) {
        console.warn('[Auth] Kill switch fired — forcing app to load');
        setLoading(false);
      }
    }, 4000);

    const init = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (session?.user && mounted) {
          setUser(session.user);
          await Promise.race([
            loadProfile(session.user.id),
            new Promise(r => setTimeout(r, 2000))
          ]);
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

  const signUp = async ({ email, password, fullName }) => {
    const { data, error } = await supabase.auth.signUp({
      email, password, options: { data: { full_name: fullName } }
    });
    if (error) throw error;
    return data;
  };

  const signIn = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    stopBackgroundSync();
    await supabase.auth.signOut();
  };

  const createFarm = async ({ name, county, currency = 'KES', activeSpecies }) => {
    if (!user) throw new Error('Not authenticated');
    const { data: newFarm, error: farmErr } = await supabase
      .from('farms').insert({ name, county, currency, active_species: activeSpecies })
      .select().single();
    if (farmErr) throw farmErr;

    const { error: fuErr } = await supabase.from('farm_users')
      .insert({ farm_id: newFarm.id, user_id: user.id, role: 'owner' });
    if (fuErr) throw fuErr;

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);
    const { data: newLicense, error: licErr } = await supabase.from('licenses').insert({
      farm_id: newFarm.id, tier: 'trial', status: 'active',
      animal_limit: 50, user_limit: 2,
      trial_ends_at: trialEnd.toISOString(),
      current_period_end: trialEnd.toISOString(),
      activated_by: user.id,
    }).select().single();
    if (licErr) throw licErr;

    await supabase.from('license_events').insert({
      farm_id: newFarm.id, event_type: 'trial_start',
      new_tier: 'trial', created_by: user.id,
    }).then(() => {}).catch(() => {});

    setFarm(newFarm);
    setLicense(newLicense);
    return newFarm;
  };

  const refreshLicense = async () => {
    if (!farm) return;
    const { data } = await supabase.from('licenses').select('*')
      .eq('farm_id', farm.id).maybeSingle();
    setLicense(data);
  };

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