// api/create-user.js — Vercel Serverless Function
// Creates a Supabase auth user with the SERVICE ROLE key so the admin's
// own session is never disturbed, then links them to the farm.
//
// SECURITY: the caller must present a valid session token AND already be
// an owner/admin of the farm they are adding someone to. Without that
// check this endpoint was an open door — anyone could POST a farm uuid
// and mint themselves a confirmed 'owner' login for that farm.
//
// Requires SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL in Vercel env vars.

import { requireFarmRole, methodGuard, rateLimit } from './_auth.js';

const ASSIGNABLE_ROLES = ['admin', 'manager', 'worker', 'vet', 'viewer'];

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  const { email, password, fullName, farmId, role, invitedBy, userCode } = req.body || {};

  // ── Authorise BEFORE doing any work ──────────────────────────
  const auth = await requireFarmRole(req, farmId, ['owner', 'admin']);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const { admin, user: caller } = auth;

  const limit = rateLimit(`create-user:${caller.id}`, { max: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    res.setHeader('Retry-After', limit.retryAfter);
    return res.status(429).json({ error: 'Too many accounts created. Try again in a minute.' });
  }

  // ── Validate ─────────────────────────────────────────────────
  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'email, password and fullName are required' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const cleanEmail = String(email).toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'That email address is not valid' });
  }

  // An admin must not be able to mint another owner and lock the real
  // owner out of their own farm. Only an owner may create an 'admin'.
  const requested = role || 'worker';
  if (!ASSIGNABLE_ROLES.includes(requested)) {
    return res.status(400).json({ error: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` });
  }
  if (requested === 'admin' && auth.role !== 'owner' && auth.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only the farm owner can create an admin.' });
  }

  try {
    // 1. Reject duplicates up front
    const { data: existing } = await admin
      .from('profiles').select('id').eq('email', cleanEmail).maybeSingle();
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists. Use the search button to add them directly.' });
    }

    // 2. Create the auth user (auto-confirmed so they can log in right away)
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (authErr) {
      const dup = /registered|exists/i.test(authErr.message);
      return res.status(dup ? 409 : 500).json({
        error: dup ? 'An account with this email already exists.' : authErr.message,
      });
    }
    const userId = authData.user.id;

    // 3. Ensure the profile carries email + name
    await admin.from('profiles').upsert({
      id: userId, full_name: fullName, email: cleanEmail, updated_at: new Date().toISOString(),
    });

    // 4. Link to the farm. invitedBy comes from the VERIFIED caller, not
    //    from the request body, so it cannot be forged.
    const { error: fuErr } = await admin.from('farm_users').insert({
      farm_id: farmId,
      user_id: userId,
      role: requested,
      invited_by: caller.id,
      user_code: userCode || null,
      is_active: true,
      status: 'active',
    });
    if (fuErr) {
      // Roll back the orphaned auth user so a retry can succeed cleanly
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      throw fuErr;
    }

    return res.status(200).json({ userId, success: true });
  } catch (err) {
    console.error('[create-user]', err);
    return res.status(500).json({ error: 'Could not create the account. Please try again.' });
  }
}
