// src/db/tables.js
// ─────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the local⇄remote table map.
//
// Both the Dexie schema (db/schema.js) and the sync engine
// (services/sync.js) are generated from this list. Previously the two
// were maintained by hand and had drifted: ten Dexie tables (pens,
// feedLogs, feedFormulas, invoices, fuelLogs, agrochemicals, …) existed
// locally but were missing from the sync map, so anything a farmer
// recorded in them lived and died on that one device.
//
// Adding a table here wires it into BOTH sides at once.
// ─────────────────────────────────────────────────────────────

/**
 * `indexes` is the Dexie index string WITHOUT the primary key — the
 * primary key is always `id` (a client-generated UUID) and is prepended
 * automatically in schema.js.
 *
 * Every synced table implicitly also gets: farmId, syncStatus, updatedAt,
 * deletedAt. Do not repeat those here.
 */
export const SYNCED_TABLES = [
  // ── Livestock ──────────────────────────────────────────────
  { local: 'animals',         remote: 'animals',          indexes: 'species, tag, name, stage, sex, penId, dam, status, [farmId+species]' },
  { local: 'pens',            remote: 'pens',             indexes: 'name, species, capacity' },

  // ── Production ─────────────────────────────────────────────
  { local: 'milkLogs',        remote: 'milk_logs',        indexes: 'animalId, date, shift, [animalId+date]' },
  { local: 'eggLogs',         remote: 'egg_logs',         indexes: 'flockId, date, [flockId+date]' },
  { local: 'weightLogs',      remote: 'weight_logs',      indexes: 'animalId, date, [animalId+date]' },
  { local: 'shearingLogs',    remote: 'shearing_logs',    indexes: 'animalId, date' },

  // ── Health ─────────────────────────────────────────────────
  { local: 'treatments',      remote: 'treatments',       indexes: 'animalId, date, vet, status' },
  { local: 'vaccinations',    remote: 'vaccinations',     indexes: 'animalId, date, vaccine, nextDue' },
  { local: 'mortality',       remote: 'mortality',        indexes: 'animalId, date, cause' },
  { local: 'labTests',        remote: 'lab_tests',        indexes: 'animalId, testType, date' },

  // ── Reproduction ───────────────────────────────────────────
  { local: 'heatLogs',        remote: 'heat_logs',        indexes: 'animalId, date' },
  { local: 'breedingLogs',    remote: 'breeding_logs',    indexes: 'animalId, date, method' },
  { local: 'pregnancyChecks', remote: 'pregnancy_checks', indexes: 'animalId, date, result' },
  { local: 'births',          remote: 'births',           indexes: 'damId, date' },

  // ── Feed ───────────────────────────────────────────────────
  { local: 'feedInventory',   remote: 'feed_inventory',   indexes: 'feedType, species' },
  { local: 'feedLogs',        remote: 'feed_logs',        indexes: 'animalId, date, feedId' },
  { local: 'feedFormulas',    remote: 'feed_formulas',    indexes: 'species, name' },

  // ── Finance ────────────────────────────────────────────────
  { local: 'transactions',    remote: 'transactions',     indexes: 'type, date, category, species, [farmId+date]' },
  { local: 'invoices',        remote: 'invoices',         indexes: 'buyerId, date, status' },

  // ── People ─────────────────────────────────────────────────
  { local: 'employees',       remote: 'employees',        indexes: 'role, section, status' },
  { local: 'attendance',      remote: 'attendance',       indexes: 'employeeId, date, status, [employeeId+date]' },
  { local: 'tasks',           remote: 'tasks',            indexes: 'assignedTo, dueDate, status, priority' },
  { local: 'payroll',         remote: 'payroll',          indexes: 'employeeId, month, status' },

  // ── Procurement ────────────────────────────────────────────
  { local: 'suppliers',       remote: 'suppliers',        indexes: 'name' },
  { local: 'purchaseOrders',  remote: 'purchase_orders',  indexes: 'supplierId, status, date' },
  { local: 'grns',            remote: 'grns',             indexes: 'poId, date' },

  // ── Assets ─────────────────────────────────────────────────
  { local: 'assets',          remote: 'assets',           indexes: 'type, status, name' },
  { local: 'maintenance',     remote: 'maintenance',      indexes: 'assetId, date' },
  { local: 'fuelLogs',        remote: 'fuel_logs',        indexes: 'assetId, date' },

  // ── Crops ──────────────────────────────────────────────────
  { local: 'plots',           remote: 'plots',            indexes: 'name' },
  { local: 'cropPlans',       remote: 'crop_plans',       indexes: 'plotId, cropType' },
  { local: 'harvests',        remote: 'harvests',         indexes: 'plotId, date, crop' },
  { local: 'agrochemicals',   remote: 'agrochemicals',    indexes: 'plotId, date' },

  // ── Ops ────────────────────────────────────────────────────
  { local: 'notifications',   remote: 'notifications',    indexes: 'type, priority, read, createdAt' },
  { local: 'calendarEvents',  remote: 'calendar_events',  indexes: 'date, type, relatedId, species' },
  { local: 'auditLog',        remote: 'audit_log',        indexes: 'userId, action, tableName, recordId, createdAt' },
];

/**
 * Device-local only. Never pushed, never pulled — these hold per-device
 * preferences and cached UI state, which must NOT be shared between the
 * farm owner's laptop and a herdsman's phone.
 */
export const LOCAL_ONLY_TABLES = [
  { local: 'settings', indexes: 'key' },
  { local: 'syncQueue', indexes: 'table, recordId, attempts, createdAt' },
];

/** Columns every synced table carries. Kept in one place so the Dexie
 *  index string and the Postgres DDL can't disagree. */
export const SYNC_COLUMNS = 'farmId, syncStatus, updatedAt, deletedAt';

/** Fast lookup: local table name → mapping entry. */
export const TABLE_BY_LOCAL = Object.fromEntries(
  SYNCED_TABLES.map((t) => [t.local, t])
);

/** Fast lookup: remote table name → mapping entry. */
export const TABLE_BY_REMOTE = Object.fromEntries(
  SYNCED_TABLES.map((t) => [t.remote, t])
);

export const isSyncedTable = (name) => Boolean(TABLE_BY_LOCAL[name]);
