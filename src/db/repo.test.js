// src/db/repo.test.js
// ─────────────────────────────────────────────────────────────
// The write path and the id helpers.
//
// The sync engine tests prove records reach the cloud; these prove the
// records are correctly formed before they get there. Several bugs in
// the audit came from writes that skipped a field — an id, a farm, the
// pending flag — so each of those is pinned here.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

import db from './schema.js';
import * as repo from './repo.js';
import { newId, isUuid, asId } from './ids.js';

const FARM = '11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
  localStorage.clear();
  await repo.setActiveFarm(FARM);
});

// ─────────────────────────────────────────────────────────────
describe('id generation', () => {
  it('produces valid v4 UUIDs', () => {
    expect(isUuid(newId())).toBe(true);
  });

  it('never repeats', () => {
    const ids = new Set(Array.from({ length: 5000 }, newId));
    expect(ids.size).toBe(5000);
  });

  it('still works without crypto.randomUUID (plain-http / old WebView)', () => {
    const original = crypto.randomUUID;
    // Farms on cheap Android handsets sometimes open the PWA over plain
    // http on the LAN, where randomUUID is unavailable.
    crypto.randomUUID = undefined;
    try {
      expect(isUuid(newId())).toBe(true);
    } finally {
      crypto.randomUUID = original;
    }
  });
});

describe('asId', () => {
  it('keeps uuid strings intact', () => {
    const id = newId();
    expect(asId(id)).toBe(id);
  });

  it('turns an empty selection into null, not NaN or 0', () => {
    // The old code used Number(form.animalId): '' became 0 and a uuid
    // became NaN, silently detaching the record from its animal.
    expect(asId('')).toBeNull();
    expect(asId(undefined)).toBeNull();
    expect(asId(null)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
describe('create', () => {
  it('stamps id, farm, timestamps and the pending flag', async () => {
    const id = await repo.create('animals', { name: 'Daisy', tag: '#045' });
    const row = await db.animals.get(id);

    expect(isUuid(row.id)).toBe(true);
    expect(row.farmId).toBe(FARM);
    expect(row.syncStatus).toBe('pending');
    expect(row.createdAt).toBeTruthy();
    expect(row.updatedAt).toBeTruthy();
  });

  it('returns the id immediately so it can be used as a foreign key', async () => {
    const animalId = await repo.create('animals', { name: 'Daisy', tag: '#045' });
    const logId = await repo.create('milkLogs', { animalId, amount: 12 });

    expect((await db.milkLogs.get(logId)).animalId).toBe(animalId);
  });

  it('honours an id supplied by the caller', async () => {
    const id = newId();
    expect(await repo.create('animals', { id, name: 'X', tag: '#1' })).toBe(id);
  });

  it('does not stamp sync fields on device-local tables', async () => {
    const id = await repo.create('settings', { key: 'theme', value: 'dark' });
    const row = await db.settings.get(id);
    // Per-device preferences must not be pushed to the shared farm.
    expect(row.syncStatus).toBeUndefined();
    expect(row.farmId).toBeUndefined();
  });

  it('createMany writes them all with distinct ids', async () => {
    const ids = await repo.createMany('animals', [
      { name: 'A', tag: '#1' }, { name: 'B', tag: '#2' }, { name: 'C', tag: '#3' },
    ]);
    expect(new Set(ids).size).toBe(3);
    expect(await db.animals.count()).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────
describe('update', () => {
  it('re-flags the row as pending so an edit is pushed like an insert', async () => {
    const id = await repo.create('animals', { name: 'Daisy', tag: '#045' });
    await db.animals.update(id, { syncStatus: 'synced' });

    await repo.update('animals', id, { name: 'Daisy II' });

    const row = await db.animals.get(id);
    expect(row.name).toBe('Daisy II');
    expect(row.syncStatus).toBe('pending');
  });

  it('moves updatedAt forward', async () => {
    const id = await repo.create('animals', { name: 'X', tag: '#1' });
    const before = (await db.animals.get(id)).updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await repo.update('animals', id, { name: 'Y' });
    expect((await db.animals.get(id)).updatedAt >= before).toBe(true);
  });

  it('refuses an update with no id rather than corrupting the table', async () => {
    await expect(repo.update('animals', undefined, { name: 'X' })).rejects.toThrow(/without an id/);
  });
});

// ─────────────────────────────────────────────────────────────
describe('upsert', () => {
  it('preserves createdAt when the row already exists', async () => {
    const id = await repo.create('animals', { name: 'X', tag: '#1' });
    const created = (await db.animals.get(id)).createdAt;

    await repo.upsert('animals', { id, name: 'Renamed', tag: '#1' });

    const row = await db.animals.get(id);
    expect(row.createdAt).toBe(created);
    expect(row.name).toBe('Renamed');
  });
});

// ─────────────────────────────────────────────────────────────
describe('remove', () => {
  it('takes the row out of its table at once', async () => {
    const id = await repo.create('animals', { name: 'X', tag: '#1' });
    await db.animals.update(id, { syncStatus: 'synced' });

    await repo.remove('animals', id);

    // Not soft-deleted-but-still-listed: actually gone, so no ordinary
    // db.animals.toArray() can show a record the user just deleted.
    expect(await db.animals.get(id)).toBeUndefined();
    expect(await db.animals.count()).toBe(0);
  });

  it('queues the deletion for a record the server already has', async () => {
    const id = await repo.create('animals', { name: 'X', tag: '#1' });
    await db.animals.update(id, { syncStatus: 'synced' });

    await repo.remove('animals', id);

    const [t] = await repo.pendingTombstones();
    expect(t.table).toBe('animals');
    expect(t.recordId).toBe(id);
    expect(t.farmId).toBe(FARM);
  });

  it('queues nothing for a record that never left the device', async () => {
    const id = await repo.create('animals', { name: 'X', tag: '#1' });  // still pending
    await repo.remove('animals', id);
    expect(await repo.pendingTombstones()).toHaveLength(0);
  });

  it('deletes local-only rows outright, with no tombstone', async () => {
    const id = await repo.create('settings', { key: 'theme' });
    await repo.remove('settings', id);
    expect(await db.settings.get(id)).toBeUndefined();
    expect(await repo.pendingTombstones()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
describe('farm scoping', () => {
  const OTHER = '22222222-2222-4222-8222-222222222222';

  it('hides rows belonging to another farm', async () => {
    await repo.create('animals', { name: 'Ours', tag: '#1' });
    // A row that arrived while a different farm was active.
    await db.animals.put({ id: newId(), farmId: OTHER, name: 'Theirs', tag: '#2' });

    const visible = await repo.all('animals');
    expect(visible.map((a) => a.name)).toEqual(['Ours']);
  });

  it('scopes byField lookups too', async () => {
    const animalId = newId();
    await repo.create('milkLogs', { animalId, amount: 10 });
    await db.milkLogs.put({ id: newId(), farmId: OTHER, animalId, amount: 99 });

    const rows = await repo.byField('milkLogs', 'animalId', animalId);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(10);
  });

  it('get() refuses to return another farm\'s record', async () => {
    const id = newId();
    await db.animals.put({ id, farmId: OTHER, name: 'Theirs', tag: '#2' });
    expect(await repo.get('animals', id)).toBeUndefined();
  });
});
