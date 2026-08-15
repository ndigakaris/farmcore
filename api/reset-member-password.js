// api/reset-member-password.js — Vercel Serverless Function
// Lets a farm owner/admin set a new temporary password for a member.
//
// SECURITY: previously this only checked that the TARGET was a member of
// the given farm — it never checked the CALLER at all. Anyone who knew a
// farm id and a user id could set that person's password and sign in as
// them. The caller is now authenticated and must hold owner/admin on the
// same farm.
//
// Requires SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL in Vercel env vars.

import { requireFarmRole, methodGuard, rateLimit } from './_auth.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  const { userId, password, farmId } = req.body || {};

  const auth = await requireFarmRole(req, farmId, ['owner', 'admin']);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const { admin, user: caller } = auth;

  const limit = rateLimit(`reset-pw:${caller.id}`, { max: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    res.setHeader('Retry-After', limit.retryAfter);
    return res.status(429).json({ error: 'Too many password resets. Try again in a minute.' });
  }

  if (!userId || !password) {
    return res.status(400).json({ error: 'userId and password are required' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    // The target must belong to THIS farm.
    const { data: target } = await admin
      .from('farm_users').select('role')
      .eq('farm_id', farmId).eq('user_id', userId).maybeSingle();

    if (!target) return res.status(403).json({ error: 'That user is not a member of this farm.' });

    // An admin must not be able to seize the owner's account.
    if (target.role === 'owner' && auth.role !== 'owner' && auth.role !== 'super_admin') {
      return res.status(403).json({ error: "You cannot reset the farm owner's password." });
    }

    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[reset-member-password]', err);
    return res.status(500).json({ error: 'Could not reset the password. Please try again.' });
  }
}
