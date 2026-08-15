// api/farm-brief.js — Vercel Serverless Function
// Generates the dashboard's AI farm brief via Google Gemini Flash.
// Free key: aistudio.google.com → add GEMINI_API_KEY to Vercel env vars.
//
// SECURITY: this was an open, unauthenticated proxy to a metered API —
// anyone could POST arbitrary prompts and run up the bill (or use the
// farm's key as a free LLM). Callers must now be a member of the farm,
// and are rate limited.

import { requireFarmRole, methodGuard, rateLimit } from './_auth.js';

const MAX_PROMPT = 12_000; // characters
const ALL_ROLES = ['owner', 'admin', 'manager', 'worker', 'vet', 'viewer'];

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  const { prompt, farmId } = req.body || {};

  const auth = await requireFarmRole(req, farmId, ALL_ROLES);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const limit = rateLimit(`brief:${auth.user.id}`, { max: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    res.setHeader('Retry-After', limit.retryAfter);
    return res.status(429).json({ error: 'Please wait a moment before asking for another brief.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'AI not configured. Add GEMINI_API_KEY to your Vercel environment variables (free key at aistudio.google.com).',
    });
  }

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'No prompt provided' });
  }
  if (prompt.length > MAX_PROMPT) {
    return res.status(413).json({ error: 'That farm summary is too large to analyse.' });
  }

  // Don't hang a phone on a stalled upstream request.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      // Log the upstream detail, return something safe — the raw error can
      // echo the API key back in some failure modes.
      console.error('[farm-brief] upstream:', data?.error?.message);
      return res.status(502).json({ error: 'The AI service is unavailable right now. Please try again shortly.' });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({ brief: text });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'The AI service took too long to respond. Please try again.' });
    }
    console.error('[farm-brief]', err);
    return res.status(500).json({ error: 'Could not generate the brief. Please try again.' });
  } finally {
    clearTimeout(timeout);
  }
}
