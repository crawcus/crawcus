/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/** Trust anchors: pinned ed25519 public keys. Pure helpers, no DOM. */

export interface TrustAnchor {
  readonly label: string;
  /** Lowercase hex of the raw 32-byte ed25519 public key. */
  readonly publicKeyHex: string;
  readonly source: 'pinned' | 'sample' | 'well-known';
}

/** Future canonical location of the public trust-anchor list. */
export const WELL_KNOWN_TRUST_ANCHORS_URL =
  'https://crawcus.org/.well-known/crawcus-trust-anchors.json';

/**
 * THIN ADAPTER over the TUF-style `trust-anchors.json` being defined on
 * branch `cursor/trust-anchors`:
 *   { _type: 'crawcus.trust-anchors', version, expires,
 *     root: { keys, threshold },
 *     keys: [{ keyid, alg, pubkey, purpose, not_before, not_after, status, revoked_at }],
 *     signatures }
 *
 * This app deliberately does NOT verify the document's root signatures,
 * thresholds or expiry — that belongs to the trust-anchors package once
 * it lands. Here we only pick active ed25519 keys out of `keys[]` so they
 * can be shown/pinned. Revoked / non-active keys are dropped.
 */
export function parseTrustAnchorsDocument(doc: unknown): TrustAnchor[] {
  if (typeof doc !== 'object' || doc === null) throw new Error('trust-anchors document is not an object');
  const d = doc as Record<string, unknown>;
  if (d['_type'] !== 'crawcus.trust-anchors') throw new Error("unsupported trust-anchors document (_type)");
  if (!Array.isArray(d['keys'])) throw new Error('keys[] missing');
  const out: TrustAnchor[] = [];
  for (const k of d['keys'] as unknown[]) {
    if (typeof k !== 'object' || k === null) continue;
    const r = k as Record<string, unknown>;
    if (r['alg'] !== 'ed25519' || typeof r['pubkey'] !== 'string') continue;
    if (r['revoked_at'] != null || (r['status'] !== undefined && r['status'] !== 'active')) continue;
    const hex = normalisePublicKey(r['pubkey']);
    if (hex) {
      const purpose = typeof r['purpose'] === 'string' ? ` (${r['purpose']})` : '';
      out.push({ label: `${String(r['keyid'] ?? 'anchor')}${purpose}`, publicKeyHex: hex, source: 'well-known' });
    }
  }
  return out;
}

/**
 * STUB: fetches the well-known anchors list. Not wired to the UI's
 * default flow yet — crawcus.org does not publish the file today.
 * The fetch is a read-only GET; nothing about the bundle is sent.
 */
export async function loadWellKnownTrustAnchors(
  url: string = WELL_KNOWN_TRUST_ANCHORS_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<TrustAnchor[]> {
  const res = await fetchImpl(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`trust anchors not available (${String(res.status)}) at ${url}`);
  return parseTrustAnchorsDocument(await res.json());
}

/**
 * Accepts 64-hex, 43/44-char base64, or an ed25519 SPKI PEM block.
 * Returns lowercase hex of the 32 raw bytes, or null.
 */
export function normalisePublicKey(input: string): string | null {
  const s = input.trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return s.toLowerCase();
  let b64 = s;
  const pem = /-----BEGIN PUBLIC KEY-----([\s\S]+?)-----END PUBLIC KEY-----/.exec(s);
  if (pem?.[1]) b64 = pem[1].replace(/\s+/g, '');
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(b64);
  } catch {
    return null;
  }
  // SPKI DER for ed25519 = 12-byte prefix + 32 key bytes.
  if (bytes.length === 44 && bytes[0] === 0x30) bytes = bytes.slice(12);
  if (bytes.length !== 32) return null;
  return bytesToHexStr(bytes);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(b64)) throw new Error('not base64');
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToHexStr(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
