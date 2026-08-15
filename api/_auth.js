// api/_auth.js
// ─────────────────────────────────────────────────────────────
// Shared request guard for the serverless functions.
//
// These endpoints hold the SUPABASE_SERVICE_ROLE_KEY, which bypasses
// every row-level-security policy in the database. Before this guard
// existed they performed NO authentication whatsoever: an unauthenticated
// POST to /api/create-user with any farm's uuid minted a confirmed
// 'owner' account on that farm, and /api/reset-member-password reset any
// member's password to an attacker-chosen value. Both were full
// farm-account takeovers reachable by anyone who knew the URL.
//
// Every privileged route must now call requireFarmRole() first.
// ─────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

let cached = null;

/** Service-role client. Never expose this key to the browser. */
export function adminClient() {
  if (cached) return cached;

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

/** Pull the bearer token off the request. */
function bearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  return m ? m[1] : null;
}

/**
 * Verify the caller and confirm they hold one of `roles` on `farmId`.
 *
 * Returns { ok: true, user, role, admin } or { ok: false, status, error }.
 * The caller's own JWT is checked against Supabase — we never trust a
 * user id supplied in the request body.
 */
export async function requireFarmRole(req, farmId, roles = ['owner', 'admin']) {
  const admin = adminClient();
  if (!admin) {
    return { ok: false, status: 500, error: 'Server not configured. Add SUPABASE_SERVICE_ROLE_KEY to your environment variables.' };
  }

  const token = bearer(req);
  if (!token) return { ok: false, status: 401, error: 'Sign in required.' };

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: 'Your session has expired. Please sign in again.' };
  }
  const user = userData.user;

  if (!farmId) return { ok: false, status: 400, error: 'farmId is required.' };

  // Super admins bypass the per-farm role check.
  const { data: profile } = await admin
    .from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle();

  if (profile?.is_super_admin) return { ok: true, user, role: 'super_admin', admin };

  const { data: membership, error: memErr } = await admin
    .from('farm_users')
    .select('role')
    .eq('farm_id', farmId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memErr) return { ok: false, status: 500, error: 'Could not verify your access.' };
  if (!membership) {
    return { ok: false, status: 403, error: 'You do not have access to this farm.' };
  }
  if (!roles.includes(membership.role)) {
    return { ok: false, status: 403, error: `This action requires ${roles.join(' or ')} permission.` };
  }

  return { ok: true, user, role: membership.role, admin };
}

// ── Small shared helpers ──────────────────────────────────────

/** Reject anything that is not the expected method. */
export function methodGuard(req, res, method = 'POST') {
  if (req.method !== method) {
    res.setHeader('Allow', method);
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }
  return true;
}

/**
 * Crude per-instance rate limit. Enough to stop a script hammering a
 * paid AI endpoint; use a durable store (Upstash/Redis) if you need
 * limits that survive a cold start.
 */
const hits = new Map();

export function rateLimit(key, { max = 20, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.reset) {
    hits.set(key, { count: 1, reset: now + windowMs });
    if (hits.size > 5000) hits.clear(); // bound memory on a warm instance
    return { allowed: true, remaining: max - 1 };
  }
  if (entry.count >= max) {
    return { allowed: false, retryAfter: Math.ceil((entry.reset - now) / 1000) };
  }
  entry.count++;
  return { allowed: true, remaining: max - entry.count };
}
