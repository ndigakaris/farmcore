// @vitest-environment node
//
// src/db/migration.test.js
// ─────────────────────────────────────────────────────────────
// Runs supabase-schema.sql (v1) and then supabase-migration-v2.sql
// against a REAL PostgreSQL — PGlite, the Postgres engine compiled to
// WebAssembly — and asserts the post-conditions.
//
// This is the check that was missing when the audit was written: the
// migration had only been eyeballed. Now every `npm test` proves it
// parses, applies cleanly on top of v1, is safe to run twice, and
// actually produces the columns, triggers, indexes, policies and
// functions the sync engine depends on.
//
// Supabase-specific pieces are stubbed below (the `auth` schema, the
// `authenticated` role, uuid-ossp). Everything else is the real file,
// read from disk unmodified.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readSql = (f) => readFileSync(join(root, f), 'utf8');

// ── Supabase environment stubs ────────────────────────────────
// Plain Postgres has none of this; Supabase provides it.
const BOOTSTRAP = `
  CREATE ROLE authenticated;
  CREATE ROLE anon;
  CREATE SCHEMA IF NOT EXISTS auth;

  CREATE TABLE auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT,
    raw_user_meta_data JSONB DEFAULT '{}'
  );

  -- Supabase reads the caller from the request JWT. We back it with a
  -- session setting so tests can "sign in" as a given user.
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $fn$
    SELECT NULLIF(current_setting('test.uid', true), '')::uuid;
  $fn$ LANGUAGE sql STABLE;

  -- uuid-ossp is not bundled with PGlite; gen_random_uuid() is core
  -- Postgres and behaves identically for our purposes.
  CREATE OR REPLACE FUNCTION uuid_generate_v4() RETURNS UUID AS $fn$
    SELECT gen_random_uuid();
  $fn$ LANGUAGE sql VOLATILE;
`;

// The one line PGlite cannot satisfy.
const stripExtension = (sql) =>
  sql.replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '');

// Every table the sync engine reads and writes.
const SYNCED = [
  'animals', 'pens', 'milk_logs', 'egg_logs', 'weight_logs', 'shearing_logs',
  'treatments', 'vaccinations', 'mortality', 'lab_tests', 'heat_logs',
  'breeding_logs', 'pregnancy_checks', 'births', 'feed_inventory', 'feed_logs',
  'feed_formulas', 'transactions', 'invoices', 'employees', 'attendance',
  'tasks', 'payroll', 'suppliers', 'purchase_orders', 'grns', 'assets',
  'maintenance', 'fuel_logs', 'plots', 'crop_plans', 'harvests',
  'agrochemicals', 'notifications', 'calendar_events', 'audit_log',
];

// Tables that had no cloud counterpart at all before v2.
const NEW_TABLES = [
  'pens', 'shearing_logs', 'feed_logs', 'feed_formulas',
  'invoices', 'fuel_logs', 'agrochemicals', 'farm_roles',
];

let pg;

beforeAll(async () => {
  pg = await PGlite.create();
  await pg.exec(BOOTSTRAP);
  await pg.exec(stripExtension(readSql('supabase-schema.sql')));
  await pg.exec(stripExtension(readSql('supabase-migration-v2.sql')));
}, 120_000);

const scalar = async (sql) => (await pg.query(sql)).rows[0];

