// src/services/sync.js
// ─────────────────────────────────────────────────────────────
// Offline-first sync engine: Dexie (device) ⇄ Supabase (cloud).
//
// Contract
//   • Local ids are client-generated UUIDs, identical to the Postgres
//     primary keys, so every push is a plain idempotent upsert.
//   • Push always runs before pull, so a record typed in the field is
//     never overwritten by the server copy it is about to replace.
//   • Nothing is ever destroyed locally to make a pull "clean".
//   • Deletes travel as tombstones (`deletedAt`), so they propagate to
//     other devices instead of resurrecting on the next pull.
//   • Every table keeps its OWN high-water mark, taken from the server's
//     clock, so one failing table cannot make the others skip records.
//
// Everything here is written for a 2G connection that drops mid-request.
// ─────────────────────────────────────────────────────────────

import supabase from './supabase.js';
import db from '../db/schema.js';
import { SYNCED_TABLES } from '../db/tables.js';
import { onFarmChanged } from '../db/repo.js';

// PostgREST caps a select at 1000 rows unless you page. A 200-cow dairy
// generates ~146k milk logs a year, so the old un-paged select was
// silently truncating history at the first thousand rows.
const PAGE_SIZE   = 1000;
const PUSH_CHUNK  = 250;   // rows per upsert request
const MAX_ATTEMPTS = 5;    // give up on a poisoned row rather than loop forever

// ── Case conversion ───────────────────────────────────────────
const snakeKey = (k) => k.replace(/([A-Z])/g, '_$1').toLowerCase();
const camelKey = (k) => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

function toSnake(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[snakeKey(k)] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

function toCamel(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[camelKey(k)] = v;
  return out;
}

// Local-only bookkeeping that must never be sent to Postgres.
const LOCAL_FIELDS = ['syncStatus', 'syncError', 'syncAttempts'];

function toRemote(record, farmId) {
  const clean = { ...record };
  for (const f of LOCAL_FIELDS) delete clean[f];
  const row = toSnake(clean);
  row.farm_id = farmId;
  // `updated_at` is owned by the database trigger — sending ours would
  // fight the server clock and corrupt the high-water mark.
  delete row.updated_at;
  return row;
}

// ── High-water marks (per farm, per table) ────────────────────
const wmKey = (farmId, remote) => `farmcore_wm:${farmId}:${remote}`;

const getWatermark = (farmId, remote) => {
  try { return localStorage.getItem(wmKey(farmId, remote)) || '1970-01-01T00:00:00Z'; }
  catch { return '1970-01-01T00:00:00Z'; }
};

const setWatermark = (farmId, remote, iso) => {
  try { localStorage.setItem(wmKey(farmId, remote), iso); } catch { /* noop */ }
};

/** Wipe all marks for a farm — forces the next sync to do a full pull. */
export function resetWatermarks(farmId) {
  for (const { remote } of SYNCED_TABLES) {
    try { localStorage.removeItem(wmKey(farmId, remote)); } catch { /* noop */ }
  }
}

// Leaving a farm clears its local cache, so its watermarks must go too —
// otherwise returning to it would resume mid-history and never re-fetch
// the records the wipe removed.
onFarmChanged.add((previous) => resetWatermarks(previous));

// ── Status broadcasting ───────────────────────────────────────
// The UI subscribes so the TopBar can honestly show "3 records waiting"
// instead of a permanently green tick.
const listeners = new Set();
let state = { status: 'idle', pending: 0, lastSync: null, error: null };

export const onSyncChange = (fn) => { listeners.add(fn); fn(state); return () => listeners.delete(fn); };
export const getSyncState = () => state;

function emit(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) { try { fn(state); } catch { /* listener threw — ignore */ } }
}

/** Number of changes still waiting to reach the cloud, deletions included. */
export async function pendingCount() {
  let n = 0;
  for (const { local } of SYNCED_TABLES) {
    const t = db[local];
    if (!t) continue;
    try { n += await t.where('syncStatus').equals('pending').count(); }
    catch { /* table missing during an upgrade */ }
  }
  try { n += await db.tombstones.count(); } catch { /* noop */ }
  return n;
}

// ── PUSH ──────────────────────────────────────────────────────
/**
 * Send every pending row to Postgres.
 *
 * Rows are upserted in chunks and the server's canonical copy is written
 * straight back, so the local `updated_at` matches the server's clock.
 * Tombstones are pushed too, then reaped locally once accepted.
 */
