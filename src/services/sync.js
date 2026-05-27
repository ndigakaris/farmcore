export async function initialPull(farmId) {
  if (!farmId) return { success: true };
  console.log('[Sync] Starting initial pull for farm:', farmId);
  
  const timeout = (ms) => new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Sync timeout')), ms)
  );

  try {
    for (const { local, remote } of SYNC_MAP) {
      try {
        const { data, error } = await Promise.race([
          supabase.from(remote).select('*').eq('farm_id', farmId),
          timeout(5000)
        ]);
        if (error || !data?.length) continue;
        const localTable = db[local];
        if (!localTable) continue;
        await localTable.clear();
        const records = data.map(r => ({ ...toCamel(r), syncStatus: 'synced' }));
        await localTable.bulkPut(records);
      } catch (tableErr) {
        console.warn(`[Sync] Skipping ${remote}:`, tableErr.message);
        continue;
      }
    }
    localStorage.setItem(LAST_PULL_KEY, new Date().toISOString());
    return { success: true };
  } catch (err) {
    console.warn('[Sync] Pull aborted:', err.message);
    return { success: false, error: err.message };
  }
}