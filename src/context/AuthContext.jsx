const loadFarmData = useCallback(async (userId) => {
  try {
    const { data: fu } = await supabase
      .from('farm_users')
      .select('*, farms(*)')
      .eq('user_id', userId)
      .maybeSingle(); // won't throw if no farm found

    if (!fu) {
      setLoading(false);
      setSyncStatus('synced');
      return;
    }

    setFarmUser(fu);
    setFarm(fu.farms);

    const { data: lic } = await supabase
      .from('licenses')
      .select('*')
      .eq('farm_id', fu.farm_id)
      .maybeSingle();

    setLicense(lic);

    // Sync with 10 second max timeout
    setSyncStatus('syncing');
    const syncPromise = initialPull(fu.farm_id);
    const timeoutPromise = new Promise(resolve => 
      setTimeout(() => resolve({ success: false, reason: 'timeout' }), 10000)
    );
    await Promise.race([syncPromise, timeoutPromise]);
    setSyncStatus('synced');

    startBackgroundSync(fu.farm_id, () => setSyncStatus('synced'));
  } catch (err) {
    console.warn('[Auth] loadFarmData error:', err);
    setSyncStatus('synced'); // don't block UI on sync failure
  } finally {
    setLoading(false);
  }
}, []);