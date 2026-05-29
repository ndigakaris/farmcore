// api/create-user.js — Vercel Serverless Function
// Creates a new Supabase auth user server-side using SERVICE ROLE key
// so the current session is never interrupted
// Add SUPABASE_SERVICE_ROLE_KEY to Vercel Environment Variables

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;

  if (!serviceKey || !supabaseUrl) {
    return res.status(500).json({
      error: 'Server not configured. Add SUPABASE_SERVICE_ROLE_KEY to Vercel environment variables.'
    });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { email, password, fullName, farmId, role, invitedBy, userCode } = req.body;

  if (!email || !password || !fullName || !farmId) {
    return res.status(400).json({ error: 'email, password, fullName and farmId are required' });
  }

  try {
    // 1. Check for duplicate email
    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // 2. Create auth user
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email:          email.toLowerCase().trim(),
      password,
      email_confirm:  true, // auto-confirm so they can log in immediately
      user_metadata:  { full_name: fullName },
    });
    if (authErr) throw authErr;
    const userId = authData.user.id;

    // 3. Update profile with email + name
    await admin.from('profiles').upsert({
      id:        userId,
      full_name: fullName,
      email:     email.toLowerCase().trim(),
      updated_at: new Date().toISOString(),
    });

    // 4. Add to farm_users
    const { error: fuErr } = await admin.from('farm_users').insert({
      farm_id:    farmId,
      user_id:    userId,
      role:       role || 'worker',
      invited_by: invitedBy || null,
      user_code:  userCode || null,
      is_active:  true,
      status:     'active',
    });
    if (fuErr) throw fuErr;

    return res.status(200).json({ userId, success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