// ─────────────────────────────────────────────────────────────
describe('migration applies', () => {
  it('runs v1 then v2 without error', () => {
    // Reaching this point means beforeAll executed both files.
    expect(pg).toBeTruthy();
  });

  it('is idempotent — running it a second time is a no-op', async () => {
    await expect(
      pg.exec(stripExtension(readSql('supabase-migration-v2.sql')))
    ).resolves.toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
describe('tables that had no cloud counterpart (F10, F12)', () => {
  it.each(NEW_TABLES)('creates %s', async (t) => {
    const r = await scalar(`SELECT to_regclass('public.${t}') AS oid`);
    expect(r.oid).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
describe('sync columns (F8)', () => {
  it('every synced table has updated_at and deleted_at', async () => {
    const { rows } = await pg.query(`
      SELECT table_name,
             COUNT(*) FILTER (WHERE column_name = 'updated_at') AS upd,
             COUNT(*) FILTER (WHERE column_name = 'deleted_at') AS del
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1)
      GROUP BY table_name
    `, [SYNCED]);

    expect(rows).toHaveLength(SYNCED.length);
    const missing = rows.filter(r => Number(r.upd) !== 1 || Number(r.del) !== 1);
    expect(missing.map(r => r.table_name)).toEqual([]);
  });

  it('the four tables that broke incremental pull now have updated_at', async () => {
    // attendance, lab_tests, notifications, calendar_events — these made
    // `.gt('updated_at', …)` throw 42703 on every sync.
    const { rows } = await pg.query(`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='updated_at'
        AND table_name IN ('attendance','lab_tests','notifications','calendar_events')
    `);
    expect(rows.map(r => r.table_name).sort())
      .toEqual(['attendance', 'calendar_events', 'lab_tests', 'notifications']);
  });
});

// ─────────────────────────────────────────────────────────────
describe('updated_at triggers (F9)', () => {
  it('every synced table has one', async () => {
    const { rows } = await pg.query(`
      SELECT c.relname AS table_name
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND t.tgname LIKE 'set_%_updated_at'
    `);
    const have = new Set(rows.map(r => r.table_name));
    expect(SYNCED.filter(t => !have.has(t))).toEqual([]);
  });

  it('the four silently-stale tables now bump updated_at on UPDATE', async () => {
    // mortality, heat_logs, births, grns had the column but no trigger,
    // so edits were invisible to every other device forever.
    await pg.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('00000000-0000-4000-8000-000000000001', 'a@b.c');
      SELECT set_config('test.uid', '00000000-0000-4000-8000-000000000001', false);
    `);
    const farm = (await scalar(
      `INSERT INTO farms (name) VALUES ('T') RETURNING id`)).id;

    for (const t of ['mortality', 'heat_logs', 'births', 'grns']) {
      await pg.query(
        `INSERT INTO ${t} (id, farm_id, date, updated_at)
         VALUES (gen_random_uuid(), $1, CURRENT_DATE, '2000-01-01')`, [farm]);
      const before = (await scalar(
        `SELECT updated_at FROM ${t} WHERE farm_id='${farm}'`)).updated_at;

      await pg.query(`UPDATE ${t} SET notes='x' WHERE farm_id=$1`, [farm]);
      const after = (await scalar(
        `SELECT updated_at FROM ${t} WHERE farm_id='${farm}'`)).updated_at;

      expect(new Date(after).getTime(),
        `${t} did not bump updated_at`).toBeGreaterThan(new Date(before).getTime());
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe('indexes for incremental pull (F31)', () => {
  it('every synced table has (farm_id, updated_at)', async () => {
    const { rows } = await pg.query(`
      SELECT tablename FROM pg_indexes
      WHERE schemaname='public' AND indexname LIKE 'idx_%_sync'
    `);
    const have = new Set(rows.map(r => r.tablename));
    expect(SYNCED.filter(t => !have.has(t))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
describe('row-level security (F14, F15)', () => {
  it('is enabled on every synced table', async () => {
    const { rows } = await pg.query(`
      SELECT relname FROM pg_class
      WHERE relnamespace='public'::regnamespace AND relrowsecurity
    `);
    const have = new Set(rows.map(r => r.relname));
    expect(SYNCED.filter(t => !have.has(t))).toEqual([]);
  });

  it('every write policy carries a WITH CHECK clause', async () => {
    // Without it, a member can write a row tagged with another farm's id.
    const { rows } = await pg.query(`
      SELECT tablename, policyname FROM pg_policies
      WHERE schemaname='public' AND policyname LIKE '%_write' AND with_check IS NULL
    `);
    expect(rows).toEqual([]);
  });

  it('puts finance and HR behind the management-only helper', async () => {
    const { rows } = await pg.query(`
      SELECT tablename, qual FROM pg_policies
      WHERE schemaname='public'
        AND tablename IN ('transactions','payroll','employees','invoices','attendance')
        AND policyname LIKE '%_write'
    `);
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r.qual, `${r.tablename} is not management-gated`).toContain('can_manage_farm');
    }
  });

  it('keeps operational tables writable by any non-viewer', async () => {
    const r = await scalar(`
      SELECT qual FROM pg_policies
      WHERE schemaname='public' AND tablename='milk_logs' AND policyname='milk_logs_write'
    `);
    expect(r.qual).toContain('can_write_farm');
  });
});

// ─────────────────────────────────────────────────────────────
describe('role helper functions', () => {
  it.each(['can_read_farm', 'can_write_farm', 'can_manage_farm', 'reap_tombstones'])(
    'defines %s', async (fn) => {
      const r = await scalar(
        `SELECT COUNT(*)::int AS n FROM pg_proc WHERE proname = '${fn}'`);
      expect(r.n).toBeGreaterThan(0);
    });

  it('excludes a viewer from write but not from read', async () => {
    const owner  = '00000000-0000-4000-8000-0000000000aa';
    const viewer = '00000000-0000-4000-8000-0000000000bb';
    await pg.query(`INSERT INTO auth.users (id) VALUES ($1), ($2)`, [owner, viewer]);

    const farm = (await scalar(
      `INSERT INTO farms (name) VALUES ('Viewer test') RETURNING id`)).id;
    await pg.query(
      `INSERT INTO farm_users (farm_id, user_id, role)
       VALUES ($1,$2,'owner'), ($1,$3,'viewer')`, [farm, owner, viewer]);

    await pg.query(`SELECT set_config('test.uid', $1, false)`, [viewer]);
    expect((await scalar(`SELECT can_read_farm('${farm}') AS v`)).v).toBe(true);
    expect((await scalar(`SELECT can_write_farm('${farm}') AS v`)).v).toBe(false);
    expect((await scalar(`SELECT can_manage_farm('${farm}') AS v`)).v).toBe(false);

    await pg.query(`SELECT set_config('test.uid', $1, false)`, [owner]);
    expect((await scalar(`SELECT can_manage_farm('${farm}') AS v`)).v).toBe(true);
  });

  it('denies a user who is not a member at all', async () => {
    const stranger = '00000000-0000-4000-8000-0000000000cc';
    await pg.query(`INSERT INTO auth.users (id) VALUES ($1)`, [stranger]);
    const farm = (await scalar(
      `INSERT INTO farms (name) VALUES ('Someone elses') RETURNING id`)).id;

    await pg.query(`SELECT set_config('test.uid', $1, false)`, [stranger]);
    expect((await scalar(`SELECT can_read_farm('${farm}') AS v`)).v).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
describe('create_farm_with_license (F13)', () => {
  it('creates the farm, the owner membership and the licence in one call', async () => {
    const uid = '00000000-0000-4000-8000-0000000000dd';
    await pg.query(`INSERT INTO auth.users (id) VALUES ($1)`, [uid]);
    await pg.query(`SELECT set_config('test.uid', $1, false)`, [uid]);

    const r = await scalar(
      `SELECT create_farm_with_license('Kilima Fresh', 'Kenya', 'Nakuru') AS out`);
    const farmId = r.out.farm_id;
    expect(farmId).toBeTruthy();

    const farm = await scalar(`SELECT name, county FROM farms WHERE id='${farmId}'`);
    expect(farm.name).toBe('Kilima Fresh');
    expect(farm.county).toBe('Nakuru');

    const member = await scalar(
      `SELECT role::text AS role FROM farm_users WHERE farm_id='${farmId}'`);
    expect(member.role).toBe('owner');

    const lic = await scalar(
      `SELECT status::text AS status FROM licenses WHERE farm_id='${farmId}'`);
    expect(lic.status).toBe('active');
  });

  it('refuses an unauthenticated caller', async () => {
    await pg.query(`SELECT set_config('test.uid', '', false)`);
    await expect(
      pg.query(`SELECT create_farm_with_license('Nope')`)
    ).rejects.toThrow(/Not authenticated/);
  });

  it('refuses a blank farm name', async () => {
    const uid = '00000000-0000-4000-8000-0000000000ee';
    await pg.query(`INSERT INTO auth.users (id) VALUES ($1)`, [uid]);
    await pg.query(`SELECT set_config('test.uid', $1, false)`, [uid]);
    await expect(
      pg.query(`SELECT create_farm_with_license('   ')`)
    ).rejects.toThrow(/Farm name is required/);
  });
});

// ─────────────────────────────────────────────────────────────
describe('tombstone reaping (F11)', () => {
  it('deletes only rows soft-deleted longer ago than the cutoff', async () => {
    const uid = '00000000-0000-4000-8000-0000000000ff';
    await pg.query(`INSERT INTO auth.users (id) VALUES ($1)`, [uid]);
    await pg.query(`SELECT set_config('test.uid', $1, false)`, [uid]);
    const farm = (await scalar(
      `INSERT INTO farms (name) VALUES ('Reap') RETURNING id`)).id;

    await pg.query(`
      INSERT INTO animals (farm_id, species, name, tag, deleted_at) VALUES
        ($1,'cattle','Old tombstone','#1', NOW() - INTERVAL '120 days'),
        ($1,'cattle','New tombstone','#2', NOW() - INTERVAL '2 days'),
        ($1,'cattle','Alive',        '#3', NULL)
    `, [farm]);

    await pg.query(`SELECT reap_tombstones('90 days')`);

    const { rows } = await pg.query(
      `SELECT name FROM animals WHERE farm_id=$1 ORDER BY name`, [farm]);
    expect(rows.map(r => r.name)).toEqual(['Alive', 'New tombstone']);
  });
});

// ─────────────────────────────────────────────────────────────
describe('schema drift the app already depended on (F2, F12)', () => {
  it('profiles.email exists — api/create-user queries it', async () => {
    const r = await scalar(`
      SELECT COUNT(*)::int AS n FROM information_schema.columns
      WHERE table_name='profiles' AND column_name='email'`);
    expect(r.n).toBe(1);
  });

  it('farm_users has user_code, is_active and status', async () => {
    const { rows } = await pg.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='farm_users'
        AND column_name IN ('user_code','is_active','status')`);
    expect(rows.map(r => r.column_name).sort())
      .toEqual(['is_active', 'status', 'user_code']);
  });

  it('farm_roles rejects two roles with the same name on one farm', async () => {
    const farm = (await scalar(
      `INSERT INTO farms (name) VALUES ('Roles') RETURNING id`)).id;
    await pg.query(
      `INSERT INTO farm_roles (farm_id, name) VALUES ($1,'Herdsman')`, [farm]);
    await expect(
      pg.query(`INSERT INTO farm_roles (farm_id, name) VALUES ($1,'Herdsman')`, [farm])
    ).rejects.toThrow();
  });
});
