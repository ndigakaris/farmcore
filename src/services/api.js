// src/services/api.js
// ─────────────────────────────────────────────────────────────
// Calls to our own serverless functions (/api/*).
//
// Those endpoints now authenticate the caller, so every request must
// carry the current Supabase session token. Centralised here so no call
// site can forget it and get a confusing 401.
// ─────────────────────────────────────────────────────────────

import supabase from './supabase.js';

/**
 * POST JSON to an /api route with the caller's bearer token attached.
 * Throws an Error carrying the server's message on a non-2xx response.
 */
export async function postJson(path, body = {}, { timeoutMs = 30_000 } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    let data = null;
    try { data = await res.json(); } catch { /* empty or non-JSON body */ }

    if (!res.ok) {
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('The request timed out. Check your connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const createFarmUser      = (payload) => postJson('/api/create-user', payload);
export const resetMemberPassword = (payload) => postJson('/api/reset-member-password', payload);
export const generateFarmBrief   = (payload) => postJson('/api/farm-brief', payload);
