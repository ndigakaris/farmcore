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
import { isSyncedTable } from './tables.js';

// ── Active farm ───────────────────────────────────────────────
// Records are stamped with the farm they belong to so a manager who
// works across two farms doesn't see one farm's animals bleed into the
// other's dashboard. Persisted so it survives a reload before Auth
// has re-resolved the session.
const FARM_KEY = 'farmcore_active_farm';

let activeFarmId = null;
try { activeFarmId = localStorage.getItem(FARM_KEY) || null; } catch { /* private mode */ }

export function setActiveFarm(farmId) {
  activeFarmId = farmId || null;
  try {
    if (farmId) localStorage.setItem(FARM_KEY, farmId);
    else localStorage.removeItem(FARM_KEY);
  } catch { /* storage unavailable — in-memory value still works */ }
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
 * Soft-delete (tombstone).
 *
 * A hard delete cannot be synced: the row simply vanishes locally and
 * the next pull happily downloads it again from Postgres, so deletions
 * used to "come back from the dead". Marking `deletedAt` lets the
 * deletion itself be pushed, after which the tombstone is reaped.
 */
export async function remove(name, id) {
  if (!isSyncedTable(name)) {
    await table(name).delete(String(id));
    return;
  }
  await table(name).update(String(id), {
    deletedAt: new Date().toISOString(),
    syncStatus: 'pending',
    updatedAt: new Date().toISOString(),
  });
}

/** Permanently drop a row locally, bypassing the tombstone. Used by the
 *  sync engine to reap tombstones the server has confirmed. */
export async function purge(name, id) {
  await table(name).delete(String(id));
}

// ── READ ──────────────────────────────────────────────────────
// Reads must hide tombstones and other farms' rows. Feature code calls
// these instead of db.<table>.toArray().

const visible = (r) => !r.deletedAt && (!activeFarmId || !r.farmId || r.farmId === activeFarmId);

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
  setActiveFarm, getActiveFarm,
  create, createMany, update, upsert,
  remove, purge,
  all, byField, get, count,
};
