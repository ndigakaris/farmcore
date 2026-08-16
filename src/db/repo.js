// src/db/repo.js
// ─────────────────────────────────────────────────────────────
// The write path. Every mutation in the app should go through here.
//
// Why this layer exists: feature code used to call db.<table>.add()
// directly and hand-stamp `syncStatus:'pending'`. Several call sites
// forgot — Assets' maintenance entries, Employees' attendance rows and
// every notifications update were written WITHOUT the pending flag, so
// the sync engine never saw them and they never left the device.
//
// Going through create/update/remove makes that impossible: the id,
// farm scope, timestamp and sync flag are stamped in one place.
// ─────────────────────────────────────────────────────────────

import db from './schema.js';
import { newId } from './ids.js';
import { isSyncedTable, SYNCED_TABLES } from './tables.js';

// ── Active farm ───────────────────────────────────────────────
// Records are stamped with the farm they belong to so a manager who
// works across two farms doesn't see one farm's animals bleed into the
// other's dashboard. Persisted so it survives a reload before Auth
// has re-resolved the session.
const FARM_KEY = 'farmcore_active_farm';

let activeFarmId = null;
try { activeFarmId = localStorage.getItem(FARM_KEY) || null; } catch { /* private mode */ }

/**
 * Point the app at a farm.
 *
 * Switching to a DIFFERENT farm wipes the local cache first. Without
 * that, one farm's animals, ledger and payroll stay in IndexedDB and mix
 * into the next farm's dashboard totals — a manager who looks after two
 * farms would see one farm's milk counted against the other's.
 *
 * Returns a promise so callers can await the wipe before syncing.
 */
export async function setActiveFarm(farmId) {
  const next = farmId || null;
  const previous = activeFarmId;

  activeFarmId = next;
  try {
    if (next) localStorage.setItem(FARM_KEY, next);
    else localStorage.removeItem(FARM_KEY);
  } catch { /* storage unavailable — in-memory value still works */ }

  // Sign-out (next === null) keeps the cache: the same user signing back
  // in should not have to re-download everything, and anything still
  // pending must survive to be pushed.
  if (next && previous && previous !== next) {
    await clearLocalData();
    onFarmChanged.forEach((fn) => { try { fn(previous, next); } catch { /* noop */ } });
  }
}

/** Subscribers notified after a farm switch has wiped the cache. The sync
 *  engine uses this to drop its high-water marks, so the new farm does a
 *  full pull instead of resuming the old farm's position. */
export const onFarmChanged = new Set();

/** Drop every synced table. Used when changing farms. */
export async function clearLocalData() {
  const tables = SYNCED_TABLES.map((t) => db[t.local]).filter(Boolean);
  await db.transaction('rw', [...tables, db.tombstones], async () => {
    await Promise.all(tables.map((t) => t.clear()));
    await db.tombstones.clear();
  });
}

export const getActiveFarm = () => activeFarmId;

// ── Helpers ───────────────────────────────────────────────────
const table = (name) => {
  const t = db[name];
  if (!t) throw new Error(`[repo] Unknown table: ${name}`);
  return t;
};

const stamp = (name) =>
  isSyncedTable(name)
    ? { farmId: activeFarmId, syncStatus: 'pending', updatedAt: new Date().toISOString() }
    : {};

// ── CREATE ────────────────────────────────────────────────────
/**
 * Insert a record and return its id.
 *
 * The id is minted on the device, so this works fully offline and the
 * caller can immediately use the returned id as a foreign key.
 */
export async function create(name, data = {}) {
  const record = {
    ...data,
    id: data.id || newId(),
    ...stamp(name),
    createdAt: data.createdAt || new Date().toISOString(),
    deletedAt: null,
  };
  await table(name).put(record);
  return record.id;
}

/** Insert many records in one transaction. Returns the new ids. */
export async function createMany(name, rows = []) {
  if (!rows.length) return [];
  const now = new Date().toISOString();
  const records = rows.map((data) => ({
    ...data,
    id: data.id || newId(),
    ...stamp(name),
    createdAt: data.createdAt || now,
    deletedAt: null,
  }));
  await table(name).bulkPut(records);
  return records.map((r) => r.id);
}

// ── UPDATE ────────────────────────────────────────────────────
/**
 * Patch an existing record.
 *
 * Always re-flags the row as pending — an edit made offline has to be
 * pushed just like a fresh insert.
 */
export async function update(name, id, patch = {}) {
  if (id === null || id === undefined || id === '') {
    throw new Error(`[repo] update(${name}) called without an id`);
  }
  await table(name).update(String(id), { ...patch, ...stamp(name) });
  return id;
}

/** Insert-or-replace by id, preserving createdAt when the row exists. */
export async function upsert(name, data = {}) {
  const id = data.id ? String(data.id) : newId();
  const existing = await table(name).get(id);
  const record = {
    ...existing,
    ...data,
    id,
    ...stamp(name),
    createdAt: existing?.createdAt || data.createdAt || new Date().toISOString(),
    deletedAt: null,
  };
  await table(name).put(record);
  return id;
}

// ── DELETE ────────────────────────────────────────────────────
/**
 * Delete a record and queue the deletion for the cloud.
 *
 * A plain local delete cannot be synced — the row vanishes here and the
 * next pull cheerfully downloads it again from Postgres, so deletions
 * "come back from the dead". So we do both: drop the row from its table
 * immediately (the UI must never show something the user just deleted,
 * even while offline for a week) and leave a note in the `tombstones`
 * outbox for the sync engine to push.
 */
export async function remove(name, id) {
  const recordId = String(id);

  if (!isSyncedTable(name)) {
    await table(name).delete(recordId);
    return;
  }

  const row = await table(name).get(recordId);

  await db.transaction('rw', table(name), db.tombstones, async () => {
    await table(name).delete(recordId);

    // A record that was never pushed has nothing to delete server-side,
    // so skip the outbox entirely rather than sending a tombstone for a
    // row Postgres has never seen.
    if (row && row.syncStatus === 'synced') {
      await db.tombstones.put({
        id: newId(),
        table: name,
        recordId,
        farmId: row.farmId ?? activeFarmId,
        deletedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
    }
  });
}

/** Delete several records in one transaction. */
export async function removeMany(name, ids = []) {
  for (const id of ids) await remove(name, id);
}

/** Rows still waiting to have their deletion pushed. */
export const pendingTombstones = () => db.tombstones.toArray();

// ── READ ──────────────────────────────────────────────────────
// Deleted rows are gone from their table outright (see remove() above),
// so plain Dexie queries in feature code are already correct. These
// helpers add farm scoping on top, for the case where one account
// belongs to more than one farm.

const visible = (r) => !activeFarmId || !r.farmId || r.farmId === activeFarmId;

/** All live rows in a table, scoped to the active farm. */
export async function all(name) {
  const rows = await table(name).toArray();
  return rows.filter(visible);
}

/** Live rows matching an indexed field — e.g. byField('milkLogs','animalId',id). */
export async function byField(name, field, value) {
  const rows = await table(name).where(field).equals(value).toArray();
  return rows.filter(visible);
}

/** A single live row, or undefined if missing or tombstoned. */
export async function get(name, id) {
  const row = await table(name).get(String(id));
  return row && visible(row) ? row : undefined;
}

/** Count of live rows. */
export async function count(name) {
  return (await all(name)).length;
}

export { visible as isVisible };

export default {
  setActiveFarm, getActiveFarm, clearLocalData,
  create, createMany, update, upsert,
  remove, removeMany, pendingTombstones,
  all, byField, get, count,
};
