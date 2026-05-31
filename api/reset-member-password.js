// api/reset-member-password.js — Vercel Serverless Function
// Lets a farm admin set a new temporary password for one of their members.
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

  const { userId, password, farmId } = req.body || {};
  if (!userId || !password || !farmId) {
    return res.status(400).json({ error: 'userId, password and farmId are required' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    // Guard: only reset passwords for someone who is actually in this farm.
    const { data: fu } = await admin
      .from('farm_users').select('id').eq('farm_id', farmId).eq('user_id', userId).maybeSingle();
    if (!fu) return res.status(403).json({ error: 'That user is not a member of this farm.' });

    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
