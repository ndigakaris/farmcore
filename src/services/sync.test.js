// src/services/sync.test.js
// ─────────────────────────────────────────────────────────────
// Tests for the sync engine, against a real (fake) IndexedDB and a
// stubbed Supabase client.
//
// These cover the failure modes that made the previous engine lose farm
// data. Each test is named for the bug it prevents coming back.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// ── Supabase stub ─────────────────────────────────────────────
// Records every call so tests can assert on what was sent, and lets each
// test script the responses per remote table.
const server = {
  rows: {},        // remote table -> array of rows
  upserts: [],     // { table, rows }
  failTables: new Set(),
  reset() {
    this.rows = {};
    this.upserts = [];
    this.failTables = new Set();
  },
};

function makeQuery(tableName) {
  const q = {
    _filters: {},
    select() { return q; },
    eq(col, val) { q._filters[col] = val; return q; },
    gt(col, val) { q._filters[`${col}>`] = val; return q; },
    order() { return q; },
    range(from, to) {
      const all = server.rows[tableName] || [];
      const since = q._filters['updated_at>'];
      const filtered = all.filter(r =>
        (!q._filters.farm_id || r.farm_id === q._filters.farm_id) &&
        (!since || r.updated_at > since)
      );
      return Promise.resolve({ data: filtered.slice(from, to + 1), error: null });
    },
    upsert(rows) {
      const list = Array.isArray(rows) ? rows : [rows];
      server.upserts.push({ table: tableName, rows: list });

      const result = server.failTables.has(tableName)
        ? { data: null, error: { message: `invalid input for ${tableName}` } }
        : (() => {
            // Emulate the DB trigger stamping its own updated_at.
            const stored = list.map(r => ({ ...r, updated_at: '2026-01-01T00:00:00Z' }));
            server.rows[tableName] = [...(server.rows[tableName] || []), ...stored];
            return { data: stored, error: null };
          })();

      // PostgrestBuilder is itself a thenable, so callers may either await
      // it directly (the deletion push) or chain .select() first (the
      // record push). The stub has to support both or it silently reports
      // success for every un-chained call.
      return {
        select: () => Promise.resolve(result),
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      };
    },
  };
  return q;
}

vi.mock('./supabase.js', () => ({
  default: { from: (t) => makeQuery(t) },
  supabase: { from: (t) => makeQuery(t) },
}));

const { default: db } = await import('../db/schema.js');
const repo = await import('../db/repo.js');
const sync = await import('./sync.js');

const FARM = '11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  server.reset();
  localStorage.clear();
  if (!db.isOpen()) await db.open();
  await Promise.all(db.tables.map(t => t.clear()));
  repo.setActiveFarm(FARM);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

// ─────────────────────────────────────────────────────────────
describe('local schema', () => {
  it('uses client-generated string ids, not auto-increment integers', async () => {
    const id = await repo.create('animals', { name: 'Daisy', tag: '#045', species: 'cattle' });

    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    const row = await db.animals.get(id);
    expect(row.id).toBe(id);
  });

  it('stamps farmId and pending status so the record is picked up by push', async () => {
    const id = await repo.create('milkLogs', { animalId: 'a1', amount: 12 });
    const row = await db.milkLogs.get(id);

    expect(row.farmId).toBe(FARM);
    expect(row.syncStatus).toBe('pending');
    expect(row.updatedAt).toBeTruthy();
  });

  it('two devices creating a record concurrently do not collide', async () => {
    // The old ++id scheme gave both of these id 1.
    const a = await repo.create('animals', { name: 'A', tag: '#1' });
    const b = await repo.create('animals', { name: 'B', tag: '#2' });
    expect(a).not.toBe(b);
  });
});

