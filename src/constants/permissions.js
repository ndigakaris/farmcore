// src/constants/permissions.js
// ─────────────────────────────────────────────────────────────
// Client-side mirror of the row-level-security tiers in
// supabase-migration-v2.sql (can_read_farm / can_write_farm /
// can_manage_farm).
//
// The database is the authority — it refuses the write regardless of
// what the UI does. This module exists so the interface stops OFFERING
// actions that are going to be refused: before it, a viewer saw a full
// set of "Add", "Edit" and "Approve" buttons that failed on submit, and
// a herdsman saw Financials and Payroll pages that returned nothing
// because RLS filtered every row.
//
// Keep the tiers below in step with the SQL helpers. If you add a role
// or move a table between tiers, change both.
// ─────────────────────────────────────────────────────────────

/** Roles that may write operational records — matches can_write_farm(). */
export const WRITE_ROLES = ['owner', 'admin', 'manager', 'worker', 'vet'];

/** Roles that may see and change money and staff — matches can_manage_farm(). */
export const MANAGE_ROLES = ['owner', 'admin', 'manager'];

/** Only these may add members, reset passwords, or edit custom roles. */
export const ADMIN_ROLES = ['owner', 'admin'];

/** Pages whose underlying tables are management-only under RLS. */
export const MANAGED_PAGES = ['finance', 'employees', 'cost', 'reports'];

/** Pages restricted to owner/admin. */
export const ADMIN_PAGES = ['team'];

/**
 * Capabilities for a role. `role` may be undefined while auth is still
 * resolving — default to the most restrictive answer so the UI never
 * flashes controls the user cannot use.
 */
export function permissionsFor(role) {
  const canWrite  = WRITE_ROLES.includes(role);
  const canManage = MANAGE_ROLES.includes(role);
  const isAdmin   = ADMIN_ROLES.includes(role);

  return {
    role: role || null,

    /** Add/edit operational records: animals, milk, health, feed, crops… */
    canWrite,
    /** See and change finance, payroll, employees, attendance. */
    canManage,
    /** Manage team members and custom roles. */
    isAdmin,
    /** Read-only user — show data, hide every mutating control. */
    isViewer: role === 'viewer',

    /** Should this nav page be visible at all? */
    canSeePage(pageId) {
      if (ADMIN_PAGES.includes(pageId))   return isAdmin;
      if (MANAGED_PAGES.includes(pageId)) return canManage;
      return true;
    },
  };
}

/** Message shown when a control is disabled rather than hidden. */
export const DENIED_HINT = {
  write:  'Your role is read-only. Ask a manager to make this change.',
  manage: 'Only an owner, admin or manager can do this.',
  admin:  'Only an owner or admin can do this.',
};