export async function pushPending(farmId) {
  if (!farmId) return { pushed: 0, failed: 0 };

  let pushed = 0;
  let failed = 0;

  for (const { local, remote } of SYNCED_TABLES) {
    const t = db[local];
    if (!t) continue;

    let pending;
    try {
      // Indexed lookup. The old code used .filter(), a full table scan of
      // every row on every 60s tick.
      pending = await t.where('syncStatus').equals('pending').toArray();
    } catch { continue; }

    if (!pending.length) continue;

    for (let i = 0; i < pending.length; i += PUSH_CHUNK) {
      const batch = pending.slice(i, i + PUSH_CHUNK);
      const rows  = batch.map((r) => toRemote(r, farmId));

      const { data, error } = await supabase
        .from(remote)
        .upsert(rows, { onConflict: 'id' })
        .select();

      if (error) {
        failed += batch.length;
        // Record the failure ON the rows so a single malformed record
        // can be found and fixed instead of silently jamming the queue.
        await t.bulkPut(batch.map((r) => {
          const attempts = (r.syncAttempts || 0) + 1;
          return {
            ...r,
            syncAttempts: attempts,
            syncError: error.message,
            syncStatus: attempts >= MAX_ATTEMPTS ? 'error' : r.syncStatus,
          };
        })).catch(() => {});
        console.warn(`[sync] push ${remote} failed:`, error.message);
        continue;
      }

      const serverById = Object.fromEntries((data || []).map((r) => [r.id, r]));

      // One bulkPut rather than a write per record.
      await t.bulkPut(batch.map((r) => ({
        ...r,
        syncStatus: 'synced',
        syncError: null,
        syncAttempts: 0,
        ...(serverById[r.id]?.updated_at ? { updatedAt: serverById[r.id].updated_at } : {}),
      }))).catch(() => {});

      pushed += batch.length;
    }
  }

  const del = await pushTombstones(farmId);
  return { pushed: pushed + del.pushed, failed: failed + del.failed };
}

// ── PUSH DELETIONS ────────────────────────────────────────────
/**
 * Drain the tombstone outbox.
 *
 * The row is already gone from the device (repo.remove deletes it on the
 * spot so the UI never shows a record the user just deleted). What is
 * left here is the instruction to mark it deleted in Postgres, which is
 * what stops the next pull downloading it again.
 */
export async function pushTombstones(farmId) {
  const outbox = db.tombstones;
  if (!outbox) return { pushed: 0, failed: 0 };

  let pending;
  try { pending = await outbox.toArray(); } catch { return { pushed: 0, failed: 0 }; }
  if (!pending.length) return { pushed: 0, failed: 0 };

  // Group by remote table so each one is a single request.
  const byTable = new Map();
  for (const t of pending) {
    const mapping = SYNCED_TABLES.find((m) => m.local === t.table);
    if (!mapping) { await outbox.delete(t.id).catch(() => {}); continue; }
    if (!byTable.has(mapping.remote)) byTable.set(mapping.remote, []);
    byTable.get(mapping.remote).push(t);
  }

  let pushed = 0;
  let failed = 0;

  for (const [remote, items] of byTable) {
    for (let i = 0; i < items.length; i += PUSH_CHUNK) {
      const batch = items.slice(i, i + PUSH_CHUNK);
      const rows = batch.map((t) => ({
        id: t.recordId,
        farm_id: t.farmId || farmId,
        deleted_at: t.deletedAt,
      }));

      const { error } = await supabase.from(remote).upsert(rows, { onConflict: 'id' });

      if (error) {
        failed += batch.length;
        await Promise.all(batch.map((t) =>
          outbox.update(t.id, {
            attempts: (t.attempts || 0) + 1,
            error: error.message,
          }).catch(() => {})
        ));
        console.warn(`[sync] delete ${remote} failed:`, error.message);
        continue;
      }

      await Promise.all(batch.map((t) => outbox.delete(t.id).catch(() => {})));
      pushed += batch.length;
    }
  }

  return { pushed, failed };
}

// ── PULL ──────────────────────────────────────────────────────
/**
 * Fetch everything changed since this table's high-water mark.
 *
 * @param {string} farmId
 * @param {boolean} full  ignore the mark and re-read the whole table
 */
