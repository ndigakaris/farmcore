// src/db/schema.js
// ─────────────────────────────────────────────────────────────
// Local IndexedDB store (Dexie).
//
// Stores are GENERATED from db/tables.js so the local schema and the
// sync map can no longer drift apart.
//
// Primary key is `id` — a client-generated UUID string (see db/ids.js),
// NOT Dexie's `++id` auto-increment. See the v2/v3 note below.
// ─────────────────────────────────────────────────────────────

import Dexie from 'dexie';
import { SYNCED_TABLES, LOCAL_ONLY_TABLES, SYNC_COLUMNS } from './tables.js';

export const db = new Dexie('FarmCoreDB');

// ── v1 — the original integer-keyed schema ───────────────────
// Declared verbatim so Dexie can still open and then upgrade databases
// created by the previous release. Do not edit.
db.version(1).stores({
  settings:       '++id, key',
  users:          '++id, role, email',
  auditLog:       '++id, userId, action, table, recordId, timestamp',
  animals:        '++id, species, tag, name, stage, sex, penId, dam, syncStatus, updatedAt',
  pens:           '++id, name, species, capacity',
  milkLogs:       '++id, animalId, date, shift, syncStatus, updatedAt',
  eggLogs:        '++id, flockId, date, syncStatus, updatedAt',
  weightLogs:     '++id, animalId, date, syncStatus, updatedAt',
  shearingLogs:   '++id, animalId, date, syncStatus, updatedAt',
  treatments:     '++id, animalId, date, vet, syncStatus, updatedAt',
  vaccinations:   '++id, animalId, date, vaccine, syncStatus, updatedAt',
  mortality:      '++id, animalId, date, cause, syncStatus, updatedAt',
  heatLogs:       '++id, animalId, date, syncStatus, updatedAt',
  breedingLogs:   '++id, animalId, date, method, syncStatus, updatedAt',
  pregnancyChecks:'++id, animalId, date, result, syncStatus, updatedAt',
  births:         '++id, damId, date, syncStatus, updatedAt',
  feedInventory:  '++id, feedType, syncStatus, updatedAt',
  feedLogs:       '++id, animalId, date, feedId, syncStatus, updatedAt',
  feedFormulas:   '++id, species, name, syncStatus',
  transactions:   '++id, type, date, category, species, syncStatus, updatedAt',
  invoices:       '++id, buyerId, date, status, syncStatus, updatedAt',
  employees:      '++id, role, section, syncStatus, updatedAt',
  attendance:     '++id, employeeId, date, status, syncStatus',
  tasks:          '++id, assignedTo, dueDate, status, priority, syncStatus',
  payroll:        '++id, employeeId, month, status, syncStatus',
  suppliers:      '++id, name, syncStatus, updatedAt',
  purchaseOrders: '++id, supplierId, status, date, syncStatus, updatedAt',
  grns:           '++id, poId, date, syncStatus, updatedAt',
  assets:         '++id, type, status, syncStatus, updatedAt',
  maintenance:    '++id, assetId, date, syncStatus, updatedAt',
  fuelLogs:       '++id, assetId, date, syncStatus',
  plots:          '++id, name, syncStatus, updatedAt',
  cropPlans:      '++id, plotId, cropType, syncStatus, updatedAt',
  harvests:       '++id, plotId, date, syncStatus, updatedAt',
  agrochemicals:  '++id, plotId, date, syncStatus, updatedAt',
  labTests:       '++id, animalId, testType, date, syncStatus',
  notifications:  '++id, type, priority, read, timestamp',
  calendarEvents: '++id, date, type, relatedId, species, syncStatus',
});

// ── v2 — drop everything ─────────────────────────────────────
// IndexedDB cannot change a store's primary key in place, and Dexie will
// throw "Not yet support for changing primary key" if you try. The
// supported route is to delete the store in one version and recreate it
// in the next, which is exactly what v2 → v3 does.
//
// The only data this discards is the local cache and the demo seed. Real
// records live in Postgres and are pulled back on the next sync.
const V1_TABLES = [
  'settings', 'users', 'auditLog', 'animals', 'pens', 'milkLogs', 'eggLogs',
  'weightLogs', 'shearingLogs', 'treatments', 'vaccinations', 'mortality',
  'heatLogs', 'breedingLogs', 'pregnancyChecks', 'births', 'feedInventory',
  'feedLogs', 'feedFormulas', 'transactions', 'invoices', 'employees',
  'attendance', 'tasks', 'payroll', 'suppliers', 'purchaseOrders', 'grns',
  'assets', 'maintenance', 'fuelLogs', 'plots', 'cropPlans', 'harvests',
  'agrochemicals', 'labTests', 'notifications', 'calendarEvents',
];

db.version(2).stores(
  Object.fromEntries(V1_TABLES.map((t) => [t, null]))
);

// ── v3 — UUID-keyed schema, generated from tables.js ─────────
const stores = {};

for (const { local, indexes } of SYNCED_TABLES) {
  // `id` (no ++) = client-assigned primary key.
  stores[local] = `id, ${indexes}, ${SYNC_COLUMNS}`;
}

for (const { local, indexes } of LOCAL_ONLY_TABLES) {
  stores[local] = `id, ${indexes}`;
}

db.version(3).stores(stores);

export default db;
