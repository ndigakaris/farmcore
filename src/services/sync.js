import supabase from './supabase.js';
import db from '../db/schema.js';

const SYNC_MAP = [
  { local: 'animals',         remote: 'animals' },
  { local: 'milkLogs',        remote: 'milk_logs' },
  { local: 'eggLogs',         remote: 'egg_logs' },
  { local: 'weightLogs',      remote: 'weight_logs' },
  { local: 'treatments',      remote: 'treatments' },
  { local: 'vaccinations',    remote: 'vaccinations' },
  { local: 'mortality',       remote: 'mortality' },
  { local: 'heatLogs',        remote: 'heat_logs' },
  { local: 'breedingLogs',    remote: 'breeding_logs' },
  { local: 'pregnancyChecks', remote: 'pregnancy_checks' },
  { local: 'births',          remote: 'births' },
  { local: 'feedInventory',   remote: 'feed_inventory' },
  { local: 'transactions',    remote: 'transactions' },
  { local: 'employees',       remote: 'employees' },
  { local: 'attendance',      remote: 'attendance' },
  { local: 'tasks',           remote: 'tasks' },
  { local: 'payroll',         remote: 'payroll' },
  { local: 'suppliers',       remote: 'suppliers' },
  { local: 'purchaseOrders',  remote: 'purchase_orders' },
  { local: 'grns',            remote: 'grns' },
  { local: 'assets',          remote: 'assets' },
  { local: 'maintenance',     remote: 'maintenance' },
  { local: 'plots',           remote: 'plots' },
  { local: 'cropPlans',       remote: 'crop_plans' },
  { local: 'harvests',        remote: 'harvests' },
  { local: 'labTests',        remote: 'lab_tests' },
  { local: 'notifications',   remote: 'notifications' },
  { local: 'calendarEvents',  remote: 'calendar_events' },
];

const LAST_PULL_KEY = 'farmcore_last_pull';

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

// ── INITIAL PULL — 5s timeout per table, never blocks UI ──────
export async function initialPull(farmId) {
  if (!farmId) return { success: true };
  console.log('[Sync] Starting pull for farm:', farmId);

  for (const { local, remote } of SYNC_MAP) {
    try {
      const fetchPromise = supabase
        .from(remote)
        .select('*')
        .eq('farm_id', farmId);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000)
      );

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);
      if (error || !data?.length) continue;

      const localTable = db[local];
      if (!localTable) continue;

      await localTable.clear();
      const records = data.map(r => ({ ...toCamel(r), syncStatus: 'synced' }));
      await localTable.bulkPut(records);
      console.log(`[Sync] ✓ ${local}: ${records.length} records`);
    } catch (err) {
      console.warn(`[Sync] Skipping ${remote}:`, err.message);
      continue; // never block on any single table failure
    }
  }

  localStorage.setItem(LAST_PULL_KEY, new Date().toISOString());
  console.log('[Sync] Pull complete.');
  return { success: true };
}

// ── PUSH PENDING ──────────────────────────────────────────────
export async function pushPending(farmId) {
  let pushed = 0;
  for (const { local, remote } of SYNC_MAP) {
    try {
      const localTable = db[local];
      if (!localTable) continue;

      const pending = await localTable
        .filter(r => r.syncStatus === 'pending')
        .toArray();

      if (!pending.length) continue;

      for (const record of pending) {
        const remoteRecord = { ...toSnake(record), farm_id: farmId };
        delete remoteRecord.sync_status;

        const { error } = await supabase
          .from(remote)
          .upsert(remoteRecord, { onConflict: 'id' });

        if (!error) {
          await localTable.update(record.id, { syncStatus: 'synced' });
          pushed++;
        }
      }
    } catch (err) {
      console.warn(`[Sync] Push error ${local}:`, err.message);
      continue;
    }
  }
  return { success: true, pushed };
}

// ── INCREMENTAL PULL ──────────────────────────────────────────
export async function incrementalPull(farmId) {
  const lastPull = localStorage.getItem(LAST_PULL_KEY) || new Date(0).toISOString();
  let pulled = 0;
  for (const { local, remote } of SYNC_MAP) {
    try {
      const { data, error } = await supabase
        .from(remote)
        .select('*')
        .eq('farm_id', farmId)
        .gte('updated_at', lastPull);

      if (error || !data?.length) continue;

      const localTable = db[local];
      if (!localTable) continue;

      for (const r of data) {
        await localTable.put({ ...toCamel(r), syncStatus: 'synced' });
        pulled++;
      }
    } catch (err) {
      continue;
    }
  }
  if (pulled > 0) localStorage.setItem(LAST_PULL_KEY, new Date().toISOString());
  return { success: true, pulled };
}

// ── FULL SYNC ─────────────────────────────────────────────────
export async function fullSync(farmId) {
  const push = await pushPending(farmId);
  const pull = await incrementalPull(farmId);
  return { push, pull };
}

// ── BACKGROUND SYNC every 60s ─────────────────────────────────
let syncInterval = null;

export function startBackgroundSync(farmId, onComplete) {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(async () => {
    if (!navigator.onLine) return;
    await fullSync(farmId);
    onComplete?.();
  }, 60000);
}

export function stopBackgroundSync() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
}

// ── PUSH SINGLE RECORD ────────────────────────────────────────
export async function pushRecord(tableName, record, farmId) {
  const mapping = SYNC_MAP.find(m => m.local === tableName);
  if (!mapping) return false;
  const remoteRecord = { ...toSnake(record), farm_id: farmId };
  delete remoteRecord.sync_status;
  const { error } = await supabase
    .from(mapping.remote)
    .upsert(remoteRecord, { onConflict: 'id' });
  return !error;
}
