// api/create-user.js — Vercel Serverless Function
// Creates a Supabase auth user with the SERVICE ROLE key so the admin's
// own session is never disturbed, then links them to the farm.
// Requires SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL in Vercel env vars.

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return res.status(500).json({ error: 'Server not configured. Add SUPABASE_SERVICE_ROLE_KEY to your Vercel environment variables.' });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { email, password, fullName, farmId, role, invitedBy, userCode } = req.body || {};
  if (!email || !password || !fullName || !farmId) {
    return res.status(400).json({ error: 'email, password, fullName and farmId are required' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const cleanEmail = String(email).toLowerCase().trim();

  try {
    // 1. Reject duplicates up front
    const { data: existing } = await admin
      .from('profiles').select('id').eq('email', cleanEmail).maybeSingle();
    if (existing) return res.status(409).json({ error: 'An account with this email already exists. Use the search button to add them directly.' });

    // 2. Create the auth user (auto-confirmed so they can log in right away)
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (authErr) {
      const msg = /registered|exists/i.test(authErr.message)
        ? 'An account with this email already exists.'
        : authErr.message;
      return res.status(/registered|exists/i.test(authErr.message) ? 409 : 500).json({ error: msg });
    }
    const userId = authData.user.id;

    // 3. Ensure the profile carries email + name
    await admin.from('profiles').upsert({
      id: userId, full_name: fullName, email: cleanEmail, updated_at: new Date().toISOString(),
    });

    // 4. Link to the farm
    const { error: fuErr } = await admin.from('farm_users').insert({
      farm_id: farmId, user_id: userId, role: role || 'worker',
      invited_by: invitedBy || null, user_code: userCode || null,
      is_active: true, status: 'active',
    });
    if (fuErr) {
      // Roll back the orphaned auth user so a retry can succeed cleanly
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      throw fuErr;
    }

    return res.status(200).json({ userId, success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