export async function pull(farmId, { full = false } = {}) {
  if (!farmId) return { pulled: 0, failed: 0 };

  let pulled = 0;
  let failed = 0;

  for (const { local, remote } of SYNCED_TABLES) {
    const t = db[local];
    if (!t) continue;

    const since = full ? '1970-01-01T00:00:00Z' : getWatermark(farmId, remote);
    let highest = since;
    let offset = 0;

    try {
      // Page until the server returns a short page.
      for (;;) {
        const { data, error } = await supabase
          .from(remote)
          .select('*')
          .eq('farm_id', farmId)
          .gt('updated_at', since)
          .order('updated_at', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        // Process the page in bulk. Doing this row-by-row meant one
        // IndexedDB round-trip per record — a farm with a year of milk
        // logs would spend minutes on the first sync, on a phone.
        const incoming = [];
        const removals = [];

        for (const row of data) {
          if (row.updated_at && row.updated_at > highest) highest = row.updated_at;
          const record = toCamel(row);
          // Deleted on another device — drop it here too.
          if (record.deletedAt) removals.push(record.id);
          else incoming.push(record);
        }

        if (removals.length) {
          await t.bulkDelete(removals).catch(() => {});
          pulled += removals.length;
        }

        if (incoming.length) {
          // Never clobber an edit that has not been pushed yet. Push runs
          // first, so anything still pending means the push failed — the
          // farmer's typing outranks the stale server copy.
          const existing = await t.bulkGet(incoming.map((r) => r.id));
          const keep = incoming.filter((_, i) => {
            const local = existing[i];
            return !local || (local.syncStatus !== 'pending' && local.syncStatus !== 'error');
          });

          if (keep.length) {
            await t.bulkPut(keep.map((r) => ({
              ...r, syncStatus: 'synced', syncError: null, syncAttempts: 0,
            })));
            pulled += keep.length;
          }
        }

        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      // Advance the mark using the SERVER's timestamps, never the device
      // clock — a phone whose clock is ten minutes fast would otherwise
      // permanently skip every record written in that window.
      if (highest !== since) setWatermark(farmId, remote, highest);
    } catch (err) {
      failed++;
      console.warn(`[sync] pull ${remote} failed:`, err.message);
      // Mark not advanced → these rows are retried on the next tick.
    }
  }

  return { pulled, failed };
}

// ── FULL CYCLE ────────────────────────────────────────────────
let inFlight = null;

/**
 * Push then pull. Re-entrant calls join the run already in progress
 * rather than starting a second one — on a slow link a sync can easily
 * outlast the 60s tick, and two concurrent cycles double-push.
 */
export async function sync(farmId, { full = false } = {}) {
  if (!farmId) return { skipped: 'no-farm' };
  if (!navigator.onLine) { emit({ status: 'offline' }); return { skipped: 'offline' }; }
  if (inFlight) return inFlight;

  emit({ status: 'syncing', error: null });

  inFlight = (async () => {
    try {
      const push = await pushPending(farmId);
      const down = await pull(farmId, { full });
      const pending = await pendingCount();

      emit({
        status: pending > 0 ? 'pending' : 'synced',
        pending,
        lastSync: new Date().toISOString(),
        error: push.failed || down.failed ? 'Some records could not sync' : null,
      });

      return { push, pull: down, pending };
    } catch (err) {
      emit({ status: 'error', error: err.message });
      return { error: err.message };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** First sync after login: full pull, no watermark. */
export const initialPull = (farmId) => sync(farmId, { full: true });

/** Manual "Sync now" button. */
export const fullSync = (farmId) => sync(farmId);

// ── SCHEDULER ─────────────────────────────────────────────────
// Rural connectivity is intermittent, so we sync on a timer AND the
// moment the device reports it is back online — waiting up to a full
// minute after regaining signal was needless lag.

const BASE_INTERVAL = 60_000;
const MAX_INTERVAL  = 15 * 60_000;

let timer = null;
let backoff = BASE_INTERVAL;
let currentFarm = null;
let onlineHandler = null;

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(run, backoff);
}

async function run() {
  if (!currentFarm) return;
  const result = await sync(currentFarm);

  // Back off when the network is refusing us, recover instantly when it
  // works. Stops a farm with no signal hammering the radio every minute
  // and flattening the phone battery.
  if (result?.error || result?.skipped === 'offline') {
    backoff = Math.min(backoff * 2, MAX_INTERVAL);
  } else {
    backoff = BASE_INTERVAL;
  }
  schedule();
}

export function startBackgroundSync(farmId) {
  stopBackgroundSync();
  currentFarm = farmId;
  backoff = BASE_INTERVAL;

  onlineHandler = () => { backoff = BASE_INTERVAL; run(); };
  window.addEventListener('online', onlineHandler);

  schedule();
}

export function stopBackgroundSync() {
  clearTimeout(timer);
  timer = null;
  currentFarm = null;
  if (onlineHandler) {
    window.removeEventListener('online', onlineHandler);
    onlineHandler = null;
  }
}

/** Rows that exhausted their retries, for the Settings diagnostics panel. */
export async function failedRecords() {
  const out = [];
  for (const { local } of SYNCED_TABLES) {
    const t = db[local];
    if (!t) continue;
    try {
      const rows = await t.where('syncStatus').equals('error').toArray();
      out.push(...rows.map((r) => ({ table: local, id: r.id, error: r.syncError })));
    } catch { /* noop */ }
  }
  return out;
}

/** Put failed rows back in the queue (after fixing data or connectivity). */
export async function retryFailed() {
  for (const { local } of SYNCED_TABLES) {
    const t = db[local];
    if (!t) continue;
    try {
      await t.where('syncStatus').equals('error')
        .modify({ syncStatus: 'pending', syncAttempts: 0, syncError: null });
    } catch { /* noop */ }
  }
}

export default { sync, initialPull, fullSync, pushPending, pull, startBackgroundSync, stopBackgroundSync };
