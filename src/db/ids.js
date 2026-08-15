// src/db/ids.js
// ─────────────────────────────────────────────────────────────
// Client-generated identifiers.
//
// Every record's primary key is minted HERE, on the device, before it
// ever touches the network. That is what makes offline-first sync work:
// a herdsman recording a milking with no signal creates a permanent,
// globally-unique id, so pushing it later is a plain idempotent upsert
// with no server round-trip and no id rewriting.
//
// The old design used Dexie auto-increment integers, which (a) could not
// be stored in the Postgres UUID columns at all, and (b) collide the
// moment two workers add an animal offline on two different phones —
// both would mint id 47.
// ─────────────────────────────────────────────────────────────

/**
 * RFC-4122 v4 UUID.
 *
 * crypto.randomUUID() needs a secure context (https / localhost). Farms
 * on cheap Android handsets sometimes run the PWA from a plain-http LAN
 * address, and older WebViews predate the API entirely, so fall back to
 * crypto.getRandomValues and only then to Math.random.
 */
export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch { /* insecure context — fall through */ }
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    const hex = [...b].map((x) => x.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }

  // Last resort. Not cryptographically strong, but still collision-safe
  // enough for record ids on a single farm.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `v` is a well-formed UUID string. */
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/**
 * Normalise a value coming out of a <select> or route param into an id.
 *
 * Feature code used to wrap every foreign key in `Number(...)`, which now
 * yields NaN for a UUID and silently detaches the record from its animal.
 * Use this instead: it keeps ids as strings and turns empty selections
 * into null rather than 0 or NaN.
 */
export const asId = (v) =>
  v === null || v === undefined || v === '' ? null : String(v);