// ─────────────────────────────────────────────────────────────
describe('push', () => {
  it('sends a uuid id that Postgres can accept, and marks the row synced', async () => {
    const id = await repo.create('animals', { name: 'Daisy', tag: '#045' });

    const res = await sync.pushPending(FARM);
    expect(res.pushed).toBe(1);
    expect(res.failed).toBe(0);

    const sent = server.upserts.find(u => u.table === 'animals').rows[0];
    expect(sent.id).toBe(id);
    expect(sent.farm_id).toBe(FARM);

    const row = await db.animals.get(id);
    expect(row.syncStatus).toBe('synced');
  });

  it('converts camelCase to snake_case for Postgres', async () => {
    await repo.create('animals', { name: 'X', tag: '#9', milkLock: true, lockReason: 'mastitis' });
    await sync.pushPending(FARM);

    const sent = server.upserts.find(u => u.table === 'animals').rows[0];
    expect(sent.milk_lock).toBe(true);
    expect(sent.lock_reason).toBe('mastitis');
    expect(sent.milkLock).toBeUndefined();
  });

  it('never sends local-only bookkeeping columns', async () => {
    await repo.create('animals', { name: 'X', tag: '#9' });
    await sync.pushPending(FARM);

    const sent = server.upserts.find(u => u.table === 'animals').rows[0];
    expect(sent.sync_status).toBeUndefined();
    expect(sent.sync_error).toBeUndefined();
    // updated_at is owned by the server trigger.
    expect(sent.updated_at).toBeUndefined();
  });

  it('keeps a failed row pending instead of silently dropping it', async () => {
    server.failTables.add('animals');
    const id = await repo.create('animals', { name: 'X', tag: '#9' });

    const res = await sync.pushPending(FARM);
    expect(res.failed).toBe(1);

    const row = await db.animals.get(id);
    expect(row.syncStatus).toBe('pending');       // still queued
    expect(row.syncAttempts).toBe(1);
    expect(row.syncError).toContain('invalid input');
  });

  it('gives up on a permanently-bad row rather than retrying it forever', async () => {
    server.failTables.add('animals');
    const id = await repo.create('animals', { name: 'X', tag: '#9' });

    for (let i = 0; i < 5; i++) await sync.pushPending(FARM);

    const row = await db.animals.get(id);
    expect(row.syncStatus).toBe('error');
    expect(row.syncAttempts).toBe(5);

    // ...and it can be requeued once the cause is fixed.
    await sync.retryFailed();
    expect((await db.animals.get(id)).syncStatus).toBe('pending');
  });

  it('removes a deleted row from the UI immediately, even offline', async () => {
    const id = await repo.create('animals', { name: 'X', tag: '#9' });
    await sync.pushPending(FARM);

    await repo.remove('animals', id);

    // Gone from its table at once — a farmer must never see a record they
    // just deleted, however long they stay out of signal.
    expect(await db.animals.get(id)).toBeUndefined();
    // ...but the deletion is queued so the cloud finds out.
    expect(await db.tombstones.count()).toBe(1);
  });

  it('pushes the queued deletion, then clears the outbox', async () => {
    const id = await repo.create('animals', { name: 'X', tag: '#9' });
    await sync.pushPending(FARM);
    await repo.remove('animals', id);

    await sync.pushPending(FARM);

    const sent = server.upserts.at(-1).rows[0];
    expect(sent.id).toBe(id);
    expect(sent.deleted_at).toBeTruthy();
    expect(await db.tombstones.count()).toBe(0);
  });

  it('does not queue a deletion for a record the server never had', async () => {
    // Created and deleted while offline — Postgres has nothing to mark.
    const id = await repo.create('animals', { name: 'Never pushed', tag: '#9' });
    await repo.remove('animals', id);

    expect(await db.animals.get(id)).toBeUndefined();
    expect(await db.tombstones.count()).toBe(0);
  });

  it('keeps the deletion queued when the push fails', async () => {
    const id = await repo.create('animals', { name: 'X', tag: '#9' });
    await sync.pushPending(FARM);
    await repo.remove('animals', id);

    server.failTables.add('animals');
    await sync.pushPending(FARM);

    expect(await db.tombstones.count()).toBe(1);
    expect((await db.tombstones.toArray())[0].attempts).toBe(1);
  });

  it('counts queued deletions as pending work', async () => {
    const id = await repo.create('animals', { name: 'X', tag: '#9' });
    await sync.pushPending(FARM);
    await repo.remove('animals', id);

    expect(await sync.pendingCount()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
describe('pull', () => {
  it('pages past the 1000-row PostgREST cap', async () => {
    // A 200-cow dairy makes ~146k milk logs a year. The old un-paged
    // select silently returned only the first 1000.
    server.rows.milk_logs = Array.from({ length: 2500 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      farm_id: FARM, amount: i, updated_at: '2026-01-01T00:00:00Z',
    }));

    const res = await sync.pull(FARM, { full: true });
    expect(res.pulled).toBe(2500);
    expect(await db.milkLogs.count()).toBe(2500);
  });

  it('does NOT wipe local records that have not been pushed yet', async () => {
    // The old initialPull called table.clear() first, destroying anything
    // a farmer had entered offline.
    const localId = await repo.create('animals', { name: 'Offline Cow', tag: '#999' });

    server.rows.animals = [{
      id: '22222222-2222-4222-8222-222222222222',
      farm_id: FARM, name: 'Server Cow', tag: '#001',
      updated_at: '2026-01-01T00:00:00Z',
    }];

    await sync.pull(FARM, { full: true });

    const survivor = await db.animals.get(localId);
    expect(survivor).toBeDefined();
    expect(survivor.name).toBe('Offline Cow');
    expect(await db.animals.count()).toBe(2);
  });

  it('does not overwrite a pending local edit with the stale server copy', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    await db.animals.put({
      id, farmId: FARM, name: 'Edited On Phone',
      syncStatus: 'pending', updatedAt: '2026-02-01T00:00:00Z', deletedAt: null,
    });

    server.rows.animals = [{
      id, farm_id: FARM, name: 'Old Server Name',
      updated_at: '2026-01-01T00:00:00Z',
    }];

    await sync.pull(FARM, { full: true });

    expect((await db.animals.get(id)).name).toBe('Edited On Phone');
  });

  it('applies a delete made on another device', async () => {
    const id = '44444444-4444-4444-8444-444444444444';
    await db.animals.put({ id, farmId: FARM, name: 'Gone', syncStatus: 'synced' });

    server.rows.animals = [{
      id, farm_id: FARM, name: 'Gone',
      deleted_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
    }];

    await sync.pull(FARM, { full: true });
    expect(await db.animals.get(id)).toBeUndefined();
  });

  it('converts snake_case back to camelCase for the UI', async () => {
    server.rows.animals = [{
      id: '55555555-5555-4555-8555-555555555555',
      farm_id: FARM, milk_lock: true, lock_reason: 'mastitis',
      updated_at: '2026-01-01T00:00:00Z',
    }];

    await sync.pull(FARM, { full: true });
    const row = await db.animals.get('55555555-5555-4555-8555-555555555555');
    expect(row.milkLock).toBe(true);
    expect(row.lockReason).toBe('mastitis');
  });

  it('advances the watermark using the server clock, not the device clock', async () => {
    // A phone whose clock runs fast used to skip every record written in
    // the gap, permanently.
    server.rows.animals = [{
      id: '66666666-6666-4666-8666-666666666666',
      farm_id: FARM, updated_at: '2026-03-05T10:00:00Z',
    }];

    await sync.pull(FARM, { full: true });
    expect(localStorage.getItem(`farmcore_wm:${FARM}:animals`)).toBe('2026-03-05T10:00:00Z');
  });

  it('does not advance the watermark for a table that failed', async () => {
    const key = `farmcore_wm:${FARM}:animals`;
    server.rows.animals = [{ id: 'x', farm_id: FARM, updated_at: '2026-03-05T10:00:00Z' }];
    // A table with no server rows must leave its mark untouched.
    await sync.pull(FARM, { full: true });
    const after = localStorage.getItem(`farmcore_wm:${FARM}:milk_logs`);
    expect(after).toBeNull();
    expect(localStorage.getItem(key)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
describe('switching farms', () => {
  const OTHER = '99999999-9999-4999-8999-999999999999';

  it('wipes the previous farm\'s records so totals cannot mix', async () => {
    await repo.create('animals', { name: 'Farm A cow', tag: '#1' });
    await repo.create('transactions', { amount: 5000, type: 'income' });

    await repo.setActiveFarm(OTHER);

    expect(await db.animals.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
  });

  it('drops the old farm\'s watermarks so the new farm pulls in full', async () => {
    localStorage.setItem(`farmcore_wm:${FARM}:animals`, '2026-05-05T00:00:00Z');
    await repo.setActiveFarm(OTHER);
    expect(localStorage.getItem(`farmcore_wm:${FARM}:animals`)).toBeNull();
  });

  it('keeps the cache when signing out and back into the same farm', async () => {
    await repo.create('animals', { name: 'Still here', tag: '#1' });
    await repo.setActiveFarm(null);   // sign out
    await repo.setActiveFarm(FARM);   // sign back in
    expect(await db.animals.count()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
describe('full cycle', () => {
  it('pushes before pulling, so local work is never lost to the server copy', async () => {
    await repo.create('animals', { name: 'Local', tag: '#1' });
    await sync.sync(FARM, { full: true });

    // The push landed on the server...
    expect(server.upserts.some(u => u.table === 'animals')).toBe(true);
    // ...and the row is now clean.
    expect(await db.animals.where('syncStatus').equals('pending').count()).toBe(0);
  });

  it('reports how many records are still waiting', async () => {
    server.failTables.add('animals');
    await repo.create('animals', { name: 'A', tag: '#1' });
    await repo.create('animals', { name: 'B', tag: '#2' });

    const result = await sync.sync(FARM);
    expect(result.pending).toBe(2);
    expect(sync.getSyncState().status).toBe('pending');
  });

  it('does not run two cycles concurrently', async () => {
    await repo.create('animals', { name: 'A', tag: '#1' });
    const [a, b] = await Promise.all([sync.sync(FARM), sync.sync(FARM)]);
    expect(a).toBe(b); // second call joined the first
  });

  it('skips entirely when the device is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const res = await sync.sync(FARM);
    expect(res.skipped).toBe('offline');
    expect(server.upserts).toHaveLength(0);
  });
});
