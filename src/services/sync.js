import supabase from './supabase.js';
import db from '../db/schema.js';

// Map: Dexie table name → Supabase table name → key field
const SYNC_MAP = [
  { local: 'animals',         remote: 'animals',          pk: 'id' },
  { local: 'milkLogs',        remote: 'milk_logs',         pk: 'id' },
  { local: 'eggLogs',         remote: 'egg_logs',          pk: 'id' },
  { local: 'weightLogs',      remote: 'weight_logs',       pk: 'id' },
  { local: 'treatments',      remote: 'treatments',        pk: 'id' },
  { local: 'vaccinations',    remote: 'vaccinations',      pk: 'id' },
  { local: 'mortality',       remote: 'mortality',         pk: 'id' },
  { local: 'heatLogs',        remote: 'heat_logs',         pk: 'id' },
  { local: 'breedingLogs',    remote: 'breeding_logs',     pk: 'id' },
  { local: 'pregnancyChecks', remote: 'pregnancy_checks',  pk: 'id' },
  { local: 'births',          remote: 'births',            pk: 'id' },
  { local: 'feedInventory',   remote: 'feed_inventory',    pk: 'id' },
  { local: 'transactions',    remote: 'transactions',      pk: 'id' },
  { local: 'employees',       remote: 'employees',         pk: 'id' },
  { local: 'attendance',      remote: 'attendance',        pk: 'id' },
  { local: 'tasks',           remote: 'tasks',             pk: 'id' },
  { local: 'payroll',         remote: 'payroll',           pk: 'id' },
  { local: 'suppliers',       remote: 'suppliers',         pk: 'id' },
  { local: 'purchaseOrders',  remote: 'purchase_orders',   pk: 'id' },
  { local: 'grns',            remote: 'grns',              pk: 'id' },
  { local: 'assets',          remote: 'assets',            pk: 'id' },
  { local: 'maintenance',     remote: 'maintenance',       pk: 'id' },
  { local: 'plots',           remote: 'plots',             pk: 'id' },
  { local: 'cropPlans',       remote: 'crop_plans',        pk: 'id' },
  { local: 'harvests',        remote: 'harvests',          pk: 'id' },
  { local: 'labTests',        remote: 'lab_tests',         pk: 'id' },
  { local: 'notifications',   remote: 'notifications',     pk: 'id' },
  { local: 'calendarEvents',  remote: 'calendar_events',   pk: 'id' },
];

const LAST_PULL_KEY = 'farmcore_last_pull';

// ── camelCase ↔ snake_case conversion ──────────────────────
function toSnake(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const snake = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    out[snake] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

function toCamel(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}

// ── INITIAL PULL — load all farm data from Supabase → Dexie ──
export async function initialPull(farmId) {
  console.log('[Sync] Starting initial pull for farm:', farmId);
  try {
    for (const { local, remote } of SYNC_MAP) {
      const { data, error } = await supabase
        .from(remote)
        .select('*')
        .eq('farm_id', farmId);

      if (error) { console.warn(`[Sync] Pull error on ${remote}:`, error.message); continue; }
      if (!data?.length) continue;

      const localTable = db[local];
      if (!localTable) continue;

      // Clear local and repopulate from server
      await localTable.clear();
      const records = data.map(r => ({ ...toCamel(r), syncStatus: 'synced' }));
      await localTable.bulkPut(records);
      console.log(`[Sync] Pulled ${records.length} records → ${local}`);
    }
    localStorage.setItem(LAST_PULL_KEY, new Date().toISOString());
    console.log('[Sync] Initial pull complete.');
    return { success: true };
  } catch (err) {
    console.error('[Sync] Initial pull failed:', err);
    return { success: false, error: err.message };
  }
}

// ── PUSH PENDING — push local pending changes → Supabase ─────
export async function pushPending(farmId) {
  let pushed = 0;
  try {
    for (const { local, remote } of SYNC_MAP) {
      const localTable = db[local];
      if (!localTable) continue;

      const pending = await localTable
        .filter(r => r.syncStatus === 'pending')
        .toArray();

      if (!pending.length) continue;

      for (const record of pending) {
        const remoteRecord = { ...toSnake(record), farm_id: farmId };
        // Remove local-only fields
        delete remoteRecord.sync_status;
        delete remoteRecord.local_id;

        const { error } = await supabase
          .from(remote)
          .upsert(remoteRecord, { onConflict: 'id' });

        if (error) {
          console.warn(`[Sync] Push error on ${remote}:`, error.message);
        } else {
          await localTable.update(record.id, { syncStatus: 'synced' });
          pushed++;
        }
      }
    }
    if (pushed > 0) console.log(`[Sync] Pushed ${pushed} pending records.`);
    return { success: true, pushed };
  } catch (err) {
    console.error('[Sync] Push failed:', err);
    return { success: false, error: err.message };
  }
}

// ── INCREMENTAL PULL — fetch changes since last pull ─────────
export async function incrementalPull(farmId) {
  const lastPull = localStorage.getItem(LAST_PULL_KEY) || new Date(0).toISOString();
  let pulled = 0;
  try {
    for (const { local, remote } of SYNC_MAP) {
      const { data, error } = await supabase
        .from(remote)
        .select('*')
        .eq('farm_id', farmId)
        .gte('updated_at', lastPull);

      if (error || !data?.length) continue;

      const localTable = db[local];
      if (!localTable) continue;

      for (const remoteRecord of data) {
        const local_r = { ...toCamel(remoteRecord), syncStatus: 'synced' };
        await localTable.put(local_r);
        pulled++;
      }
    }
    if (pulled > 0) {
      console.log(`[Sync] Incremental pull: ${pulled} records updated.`);
      localStorage.setItem(LAST_PULL_KEY, new Date().toISOString());
    }
    return { success: true, pulled };
  } catch (err) {
    console.error('[Sync] Incremental pull failed:', err);
    return { success: false, error: err.message };
  }
}

// ── FULL SYNC — push pending, then pull new ──────────────────
export async function fullSync(farmId) {
  const push = await pushPending(farmId);
  const pull = await incrementalPull(farmId);
  return { push, pull };
}

// ── BACKGROUND SYNC — runs every 60s ─────────────────────────
let syncInterval = null;

export function startBackgroundSync(farmId, onSyncComplete) {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(async () => {
    if (!navigator.onLine) return;
    const result = await fullSync(farmId);
    onSyncComplete?.(result);
  }, 60000);
  console.log('[Sync] Background sync started (60s interval).');
}

export function stopBackgroundSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[Sync] Background sync stopped.');
  }
}

// ── PUSH SINGLE RECORD — call after every local write ────────
export async function pushRecord(tableName, record, farmId) {
  const mapping = SYNC_MAP.find(m => m.local === tableName);
  if (!mapping) return;

  const remoteRecord = { ...toSnake(record), farm_id: farmId };
  delete remoteRecord.sync_status;

  const { error } = await supabase
    .from(mapping.remote)
    .upsert(remoteRecord, { onConflict: 'id' });

  if (error) {
    console.warn(`[Sync] Push single record error (${tableName}):`, error.message);
    return false;
  }
  return true;
}
