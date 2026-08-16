// @vitest-environment node
//
// src/constants/permissions.test.js
// ─────────────────────────────────────────────────────────────
// The client-side permission tiers must stay in step with the RLS
// helpers in supabase-migration-v2.sql. If they drift, the UI starts
// offering actions the database will refuse (or hiding ones it allows).
//
// The SQL side of the same contract is asserted in db/migration.test.js
// against a real Postgres.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { permissionsFor, MANAGED_PAGES, ADMIN_PAGES } from './permissions.js';

const ROLES = ['owner', 'admin', 'manager', 'worker', 'vet', 'viewer'];

describe('write access — mirrors can_write_farm()', () => {
  it.each(['owner', 'admin', 'manager', 'worker', 'vet'])('%s may write', (role) => {
    expect(permissionsFor(role).canWrite).toBe(true);
  });

  it('viewer may not write', () => {
    expect(permissionsFor('viewer').canWrite).toBe(false);
    expect(permissionsFor('viewer').isViewer).toBe(true);
  });
});

describe('management access — mirrors can_manage_farm()', () => {
  it.each(['owner', 'admin', 'manager'])('%s may see finance and payroll', (role) => {
    expect(permissionsFor(role).canManage).toBe(true);
  });

  it.each(['worker', 'vet', 'viewer'])('%s may not', (role) => {
    // RLS hides these tables from them entirely, so showing the pages
    // would only produce empty screens.
    expect(permissionsFor(role).canManage).toBe(false);
  });
});

describe('team administration', () => {
  it.each(['owner', 'admin'])('%s may manage the team', (role) => {
    expect(permissionsFor(role).isAdmin).toBe(true);
  });

  it.each(['manager', 'worker', 'vet', 'viewer'])('%s may not', (role) => {
    expect(permissionsFor(role).isAdmin).toBe(false);
  });
});

describe('page visibility', () => {
  it('hides finance and employees from a herdsman', () => {
    const p = permissionsFor('worker');
    for (const page of MANAGED_PAGES) expect(p.canSeePage(page)).toBe(false);
  });

  it('hides team administration from a manager', () => {
    expect(permissionsFor('manager').canSeePage('team')).toBe(false);
  });

  it('shows the owner everything', () => {
    const p = permissionsFor('owner');
    for (const page of [...MANAGED_PAGES, ...ADMIN_PAGES, 'dashboard', 'animals']) {
      expect(p.canSeePage(page)).toBe(true);
    }
  });

  it('lets every role reach the operational screens', () => {
    for (const role of ROLES) {
      const p = permissionsFor(role);
      for (const page of ['dashboard', 'animals', 'production', 'health']) {
        expect(p.canSeePage(page), `${role} / ${page}`).toBe(true);
      }
    }
  });
});

describe('unknown or still-loading role', () => {
  // Auth resolves asynchronously. Before it lands, `role` is null — and
  // the previous code defaulted that to 'owner', briefly showing every
  // user the full owner interface.
  it.each([undefined, null, '', 'not-a-role'])('%p gets no privileges', (role) => {
    const p = permissionsFor(role);
    expect(p.canWrite).toBe(false);
    expect(p.canManage).toBe(false);
    expect(p.isAdmin).toBe(false);
    expect(p.canSeePage('finance')).toBe(false);
    expect(p.canSeePage('team')).toBe(false);
  });
});
